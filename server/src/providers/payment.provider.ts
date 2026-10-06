/**
 * Payment provider abstraction. A payment method (payment_methods.provider) points to
 * a provider key; the sale service never knows which mobile-money operator is behind it.
 * Real Airtel Money / Moov Money adapters implement this interface and register below.
 */
export interface PaymentRequest {
  amount: string;
  currency: string;
  reference?: string;
  customerPhone?: string | null;
  description?: string;
}
export interface PaymentResult {
  status: 'CONFIRMED' | 'PENDING' | 'FAILED';
  reference: string | null;
  message?: string;
}
export interface PaymentProvider {
  readonly key: string;
  readonly displayName: string;
  /** Called before the sale transaction; must be idempotent for a given reference. */
  initiate(req: PaymentRequest): Promise<PaymentResult>;
  getStatus(reference: string): Promise<PaymentResult>;
  refund(reference: string, amount: string): Promise<PaymentResult>;
}

/** Cashier confirms the payment on the customer's phone and types the transaction id. */
export class ManualProvider implements PaymentProvider {
  readonly key = 'manual';
  readonly displayName = 'Confirmation manuelle';
  async initiate(req: PaymentRequest): Promise<PaymentResult> {
    return { status: 'CONFIRMED', reference: req.reference ?? null };
  }
  async getStatus(reference: string): Promise<PaymentResult> {
    return { status: 'CONFIRMED', reference };
  }
  async refund(reference: string): Promise<PaymentResult> {
    return { status: 'CONFIRMED', reference };
  }
}

const registry = new Map<string, PaymentProvider>([['manual', new ManualProvider()]]);

export const PaymentProviders = {
  register(p: PaymentProvider) {
    registry.set(p.key, p);
  },
  get(key: string | null | undefined): PaymentProvider | null {
    return key ? registry.get(key) ?? null : null;
  },
  list() {
    return [...registry.values()].map((p) => ({ key: p.key, name: p.displayName }));
  },
};
