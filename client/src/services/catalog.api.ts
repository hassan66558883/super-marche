import { api } from './api';
import type { Brand, Category, Customer, Product, Tax, Unit } from '@/types/catalog';

export interface ProductInput {
  name: string; nameAr?: string | null; nameEn?: string | null; sku: string; reference?: string | null;
  categoryId?: string | null; brandId?: string | null; unitId?: string | null; taxId?: string | null;
  priceMode: 'INCLUSIVE' | 'EXCLUSIVE'; purchasePrice: number; sellingPrice: number; wholesalePrice?: number | null;
  minStock: number; maxStock?: number | null; trackStock: boolean; isQuick: boolean; returnToStock: boolean;
  imageUrl?: string | null; description?: string | null; status: 'ACTIVE' | 'INACTIVE';
  barcodes: string[];
  variants: { id?: string; name: string; sku: string; sellingPrice?: number | null; wholesalePrice?: number | null; purchasePrice?: number | null; barcode?: string | null; status: 'ACTIVE' | 'INACTIVE' }[];
  openingStock?: number;
}

export const ProductsApi = {
  list: (q: Record<string, string | number | undefined>) => api.page<Product>('/products', q),
  pos: (q: { q?: string; categoryId?: string; quick?: string; page?: number; pageSize?: number }, signal?: AbortSignal) =>
    api.page<Product>('/products/pos', q, signal),
  byCode: (code: string) => api.get<{ product: Product; variantId: string | null }>(`/products/code/${encodeURIComponent(code)}`),
  get: (id: string) => api.get<Product>(`/products/${id}`),
  create: (b: ProductInput) => api.post<Product>('/products', b),
  update: (id: string, b: ProductInput) => api.put<Product>(`/products/${id}`, b),
  remove: (id: string) => api.delete<{ deleted: boolean; deactivated: boolean }>(`/products/${id}`),
  generateBarcode: () => api.get<{ barcode: string }>('/products/generate-barcode'),
  nextSku: (prefix: string) => api.get<{ sku: string }>('/products/next-sku', { prefix }),
};

export const CategoriesApi = {
  list: (all = false) => api.get<Category[]>('/categories', all ? { status: 'ALL' } : undefined),
  create: (b: Partial<Category>) => api.post<Category>('/categories', b),
  update: (id: string, b: Partial<Category>) => api.put<Category>(`/categories/${id}`, b),
  remove: (id: string) => api.delete<{ deleted: boolean }>(`/categories/${id}`),
};
export const BrandsApi = {
  list: () => api.get<Brand[]>('/brands'),
  create: (b: Partial<Brand>) => api.post<Brand>('/brands', b),
  update: (id: string, b: Partial<Brand>) => api.put<Brand>(`/brands/${id}`, b),
  remove: (id: string) => api.delete(`/brands/${id}`),
};
export const UnitsApi = {
  list: () => api.get<Unit[]>('/units'),
  create: (b: Partial<Unit>) => api.post<Unit>('/units', b),
  update: (id: string, b: Partial<Unit>) => api.put<Unit>(`/units/${id}`, b),
  remove: (id: string) => api.delete(`/units/${id}`),
};
export const TaxesApi = {
  list: () => api.get<Tax[]>('/taxes'),
  create: (b: Omit<Partial<Tax>, 'rate'> & { rate: number }) => api.post<Tax>('/taxes', b),
  update: (id: string, b: Omit<Partial<Tax>, 'rate'> & { rate: number }) => api.put<Tax>(`/taxes/${id}`, b),
};

export interface CustomerInput {
  type: Customer['type']; name: string; phone?: string | null; email?: string | null; address?: string | null; taxId?: string | null;
  creditLimit: number; paymentTermsDays: number; notes?: string | null; status: 'ACTIVE' | 'INACTIVE';
}
export interface LedgerEntry {
  id: string; type: 'SALE' | 'PAYMENT' | 'REFUND' | 'ADJUSTMENT'; amount: string; balanceAfter: string; saleId: string | null;
  invoiceNumber: string | null; dueDate: string | null; description: string | null; createdAt: string;
}
export interface CustomerInvoice {
  id: string; invoiceNumber: string; createdAt: string; total: string; amountPaid: string; amountDue: string; dueDate: string | null;
  status: string; paymentStatus: string; branch: { code: string; name: string };
}
export const CustomersApi = {
  list: (q: Record<string, string | number | undefined>) => api.page<Customer>('/customers', q),
  get: (id: string) => api.get<Customer>(`/customers/${id}`),
  create: (b: CustomerInput) => api.post<Customer>('/customers', b),
  update: (id: string, b: CustomerInput) => api.put<Customer>(`/customers/${id}`, b),
  ledger: (id: string, page = 1) => api.page<LedgerEntry>(`/customers/${id}/ledger`, { page, pageSize: 50 }),
  invoices: (id: string, open = false) => api.get<CustomerInvoice[]>(`/customers/${id}/invoices`, { open: open ? 'true' : undefined }),
  receivePayment: (id: string, b: { amount: number; method: string; reference?: string; note?: string }) =>
    api.post<{ customer: Customer; allocations: { invoiceNumber: string; amount: string }[] }>(`/customers/${id}/payments`, b),
};
