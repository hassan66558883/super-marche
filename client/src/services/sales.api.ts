import { api } from './api';
import type { CashRegister, CashSession, CashSummary, HeldSale, PaymentMethod, Sale, SaleInput, SaleListItem, SaleReturn } from '@/types/sales';

export const PaymentMethodsApi = {
  list: () => api.get<PaymentMethod[]>('/payment-methods'),
};

export interface ReturnInput {
  reason: SaleReturn['reason']; note?: string | null; refundMethod: string;
  items: { saleItemId: string; quantity: number; restock?: boolean }[];
}

export const SalesApi = {
  create: (b: SaleInput) => api.post<Sale>('/sales', b),
  list: (q: Record<string, string | number | undefined>) => api.page<SaleListItem>('/sales', q),
  get: (id: string) => api.get<Sale>(`/sales/${id}`),
  byInvoice: (n: string) => api.get<Sale>(`/sales/invoice/${encodeURIComponent(n)}`),
  cancel: (id: string, reason: string) => api.post<Sale>(`/sales/${id}/cancel`, { reason }),
  createReturn: (id: string, b: ReturnInput) => api.post<SaleReturn>(`/sales/${id}/returns`, b),
};

export const ReturnsApi = {
  list: (q: Record<string, string | number | undefined>) => api.page<SaleReturn>('/returns', q),
  get: (id: string) => api.get<SaleReturn & { sale: Sale }>(`/returns/${id}`),
};

export const HeldSalesApi = {
  list: () => api.get<HeldSale[]>('/held-sales'),
  hold: (b: { label: string; customerId?: string | null; cart: object; itemCount: number; total: number }) => api.post<HeldSale>('/held-sales', b),
  resume: (id: string) => api.post<HeldSale>(`/held-sales/${id}/resume`),
};

export const CashApi = {
  registers: () => api.get<CashRegister[]>('/cash/registers'),
  current: () => api.get<CashSummary | null>('/cash/current'),
  open: (b: { registerId: string; amount: number; note?: string }) => api.post<CashSummary>('/cash/open', b),
  session: (id: string) => api.get<CashSummary>(`/cash/sessions/${id}`),
  sessions: (q: Record<string, string | number | undefined>) => api.page<CashSession>('/cash/sessions', q),
  cashIn: (id: string, b: { amount: number; note: string }) => api.post(`/cash/sessions/${id}/cash-in`, b),
  cashOut: (id: string, b: { amount: number; note: string }) => api.post(`/cash/sessions/${id}/cash-out`, b),
  close: (id: string, b: { amount: number; note?: string }) => api.post<CashSummary>(`/cash/sessions/${id}/close`, b),
};
