import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart3, ScanBarcode, ShieldCheck, Boxes } from 'lucide-react';
import { Logo } from '@/components/layout/Logo';
import { LanguageSwitcher, ThemeToggle } from '@/components/layout/HeaderControls';

export function AuthShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const features = [
    { icon: ScanBarcode, text: t('nav.pos') },
    { icon: Boxes, text: t('nav.inventory') },
    { icon: BarChart3, text: t('nav.reports') },
    { icon: ShieldCheck, text: t('users.rolesTitle') },
  ];
  return (
    <div className="grid min-h-full lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-sidebar p-12 text-white lg:flex lg:flex-col">
        <div className="absolute -end-32 -top-32 h-96 w-96 rounded-full bg-primary/40 blur-3xl" aria-hidden />
        <div className="absolute -bottom-40 -start-20 h-96 w-96 rounded-full bg-secondary/25 blur-3xl" aria-hidden />
        <Logo light className="relative" />
        <div className="relative mt-auto max-w-md">
          <h2 className="text-4xl font-extrabold leading-tight tracking-tight">
            Smart Sales.<br />Smart Stock.<br /><span className="text-secondary">Smart Business.</span>
          </h2>
          <ul className="mt-10 grid grid-cols-2 gap-3">
            {features.map((f) => (
              <li key={f.text} className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm">
                <f.icon className="h-4 w-4 text-secondary" /> {f.text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative mt-12 text-xs text-white/40">© {new Date().getFullYear()} TECHNOVA — N'Djamena, Tchad</p>
      </aside>
      <main className="flex flex-col">
        <div className="flex items-center justify-between p-4 sm:p-6">
          <Logo className="lg:invisible" />
          <div className="flex items-center gap-1">
            <LanguageSwitcher variant="outline" />
            <ThemeToggle />
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center px-4 pb-12 sm:px-6">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </main>
    </div>
  );
}
