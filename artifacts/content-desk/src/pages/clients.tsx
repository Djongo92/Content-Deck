import { useState } from 'react';
import { useStore, useMutateStore } from '@/hooks/use-store';
import { Plus, Settings } from 'lucide-react';
import { ALL_PLATFORMS } from '@/lib/types';
import { cn } from '@/lib/utils';

export default function ClientsPage() {
  const { clients, deliverables } = useStore();
  const { addClient, updateClient } = useMutateStore();
  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');
  const [editingId, setEditingId] = useState<string | null>(null);

  const displayedClients = clients.filter(c => activeTab === 'active' ? !c.archived : c.archived);

  return (
    <div className="flex-1 overflow-y-auto p-8 max-w-6xl mx-auto w-full">
      <header className="flex justify-between items-end mb-10">
        <div>
          <h1 className="text-3xl font-serif text-foreground">Clients</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage brand profiles and retainers</p>
        </div>
        <button 
          onClick={addClient}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md font-medium text-sm shadow-sm hover:brightness-110 transition-all"
        >
          <Plus className="w-4 h-4" /> Add Client
        </button>
      </header>

      <div className="flex border-b border-border mb-6">
        <button 
          onClick={() => setActiveTab('active')}
          className={cn("px-4 py-2 text-sm font-medium border-b-2 transition-colors", activeTab === 'active' ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
        >
          Active
        </button>
        <button 
          onClick={() => setActiveTab('archived')}
          className={cn("px-4 py-2 text-sm font-medium border-b-2 transition-colors", activeTab === 'archived' ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
        >
          Archived
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {displayedClients.map(client => {
          const clientDelivs = deliverables.filter(d => d.clientId === client.id);
           const now = new Date();
          const publishedThisMonth = clientDelivs.filter(d => 
            d.publishingStatus === 'published' && 
            (d.publishedAt || d.publishAt) &&
            new Date(d.publishedAt || d.publishAt!).getMonth() === now.getMonth() &&
             new Date(d.publishedAt || d.publishAt!).getFullYear() === now.getFullYear()
          ).length;
           const hoursThisMonth = clientDelivs
             .filter(d => {
               const dateValue = d.publishAt || d.createdAt;
               if (!dateValue) return false;
               const date = new Date(dateValue);
               return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
             })
             .reduce((sum, d) => sum + (d.actualHours || 0), 0);
           const effectiveRate = hoursThisMonth > 0 ? client.monthlyRetainerAmount / hoursThisMonth : null;
           const money = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

          const isEditing = editingId === client.id;

          return (
            <div key={client.id} className="bg-card border border-border rounded-xl overflow-hidden shadow-sm hover:border-primary/30 transition-colors">
              <div className="p-5 border-b border-border bg-secondary/20 flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: client.color }} />
                  {isEditing ? (
                    <input 
                      value={client.name}
                      onChange={e => updateClient(client.id, { name: e.target.value })}
                      className="bg-background border border-border rounded px-2 py-1 text-lg font-serif"
                    />
                  ) : (
                    <h2 className="text-xl font-serif text-foreground">{client.name}</h2>
                  )}
                </div>
                <button 
                  onClick={() => setEditingId(isEditing ? null : client.id)}
                  className="p-1.5 text-muted-foreground hover:text-primary transition-colors"
                >
                  <Settings className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-6">
                {/* Stats row */}
                 <div className="grid grid-cols-2 md:grid-cols-4 gap-4 border-b border-border/50 pb-5">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Target</p>
                    <p className="text-lg font-medium">{client.monthlyDeliverableTarget} <span className="text-sm text-muted-foreground">items</span></p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Delivered</p>
                    <p className="text-lg font-medium text-primary">{publishedThisMonth}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Retainer</p>
                     <p className="text-lg font-medium">{money.format(client.monthlyRetainerAmount || 0)}</p>
                     <p className="text-xs text-muted-foreground">{client.monthlyRetainerHours} hrs</p>
                   </div>
                   <div>
                     <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Effective rate</p>
                     <p className="text-lg font-medium">{effectiveRate === null ? '—' : `${money.format(effectiveRate)}/hr`}</p>
                  </div>
                </div>

                 {isEditing && (
                   <div className="mb-3">
                     <p className="text-xs text-muted-foreground mb-2">Platforms for this client</p>
                     <div className="flex flex-wrap gap-2">
                       {ALL_PLATFORMS.map(platform => {
                         const enabled = !client.platforms?.length || client.platforms.includes(platform);
                         return (
                           <button
                             key={platform}
                             type="button"
                             onClick={() => {
                               const current = client.platforms?.length ? [...client.platforms] : [...ALL_PLATFORMS];
                               const next = enabled ? current.filter(p => p !== platform) : [...current, platform];
                               updateClient(client.id, { platforms: next });
                             }}
                             className={cn(
                               'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                               enabled
                                 ? 'border-primary bg-primary/15 text-foreground'
                                 : 'border-border bg-secondary text-muted-foreground hover:text-foreground'
                             )}
                           >
                             {platform}
                           </button>
                         );
                       })}
                     </div>
                     <p className="mt-1.5 text-[10px] text-muted-foreground">New content for {client.name} will only offer the platforms switched on here.</p>
                   </div>
                 )}

                 {isEditing && (
                   <div className="grid grid-cols-2 gap-3">
                     <label className="text-xs text-muted-foreground">Monthly retainer hours
                       <input
                         type="number"
                         min="0"
                         step=".25"
                         value={client.monthlyRetainerHours}
                         onChange={e => updateClient(client.id, { monthlyRetainerHours: Number(e.target.value) })}
                         className="mt-1 w-full bg-secondary border border-border rounded-md p-2 text-sm text-foreground"
                       />
                     </label>
                     <label className="text-xs text-muted-foreground">Monthly retainer amount
                       <input
                         type="number"
                         min="0"
                         step="1"
                         value={client.monthlyRetainerAmount}
                         onChange={e => updateClient(client.id, { monthlyRetainerAmount: Number(e.target.value) })}
                         className="mt-1 w-full bg-secondary border border-border rounded-md p-2 text-sm text-foreground"
                       />
                     </label>
                   </div>
                 )}

                {/* Actions */}
                {isEditing && (
                  <div className="pt-4 border-t border-border flex justify-between items-center">
                    <button 
                      onClick={() => {
                        if (confirm(`Are you sure you want to ${client.archived ? 'unarchive' : 'archive'} this client?`)) {
                          updateClient(client.id, { archived: !client.archived });
                          setEditingId(null);
                        }
                      }}
                      className="text-xs text-destructive hover:underline"
                    >
                      {client.archived ? 'Restore Client' : 'Archive Client'}
                    </button>
                    <button 
                      onClick={() => setEditingId(null)}
                      className="bg-primary text-primary-foreground px-3 py-1.5 rounded-md text-sm font-medium"
                    >
                      Done Editing
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
        {displayedClients.length === 0 && (
          <div className="col-span-full py-12 text-center text-muted-foreground bg-card border border-border border-dashed rounded-xl">
            No {activeTab} clients found.
          </div>
        )}
      </div>
    </div>
  );
}
