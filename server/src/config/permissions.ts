// Single source of truth for permissions and default role grants.
// Seeded into the database; enforced by `requirePermission` middleware.

export const PERMISSIONS = {
  // Dashboard
  'dashboard.view': 'Voir le tableau de bord',
  // Products & catalog
  'products.view': 'Voir les produits',
  'products.create': 'Créer des produits',
  'products.edit': 'Modifier les produits',
  'products.delete': 'Désactiver/supprimer des produits',
  'products.view_cost': 'Voir les prix d’achat et marges',
  'categories.manage': 'Gérer catégories, marques et unités',
  // Customers
  'customers.view': 'Voir les clients',
  'customers.create': 'Créer des clients',
  'customers.edit': 'Modifier des clients',
  'customers.payment': 'Encaisser un paiement client (crédit)',
  // Sales / POS
  'sales.view': 'Voir les ventes',
  'sales.view_all': 'Voir les ventes de tous les caissiers',
  'sales.create': 'Vendre (point de vente)',
  'sales.edit': 'Modifier une vente',
  'sales.cancel': 'Annuler une vente',
  'sales.return': 'Effectuer des retours / remboursements',
  'sales.credit': 'Vendre à crédit',
  'sales.price_override': 'Modifier le prix de vente en caisse',
  'sales.discount': 'Accorder des remises',
  'sales.discount_override': 'Dépasser la limite de remise',
  // Inventory
  'inventory.view': 'Voir le stock',
  'inventory.adjust': 'Ajuster le stock',
  'transfers.view': 'Voir les transferts',
  'transfers.create': 'Créer des transferts',
  'transfers.approve': 'Approuver / expédier des transferts',
  'transfers.receive': 'Réceptionner des transferts',
  // Purchasing
  'purchases.view': 'Voir les achats',
  'purchases.create': 'Créer des bons de commande',
  'purchases.approve': 'Approuver des bons de commande',
  'purchases.receive': 'Réceptionner des achats',
  'suppliers.view': 'Voir les fournisseurs',
  'suppliers.manage': 'Gérer les fournisseurs et leurs paiements',
  // Cash
  'cash.view': 'Voir les sessions de caisse',
  'cash.operate': 'Ouvrir / fermer sa caisse',
  'cash.manage': 'Gérer toutes les caisses',
  'expenses.view': 'Voir les dépenses',
  'expenses.create': 'Saisir des dépenses',
  'expenses.void': 'Annuler des dépenses',
  // Reports
  'reports.view': 'Voir les rapports',
  'reports.export': 'Exporter les rapports',
  // Users & settings
  'users.view': 'Voir les utilisateurs',
  'users.create': 'Créer des utilisateurs',
  'users.edit': 'Modifier des utilisateurs',
  'users.delete': 'Désactiver des utilisateurs',
  'roles.manage': 'Gérer rôles et permissions',
  'branches.manage': 'Gérer les succursales',
  'branches.all': 'Accéder à toutes les succursales',
  'settings.manage': 'Gérer les paramètres',
  'audit.view': 'Consulter le journal d’audit',
} as const;

export type PermissionCode = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as PermissionCode[];

const p = (...codes: PermissionCode[]) => codes;

export interface RoleDefinition {
  code: string;
  name: string;
  description: string;
  maxDiscountPercent: number;
  permissions: PermissionCode[];
}

export const DEFAULT_ROLES: RoleDefinition[] = [
  {
    code: 'SUPER_ADMIN',
    name: 'Super administrateur',
    description: 'Accès complet à toutes les succursales et paramètres',
    maxDiscountPercent: 100,
    permissions: ALL_PERMISSIONS,
  },
  {
    code: 'ADMIN',
    name: 'Administrateur',
    description: 'Administration de l’entreprise',
    maxDiscountPercent: 100,
    permissions: ALL_PERMISSIONS.filter((c) => c !== 'roles.manage'),
  },
  {
    code: 'MANAGER',
    name: 'Gérant',
    description: 'Gestion d’une succursale',
    maxDiscountPercent: 30,
    permissions: p(
      'dashboard.view', 'products.view', 'products.create', 'products.edit', 'products.view_cost',
      'categories.manage', 'customers.view', 'customers.create', 'customers.edit', 'customers.payment',
      'sales.view', 'sales.view_all', 'sales.create', 'sales.cancel', 'sales.return', 'sales.credit',
      'sales.price_override', 'sales.discount', 'sales.discount_override',
      'inventory.view', 'inventory.adjust', 'transfers.view', 'transfers.create', 'transfers.approve',
      'transfers.receive', 'purchases.view', 'purchases.create', 'purchases.approve', 'purchases.receive',
      'suppliers.view', 'suppliers.manage', 'cash.view', 'cash.operate', 'cash.manage',
      'expenses.view', 'expenses.create', 'expenses.void', 'reports.view', 'reports.export',
      'users.view', 'audit.view',
    ),
  },
  {
    code: 'CASHIER',
    name: 'Caissier',
    description: 'Ventes au point de vente',
    maxDiscountPercent: 5,
    permissions: p(
      'products.view', 'customers.view', 'customers.create', 'sales.view', 'sales.create',
      'sales.discount', 'inventory.view', 'cash.operate', 'expenses.create',
    ),
  },
  {
    code: 'STOCK_MANAGER',
    name: 'Gestionnaire de stock',
    description: 'Stock, transferts et réceptions',
    maxDiscountPercent: 0,
    permissions: p(
      'dashboard.view', 'products.view', 'products.create', 'products.edit', 'categories.manage',
      'inventory.view', 'inventory.adjust', 'transfers.view', 'transfers.create', 'transfers.receive',
      'purchases.view', 'purchases.receive', 'suppliers.view', 'reports.view',
    ),
  },
  {
    code: 'PURCHASING',
    name: 'Acheteur',
    description: 'Achats et fournisseurs',
    maxDiscountPercent: 0,
    permissions: p(
      'dashboard.view', 'products.view', 'products.view_cost', 'inventory.view', 'purchases.view',
      'purchases.create', 'purchases.receive', 'suppliers.view', 'suppliers.manage', 'reports.view',
    ),
  },
  {
    code: 'ACCOUNTANT',
    name: 'Comptable',
    description: 'Finances, dépenses et rapports',
    maxDiscountPercent: 0,
    permissions: p(
      'dashboard.view', 'products.view', 'products.view_cost', 'customers.view', 'customers.payment',
      'sales.view', 'sales.view_all', 'purchases.view', 'suppliers.view', 'suppliers.manage',
      'cash.view', 'expenses.view', 'expenses.create', 'expenses.void', 'reports.view',
      'reports.export', 'branches.all', 'audit.view',
    ),
  },
  {
    code: 'AUDITOR',
    name: 'Auditeur',
    description: 'Lecture seule et journal d’audit',
    maxDiscountPercent: 0,
    permissions: p(
      'dashboard.view', 'products.view', 'products.view_cost', 'customers.view', 'sales.view',
      'sales.view_all', 'inventory.view', 'transfers.view', 'purchases.view', 'suppliers.view',
      'cash.view', 'expenses.view', 'reports.view', 'reports.export', 'users.view', 'branches.all',
      'audit.view',
    ),
  },
];
