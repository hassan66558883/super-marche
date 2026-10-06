import type { Customer, PriceMode } from './catalog';

export type DiscountType = 'PERCENT' | 'FIXED';
export type SaleStatus = 'COMPLETED' | 'CANCELLED' | 'PARTIALLY_REFUNDED' | 'REFUNDED';
export type PaymentStatus = 'PAID' | 'PARTIAL' | 'CREDIT';
export type PaymentMethodType = 'CASH' | 'CARD' | 'MOBILE_MONEY' | 'BANK_TRANSFER' | 'CREDIT';

export interface PaymentMethod {
  id: string; code: string; name: string; type: PaymentMethodType; provider: string | null; isActive: boolean; sortOrder: number;
}

export interface SaleItem {
  id: string; productId: string; variantId: string | null; productName: string; sku: string;
  quantity: string; unitPrice: string; originalPrice: string; unitCost?: string;
  discountType: DiscountType | null; discountValue: string | null; discountAmount: string; cartDiscountShare: string;
  taxId: string | null; taxRate: string; priceMode: PriceMode; taxAmount: string; netAmount: string; total: string; returnedQuantity: string;
}

export interface SalePayment {
  id: string; amount: string; direction: 'IN' | 'OUT'; reference: string | null; status: 'COMPLETED' | 'VOID'; createdAt: string;
  returnId: string | null;
  paymentMethod: { code: string; name: string; type?: PaymentMethodType };
}

export interface ReturnItem { id: string; saleItemId: string; quantity: string; unitPrice: string; taxAmount: string; total: string; restocked: boolean; saleItem?: { productName: string; sku: string } }
export interface SaleReturn {
  id: string; number: string; saleId: string; reason: 'DAMAGED' | 'WRONG_PRODUCT' | 'CUSTOMER_REQUEST' | 'OTHER'; note: string | null;
  subtotal: string; taxTotal: string; total: string; createdAt: string; items: ReturnItem[]; user: { fullName: string };
  sale?: { id: string; invoiceNumber: string; customer: { id: string; name: string } | null };
  payments?: SalePayment[];
}

export interface Branch { id: string; code: string; name: string; address?: string | null; phone?: string | null; email?: string | null; taxId?: string | null; city?: string | null }

export interface Sale {
  id: string; invoiceNumber: string; clientRef: string | null; branchId: string; cashierId: string; customerId: string | null;
  status: SaleStatus; paymentStatus: PaymentStatus;
  subtotal: string; lineDiscountTotal: string; cartDiscountType: DiscountType | null; cartDiscountValue: string | null; cartDiscountTotal: string;
  discountTotal: string; taxTotal: string; total: string; amountPaid: string; amountDue: string; amountTendered: string; changeGiven: string;
  refundedTotal: string; dueDate: string | null; note: string | null; cancelReason: string | null; cancelledAt: string | null; createdAt: string;
  items: SaleItem[]; payments: SalePayment[]; customer: Customer | null; cashier: { id: string; fullName: string; username?: string };
  branch: Branch; returns: SaleReturn[];
}

export type SaleListItem = Pick<Sale, 'id' | 'invoiceNumber' | 'status' | 'paymentStatus' | 'total' | 'amountDue' | 'amountPaid' | 'discountTotal' | 'createdAt'> & {
  customer: { id: string; name: string } | null; cashier: { id: string; fullName: string }; branch: { code: string; name: string };
  payments: { paymentMethod: { code: string; name: string }; amount: string }[];
};

export interface SaleLineInput {
  productId: string; variantId?: string | null; quantity: number; unitPrice?: number | null;
  discountType?: DiscountType | null; discountValue?: number | null;
}
export interface SaleInput {
  clientRef?: string; customerId?: string | null; items: SaleLineInput[];
  cartDiscount?: { type: DiscountType; value: number } | null;
  payments: { method: string; amount: number; reference?: string | null }[];
  priceList?: 'RETAIL' | 'WHOLESALE'; dueDate?: string | null; note?: string | null; offlineCreatedAt?: string | null;
}

export interface HeldSale { id: string; label: string; customerId: string | null; cart: unknown; itemCount: number; total: string; createdAt: string }

export interface CashRegister { id: string; name: string; branchId: string; openSession: { id: string; openedBy: { id: string; fullName: string }; openedAt: string } | null }
export interface CashSession {
  id: string; registerId: string; branchId: string; openedById: string; status: 'OPEN' | 'CLOSED'; openingAmount: string;
  expectedAmount: string | null; countedAmount: string | null; difference: string | null; openingNote: string | null; closingNote: string | null;
  openedAt: string; closedAt: string | null;
  register: { name: string }; openedBy: { id?: string; fullName: string }; closedBy?: { fullName: string } | null;
}
export interface CashMovement { id: string; type: 'OPEN' | 'SALE' | 'REFUND' | 'EXPENSE' | 'CASH_IN' | 'CASH_OUT' | 'CLOSE'; amount: string; reference: string | null; note: string | null; createdAt: string }
export interface CashSummary {
  session: CashSession; opening: string; cashSales: string; cashRefunds: string; cashExpenses: string; cashIn: string; cashOut: string;
  expected: string; salesCount: number; salesTotal: string;
  byMethod: { code: string; name: string; type: PaymentMethodType; in: string; out: string; net: string }[];
  movements?: CashMovement[];
}
