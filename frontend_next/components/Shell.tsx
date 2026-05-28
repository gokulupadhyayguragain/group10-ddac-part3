import Link from 'next/link';
import { useRouter } from 'next/router';
import { ReactNode } from 'react';

const navItems = [
  ['Dashboard', '/'],
  ['Report Missing', '/report'],
  ['Search Map', '/search'],
  ['Sightings', '/sightings'],
  ['Alerts', '/alerts'],
  ['Admin', '/admin'],
  ['Resources', '/resources'],
];

const accountItems = [
  ['Profile', '/profile'],
  ['Login', '/login'],
  ['Register', '/register'],
];

type ShellProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  actions?: ReactNode;
};

export default function Shell({ title, subtitle, children, actions }: ShellProps) {
  const router = useRouter();

  function active(href: string) {
    if (href === '/') return router.pathname === '/';
    return router.pathname === href || router.pathname.startsWith(`${href}/`);
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-slate-200 bg-white lg:block">
        <div className="flex h-full flex-col">
          <div className="border-b border-slate-200 px-5 py-5">
            <div className="text-xs font-semibold uppercase tracking-widest text-teal-700">Scenario 3</div>
            <div className="mt-1 text-xl font-bold">SafeTrace</div>
            <p className="mt-2 text-sm leading-5 text-slate-500">Alzheimer wandering alert and community response.</p>
          </div>

          <nav className="flex-1 space-y-1 px-3 py-4">
            {navItems.map(([label, href]) => (
              <Link
                key={href}
                href={href}
                className={[
                  'block rounded-lg px-3 py-2 text-sm font-medium transition',
                  active(href) ? 'bg-teal-50 text-teal-800' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950',
                ].join(' ')}
              >
                {label}
              </Link>
            ))}
          </nav>

          <div className="border-t border-slate-200 px-3 py-4">
            <div className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Account</div>
            <div className="space-y-1">
              {accountItems.map(([label, href]) => (
                <Link
                  key={href}
                  href={href}
                  className={[
                    'block rounded-lg px-3 py-2 text-sm font-medium transition',
                    active(href) ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100',
                  ].join(' ')}
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur md:px-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{title}</h1>
              {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
            </div>
            {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
          </div>
          <nav className="mt-3 flex gap-2 overflow-x-auto pb-1 lg:hidden">
            {navItems.map(([label, href]) => (
              <Link
                key={href}
                href={href}
                className={[
                  'whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold',
                  active(href) ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-600',
                ].join(' ')}
              >
                {label}
              </Link>
            ))}
          </nav>
        </header>

        <main className="w-full px-4 py-4 md:px-6">{children}</main>
      </div>
    </div>
  );
}
