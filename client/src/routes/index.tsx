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
          { path: '*', element: page(<NotFoundPage />) },
        ],
      },
    ],
  },
  { path: '*', element: <Outlet /> },
]);
