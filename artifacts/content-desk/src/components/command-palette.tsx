import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { Calendar, FileText, Image, LayoutDashboard, Plus, Search, Users, BarChart3, Download, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { useMutateStore, useStore } from '@/hooks/use-store';
import { store } from '@/lib/store';
import { cn } from '@/lib/utils';

const OPEN_PALETTE_EVENT = 'content-desk:open-command-palette';
export const OPEN_QUICK_CAPTURE_EVENT = 'content-desk:open-quick-capture';

export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_PALETTE_EVENT));
}

export function openQuickCapture() {
  window.dispatchEvent(new Event(OPEN_QUICK_CAPTURE_EVENT));
}

type PaletteItem = {
  id: string;
  label: string;
  detail?: string;
  icon: typeof Search;
  keywords?: string;
  run: () => void;
};

export function CommandPalette() {
  const { deliverables, clients } = useStore();
  const { addClient, addDeliverable, generateFromTemplates } = useMutateStore();
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const openPalette = () => setOpen(true);
    const hotkey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.matches('input, textarea, select, [contenteditable="true"]');
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(value => !value);
      } else if (event.key === '/' && !typing && !open) {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener(OPEN_PALETTE_EVENT, openPalette);
    window.addEventListener('keydown', hotkey);
    return () => {
      window.removeEventListener(OPEN_PALETTE_EVENT, openPalette);
      window.removeEventListener('keydown', hotkey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelected(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const closeAnd = (action: () => void) => {
    setOpen(false);
    action();
  };

  const items = useMemo(() => {
    const routes: PaletteItem[] = [
      { id: 'today', label: 'Today', icon: LayoutDashboard, run: () => navigate('/') },
      { id: 'calendar', label: 'Calendar', icon: Calendar, run: () => navigate('/calendar') },
      { id: 'clients', label: 'Clients', icon: Users, run: () => navigate('/clients') },
      { id: 'assets', label: 'Assets', icon: Image, run: () => navigate('/assets') },
      { id: 'reports', label: 'Reports', icon: BarChart3, run: () => navigate('/reports') },
    ];
    const actions: PaletteItem[] = [
      { id: 'new-idea', label: 'New idea', detail: 'Quick capture', icon: Plus, run: openQuickCapture },
      { id: 'new-client', label: 'New client', icon: Users, run: () => { addClient(); navigate('/clients'); } },
      ...clients.filter(client => !client.archived).map(client => ({
        id: `new-deliverable-${client.id}`,
        label: `New deliverable for ${client.name}`,
        icon: Plus,
        run: () => { addDeliverable({ clientId: client.id }); navigate('/calendar'); },
      })),
      {
        id: 'generate-series',
        label: 'Generate series drafts',
        detail: 'Next 4 weeks',
        icon: Wand2,
        run: () => {
          const count = generateFromTemplates(4);
          toast.success(count ? `Generated ${count} series draft${count === 1 ? '' : 's'}` : 'Series drafts are up to date');
        },
      },
      {
        id: 'download-backup',
        label: 'Download backup',
        icon: Download,
        run: () => {
          const blob = new Blob([store.exportBackup()], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = 'content-desk-backup.json';
          anchor.click();
          URL.revokeObjectURL(url);
        },
      },
    ];
    const normalized = query.trim().toLowerCase();
    const matches = (item: PaletteItem) => !normalized || `${item.label} ${item.detail || ''} ${item.keywords || ''}`.toLowerCase().includes(normalized);
    const base = [...routes, ...actions].filter(matches);
    if (!normalized) return base;
    const clientResults: PaletteItem[] = clients
      .filter(client => client.name.toLowerCase().includes(normalized))
      .slice(0, 5)
      .map(client => ({
        id: `client-${client.id}`,
        label: client.name,
        detail: 'Client',
        icon: Users,
        run: () => navigate('/clients'),
      }));
    const deliverableResults: PaletteItem[] = deliverables
      .filter(item => `${item.title} ${item.copy}`.toLowerCase().includes(normalized))
      .slice(0, 5)
      .map(item => ({
        id: `deliverable-${item.id}`,
        label: item.title,
        detail: 'Deliverable',
        icon: FileText,
        run: () => navigate('/calendar'),
      }));
    return [...base, ...deliverableResults, ...clientResults];
  }, [addClient, addDeliverable, clients, deliverables, generateFromTemplates, navigate, query]);

  useEffect(() => {
    setSelected(index => Math.min(index, Math.max(0, items.length - 1)));
  }, [items.length]);

  if (!open) return null;

  return (
    <div data-command-palette className="fixed inset-0 z-[80] flex items-start justify-center bg-background/80 p-4 pt-[12vh] backdrop-blur-sm" onMouseDown={() => setOpen(false)}>
      <div className="w-full max-w-xl overflow-hidden rounded-xl border border-border bg-card shadow-xl" onMouseDown={event => event.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="h-5 w-5 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={event => { setQuery(event.target.value); setSelected(0); }}
            onKeyDown={event => {
              if (event.key === 'Escape') setOpen(false);
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setSelected(index => items.length ? (index + 1) % items.length : 0);
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault();
                setSelected(index => items.length ? (index - 1 + items.length) % items.length : 0);
              }
              if (event.key === 'Enter' && items[selected]) closeAnd(items[selected].run);
            }}
            placeholder="Search actions, content, and clients…"
            className="h-14 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="rounded border border-border bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">ESC</kbd>
        </div>
        <div className="max-h-[55vh] overflow-y-auto p-2">
          {items.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No results found.</p>}
          {items.map((item, index) => (
            <button
              key={item.id}
              onMouseEnter={() => setSelected(index)}
              onClick={() => closeAnd(item.run)}
              className={cn('flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm', selected === index ? 'bg-secondary text-foreground' : 'text-muted-foreground')}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span className="flex-1 truncate">{item.label}</span>
              {item.detail && <span className="text-xs text-muted-foreground">{item.detail}</span>}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-4 border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> select</span>
          <span><kbd>esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}