import {
  LayoutDashboard, ShoppingCart, Receipt, FileText, Package, Tags, Warehouse, ArrowLeftRight, Truck, Factory,
  Users, Wallet, HandCoins, BarChart3, UserCog, Settings, ShieldCheck, Undo2, type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  labelKey: string;
  icon: LucideIcon;
  permission?: string;
  anyOf?: string[];
}
export interface NavGroup {
  labelKey?: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    items: [
      { to: '/', labelKey: 'nav.dashboard', icon: LayoutDashboard, permission: 'dashboard.view' },
      { to: '/pos', labelKey: 'nav.pos', icon: ShoppingCart, permission: 'sales.create' },
    ],
  },
  {
    labelKey: 'nav.groupSales',
    items: [
      { to: '/sales', labelKey: 'nav.sales', icon: Receipt, permission: 'sales.view' },
      { to: '/invoices', labelKey: 'nav.invoices', icon: FileText, permission: 'sales.view' },
      { to: '/returns', labelKey: 'nav.returns', icon: Undo2, permission: 'sales.return' },
      { to: '/customers', labelKey: 'nav.customers', icon: Users, permission: 'customers.view' },
    ],
  },
  {
    labelKey: 'nav.groupCatalog',
    items: [
      { to: '/products', labelKey: 'nav.products', icon: Package, permission: 'products.view' },
      { to: '/categories', labelKey: 'nav.categories', icon: Tags, permission: 'categories.manage' },
      { to: '/inventory', labelKey: 'nav.inventory', icon: Warehouse, permission: 'inventory.view' },
      { to: '/transfers', labelKey: 'nav.transfers', icon: ArrowLeftRight, permission: 'transfers.view' },
      { to: '/purchases', labelKey: 'nav.purchases', icon: Truck, permission: 'purchases.view' },
      { to: '/suppliers', labelKey: 'nav.suppliers', icon: Factory, permission: 'suppliers.view' },
    ],
  },
  {
    labelKey: 'nav.groupFinance',
    items: [
      { to: '/cash', labelKey: 'nav.cash', icon: Wallet, anyOf: ['cash.operate', 'cash.view'] },
      { to: '/expenses', labelKey: 'nav.expenses', icon: HandCoins, anyOf: ['expenses.view', 'expenses.create'] },
      { to: '/reports', labelKey: 'nav.reports', icon: BarChart3, permission: 'reports.view' },
    ],
  },
  {
    labelKey: 'nav.groupAdmin',
    items: [
      { to: '/users', labelKey: 'nav.users', icon: UserCog, permission: 'users.view' },
      { to: '/audit', labelKey: 'nav.audit', icon: ShieldCheck, permission: 'audit.view' },
      { to: '/settings', labelKey: 'nav.settings', icon: Settings, permission: 'settings.manage' },
    ],
  },
];

export const canSee = (item: Pick<NavItem, 'permission' | 'anyOf'>, perms: string[]) =>
  (!item.permission || perms.includes(item.permission)) && (!item.anyOf || item.anyOf.some((p) => perms.includes(p)));

/** First page the user may open (cashiers land on the POS). */
export function homePath(perms: string[]): string {
  if (perms.includes('dashboard.view')) return '/';
  if (perms.includes('sales.create')) return '/pos';
  for (const g of NAV) for (const i of g.items) if (canSee(i, perms)) return i.to;
  return '/profile';
}
