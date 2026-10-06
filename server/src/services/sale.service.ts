import type { Request } from 'express';
import type { Prisma, PaymentStatus } from '@prisma/client';
import { prisma } from '../utils/prisma.js';
import { badRequest, conflict, forbidden, notFound, unprocessable } from '../utils/errors.js';
import { D, Decimal, toDb, roundMoney } from '../utils/money.js';
import { paging, dayBounds } from '../utils/pagination.js';
import { hasPermission } from '../middleware/auth.js';
import { computePricing, type PricingLineInput } from './pricing.service.js';
import { InventoryService } from './inventory.service.js';
import { CashService } from './cash.service.js';
import { SequenceService } from './sequence.service.js';
import { AuditService } from './audit.service.js';
import { NotificationService } from './notification.service.js';
import { SettingsService, type PosSettings } from './settings.service.js';
import { PaymentProviders } from '../providers/payment.provider.js';
import { branchDefaultTax } from '../repositories/product.repository.js';
import type { SaleInput, saleListQuery } from '../validators/sale.validators.js';
import type { z } from 'zod';

export const saleDetailInclude = {
  items: { orderBy: { id: 'asc' } },
  payments: { include: { paymentMethod: { select: { code: true, name: true, type: true } } }, orderBy: { createdAt: 'asc' } },
  customer: true,
  cashier: { select: { id: true, fullName: true, username: true } },
  branch: true,
  returns: { include: { items: true, user: { select: { fullName: true } } }, orderBy: { createdAt: 'desc' } },
} satisfies Prisma.SaleInclude;

