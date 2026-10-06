import {
  CupSoda, Wheat, Milk, Droplets, Sparkles, PenLine, Smartphone, Pill, Croissant, SprayCan, Package, Apple, Beef, Fish, Shirt,
  Baby, Coffee, Candy, Wine, Cookie, Egg, Carrot, Hammer, Book, ShoppingBasket, type LucideIcon,
} from 'lucide-react';
import { cn } from '@/utils/cn';

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  CupSoda, Wheat, Milk, Droplets, Sparkles, PenLine, Smartphone, Pill, Croissant, SprayCan, Package, Apple, Beef, Fish, Shirt,
  Baby, Coffee, Candy, Wine, Cookie, Egg, Carrot, Hammer, Book, ShoppingBasket,
};

export function CategoryIcon({ icon, className }: { icon?: string | null; className?: string }) {
  const Icon = (icon && CATEGORY_ICONS[icon]) || Package;
  return <Icon className={cn('h-5 w-5', className)} aria-hidden />;
}

/** Product image, or a clean generated placeholder from the category icon/colour + initials. */
export function ProductThumb({ name, imageUrl, category, className, size = 'md' }: {
  name: string; imageUrl?: string | null; category?: { icon?: string | null; color?: string | null } | null; className?: string; size?: 'sm' | 'md' | 'lg';
}) {
  const color = category?.color ?? '#64748b';
  const dims = size === 'sm' ? 'h-9 w-9' : size === 'lg' ? 'h-full w-full' : 'h-12 w-12';
  if (imageUrl) {
    return <img src={imageUrl} alt="" loading="lazy" className={cn('rounded-lg bg-muted object-cover', dims, className)} />;
  }
  const initials = name.replace(/[^\p{L}\p{N} ]/gu, '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return (
    <div
      className={cn('relative flex items-center justify-center overflow-hidden rounded-lg', dims, className)}
      style={{ background: `linear-gradient(135deg, ${color}22, ${color}0d)`, color }}
      aria-hidden
    >
      <CategoryIcon icon={category?.icon} className={size === 'lg' ? 'h-9 w-9 opacity-90' : size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'} />
      {size === 'lg' && <span className="absolute bottom-1.5 end-2 text-[10px] font-bold opacity-60">{initials}</span>}
    </div>
  );
}
