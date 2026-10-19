import { ReactNode, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { cn } from '@/lib/utils';
import { LayoutDashboard, Calendar, Users, Image as ImageIcon, BarChart3, Rocket, Settings, Search, Plus, X, Menu } from 'lucide-react';
import { SettingsModal } from '@/components/settings-modal';
import { CommandPalette, openCommandPalette, OPEN_QUICK_CAPTURE_EVENT } from '@/components/command-palette';
import { QuickCapture } from '@/components/quick-capture';
import { PwaInstallPrompt } from '@/components/pwa-install-prompt';
import { useSaveStatus } from '@/hooks/use-store';

const navItems = [
  { href: '/', label: 'Today', icon: LayoutDashboard },
  { href: '/calendar', label: 'Calendar', icon: Calendar },
  { href: '/clients', label: 'Clients', icon: Users },
  { href: '/assets', label: 'Assets', icon: ImageIcon },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
  { href: '/launch', label: 'Launch', icon: Rocket },
];

function SaveDot() {
  const { status, lastSavedAt } = useSaveStatus();
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <span className={cn(
        'h-1.5 w-1.5 rounded-full',
        status === 'saved' && 'bg-emerald-500',
        status === 'saving' && 'animate-pulse bg-amber-500',
        status === 'offline' && 'bg-red-500',
        status === 'loading' && 'bg-muted-foreground',
      )} />
      {status === 'saved' && `Saved${lastSavedAt ? ` ${new Date(lastSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}`}
      {status === 'saving' && 'Saving…'}
      {status === 'offline' && 'Offline'}
      {status === 'loading' && 'Loading…'}
    </span>
  );
}

export function Sidebar() {
  const [location] = useLocation();
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="hidden md:flex w-64 flex-shrink-0 flex-col h-[100dvh] border-r border-border bg-sidebar overflow-y-auto">
      <div className="p-6 pb-2">
        <h1 className="font-serif text-xl text-primary font-medium tracking-wide">Content Desk</h1>
        <p className="text-xs text-muted-foreground mt-1 tracking-wider uppercase">Editorial Workspace</p>
      </div>

      <nav className="flex-1 px-4 py-6 space-y-1">
        {navItems.map((item) => {
          const active = location === item.href || (item.href !== '/' && location.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href} className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}>
              <item.icon className="w-4 h-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-border/50">
        <button
          onClick={openCommandPalette}
          className="mb-2 flex w-full items-center justify-between rounded-md border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <span>Quick search</span>
          <kbd className="rounded bg-secondary px-1.5 py-0.5">⌘K</kbd>
        </button>
        <button
          onClick={() => setSettingsOpen(true)}
          className="flex items-center gap-3 px-3 py-2 w-full rounded-md text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
        >
          <Settings className="w-4 h-4" />
          Settings
        </button>
        <div className="mt-3 px-3 text-xs"><SaveDot /></div>
      </div>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

function MobileTopBar() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [location] = useLocation();
  return (
    <div className="flex md:hidden items-center justify-between border-b border-border bg-sidebar px-2 py-2">
      <div className="flex items-center gap-1">
        <button onClick={() => setDrawerOpen(true)} className="rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </button>
        <h1 className="font-serif text-lg text-primary font-medium tracking-wide">Content Desk</h1>
      </div>
      <div className="flex items-center gap-1">
        <SaveDot />
        <button onClick={openCommandPalette} className="ml-2 rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="Search">
          <Search className="h-5 w-5" />
        </button>
        <button onClick={() => setSettingsOpen(true)} className="rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="Settings">
          <Settings className="h-5 w-5" />
        </button>
      </div>
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex bg-background/70 backdrop-blur-sm md:hidden" onClick={() => setDrawerOpen(false)}>
          <div className="flex h-full w-72 max-w-[85vw] flex-col border-r border-border bg-sidebar animate-in slide-in-from-left-4" onClick={event => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border/50 p-4">
              <div>
                <h1 className="font-serif text-lg text-primary font-medium tracking-wide">Content Desk</h1>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Editorial Workspace</p>
              </div>
              <button onClick={() => setDrawerOpen(false)} className="rounded-md p-1.5 text-muted-foreground hover:text-foreground" aria-label="Close menu"><X className="h-5 w-5" /></button>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto p-3">
              {navItems.map(item => {
                const active = location === item.href || (item.href !== '/' && location.startsWith(item.href));
                return (
                  <Link key={item.href} href={item.href} onClick={() => setDrawerOpen(false)} className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
                    active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                  )}>
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <div className="border-t border-border/50 p-3">
              <button onClick={() => { setDrawerOpen(false); setSettingsOpen(true); }} className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground">
                <Settings className="h-4 w-4" />
                Settings
              </button>
              <div className="mt-2 px-3 text-xs"><SaveDot /></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MobileTabBar() {
  const [location] = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const tabs = [navItems[0], navItems[1]];
  const tabsRight = [navItems[2]];
  const moreItems = [navItems[3], navItems[4], navItems[5]];
  const moreActive = moreItems.some(item => location === item.href || location.startsWith(item.href + '/'));

  const tabClass = (href: string) => cn(
    'flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors',
    location === href || (href !== '/' && location.startsWith(href)) ? 'text-primary' : 'text-muted-foreground'
  );

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-border bg-sidebar/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {tabs.map(item => (
          <Link key={item.href} href={item.href} className={tabClass(item.href)}>
            <item.icon className="h-5 w-5" />
            {item.label}
          </Link>
        ))}
        <div className="flex flex-1 items-center justify-center">
          <button
            onClick={() => window.dispatchEvent(new Event(OPEN_QUICK_CAPTURE_EVENT))}
            className="-mt-5 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 active:scale-95"
            aria-label="Capture idea"
          >
            <Plus className="h-6 w-6" />
          </button>
        </div>
        {tabsRight.map(item => (
          <Link key={item.href} href={item.href} className={tabClass(item.href)}>
            <item.icon className="h-5 w-5" />
            {item.label}
          </Link>
        ))}
        <button onClick={() => setMoreOpen(true)} className={cn('flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium', moreActive ? 'text-primary' : 'text-muted-foreground')}>
          <BarChart3 className="h-5 w-5" />
          More
        </button>
      </nav>

      {moreOpen && (
        <div className="fixed inset-0 z-50 flex items-end bg-background/70 backdrop-blur-sm md:hidden" onClick={() => setMoreOpen(false)}>
          <div className="w-full rounded-t-2xl border-t border-border bg-card p-4 pb-[calc(16px+env(safe-area-inset-bottom))] animate-in slide-in-from-bottom-4" onClick={event => event.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-serif text-lg">More</h2>
              <button onClick={() => setMoreOpen(false)} className="rounded-md p-1.5 text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-1">
              {moreItems.map(item => (
                <Link key={item.href} href={item.href} className="flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium text-foreground hover:bg-secondary" onClick={() => setMoreOpen(false)}>
                  <item.icon className="h-5 w-5 text-muted-foreground" />
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] bg-background text-foreground selection:bg-primary/30">
      <Sidebar />
      <div className="flex h-[100dvh] min-w-0 flex-1 flex-col">
        <MobileTopBar />
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden pb-16 md:pb-0">
          {children}
        </main>
      </div>
      <MobileTabBar />
      <CommandPalette />
      <QuickCapture />
      <PwaInstallPrompt />
    </div>
  );
}