export const SaleService = {
  /**
   * Creates a sale atomically. Any failure (stock, credit limit, permission, numbering)
   * rolls back everything: no partial stock movement, payment or cash entry survives.
   */
  async create(req: Request, input: SaleInput) {
    const auth = req.auth!;
    const branchId = req.branchId!;

    // Idempotency: a retried offline sync returns the sale already recorded
    if (input.clientRef) {
      const existing = await prisma.sale.findUnique({ where: { clientRef: input.clientRef }, include: saleDetailInclude });
      if (existing) return { sale: existing, duplicate: true };
    }

    const posSettings = await SettingsService.get<PosSettings>('pos', branchId);
    const offline = !!input.offlineCreatedAt;
    if (offline) {
      const at = new Date(input.offlineCreatedAt!).getTime();
      if (!(at <= Date.now() + 5 * 60_000 && at >= Date.now() - 7 * 86_400_000)) throw badRequest('OFFLINE_DATE_INVALID', 'Date de vente hors ligne invalide');
      if (input.payments.some((p) => p.method === 'CREDIT')) throw badRequest('OFFLINE_CREDIT', 'Les ventes à crédit ne sont pas possibles hors ligne');
    }
    const branchTax = await branchDefaultTax(branchId);

    // ── Load catalog data ──
    const productIds = [...new Set(input.items.map((i) => i.productId))];
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      include: { variants: true, tax: true, category: { include: { tax: true } } },
    });
    const overrideTaxIds = input.items.map((i) => i.taxId).filter((x): x is string => !!x);
    const overrideTaxes = overrideTaxIds.length ? await prisma.tax.findMany({ where: { id: { in: overrideTaxIds } } }) : [];

    const lines = input.items.map((item, idx) => {
      const p = products.find((x) => x.id === item.productId);
      if (!p || p.status !== 'ACTIVE') throw notFound('PRODUCT_NOT_FOUND', 'Produit introuvable ou inactif');
      const activeVariants = p.variants.filter((v) => v.status === 'ACTIVE');
      const variant = item.variantId ? p.variants.find((v) => v.id === item.variantId) : null;
      if (item.variantId && (!variant || variant.status !== 'ACTIVE')) throw notFound('VARIANT_NOT_FOUND', `Variante introuvable pour « ${p.name} »`);
      if (!item.variantId && activeVariants.length) throw badRequest('VARIANT_REQUIRED', `Choisissez une variante pour « ${p.name} »`);

      const catalogPrice = input.priceList === 'WHOLESALE'
        ? D(variant?.wholesalePrice ?? p.wholesalePrice ?? variant?.sellingPrice ?? p.sellingPrice)
        : D(variant?.sellingPrice ?? p.sellingPrice);
      const overridden = item.unitPrice !== null && item.unitPrice !== undefined && !D(item.unitPrice).eq(catalogPrice);
      if (overridden && !hasPermission(req, 'sales.price_override')) {
        throw forbidden('Vous n’êtes pas autorisé à modifier le prix de vente', 'PRICE_OVERRIDE_DENIED');
      }
      if (input.priceList === 'WHOLESALE' && !hasPermission(req, 'sales.price_override')) {
        throw forbidden('Le tarif de gros nécessite une autorisation', 'PRICE_OVERRIDE_DENIED');
      }
      let tax = p.tax ?? p.category?.tax ?? null;
      let taxRate = tax ? D(tax.rate) : D(branchTax?.rate ?? 0);
      let taxId = tax?.id ?? branchTax?.id ?? null;
      if (item.taxId && item.taxId !== taxId) {
        if (!hasPermission(req, 'sales.price_override')) throw forbidden('Modification de taxe non autorisée', 'PRICE_OVERRIDE_DENIED');
        tax = overrideTaxes.find((t) => t.id === item.taxId) ?? null;
        if (!tax) throw notFound('TAX_NOT_FOUND', 'Taxe introuvable');
        taxRate = D(tax.rate);
        taxId = tax.id;
      }
      // Quantity must be whole unless the unit allows decimals (kg, l…)
      return {
        key: String(idx), item, product: p, variant, taxId, taxRate,
        unitPrice: overridden ? D(item.unitPrice!) : catalogPrice,
        originalPrice: catalogPrice,
        unitCost: D(variant?.purchasePrice ?? p.purchasePrice),
      };
    });

    // ── Discounts & permissions ──
    const pricingInput: PricingLineInput[] = lines.map((l) => ({
      key: l.key, unitPrice: l.unitPrice, quantity: l.item.quantity, discountType: l.item.discountType,
      discountValue: l.item.discountValue, taxRate: l.taxRate, priceMode: l.product.priceMode,
    }));
    const pricing = computePricing(pricingInput, input.cartDiscount ?? null);
    const anyDiscount = pricing.discountTotal.gt(0);
    if (anyDiscount && !hasPermission(req, 'sales.discount')) throw forbidden('Vous n’êtes pas autorisé à accorder des remises', 'DISCOUNT_DENIED');
    const maxPct = D(auth.maxDiscountPercent);
    const worstPct = Decimal.max(pricing.cartDiscountPercent, ...pricing.lines.map((l) => l.discountPercent));
    // Overall discount relative to the undiscounted subtotal (catches stacked line + cart discounts)
    const overallPct = pricing.subtotal.gt(0) ? pricing.discountTotal.div(pricing.subtotal).mul(100) : D(0);
    if ((worstPct.gt(maxPct) || overallPct.gt(maxPct)) && !hasPermission(req, 'sales.discount_override')) {
      throw forbidden(`Remise supérieure à votre limite autorisée (${maxPct.toFixed()} %)`, 'DISCOUNT_LIMIT_EXCEEDED');
    }

    // ── Payments ──
    const methodCodes = [...new Set(input.payments.map((p) => p.method))];
    const methods = await prisma.paymentMethod.findMany({ where: { code: { in: methodCodes }, isActive: true } });
    for (const c of methodCodes) if (!methods.find((m) => m.code === c)) throw badRequest('PAYMENT_METHOD_INVALID', `Mode de paiement invalide : ${c}`);
    const typeOf = (code: string) => methods.find((m) => m.code === code)!.type;

    const total = pricing.total;
    const nonCredit = input.payments.filter((p) => typeOf(p.method) !== 'CREDIT' && D(p.amount).gt(0));
    const cashTendered = nonCredit.filter((p) => typeOf(p.method) === 'CASH').reduce((a, p) => a.plus(D(p.amount)), D(0));
    const otherPaid = nonCredit.filter((p) => typeOf(p.method) !== 'CASH').reduce((a, p) => a.plus(D(p.amount)), D(0));
    if (otherPaid.gt(total)) throw badRequest('OVERPAYMENT_NON_CASH', 'Les paiements non-espèces dépassent le total (la monnaie ne se rend qu’en espèces)');
    const paidTotal = cashTendered.plus(otherPaid);
    const change = Decimal.max(paidTotal.minus(total), 0);
    const cashApplied = cashTendered.minus(change);
    const amountPaid = Decimal.min(paidTotal, total);
    const shortfall = total.minus(amountPaid);
    const wantsCredit = input.payments.some((p) => typeOf(p.method) === 'CREDIT');

    let customer = input.customerId ? await prisma.customer.findUnique({ where: { id: input.customerId } }) : null;
    if (input.customerId && !customer) throw notFound('CUSTOMER_NOT_FOUND', 'Client introuvable');

    if (shortfall.gt(0)) {
      if (!wantsCredit) throw unprocessable('INSUFFICIENT_PAYMENT', `Paiement insuffisant : reste ${shortfall.toFixed()} à payer`);
      if (!hasPermission(req, 'sales.credit')) throw forbidden('Vente à crédit non autorisée', 'CREDIT_DENIED');
      if (!customer || customer.type === 'WALK_IN') throw unprocessable('CREDIT_REQUIRES_CUSTOMER', 'Un client enregistré est requis pour une vente à crédit');
    }

    let paymentStatus: PaymentStatus = 'PAID';
    if (shortfall.gt(0)) paymentStatus = amountPaid.gt(0) ? 'PARTIAL' : 'CREDIT';

    // External providers (mobile money) are confirmed before touching the database
    const providerRefs = new Map<number, { reference: string | null; status: string }>();
    for (const [i, p] of input.payments.entries()) {
      const m = methods.find((x) => x.code === p.method)!;
      const provider = PaymentProviders.get(m.provider);
      if (provider && D(p.amount).gt(0)) {
        const r = await provider.initiate({ amount: D(p.amount).toFixed(), currency: 'XAF', reference: p.reference ?? undefined, customerPhone: customer?.phone });
        if (r.status === 'FAILED') throw unprocessable('PAYMENT_FAILED', r.message ?? `Paiement ${m.name} refusé`);
        providerRefs.set(i, { reference: r.reference, status: r.status });
      }
    }

    const sale = await prisma.$transaction(async (tx) => {
      const session = posSettings.requireOpenRegister || cashApplied.gt(0) ? await CashService.requireSession(tx, auth.userId, branchId) : await CashService.currentSession(auth.userId, branchId, tx);

      // Credit limit is checked against the locked, current balance
      if (shortfall.gt(0) && customer) {
        const [locked] = await tx.$queryRaw<{ balance: Prisma.Decimal; credit_limit: Prisma.Decimal }[]>`
          SELECT balance, credit_limit FROM customers WHERE id = ${customer.id}::uuid FOR UPDATE`;
        const newBalance = D(locked.balance).plus(shortfall);
        if (newBalance.gt(D(locked.credit_limit))) {
          throw unprocessable('CREDIT_LIMIT_EXCEEDED', `Plafond de crédit dépassé (plafond ${D(locked.credit_limit).toFixed()}, solde après vente ${newBalance.toFixed()})`, {
            creditLimit: D(locked.credit_limit).toFixed(), balance: D(locked.balance).toFixed(), requested: shortfall.toFixed(),
          });
        }
      }

      const now = new Date();
      const invoiceNumber = await SequenceService.next(tx, branchId, 'SALE', now);
      const costTotal = lines.reduce((a, l) => a.plus(roundMoney(l.unitCost.mul(D(l.item.quantity)))), D(0));
      const dueDate = shortfall.gt(0)
        ? input.dueDate ? new Date(`${input.dueDate}T00:00:00`) : new Date(now.getTime() + (customer?.paymentTermsDays ?? 30) * 86_400_000)
        : null;

      const created = await tx.sale.create({
        data: {
          invoiceNumber, clientRef: input.clientRef, branchId, registerSessionId: session?.id ?? null, cashierId: auth.userId,
          customerId: customer?.id ?? null, paymentStatus,
          subtotal: toDb(pricing.subtotal), lineDiscountTotal: toDb(pricing.lineDiscountTotal),
          cartDiscountType: input.cartDiscount?.type ?? null, cartDiscountValue: input.cartDiscount ? toDb(input.cartDiscount.value) : null,
          cartDiscountTotal: toDb(pricing.cartDiscountTotal), discountTotal: toDb(pricing.discountTotal), taxTotal: toDb(pricing.taxTotal),
          total: toDb(total), costTotal: toDb(costTotal), amountPaid: toDb(amountPaid), amountDue: toDb(shortfall),
          amountTendered: toDb(paidTotal), changeGiven: toDb(change), dueDate, note: input.note,
          offlineCreatedAt: input.offlineCreatedAt ? new Date(input.offlineCreatedAt) : null,
          items: {
            create: lines.map((l) => {
              const r = pricing.lines.find((x) => x.key === l.key)!;
              return {
                productId: l.product.id, variantId: l.variant?.id ?? null,
                productName: l.variant ? `${l.product.name} — ${l.variant.name}` : l.product.name,
                sku: l.variant?.sku ?? l.product.sku,
                quantity: toDb(l.item.quantity), unitPrice: toDb(l.unitPrice), originalPrice: toDb(l.originalPrice), unitCost: toDb(l.unitCost),
                discountType: l.item.discountType ?? null, discountValue: l.item.discountValue != null ? toDb(l.item.discountValue) : null,
                discountAmount: toDb(r.lineDiscount), cartDiscountShare: toDb(r.cartShare),
                taxId: l.taxId, taxRate: toDb(l.taxRate), priceMode: l.product.priceMode,
                taxAmount: toDb(r.tax), netAmount: toDb(r.net), total: toDb(r.total),
              };
            }),
          },
        },
      });

      // Payments (cash recorded net of change)
      for (const [i, p] of input.payments.entries()) {
        const m = methods.find((x) => x.code === p.method)!;
        if (m.type === 'CREDIT') continue;
        const amount = m.type === 'CASH' ? (cashTendered.gt(0) ? D(p.amount).div(cashTendered).mul(cashApplied) : D(0)) : D(p.amount);
        const applied = roundMoney(amount);
        if (applied.lte(0)) continue;
        await tx.payment.create({
          data: {
            branchId, saleId: created.id, customerId: customer?.id ?? null, paymentMethodId: m.id, registerSessionId: session?.id ?? null,
            amount: toDb(applied), reference: providerRefs.get(i)?.reference ?? p.reference ?? null, providerStatus: providerRefs.get(i)?.status ?? null, userId: auth.userId,
          },
        });
      }

      // Stock: conditional atomic decrement + movement per tracked line
      for (const l of lines) {
        if (!l.product.trackStock) continue;
        await InventoryService.move(tx, {
          branchId, productId: l.product.id, variantId: l.variant?.id ?? null, quantity: D(l.item.quantity).neg(), type: 'SALE',
          userId: auth.userId, unitCost: l.unitCost, referenceType: 'SALE', referenceId: created.id, reference: invoiceNumber,
          // A sale rung up offline already happened: record it even if stock goes negative
          allowNegative: posSettings.allowNegativeStock || offline, productName: l.product.name,
        });
      }

      // Credit → customer ledger
      if (shortfall.gt(0) && customer) {
        const updated = await tx.customer.update({ where: { id: customer.id }, data: { balance: { increment: toDb(shortfall) } } });
        await tx.customerAccountEntry.create({
          data: {
            customerId: customer.id, branchId, type: 'SALE', amount: toDb(shortfall), balanceAfter: updated.balance, saleId: created.id,
            dueDate, description: `Vente à crédit ${invoiceNumber}`, userId: auth.userId,
          },
        });
        customer = updated;
      }

      // Cash drawer
      if (session && cashApplied.gt(0)) {
        await CashService.addMovement(tx, { sessionId: session.id, type: 'SALE', amount: cashApplied, userId: auth.userId, referenceType: 'SALE', referenceId: created.id, reference: invoiceNumber });
      }

      await AuditService.log({
        action: 'SALE', module: 'sales', recordId: created.id,
        description: `Vente ${invoiceNumber} — ${total.toFixed()} FCFA (${paymentStatus})`,
        metadata: { total: total.toFixed(), discount: pricing.discountTotal.toFixed(), items: lines.length, clientRef: input.clientRef ?? null },
      }, req, tx);

      return tx.sale.findUniqueOrThrow({ where: { id: created.id }, include: saleDetailInclude });
    }, { timeout: 20_000 });

    // Post-commit side effects (never affect the sale itself)
    void InventoryService.checkAlerts(branchId, productIds);
    if (pricing.discountTotal.gt(0) && pricing.subtotal.gt(0)) {
      const pct = pricing.discountTotal.div(pricing.subtotal).mul(100);
      if (pct.gte(posSettings.largeDiscountPercent ?? 15)) {
        void NotificationService.notify({
          branchId, type: 'LARGE_DISCOUNT', title: 'Remise importante',
          message: `${sale.invoiceNumber} : remise de ${pct.toDecimalPlaces(1).toString()} % (${pricing.discountTotal.toFixed()} FCFA) par ${auth.fullName}`,
          link: `/sales/${sale.id}`,
        });
      }
    }
    return { sale, duplicate: false };
  },

  async list(req: Request, q: z.infer<typeof saleListQuery>) {
    const where: Prisma.SaleWhereInput = {
      branchId: req.branchId!,
      ...(q.status ? { status: q.status } : {}),
      ...(q.paymentStatus ? { paymentStatus: q.paymentStatus } : {}),
      ...(q.customerId ? { customerId: q.customerId } : {}),
      ...(q.registerSessionId ? { registerSessionId: q.registerSessionId } : {}),
      ...(q.unpaid === 'true' || q.overdue === 'true' ? { paymentStatus: { in: ['PARTIAL', 'CREDIT'] }, amountDue: { gt: 0 }, status: { not: 'CANCELLED' } } : {}),
      ...(q.overdue === 'true' ? { dueDate: { lt: new Date() } } : {}),
      ...(hasPermission(req, 'sales.view_all') ? (q.cashierId ? { cashierId: q.cashierId } : {}) : { cashierId: req.auth!.userId }),
      ...(dayBounds(q.from, q.to) ? { createdAt: dayBounds(q.from, q.to) } : {}),
      ...(q.search ? { OR: [{ invoiceNumber: { contains: q.search, mode: 'insensitive' } }, { customer: { name: { contains: q.search, mode: 'insensitive' } } }] } : {}),
    };
    const [items, total, sums] = await Promise.all([
      prisma.sale.findMany({
        where,
        include: { customer: { select: { id: true, name: true } }, cashier: { select: { id: true, fullName: true } }, branch: { select: { code: true, name: true } }, payments: { select: { paymentMethod: { select: { code: true, name: true } }, amount: true } } },
        orderBy: { createdAt: q.order }, ...paging(q),
      }),
      prisma.sale.count({ where }),
      prisma.sale.aggregate({ where: { ...where, status: { not: 'CANCELLED' } }, _sum: { total: true, amountDue: true } }),
    ]);
    return { items, total, sums: { total: D(sums._sum.total).toFixed(), due: D(sums._sum.amountDue).toFixed() } };
  },

  async get(req: Request, id: string) {
    const sale = await prisma.sale.findUnique({ where: { id }, include: saleDetailInclude });
    if (!sale) throw notFound('SALE_NOT_FOUND', 'Vente introuvable');
    if (!req.auth!.branchIds.includes(sale.branchId)) throw forbidden('Accès refusé à cette succursale', 'BRANCH_FORBIDDEN');
    if (!hasPermission(req, 'sales.view_all') && sale.cashierId !== req.auth!.userId) throw forbidden();
    return sale;
  },

  async findByInvoice(req: Request, invoiceNumber: string) {
    const sale = await prisma.sale.findUnique({ where: { invoiceNumber: invoiceNumber.trim().toUpperCase() }, include: saleDetailInclude });
    if (!sale || !req.auth!.branchIds.includes(sale.branchId)) throw notFound('SALE_NOT_FOUND', 'Facture introuvable');
    return sale;
  },

  /**
   * Cancels (voids) a sale: the sale row stays with status CANCELLED, stock is put back via
   * movements, payments are voided, cash is reversed and credit removed from the customer.
   */
  async cancel(req: Request, id: string, reason: string) {
    const auth = req.auth!;
    const sale = await this.get(req, id);
    if (sale.status !== 'COMPLETED') throw conflict('SALE_NOT_CANCELLABLE', 'Seule une vente terminée sans retour peut être annulée');
    if (sale.returns.length) throw conflict('SALE_HAS_RETURNS', 'Cette vente a des retours : utilisez un remboursement');

    await prisma.$transaction(async (tx) => {
      const updated = await tx.sale.updateMany({ where: { id, status: 'COMPLETED' }, data: { status: 'CANCELLED', cancelReason: reason, cancelledAt: new Date(), cancelledById: auth.userId } });
      if (!updated.count) throw conflict('SALE_NOT_CANCELLABLE', 'Vente déjà modifiée');

      for (const it of sale.items) {
        const product = await tx.product.findUnique({ where: { id: it.productId }, select: { trackStock: true } });
        if (!product?.trackStock) continue;
        await InventoryService.move(tx, {
          branchId: sale.branchId, productId: it.productId, variantId: it.variantId, quantity: it.quantity, type: 'RETURN', userId: auth.userId,
          unitCost: it.unitCost, referenceType: 'SALE_CANCEL', referenceId: sale.id, reference: sale.invoiceNumber, note: `Annulation : ${reason}`,
        });
      }
      await tx.payment.updateMany({ where: { saleId: id }, data: { status: 'VOID' } });

      const cashPaid = sale.payments.filter((p) => p.paymentMethod.type === 'CASH' && p.status === 'COMPLETED').reduce((a, p) => a.plus(D(p.amount)), D(0));
      if (cashPaid.gt(0)) {
        const session = await CashService.currentSession(auth.userId, sale.branchId, tx);
        const target = session ?? (sale.registerSessionId ? await tx.cashRegisterSession.findFirst({ where: { id: sale.registerSessionId, status: 'OPEN' } }) : null);
        if (!target) throw unprocessable('REGISTER_NOT_OPEN', 'Ouvrez une caisse pour rembourser les espèces de cette vente');
        await CashService.addMovement(tx, { sessionId: target.id, type: 'REFUND', amount: cashPaid.neg(), userId: auth.userId, referenceType: 'SALE_CANCEL', referenceId: sale.id, reference: sale.invoiceNumber, note: reason });
      }

      if (sale.customerId && D(sale.amountDue).gt(0)) {
        const c = await tx.customer.update({ where: { id: sale.customerId }, data: { balance: { decrement: sale.amountDue } } });
        await tx.customerAccountEntry.create({
          data: { customerId: sale.customerId, branchId: sale.branchId, type: 'ADJUSTMENT', amount: D(sale.amountDue).neg().toFixed(), balanceAfter: c.balance, saleId: sale.id, description: `Annulation ${sale.invoiceNumber}`, userId: auth.userId },
        });
      }
      await AuditService.log({ action: 'CANCEL', module: 'sales', recordId: sale.id, description: `Vente ${sale.invoiceNumber} annulée : ${reason}`, metadata: { total: D(sale.total).toFixed() } }, req, tx);
    });

    void NotificationService.notify({
      branchId: sale.branchId, type: 'SALE_CANCELLED', title: 'Vente annulée',
      message: `${sale.invoiceNumber} (${D(sale.total).toFixed()} FCFA) annulée par ${auth.fullName} : ${reason}`, link: `/sales/${sale.id}`,
    });
    return this.get(req, id);
  },
};
