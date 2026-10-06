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
          { path: '*', element: page(<NotFoundPage />) },
        ],
      },
    ],
  },
  { path: '*', element: <Outlet /> },
]);
