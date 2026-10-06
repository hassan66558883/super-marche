export type Status = 'ACTIVE' | 'INACTIVE';
export type PriceMode = 'INCLUSIVE' | 'EXCLUSIVE';

export interface TaxInfo { id: string; name: string; rate: string }
export interface Tax { id: string; name: string; code: string; rate: string; status: Status }
export interface Unit { id: string; code: string; name: string; nameAr: string | null; nameEn: string | null; allowDecimal: boolean; isSystem?: boolean }
export interface Brand { id: string; name: string; status?: Status; productCount?: number }
export interface Category {
  id: string; name: string; nameAr: string | null; nameEn: string | null; icon: string | null; color: string | null;
  parentId?: string | null; taxId?: string | null; sortOrder?: number; status?: Status; productCount?: number;
  tax?: { id: string; name: string; rate: string } | null;
}

export interface ProductVariant {
  id: string; name: string; sku: string; sellingPrice: string; wholesalePrice: string | null; purchasePrice?: string;
  barcode: string | null; stock: string; status: Status;
}

export interface Product {
  id: string; name: string; nameAr: string | null; nameEn: string | null; sku: string; reference: string | null;
  description: string | null; imageUrl: string | null; status: Status; priceMode: PriceMode;
  sellingPrice: string; wholesalePrice: string | null; purchasePrice?: string;
  minStock: string; maxStock: string | null; trackStock: boolean; isQuick: boolean; returnToStock: boolean;
  category: Pick<Category, 'id' | 'name' | 'nameAr' | 'nameEn' | 'icon' | 'color'> | null;
  brand: { id: string; name: string } | null;
  unit: Unit | null;
  taxId: string | null;
  tax: TaxInfo | null;
  barcodes: { id: string; barcode: string; variantId: string | null; isPrimary: boolean }[];
  barcode: string | null;
  stock: string;
  variants: ProductVariant[];
  createdAt: string; updatedAt: string;
}

export type CustomerType = 'WALK_IN' | 'REGISTERED' | 'BUSINESS';
export interface Customer {
  id: string; code: string; type: CustomerType; name: string; phone: string | null; email: string | null; address: string | null;
  taxId: string | null; creditLimit: string; balance: string; paymentTermsDays: number; notes: string | null; status: Status;
  createdAt: string; availableCredit?: string;
  stats?: { totalPurchases: string; salesCount: number; openInvoices: number };
}
