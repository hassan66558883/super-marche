import { api } from './api';
import type { BranchRef, PurchaseOrder, StockMovement, StockSummary, Supplier, SupplierLedgerEntry, Transfer } from '@/types/stock';

type Q = Record<string, string | number | undefined>;
export interface LineInput { productId: string; variantId?: string | null; quantity: number }

export const InventoryApi = {
  summary: () => api.get<StockSummary>('/inventory/summary'),
  movements: (q: Q) => api.page<StockMovement>('/inventory/movements', q),
  adjust: (b: { productId: string; variantId?: string | null; mode: 'SET' | 'DELTA' | 'DAMAGE'; quantity: number; note: string }) => api.post<StockMovement>('/inventory/adjust', b),
};

export const TransfersApi = {
  list: (q: Q) => api.page<Transfer>('/transfers', q),
  get: (id: string) => api.get<Transfer>(`/transfers/${id}`),
  create: (b: { toBranchId: string; items: LineInput[]; note?: string | null; submit: boolean }) => api.post<Transfer>('/transfers', b),
  update: (id: string, b: { toBranchId: string; items: LineInput[]; note?: string | null; submit: boolean }) => api.put<Transfer>(`/transfers/${id}`, b),
  approve: (id: string) => api.post<Transfer>(`/transfers/${id}/approve`),
  ship: (id: string) => api.post<Transfer>(`/transfers/${id}/ship`),
  receive: (id: string, b: { items: { itemId: string; receivedQuantity: number }[]; note?: string | null }) => api.post<Transfer>(`/transfers/${id}/receive`, b),
  cancel: (id: string, reason: string) => api.post<Transfer>(`/transfers/${id}/cancel`, { reason }),
};

export interface PurchaseInput {
  supplierId: string; items: (LineInput & { unitCost: number; taxRate: number })[]; expectedAt?: string | null; note?: string | null; submit: boolean;
}
export const PurchasesApi = {
  list: (q: Q) => api.page<PurchaseOrder>('/purchases', q),
  get: (id: string) => api.get<PurchaseOrder>(`/purchases/${id}`),
  create: (b: PurchaseInput) => api.post<PurchaseOrder>('/purchases', b),
  update: (id: string, b: PurchaseInput) => api.put<PurchaseOrder>(`/purchases/${id}`, b),
  submit: (id: string) => api.post<PurchaseOrder>(`/purchases/${id}/submit`),
  approve: (id: string) => api.post<PurchaseOrder>(`/purchases/${id}/approve`),
  receive: (id: string, b: { items: { itemId: string; quantity: number }[]; updateCost: boolean; note?: string | null }) => api.post<PurchaseOrder>(`/purchases/${id}/receive`, b),
  cancel: (id: string, reason: string) => api.post<PurchaseOrder>(`/purchases/${id}/cancel`, { reason }),
};

export interface SupplierInput { name: string; company?: string | null; phone?: string | null; email?: string | null; address?: string | null; taxId?: string | null; paymentTerms?: string | null; status: 'ACTIVE' | 'INACTIVE' }
export const SuppliersApi = {
  list: (q: Q) => api.page<Supplier>('/suppliers', q),
  get: (id: string) => api.get<Supplier>(`/suppliers/${id}`),
  create: (b: SupplierInput) => api.post<Supplier>('/suppliers', b),
  update: (id: string, b: SupplierInput) => api.put<Supplier>(`/suppliers/${id}`, b),
  ledger: (id: string, page = 1) => api.page<SupplierLedgerEntry>(`/suppliers/${id}/ledger`, { page, pageSize: 50 }),
  purchases: (id: string) => api.page<PurchaseOrder>(`/suppliers/${id}/purchases`, { pageSize: 50 }),
  pay: (id: string, b: { amount: number; method: string; reference?: string | null; note?: string | null; fromRegister: boolean }) =>
    api.post<{ supplier: Supplier }>(`/suppliers/${id}/payments`, b),
};

export const BranchesApi = {
  list: () => api.get<(BranchRef & { city: string | null })[]>('/branches'),
};
