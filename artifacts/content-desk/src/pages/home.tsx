import { useState, useMemo } from 'react';
import { useStore, useMutateStore } from '@/hooks/use-store';
import { CheckCircle2, Circle, Trash2, Clock, AlertCircle, Link as LinkIcon, Lightbulb } from 'lucide-react';
import { format, isPast, isToday, parseISO, startOfWeek, subWeeks } from 'date-fns';
import { cn } from '@/lib/utils';
import { DeliverableModal } from '@/components/deliverable-modal';
import { toast } from 'sonner';
import { openQuickCapture } from '@/components/command-palette';

export default function Home() {
  const { tasks, deliverables, clients, notes } = useStore();
  const { addTask, toggleTask, deleteTask, addNote, deleteNote, convertNoteToDeliverable } = useMutateStore();
  const [newTaskText, setNewTaskText] = useState('');
  const [newIdeaText, setNewIdeaText] = useState('');
  const [noteClients, setNoteClients] = useState<Record<string, string>>({});
  const [activeDeliverableId, setActiveDeliverableId] = useState<string | null>(null);

  const activeClients = useMemo(() => clients.filter(c => !c.archived), [clients]);
  
  const clientMap = useMemo(() => {
    return Object.fromEntries(clients.map(c => [c.id, c]));
  }, [clients]);

  const dueTodayOrOverdue = useMemo(() => {
    return deliverables.filter(d => {
      if (d.publishingStatus === 'published' || d.productionStatus === 'approved') return false;
      if (!d.productionDueAt) return false;
      const date = parseISO(d.productionDueAt);
      return isPast(date) || isToday(date);
    }).sort((a, b) => {
      const dateA = a.productionDueAt ? new Date(a.productionDueAt).getTime() : 0;
      const dateB = b.productionDueAt ? new Date(b.productionDueAt).getTime() : 0;
      return dateA - dateB;
    });
  }, [deliverables]);

  const publishingStats = useMemo(() => {
    const published = deliverables.filter(item => item.publishingStatus === 'published');
    const publishedWeeks = new Set(published.flatMap(item => (item.publishedAt || item.publishAt)
      ? [startOfWeek(parseISO(item.publishedAt || item.publishAt!), { weekStartsOn: 1 }).toISOString().slice(0, 10)]
      : []));
    let streak = 0;
    const thisWeek = startOfWeek(new Date(), { weekStartsOn: 1 });
    while (publishedWeeks.has(subWeeks(thisWeek, streak).toISOString().slice(0, 10))) streak += 1;
    return { streak, total: published.length };
  }, [deliverables]);

  return (
    <div className="flex-1 overflow-y-auto p-8 max-w-6xl mx-auto w-full">
      <header className="mb-10 flex justify-between items-end">
        <div>
          <p className="text-muted-foreground text-sm font-medium tracking-wide uppercase mb-1">Today</p>
          <h1 className="text-3xl font-serif text-foreground">{format(new Date(), 'EEEE, MMMM do')}</h1>
        </div>
        <button 
          onClick={openQuickCapture}
          className="bg-primary text-primary-foreground px-4 py-2 rounded-md font-medium text-sm shadow-sm hover:brightness-110 transition-all"
        >
          Quick capture
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Urgent & Workload */}
        <div className="lg:col-span-2 space-y-8">
          
          <section>
            <h2 className="text-lg font-serif mb-4 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-destructive" />
              Action Required
            </h2>
            <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
              {dueTodayOrOverdue.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <CheckCircle2 className="w-8 h-8 mx-auto mb-3 opacity-50" />
                  <p>You're all caught up for today.</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {dueTodayOrOverdue.map(deliv => {
                    const client = clientMap[deliv.clientId];
                    const isOverdue = deliv.productionDueAt && isPast(parseISO(deliv.productionDueAt)) && !isToday(parseISO(deliv.productionDueAt));
                    
                    return (
                      <div 
                        key={deliv.id} 
                        className="p-4 hover:bg-secondary/50 transition-colors cursor-pointer flex items-start gap-4"
                        onClick={() => setActiveDeliverableId(deliv.id)}
                      >
                        <div 
                          className="w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0" 
                          style={{ backgroundColor: client?.color || '#888' }} 
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground border border-border">
                              {client?.name || 'Unknown'}
                            </span>
                            <span className="text-xs text-muted-foreground capitalize">{deliv.platform} · {deliv.format}</span>
                            {isOverdue && (
                              <span className="text-xs text-destructive font-medium bg-destructive/10 px-2 py-0.5 rounded-sm">Overdue</span>
                            )}
                          </div>
                          <p className="text-foreground font-medium truncate">{deliv.title}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
                            <Clock className="w-3 h-3" />
                            {deliv.productionDueAt ? format(parseISO(deliv.productionDueAt), 'MMM d, h:mm a') : 'No date'}
                          </div>
                          <div className="mt-1 text-xs capitalize text-muted-foreground">
                            {deliv.productionStatus.replace('-', ' ')}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          <section>
            <h2 className="text-lg font-serif mb-4">Client Workload (Month)</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeClients.map(client => {
                const clientDelivs = deliverables.filter(d => 
                  d.clientId === client.id && 
                  d.publishAt && 
                  new Date(d.publishAt).getMonth() === new Date().getMonth()
                );
                
                  const publishedCount = clientDelivs.filter(d => d.publishingStatus === 'published').length;
                const plannedCount = clientDelivs.length;
                const target = client.monthlyDeliverableTarget || 1;
                
                const progress = Math.min(100, Math.round((publishedCount / target) * 100));
                
                return (
                  <div key={client.id} className="bg-card border border-border rounded-xl p-5">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: client.color }} />
                        <h3 className="font-medium">{client.name}</h3>
                      </div>
                      <span className="text-sm font-medium">{publishedCount} / {target} done</span>
                    </div>
                    
                    <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                      <div 
                        className="h-full rounded-full transition-all" 
                        style={{ width: `${progress}%`, backgroundColor: client.color }} 
                      />
                    </div>
                    <div className="mt-3 text-xs text-muted-foreground flex justify-between">
                      <span>{plannedCount} total planned</span>
                      <span>{target - publishedCount} remaining</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

        </div>

        {/* Right Column: Tasks & Ideas */}
        <div className="space-y-8">
          
          <section>
            <h2 className="text-lg font-serif mb-4 flex items-center gap-2">Standing Tasks</h2>
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="space-y-1 mb-4">
                {tasks.length === 0 && <p className="text-sm text-muted-foreground p-2">No standing tasks.</p>}
                {tasks.map(t => (
                  <div key={t.id} className="flex items-start gap-3 p-2 group hover:bg-secondary/50 rounded-md transition-colors">
                    <button 
                      onClick={() => toggleTask(t.id)} 
                      className={cn("mt-0.5 text-muted-foreground hover:text-primary transition-colors", t.done && "text-primary")}
                    >
                      {t.done ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                    </button>
                    <span className={cn("flex-1 text-sm text-foreground", t.done && "text-muted-foreground line-through")}>
                      {t.text}
                    </span>
                    <button 
                      onClick={() => deleteTask(t.id)}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Add an admin task..."
                  value={newTaskText}
                  onChange={(e) => setNewTaskText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newTaskText.trim()) {
                      addTask(newTaskText.trim());
                      setNewTaskText('');
                    }
                  }}
                  className="flex-1 bg-secondary border border-border rounded-md px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button 
                  onClick={() => {
                    if (newTaskText.trim()) {
                      addTask(newTaskText.trim());
                      setNewTaskText('');
                    }
                  }}
                  className="bg-secondary border border-border text-foreground px-3 py-1.5 rounded-md text-sm font-medium hover:bg-secondary/80"
                >
                  Add
                </button>
              </div>
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-serif">Ideas inbox</h2>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <input
                value={newIdeaText}
                onChange={event => setNewIdeaText(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter' && newIdeaText.trim()) {
                    addNote({ text: newIdeaText.trim() });
                    setNewIdeaText('');
                  }
                }}
                placeholder="Add an idea and press Enter…"
                className="mb-4 h-10 w-full rounded-md border border-border bg-secondary px-3 text-sm outline-none focus:ring-1 focus:ring-primary"
              />
              <div className="space-y-3">
              {notes.length === 0 && (
                <p className="text-sm text-muted-foreground p-4 bg-card border border-border rounded-xl text-center">
                  Your inbox is clear.
                </p>
              )}
              {notes.map(note => {
                let domain = '';
                try { domain = note.url ? new URL(note.url).hostname.replace(/^www\./, '') : ''; } catch { domain = note.url; }
                return (
                  <div key={note.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-start gap-2">
                      {note.kind === 'capture' ? <LinkIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> : <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
                      <div className="min-w-0 flex-1">
                        {note.title && <p className="truncate text-xs font-medium">{note.title}</p>}
                        <p className="text-sm">{note.text}</p>
                        {domain && <p className="mt-1 truncate text-xs text-muted-foreground">{domain}</p>}
                      </div>
                      <button onClick={() => deleteNote(note.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                    </div>
                    {note.url && <a href={note.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-primary hover:underline">Open source</a>}
                    <div className="mt-3 flex gap-2">
                      <select
                        value={noteClients[note.id] || activeClients[0]?.id || ''}
                        onChange={event => setNoteClients(current => ({ ...current, [note.id]: event.target.value }))}
                        className="min-w-0 flex-1 rounded-md border border-border bg-secondary px-2 py-1.5 text-xs"
                      >
                        {activeClients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}
                      </select>
                      <button
                        disabled={!activeClients.length}
                        onClick={() => {
                          const id = convertNoteToDeliverable(note.id, noteClients[note.id] || activeClients[0]?.id || '');
                          if (id) toast.success('Turned into a deliverable');
                        }}
                        className="rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
                      >
                        Turn into deliverable
                      </button>
                    </div>
                  </div>
                )
              })}
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Publishing rhythm</p>
            <p className="mt-2 font-serif text-4xl">{publishingStats.streak} week streak</p>
            <p className="mt-1 text-sm text-muted-foreground">pieces published all-time: {publishingStats.total}</p>
          </section>

        </div>
      </div>

      {activeDeliverableId && (
        <DeliverableModal 
          deliverableId={activeDeliverableId} 
          onClose={() => setActiveDeliverableId(null)} 
        />
      )}
    </div>
  );
}
