import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Outlet } from 'react-router-dom';
import { AppLayout } from '@/layouts/AppLayout';
import { RequireAuth, RequirePermission, HomeRedirect, FullScreenLoader } from './guards';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';

const LoginPage = lazy(() => import('@/pages/auth/LoginPage'));
const ForgotPasswordPage = lazy(() => import('@/pages/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('@/pages/auth/ResetPasswordPage'));
const DashboardPage = lazy(() => import('@/pages/dashboard/DashboardPage'));
const ProfilePage = lazy(() => import('@/pages/profile/ProfilePage'));
const NotFoundPage = lazy(() => import('@/pages/errors/NotFoundPage'));
const ProductsPage = lazy(() => import('@/pages/products/ProductsPage'));
const ProductFormPage = lazy(() => import('@/pages/products/ProductFormPage'));
const CategoriesPage = lazy(() => import('@/pages/products/CategoriesPage'));
const CustomersPage = lazy(() => import('@/pages/customers/CustomersPage'));
const CustomerDetailPage = lazy(() => import('@/pages/customers/CustomerDetailPage'));
const POSPage = lazy(() => import('@/pages/pos/POSPage'));
const InventoryPage = lazy(() => import('@/pages/inventory/InventoryPage'));
const TransfersPage = lazy(() => import('@/pages/transfers/TransfersPage'));
const TransferFormPage = lazy(() => import('@/pages/transfers/TransferFormPage'));
const TransferDetailPage = lazy(() => import('@/pages/transfers/TransferDetailPage'));
const PurchasesPage = lazy(() => import('@/pages/purchases/PurchasesPage'));
const PurchaseFormPage = lazy(() => import('@/pages/purchases/PurchaseFormPage'));
const PurchaseDetailPage = lazy(() => import('@/pages/purchases/PurchaseDetailPage'));
const SuppliersPage = lazy(() => import('@/pages/suppliers/SuppliersPage'));
const SupplierDetailPage = lazy(() => import('@/pages/suppliers/SupplierDetailPage'));
const CashPage = lazy(() => import('@/pages/cash/CashPage'));
const CashSessionPage = lazy(() => import('@/pages/cash/CashSessionPage'));
const ExpensesPage = lazy(() => import('@/pages/expenses/ExpensesPage'));
const SalesPage = lazy(() => import('@/pages/sales/SalesPage'));
const SaleDetailPage = lazy(() => import('@/pages/sales/SaleDetailPage'));
const ReturnsPage = lazy(() => import('@/pages/returns/ReturnsPage'));

const page = (el: ReactNode, permission?: string, anyOf?: string[]) => (
  <ErrorBoundary>
    <Suspense fallback={<FullScreenLoader />}>
      {permission || anyOf ? <RequirePermission permission={permission} anyOf={anyOf}>{el}</RequirePermission> : el}
    </Suspense>
  </ErrorBoundary>
);

export const router = createBrowserRouter([
  { path: '/login', element: page(<LoginPage />) },
  { path: '/forgot-password', element: page(<ForgotPasswordPage />) },
  { path: '/reset-password', element: page(<ResetPasswordPage />) },
  {
    element: <RequireAuth />,
    children: [
      // Full-screen point of sale (own top bar, no sidebar)
      { path: 'pos', element: <div className="h-full">{page(<POSPage />, 'sales.create')}</div> },
      {
        element: <AppLayout />,
        children: [
          { index: true, element: page(<HomeRedirect><DashboardPage /></HomeRedirect>) },
          { path: 'profile', element: page(<ProfilePage />) },
          { path: 'products', element: page(<ProductsPage />, 'products.view') },
          { path: 'products/new', element: page(<ProductFormPage />, 'products.create') },
          { path: 'products/:id/edit', element: page(<ProductFormPage />, 'products.edit') },
          { path: 'categories', element: page(<CategoriesPage />, 'categories.manage') },
          { path: 'customers', element: page(<CustomersPage />, 'customers.view') },
          { path: 'customers/:id', element: page(<CustomerDetailPage />, 'customers.view') },
          { path: 'inventory', element: page(<InventoryPage />, 'inventory.view') },
          { path: 'transfers', element: page(<TransfersPage />, 'transfers.view') },
          { path: 'transfers/new', element: page(<TransferFormPage />, 'transfers.create') },
          { path: 'transfers/:id', element: page(<TransferDetailPage />, 'transfers.view') },
          { path: 'transfers/:id/edit', element: page(<TransferFormPage />, 'transfers.create') },
          { path: 'purchases', element: page(<PurchasesPage />, 'purchases.view') },
          { path: 'purchases/new', element: page(<PurchaseFormPage />, 'purchases.create') },
          { path: 'purchases/:id', element: page(<PurchaseDetailPage />, 'purchases.view') },
          { path: 'purchases/:id/edit', element: page(<PurchaseFormPage />, 'purchases.create') },
          { path: 'suppliers', element: page(<SuppliersPage />, 'suppliers.view') },
          { path: 'suppliers/:id', element: page(<SupplierDetailPage />, 'suppliers.view') },
          { path: 'cash', element: page(<CashPage />, undefined, ['cash.operate', 'cash.view']) },
          { path: 'cash/sessions/:id', element: page(<CashSessionPage />, undefined, ['cash.operate', 'cash.view']) },
          { path: 'expenses', element: page(<ExpensesPage />, undefined, ['expenses.view', 'expenses.create']) },
          { path: 'sales', element: page(<SalesPage />, 'sales.view') },
          { path: 'sales/:id', element: page(<SaleDetailPage />, 'sales.view') },
          { path: 'invoices', element: page(<SalesPage key="invoices" mode="invoices" />, 'sales.view') },
          { path: 'returns', element: page(<ReturnsPage />, 'sales.return') },
          { path: '*', element: page(<NotFoundPage />) },
        ],
      },
    ],
  },
  { path: '*', element: <Outlet /> },
]);
