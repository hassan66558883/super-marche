import { api } from './api';
import type { Expense, ExpenseCategory, ExpenseInput } from '@/types/expense';

export const ExpensesApi = {
  list: (q: Record<string, string | number | undefined>) => api.page<Expense>('/expenses', q),
  create: (b: ExpenseInput) => api.post<Expense>('/expenses', b),
  void: (id: string, reason: string) => api.post<Expense>(`/expenses/${id}/void`, { reason }),
  categories: (all = false) => api.get<ExpenseCategory[]>('/expenses/categories', all ? { all: 'true' } : undefined),
  createCategory: (b: { name: string; status?: 'ACTIVE' | 'INACTIVE' }) => api.post<ExpenseCategory>('/expenses/categories', b),
  updateCategory: (id: string, b: { name: string; status: 'ACTIVE' | 'INACTIVE' }) => api.put<ExpenseCategory>(`/expenses/categories/${id}`, b),
};
