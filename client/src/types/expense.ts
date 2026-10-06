export interface ExpenseCategory { id: string; code: string; name: string; status: 'ACTIVE' | 'INACTIVE' }
export interface Expense {
  id: string; branchId: string; categoryId: string; amount: string; description: string | null; expenseDate: string; paymentMethodCode: string;
  reference: string | null; registerSessionId: string | null; status: 'RECORDED' | 'VOID'; voidReason: string | null; voidedAt: string | null;
  userId: string; userName: string | null; voidedByName: string | null; createdAt: string;
  category: { id: string; code: string; name: string };
}
export interface ExpenseInput {
  categoryId: string; amount: number; description: string; expenseDate?: string; method: string; reference?: string | null; fromRegister: boolean;
}
