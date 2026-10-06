export type MovementType = 'PURCHASE' | 'SALE' | 'RETURN' | 'ADJUSTMENT' | 'TRANSFER_IN' | 'TRANSFER_OUT' | 'DAMAGE' | 'OPENING';
export interface StockMovement {
  id: string; type: MovementType; quantity: string; balanceAfter: string; unitCost: string | null; referenceType: string | null;
  referenceId: string | null; reference: string | null; note: string | null; createdAt: string; userName: string;
  product: { id: string; name: string; sku: string }; variant: { name: string } | null;
}
export interface StockSummary { skus: number; units: string; costValue: string | null; retailValue: string; low: number; out: number }

export type TransferStatus = 'DRAFT' | 'REQUESTED' | 'APPROVED' | 'IN_TRANSIT' | 'RECEIVED' | 'CANCELLED';
export interface BranchRef { id: string; code: string; name: string }
export interface TransferItem {
  id: string; productId: string; variantId: string | null; quantity: string; receivedQuantity: string | null; sourceStock?: string;
  product: { id: string; name: string; sku: string; unit: { code: string } | null }; variant: { id: string; name: string; sku: string } | null;
}
export interface Transfer {
  id: string; number: string; status: TransferStatus; note: string | null; fromBranchId: string; toBranchId: string;
  fromBranch: BranchRef; toBranch: BranchRef; createdAt: string; requestedAt: string | null; approvedAt: string | null; shippedAt: string | null; receivedAt: string | null; cancelledAt: string | null;
  createdById: string; createdBy?: string | null; approvedBy?: string | null; shippedBy?: string | null; receivedBy?: string | null;
  items: TransferItem[]; _count?: { items: number };
}

export type PurchaseStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'RECEIVED' | 'CANCELLED';
export interface Supplier {
  id: string; code: string; name: string; company: string | null; phone: string | null; email: string | null; address: string | null;
  taxId: string | null; paymentTerms: string | null; balance: string; status: 'ACTIVE' | 'INACTIVE'; createdAt: string;
  stats?: { purchasesTotal: string; purchasesCount: number; openOrders: number };
}
export interface PurchaseItem {
  id: string; productId: string; variantId: string | null; quantity: string; receivedQuantity: string; unitCost: string; taxRate: string; taxAmount: string; total: string;
  product: { id: string; name: string; sku: string; purchasePrice: string; unit: { code: string } | null }; variant: { id: string; name: string; sku: string } | null;
}
export interface PurchaseOrder {
  id: string; number: string; status: PurchaseStatus; supplierId: string; branchId: string; subtotal: string; taxTotal: string; total: string; amountPaid: string;
  expectedAt: string | null; note: string | null; createdAt: string; approvedAt: string | null; receivedAt: string | null; createdById: string;
  supplier: Supplier; branch?: BranchRef; items: PurchaseItem[]; createdBy?: string | null; approvedBy?: string | null; receivedBy?: string | null;
  _count?: { items: number };
}
export interface SupplierLedgerEntry { id: string; type: 'PURCHASE' | 'PAYMENT' | 'ADJUSTMENT' | 'REFUND' | 'SALE'; amount: string; balanceAfter: string; reference: string | null; description: string | null; createdAt: string }
