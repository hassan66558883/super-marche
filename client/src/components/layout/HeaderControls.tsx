import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Building2, Check, ChevronDown, Globe, KeyRound, LogOut, Moon, Sun, Monitor, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuthStore, useCurrentBranch } from '@/stores/auth.store';
import { useUiStore, type Theme } from '@/stores/ui.store';
import { AuthApi } from '@/services/auth.service';
import { LANGUAGES, applyLanguage, type LanguageCode } from '@/i18n';
import { cn } from '@/utils/cn';

export function BranchSwitcher({ compact }: { compact?: boolean }) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const setBranch = useAuthStore((s) => s.setBranch);
  const branch = useCurrentBranch();
  const qc = useQueryClient();
  if (!user || !branch) return null;
  const single = user.branches.length <= 1;

  const content = (
    <span className="flex min-w-0 items-center gap-2">
      <Building2 className="h-4 w-4 shrink-0 text-primary" />
      <span className="truncate font-semibold">{branch.name}</span>
      {!compact && <span className="hidden rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline">{branch.code}</span>}
    </span>
  );
  // Assigned to a single branch: show it, nothing to choose
  if (single) return <div className="flex h-9 min-w-0 max-w-[220px] items-center rounded-lg px-2 text-sm" aria-label={t('header.branch')}>{content}</div>;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-9 min-w-0 max-w-[260px] shrink gap-1 px-2" aria-label={t('header.switchBranch')}>
          {content}
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>{t('header.switchBranch')}</DropdownMenuLabel>
        {user.branches.map((b) => (
          <DropdownMenuItem
            key={b.id}
            onSelect={() => {
              setBranch(b.id);
              void qc.invalidateQueries();
            }}
          >
            <Check className={cn('h-4 w-4', b.id === branch.id ? 'opacity-100' : 'opacity-0')} />
            <span className="flex-1">{b.name}</span>
            <span className="font-mono text-[10px] text-muted-foreground">{b.code}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function LanguageSwitcher({ variant = 'ghost' }: { variant?: 'ghost' | 'outline' }) {
  const { t, i18n } = useTranslation();
  const authed = useAuthStore((s) => s.status === 'authenticated');
  const change = (code: LanguageCode) => {
    applyLanguage(code);
    if (authed) void AuthApi.updatePreferences({ locale: code }).catch(() => undefined);
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size="sm" className="h-9 gap-1.5" aria-label={t('header.language')}>
          <Globe className="h-4 w-4" />
          <span className="hidden text-xs font-semibold uppercase sm:inline">{i18n.language}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[10rem]">
        {LANGUAGES.map((l) => (
          <DropdownMenuItem key={l.code} onSelect={() => change(l.code)}>
            <Check className={cn('h-4 w-4', i18n.language === l.code ? 'opacity-100' : 'opacity-0')} />
            {l.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ThemeToggle() {
  const { t } = useTranslation();
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const authed = useAuthStore((s) => s.status === 'authenticated');
  const options: { v: Theme; icon: typeof Sun; label: string }[] = [
    { v: 'light', icon: Sun, label: t('header.light') },
    { v: 'dark', icon: Moon, label: t('header.dark') },
    { v: 'system', icon: Monitor, label: t('header.system') },
  ];
  const Current = theme === 'dark' ? Moon : theme === 'system' ? Monitor : Sun;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9" aria-label={t('header.theme')}>
          <Current className="h-[18px] w-[18px]" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[9rem]">
        {options.map((o) => (
          <DropdownMenuItem
            key={o.v}
            onSelect={() => {
              setTheme(o.v);
              if (authed) void AuthApi.updatePreferences({ theme: o.v }).catch(() => undefined);
            }}
          >
            <o.icon />
            <span className="flex-1">{o.label}</span>
            {theme === o.v && <Check className="h-4 w-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function UserMenu() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const qc = useQueryClient();
  if (!user) return null;
  const initials = user.fullName.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="flex items-center gap-2 rounded-lg p-1 pe-2 hover:bg-muted" aria-label={t('auth.profile')}>
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{initials}</span>
          <span className="hidden text-start leading-tight md:block">
            <span className="block max-w-[140px] truncate text-sm font-semibold">{user.fullName}</span>
            <span className="block text-[11px] text-muted-foreground">{user.roles[0]?.name}</span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="text-sm font-semibold text-foreground">{user.fullName}</div>
          <div className="font-normal">@{user.username}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/profile')}>
          <UserRound /> {t('auth.profile')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate('/profile#password')}>
          <KeyRound /> {t('auth.changePassword')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          destructive
          onSelect={async () => {
            await AuthApi.logout();
            qc.clear();
            navigate('/login', { replace: true });
          }}
        >
          <LogOut /> {t('auth.logout')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
