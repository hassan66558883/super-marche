import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronsLeft } from 'lucide-react';
import { NAV, canSee } from '@/routes/nav';
import { useAuthStore } from '@/stores/auth.store';
import { useUiStore } from '@/stores/ui.store';
import { cn } from '@/utils/cn';
import { Logo } from './Logo';
import { Tip } from '@/components/ui/tooltip';

export function SidebarNav({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const { t } = useTranslation();
  const perms = useAuthStore((s) => s.user?.permissions ?? []);

  return (
    <nav aria-label="Navigation principale" className="flex-1 space-y-5 overflow-y-auto px-3 py-4 scroll-thin">
      {NAV.map((group, gi) => {
        const items = group.items.filter((i) => canSee(i, perms));
        if (!items.length) return null;
        return (
          <div key={gi}>
            {group.labelKey && !collapsed && (
              <div className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-muted">{t(group.labelKey)}</div>
            )}
            <ul className="space-y-0.5">
              {items.map((item) => {
                const link = (
                  <NavLink
                    to={item.to}
                    end={item.to === '/'}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        'group relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
                        collapsed && 'justify-center px-0',
                        isActive
                          ? 'bg-sidebar-active text-white shadow-md shadow-black/20'
                          : 'text-sidebar-foreground/80 hover:bg-white/5 hover:text-white',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && <span className="absolute inset-y-2 start-0 w-1 rounded-e-full bg-secondary" aria-hidden />}
                        <item.icon className="h-[18px] w-[18px] shrink-0" />
                        {!collapsed && <span className="truncate">{t(item.labelKey)}</span>}
                      </>
                    )}
                  </NavLink>
                );
                return <li key={item.to}>{collapsed ? <Tip label={t(item.labelKey)} side="right">{link}</Tip> : link}</li>;
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

export function Sidebar() {
  const { t } = useTranslation();
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggle = useUiStore((s) => s.toggleSidebar);
  return (
    <aside
      className={cn(
        'hidden shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200 lg:flex',
        collapsed ? 'w-[72px]' : 'w-64',
      )}
    >
      <div className={cn('flex h-16 items-center border-b border-white/10', collapsed ? 'justify-center' : 'px-5')}>
        <Logo compact={collapsed} light />
      </div>
      <SidebarNav collapsed={collapsed} />
      <button
        type="button"
        onClick={toggle}
        className="m-3 flex h-9 items-center justify-center gap-2 rounded-lg text-xs text-sidebar-muted hover:bg-white/5 hover:text-white"
        aria-label={t('header.menu')}
      >
        <ChevronsLeft className={cn('h-4 w-4 transition-transform rtl:rotate-180', collapsed && 'rotate-180 rtl:rotate-0')} />
      </button>
    </aside>
  );
}
