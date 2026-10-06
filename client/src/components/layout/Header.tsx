import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Menu, ShoppingCart, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, SheetContent, DialogTitle } from '@/components/ui/dialog';
import { BranchSwitcher, LanguageSwitcher, ThemeToggle, UserMenu } from './HeaderControls';
import { NotificationsBell } from './Notifications';
import { SidebarNav } from './Sidebar';
import { Logo } from './Logo';
import { useCan } from '@/stores/auth.store';
import { useOnline } from '@/hooks/useOnline';

export function Header() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const canSell = useCan('sales.create');
  const online = useOnline();

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b bg-card/95 px-3 backdrop-blur sm:px-5">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)} aria-label={t('header.menu')}>
        <Menu className="h-5 w-5" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <SheetContent side="start" className="bg-sidebar p-0 text-sidebar-foreground" aria-describedby={undefined}>
          <DialogTitle className="sr-only">{t('header.menu')}</DialogTitle>
          <div className="flex h-16 items-center border-b border-white/10 px-5">
            <Logo light />
          </div>
          <SidebarNav onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Dialog>

      <BranchSwitcher />
      {!online && (
        <span className="flex items-center gap-1.5 rounded-full bg-warning/15 px-2.5 py-1 text-xs font-medium text-warning">
          <WifiOff className="h-3.5 w-3.5" /> {t('common.offline')}
        </span>
      )}
      <div className="ms-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
        {canSell && (
          <Button asChild variant="secondary" size="sm" className="me-1 hidden h-9 sm:inline-flex">
            <Link to="/pos">
              <ShoppingCart /> {t('nav.pos')}
            </Link>
          </Button>
        )}
        <LanguageSwitcher />
        <ThemeToggle />
        <NotificationsBell />
        <div className="mx-1 hidden h-6 w-px bg-border sm:block" />
        <UserMenu />
      </div>
    </header>
  );
}
