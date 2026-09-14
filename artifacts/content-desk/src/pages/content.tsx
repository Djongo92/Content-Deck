import { useEffect, useState, useMemo } from 'react';
import { useStore } from '@/hooks/use-store';
import { Search, Plus, LayoutGrid, List } from 'lucide-react';
import { DeliverableModal } from '@/components/deliverable-modal';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';

export default function ContentPage() {
  const { deliverables, clients } = useStore();
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [search, setSearch] = useState('');
  const [activeDeliverableId, setActiveDeliverableId] = useState<string | null>(null);
  const [selectedDeliverableId, setSelectedDeliverableId] = useState<string | null>(null);

  const clientMap = useMemo(() => Object.fromEntries(clients.map(c => [c.id, c])), [clients]);
  
  const filtered = useMemo(() => {
    return deliverables.filter(d => {
      if (search && !d.title.toLowerCase().includes(search.toLowerCase()) && !d.copy?.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [deliverables, search]);

  useEffect(() => {
    if (viewMode !== 'list' || activeDeliverableId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
      const currentIndex = filtered.findIndex(item => item.id === selectedDeliverableId);
      if (event.key === 'ArrowDown' || event.key.toLowerCase() === 'j') {
        event.preventDefault();
        const nextIndex = currentIndex < 0 ? 0 : Math.min(filtered.length - 1, currentIndex + 1);
        setSelectedDeliverableId(filtered[nextIndex]?.id || null);
      } else if (event.key === 'ArrowUp' || event.key.toLowerCase() === 'k') {
        event.preventDefault();
        const nextIndex = currentIndex < 0 ? filtered.length - 1 : Math.max(0, currentIndex - 1);
        setSelectedDeliverableId(filtered[nextIndex]?.id || null);
      } else if (event.key === 'Enter' && selectedDeliverableId) {
        event.preventDefault();
        setActiveDeliverableId(selectedDeliverableId);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeDeliverableId, filtered, selectedDeliverableId, viewMode]);

  useEffect(() => {
    if (selectedDeliverableId && !filtered.some(item => item.id === selectedDeliverableId)) {
      setSelectedDeliverableId(null);
    }
  }, [filtered, selectedDeliverableId]);

  const columns = ['idea', 'in-progress', 'in-review', 'changes-requested', 'approved'] as const;

  return (
    <div className="flex flex-col h-full overflow-hidden p-6 max-w-[1400px] mx-auto w-full">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-serif text-foreground">Content Pipeline</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage deliverables and ideas</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input 
              type="text"
              placeholder="Search content..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 bg-secondary border border-border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary w-64"
            />
          </div>
          
          <div className="flex items-center bg-secondary border border-border rounded-md overflow-hidden p-0.5">
            <button 
              onClick={() => setViewMode('kanban')}
              className={cn("p-1.5 rounded-sm transition-colors", viewMode === 'kanban' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setViewMode('list')}
              className={cn("p-1.5 rounded-sm transition-colors", viewMode === 'list' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          <button 
            onClick={() => setActiveDeliverableId('new')}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md font-medium text-sm hover:brightness-110 transition-all"
          >
            <Plus className="w-4 h-4" /> Create
          </button>
        </div>
      </header>

      {viewMode === 'kanban' ? (
        <div className="flex-1 overflow-x-auto flex gap-4 pb-4 snap-x">
          {columns.map(status => {
            const colItems = filtered.filter(d => d.productionStatus === status);
            return (
              <div key={status} className="w-[300px] flex-shrink-0 flex flex-col snap-start bg-secondary/30 rounded-xl border border-border/50">
                <div className="p-3 border-b border-border/50 flex justify-between items-center bg-secondary/50 rounded-t-xl">
                  <h3 className="font-medium text-sm capitalize text-muted-foreground">
                    {status.replace('-', ' ')}
                  </h3>
                  <span className="text-xs bg-background px-2 py-0.5 rounded-full text-muted-foreground border border-border">
                    {colItems.length}
                  </span>
                </div>
                
                <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-hidden">
                  {colItems.map(item => {
                    const client = clientMap[item.clientId];
                    return (
                      <div 
                        key={item.id}
                        onClick={() => setActiveDeliverableId(item.id)}
                        className="bg-card border border-border rounded-lg p-3 cursor-pointer hover:border-primary/50 transition-colors shadow-sm group"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-secondary border border-border text-muted-foreground">
                            {item.platform}
                          </span>
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: client?.color || '#888' }} />
                        </div>
                        <h4 className="text-sm font-medium mb-2 leading-snug group-hover:text-primary transition-colors">
                          {item.title}
                        </h4>
                        <div className="flex justify-between items-center text-[10px] text-muted-foreground">
                          <span>{client?.name}</span>
                          {item.productionDueAt && (
                            <span>{format(parseISO(item.productionDueAt), 'MMM d')}</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="flex-1 bg-card border border-border rounded-xl overflow-hidden flex flex-col">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground bg-secondary/50 border-b border-border">
                <tr>
                  <th className="px-4 py-3 font-medium">Title</th>
                  <th className="px-4 py-3 font-medium">Client</th>
                  <th className="px-4 py-3 font-medium">Platform</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(item => {
                  const client = clientMap[item.clientId];
                  return (
                    <tr 
                      key={item.id} 
                      onClick={() => { setSelectedDeliverableId(item.id); setActiveDeliverableId(item.id); }}
                      className={cn(
                        "hover:bg-secondary/30 cursor-pointer transition-colors",
                        selectedDeliverableId === item.id && "relative z-10 ring-1 ring-inset ring-primary"
                      )}
                    >
                      <td className="px-4 py-3 font-medium text-foreground">{item.title}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: client?.color || '#888' }} />
                          <span className="text-muted-foreground">{client?.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{item.platform}</td>
                      <td className="px-4 py-3 capitalize text-muted-foreground">{item.productionStatus.replace('-', ' ')}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {item.productionDueAt ? format(parseISO(item.productionDueAt), 'MMM d, yyyy') : '-'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeDeliverableId && (
        <DeliverableModal 
          deliverableId={activeDeliverableId} 
          onClose={() => setActiveDeliverableId(null)} 
        />
      )}
    </div>
  );
}
