import { useState } from 'react';
import { Link } from 'wouter';
import { toast } from 'sonner';
import { Sparkles, X, ExternalLink, CheckCircle2, Check, GripVertical, Send, Loader2 } from 'lucide-react';
import { useMutateStore, useStore } from '@/hooks/use-store';
import { api } from '@/lib/api';
import { LAUNCH_PHASE_LABELS, LaunchLeadStatus, LaunchTask } from '@/lib/types';
import { cn } from '@/lib/utils';

const LEAD_STATUSES: LaunchLeadStatus[] = ['Lead', 'Contacted', 'Proposal', 'Active', 'Paused', 'Closed'];

function fmtEUR(n: number): string {
  return '€' + Math.round(n || 0).toLocaleString('en-US');
}

const TABS = ['Overview', 'Roadmap', 'Clients & Finances', 'Brand & Settings', 'Notes', 'Memo'] as const;
type Tab = typeof TABS[number];

export default function LaunchPage() {
  const [tab, setTab] = useState<Tab>('Overview');
  const [discussOpen, setDiscussOpen] = useState(false);

  return (
    <div className="flex-1 overflow-y-auto p-8 max-w-6xl mx-auto w-full">
      <header className="flex justify-between items-end mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-serif text-foreground">Algo-Rhythm Launch</h1>
          <p className="text-sm text-muted-foreground mt-1">Planning workspace for Tisa's studio launch and ongoing operation</p>
        </div>
        <button
          onClick={() => setDiscussOpen(true)}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md font-medium text-sm shadow-sm hover:brightness-110 transition-all"
        >
          <Sparkles className="w-4 h-4" /> Discuss the plan
        </button>
      </header>

      <div className="flex border-b border-border mb-6 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
              tab === t ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Overview' && <OverviewTab onOpenRoadmap={() => setTab('Roadmap')} />}
      {tab === 'Roadmap' && <RoadmapTab />}
      {tab === 'Clients & Finances' && <ClientsFinancesTab />}
      {tab === 'Brand & Settings' && <BrandSettingsTab />}
      {tab === 'Notes' && <NotesTab />}
      {tab === 'Memo' && <MemoTab />}

      {discussOpen && <DiscussPanel onClose={() => setDiscussOpen(false)} />}
    </div>
  );
}

// --- Overview ----------------------------------------------------------------

function OverviewTab({ onOpenRoadmap }: { onOpenRoadmap: () => void }) {
  const { launchTasks, launchLeads, launchSettings } = useStore();
  const { toggleLaunchTask } = useMutateStore();
  const settings = launchSettings[0];

  const doneCount = launchTasks.filter(t => t.done).length;
  const progress = launchTasks.length ? Math.round((100 * doneCount) / launchTasks.length) : 0;
  const revenue = launchLeads.filter(l => l.status === 'Active').reduce((sum, l) => sum + (l.fee || 0), 0);
  const nextTasks = launchTasks.filter(t => !t.done).sort((a, b) => a.due.localeCompare(b.due)).slice(0, 6);
  const launchDate = settings?.launchDate ? new Date(settings.launchDate + 'T00:00:00') : null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Metric label="Public launch" value={launchDate ? launchDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'Not set'} sub={launchDate ? launchDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'Set one in Brand & Settings'} />
        <Metric label="Current recurring revenue" value={fmtEUR(revenue)} sub="From the client / lead tracker" />
        <Metric label="Active leads/clients" value={String(launchLeads.length)} sub={`${launchLeads.filter(l => l.linkedClientId).length} linked to Content Desk`} />
        <Metric label="Tasks completed" value={`${doneCount} / ${launchTasks.length}`}>
          <div className="h-2 rounded-full bg-secondary overflow-hidden mt-2">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
        </Metric>
      </div>

      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-serif">Next actions</h2>
          <button onClick={onOpenRoadmap} className="text-xs text-primary hover:underline">Open full roadmap →</button>
        </div>
        <div className="space-y-0">
          {nextTasks.length === 0 && <p className="text-sm text-muted-foreground py-4">All tracked tasks are complete.</p>}
          {nextTasks.map(t => (
            <label key={t.id} className="flex items-center gap-3 border-t border-border/50 py-2.5 first:border-t-0 cursor-pointer">
              <input type="checkbox" checked={t.done} onChange={e => toggleLaunchTask(t.id, e.target.checked)} className="accent-primary w-4 h-4" />
              <span className="flex-1 text-sm font-medium">{t.title}</span>
              <span className="text-xs text-muted-foreground">{t.due}</span>
              <span className="text-[11px] rounded-full bg-secondary px-2 py-0.5">{LAUNCH_PHASE_LABELS[t.phase] ?? '—'}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-lg font-serif mb-2">What we're building</h2>
          <p className="text-sm text-muted-foreground">A founder-led communications studio for musicians, ensembles, festivals, venues, and cultural institutions — combining industry understanding with editorial, digital, PR, and WordPress expertise.</p>
          <p className="mt-3 text-sm border-l-2 border-primary pl-3 text-muted-foreground"><b className="text-foreground">Operating principle:</b> prioritize paid work and reliable delivery over follower growth, unnecessary subscriptions, or the appearance of agency scale.</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-lg font-serif mb-2">Non-negotiable guardrails</h2>
          <ul className="text-sm text-muted-foreground space-y-1.5 list-disc pl-4">
            <li>Wonder Strings stays at €400/month; track its 20–30 hours of work.</li>
            <li>Founder owns client acquisition and daily operations.</li>
            <li>Initial website/brand budget is capped at €150.</li>
            <li>Registration follows actual legal and commercial requirements.</li>
            <li>Do not promise unlimited event attendance, video editing, or revisions.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, sub, children }: { label: string; value: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
      <p className="text-2xl font-medium tracking-tight">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      {children}
    </div>
  );
}

// --- Roadmap -------------------------------------------------------------------

function phaseDateRange(tasks: LaunchTask[]): string {
  const dues = tasks.map(t => t.due).filter(Boolean).sort();
  if (!dues.length) return 'No dates set';
  const fmt = (d: string) => {
    const dt = new Date(d + 'T00:00:00');
    return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };
  const start = dues[0], end = dues[dues.length - 1];
  return start === end ? fmt(start) : `${fmt(start)} – ${fmt(end)}`;
}

function PhaseStepper({ launchTasks }: { launchTasks: LaunchTask[] }) {
  const currentPhase = LAUNCH_PHASE_LABELS.findIndex((_, p) => launchTasks.some(t => t.phase === p && !t.done));
  const resolvedCurrent = currentPhase === -1 ? LAUNCH_PHASE_LABELS.length - 1 : currentPhase;

  return (
    <div className="flex items-start gap-0 overflow-x-auto pb-1">
      {LAUNCH_PHASE_LABELS.map((label, p) => {
        const tasks = launchTasks.filter(t => t.phase === p);
        const done = tasks.filter(t => t.done).length;
        const complete = tasks.length > 0 && done === tasks.length;
        const isCurrent = p === resolvedCurrent && !complete;
        return (
          <div key={p} className="flex-1 min-w-[128px] flex flex-col items-center text-center px-1">
            <div className="flex w-full items-center">
              <div className={cn('h-px flex-1', p === 0 ? 'opacity-0' : complete || p < resolvedCurrent ? 'bg-primary' : 'bg-border')} />
              <div className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold',
                complete ? 'border-primary bg-primary text-primary-foreground'
                  : isCurrent ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground'
              )}>
                {complete ? <Check className="w-4 h-4" /> : p + 1}
              </div>
              <div className={cn('h-px flex-1', p === LAUNCH_PHASE_LABELS.length - 1 ? 'opacity-0' : complete ? 'bg-primary' : 'bg-border')} />
            </div>
            <p className={cn('mt-2 text-xs font-semibold leading-tight', isCurrent && 'text-primary')}>{label}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{phaseDateRange(tasks)}</p>
            <p className="text-[11px] text-muted-foreground">{done}/{tasks.length} done</p>
          </div>
        );
      })}
    </div>
  );
}

function RoadmapTab() {
  const { launchTasks, launchGates } = useStore();
  const { addLaunchTask, updateLaunchTask, toggleLaunchTask, deleteLaunchTask, updateLaunchGate } = useMutateStore();
  const [dragOverPhase, setDragOverPhase] = useState<number | null>(null);

  const doneCount = launchTasks.filter(t => t.done).length;
  const progress = launchTasks.length ? Math.round((100 * doneCount) / launchTasks.length) : 0;

  function handleDrop(e: React.DragEvent, phase: number) {
    e.preventDefault();
    setDragOverPhase(null);
    const id = e.dataTransfer.getData('text/plain');
    if (id) updateLaunchTask(id, { phase });
  }

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="text-xl font-serif mb-1">Where things stand</h2>
        <div className="h-2 rounded-full bg-secondary overflow-hidden mb-4"><div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} /></div>
        <PhaseStepper launchTasks={launchTasks} />
      </div>

      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-serif">Execution board</h2>
          <p className="text-xs text-muted-foreground">{doneCount} of {launchTasks.length} complete · drag a card to move it between phases</p>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
          {LAUNCH_PHASE_LABELS.map((label, phase) => {
            const phaseTasks = launchTasks.filter(t => t.phase === phase);
            const phaseDone = phaseTasks.filter(t => t.done).length;
            return (
              <div
                key={phase}
                onDragOver={e => { e.preventDefault(); setDragOverPhase(phase); }}
                onDragLeave={() => setDragOverPhase(current => current === phase ? null : current)}
                onDrop={e => handleDrop(e, phase)}
                className={cn(
                  'flex w-[230px] shrink-0 flex-col rounded-lg border bg-secondary/20 transition-colors',
                  dragOverPhase === phase ? 'border-primary bg-primary/5' : 'border-border/60'
                )}
              >
                <div className="px-3 pt-3 pb-2 border-b border-border/50">
                  <h3 className="text-sm font-semibold leading-tight">{label}</h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{phaseDone}/{phaseTasks.length} done</p>
                </div>
                <div className="flex-1 space-y-2 p-2 min-h-[60px]">
                  {phaseTasks.map(t => (
                    <div
                      key={t.id}
                      draggable
                      onDragStart={e => { e.dataTransfer.setData('text/plain', t.id); e.dataTransfer.effectAllowed = 'move'; }}
                      className="group rounded-md border border-border bg-card p-2 cursor-grab active:cursor-grabbing"
                    >
                      <div className="flex items-start gap-1.5">
                        <input type="checkbox" checked={t.done} onChange={e => toggleLaunchTask(t.id, e.target.checked)} className="accent-primary w-3.5 h-3.5 mt-0.5 shrink-0" />
                        <input
                          value={t.title}
                          onChange={e => updateLaunchTask(t.id, { title: e.target.value })}
                          className={cn('flex-1 min-w-0 bg-transparent text-xs font-medium rounded px-1 py-0.5 border border-transparent hover:border-border focus:border-primary focus:bg-secondary outline-none', t.done && 'line-through text-muted-foreground')}
                        />
                        <GripVertical className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0 mt-0.5 opacity-0 group-hover:opacity-100" />
                      </div>
                      <div className="flex items-center justify-between mt-1 pl-5">
                        <input
                          type="date"
                          value={t.due}
                          onChange={e => updateLaunchTask(t.id, { due: e.target.value })}
                          className="bg-transparent text-[11px] text-muted-foreground rounded px-1 py-0.5 border border-transparent hover:border-border focus:border-primary focus:bg-secondary outline-none min-w-0"
                        />
                        <button onClick={() => deleteLaunchTask(t.id)} className="text-[11px] text-destructive opacity-0 group-hover:opacity-100 hover:underline px-1">Remove</button>
                      </div>
                    </div>
                  ))}
                  {phaseTasks.length === 0 && <p className="text-[11px] text-muted-foreground px-1 py-2">Drop a task here</p>}
                </div>
                <button onClick={() => addLaunchTask({ phase })} className="text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/60 px-3 py-2 text-left border-t border-border/50">+ Add task</button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="text-xl font-serif mb-3">Launch decision gates</h2>
        <div className="space-y-0">
          {launchGates.map(g => {
            const phaseTasks = g.relatedPhase != null ? launchTasks.filter(t => t.phase === g.relatedPhase) : [];
            const phaseDone = phaseTasks.filter(t => t.done).length;
            const ready = g.relatedPhase != null && phaseTasks.length > 0 && phaseDone === phaseTasks.length;
            return (
              <div key={g.id} className="grid grid-cols-[20px_1fr] gap-3 border-t border-border/50 py-3 first:border-t-0">
                <input type="checkbox" checked={g.done} onChange={e => updateLaunchGate(g.id, { done: e.target.checked })} className="accent-primary w-4 h-4 mt-0.5" />
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{g.title}</span>
                    {g.relatedPhase != null && (
                      <span className={cn('text-[11px] rounded-full px-2 py-0.5 flex items-center gap-1', ready ? 'bg-emerald-500/15 text-emerald-600' : 'bg-secondary text-muted-foreground')}>
                        {ready && <CheckCircle2 className="w-3 h-3" />}
                        {phaseDone}/{phaseTasks.length} phase tasks done
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{g.description}</p>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 border-l-2 border-primary pl-3 text-xs text-muted-foreground">
          The public launch and business registration are separate decisions. Commercial engagements need compliant contracting and invoicing when required, regardless of launch timing.
        </div>
      </div>
    </div>
  );
}

// --- Clients & Finances --------------------------------------------------------

function ClientsFinancesTab() {
  const { launchLeads, launchSettings } = useStore();
  const { addLaunchLead, updateLaunchLead, deleteLaunchLead, convertLaunchLead, updateLaunchSettings } = useMutateStore();
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const settings = launchSettings[0];

  const activeLeads = launchLeads.filter(l => l.status === 'Active');
  const revenue = activeLeads.reduce((sum, l) => sum + (l.fee || 0), 0);
  const hours = activeLeads.reduce((sum, l) => sum + (l.hours || 0), 0);
  const hourly = hours ? revenue / hours : null;
  const takeHome = revenue - (settings?.monthlyCosts || 0) - (settings?.monthlyReserve || 0);

  const totalMonthly = (settings?.weeklyHours || 0) * 52 / 12;
  const delivery = totalMonthly * (1 - (settings?.adminPercent || 0) / 100);
  const remaining = delivery - hours;

  async function handleConvert(id: string) {
    setConvertingId(id);
    try {
      await convertLaunchLead(id);
      toast.success('Lead converted to a Content Desk client');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not convert this lead');
    } finally {
      setConvertingId(null);
    }
  }

  function handleDelete(id: string) {
    if (confirm('Remove this client/lead from the tracker?')) deleteLaunchLead(id);
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Metric label="Monthly recurring" value={fmtEUR(revenue)} />
        <Metric label="Client delivery hours" value={`${Math.round(hours)}h`} />
        <Metric label="Gross €/delivery hour" value={hourly ? `${fmtEUR(hourly)}/hr` : '—'} />
        <Metric label="Estimated owner take-home" value={fmtEUR(takeHome)} sub="Placeholder cost assumptions" />
      </div>

      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-serif">Client / prospect tracker</h2>
          <button onClick={() => addLaunchLead({})} className="text-xs font-medium bg-primary text-primary-foreground px-3 py-1.5 rounded-md">+ Add client or lead</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="pb-2 pr-2">Name</th>
                <th className="pb-2 pr-2">Status</th>
                <th className="pb-2 pr-2">Monthly €</th>
                <th className="pb-2 pr-2">Hours/month</th>
                <th className="pb-2 pr-2">Next action</th>
                <th className="pb-2 pr-2">Content Desk</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {launchLeads.map(l => (
                <tr key={l.id} className="border-t border-border/50">
                  <td className="py-2 pr-2"><input value={l.name} onChange={e => updateLaunchLead(l.id, { name: e.target.value })} className="w-full min-w-[120px] bg-transparent rounded px-1.5 py-1 border border-transparent hover:border-border focus:border-primary focus:bg-secondary outline-none" /></td>
                  <td className="py-2 pr-2">
                    <select value={l.status} onChange={e => updateLaunchLead(l.id, { status: e.target.value as LaunchLeadStatus })} className="bg-transparent rounded px-1.5 py-1 border border-border outline-none">
                      {LEAD_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="py-2 pr-2"><input type="number" min={0} value={l.fee} onChange={e => updateLaunchLead(l.id, { fee: Math.max(0, Number(e.target.value) || 0) })} className="w-20 bg-transparent rounded px-1.5 py-1 border border-transparent hover:border-border focus:border-primary focus:bg-secondary outline-none" /></td>
                  <td className="py-2 pr-2"><input type="number" min={0} value={l.hours} onChange={e => updateLaunchLead(l.id, { hours: Math.max(0, Number(e.target.value) || 0) })} className="w-20 bg-transparent rounded px-1.5 py-1 border border-transparent hover:border-border focus:border-primary focus:bg-secondary outline-none" /></td>
                  <td className="py-2 pr-2"><input value={l.next} onChange={e => updateLaunchLead(l.id, { next: e.target.value })} className="w-full min-w-[140px] bg-transparent rounded px-1.5 py-1 border border-transparent hover:border-border focus:border-primary focus:bg-secondary outline-none" /></td>
                  <td className="py-2 pr-2">
                    {l.linkedClientId ? (
                      <Link href="/clients" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                        Client <ExternalLink className="w-3 h-3" />
                      </Link>
                    ) : l.status === 'Active' ? (
                      <button
                        onClick={() => handleConvert(l.id)}
                        disabled={convertingId === l.id}
                        className="text-xs font-medium bg-secondary hover:bg-secondary/70 px-2 py-1 rounded-md disabled:opacity-50"
                      >
                        {convertingId === l.id ? 'Converting…' : 'Convert to client'}
                      </button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="py-2"><button onClick={() => handleDelete(l.id)} className="text-destructive text-sm font-bold px-1">×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground mt-3">Only clients marked "Active" count toward revenue and delivery hours. Converting a lead creates a real client record in Content Desk's own Clients list, linked back to this row.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-lg font-serif mb-3">Capacity assumptions</h2>
          <Field label="Working hours/week">
            <input type="number" min={1} max={70} value={settings?.weeklyHours ?? 20} onChange={e => updateLaunchSettings({ weeklyHours: Number(e.target.value) || 0 })} className="w-full bg-secondary border border-border rounded-md p-2 text-sm" />
          </Field>
          <Field label="Non-client time (%)">
            <input type="number" min={0} max={90} value={settings?.adminPercent ?? 25} onChange={e => updateLaunchSettings({ adminPercent: Number(e.target.value) || 0 })} className="w-full bg-secondary border border-border rounded-md p-2 text-sm" />
          </Field>
          <p className="text-sm bg-secondary/50 rounded-md p-3 mt-2">
            At {settings?.weeklyHours ?? 20}h/week, approximate monthly availability is <b>{Math.round(totalMonthly)}h</b>. After {settings?.adminPercent ?? 25}% non-client work, client-delivery capacity is <b>{Math.round(delivery)}h</b>. Remaining after active commitments: <b className={remaining < 0 ? 'text-destructive' : 'text-emerald-600'}>{Math.round(remaining)}h</b>.
          </p>
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-lg font-serif mb-3">Cost assumptions (editable)</h2>
          <Field label="Monthly taxes, contributions, and fixed costs (€)">
            <input type="number" min={0} value={settings?.monthlyCosts ?? 0} onChange={e => updateLaunchSettings({ monthlyCosts: Number(e.target.value) || 0 })} className="w-full bg-secondary border border-border rounded-md p-2 text-sm" />
          </Field>
          <Field label="Additional contingency provision (€)">
            <input type="number" min={0} value={settings?.monthlyReserve ?? 0} onChange={e => updateLaunchSettings({ monthlyReserve: Number(e.target.value) || 0 })} className="w-full bg-secondary border border-border rounded-md p-2 text-sm" />
          </Field>
          <p className="text-xs text-muted-foreground mt-1">Deliberately editable placeholders, not Serbian tax quotations. Confirm liability with an accountant before treating the take-home number as reliable.</p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="text-lg font-serif mb-3">Proposed offers (reference)</h2>
        <div className="grid md:grid-cols-3 gap-4">
          {[
            { tier: 'Retainer 01', name: 'Presence', price: '€450–550/mo', hours: '10–13 delivery hours', items: ['One platform', 'Content plan, copy and design', 'Approx. 8 feed posts; up to 2 simple reels', 'Basic reporting'] },
            { tier: 'Retainer 02', name: 'Engagement', price: '€700–900/mo', hours: '16–20 delivery hours', items: ['Content strategy and management', 'Approx. 10–12 posts; up to 3 reels', 'Light community management', 'One capped local event visit'] },
            { tier: 'Retainer 03', name: 'Communications Partner', price: '€1,000–1,300/mo', hours: '22–28 delivery hours', items: ['Broader communications strategy', 'Social, editorial and web support', 'Campaign and press materials', 'Up to two capped local visits'] },
          ].map(offer => (
            <div key={offer.name} className="border border-border rounded-lg p-4">
              <span className="text-[11px] font-bold rounded-full bg-secondary px-2 py-0.5">{offer.tier}</span>
              <h3 className="font-serif text-lg mt-2">{offer.name}</h3>
              <div className="text-xl font-bold tracking-tight">{offer.price}</div>
              <p className="text-xs text-muted-foreground mb-2">{offer.hours}</p>
              <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
                {offer.items.map(item => <li key={item}>{item}</li>)}
              </ul>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-3">Working prices to test with Serbian buyers. Scope and event editing must be capped in every offer. One-off WordPress sites: €600–1,200; site maintenance: €75–150/mo; strategy projects: €400–900.</p>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs text-muted-foreground mb-3">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

// --- Brand & Settings ------------------------------------------------------------

function BrandSettingsTab() {
  const { launchSettings } = useStore();
  const { updateLaunchSettings } = useMutateStore();
  const settings = launchSettings[0];
  if (!settings) return null;

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-lg font-serif mb-3">Brand brief</h2>
          <Field label="Working brand name">
            <input value={settings.brandName} onChange={e => updateLaunchSettings({ brandName: e.target.value })} className="w-full bg-secondary border border-border rounded-md p-2 text-sm" />
          </Field>
          <Field label="Positioning headline">
            <input value={settings.headline} onChange={e => updateLaunchSettings({ headline: e.target.value })} className="w-full bg-secondary border border-border rounded-md p-2 text-sm" />
          </Field>
          <Field label="One-sentence proposition">
            <textarea value={settings.proposition} onChange={e => updateLaunchSettings({ proposition: e.target.value })} className="w-full bg-secondary border border-border rounded-md p-2 text-sm min-h-[80px]" />
          </Field>
          <Field label="Visual direction / references">
            <textarea value={settings.visualDirection} onChange={e => updateLaunchSettings({ visualDirection: e.target.value })} className="w-full bg-secondary border border-border rounded-md p-2 text-sm min-h-[80px]" />
          </Field>
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-lg font-serif mb-3">Web and launch settings</h2>
          <Field label="Proposed domain">
            <input value={settings.domain} onChange={e => updateLaunchSettings({ domain: e.target.value })} placeholder="Not selected" className="w-full bg-secondary border border-border rounded-md p-2 text-sm" />
          </Field>
          <Field label="Name clearance status">
            <select value={settings.clearance} onChange={e => updateLaunchSettings({ clearance: e.target.value })} className="w-full bg-secondary border border-border rounded-md p-2 text-sm">
              {['Not checked', 'In progress', 'Cleared with appropriate review', 'Needs a new name'].map(opt => <option key={opt}>{opt}</option>)}
            </select>
          </Field>
          <Field label="Website stack">
            <input value={settings.stack} onChange={e => updateLaunchSettings({ stack: e.target.value })} className="w-full bg-secondary border border-border rounded-md p-2 text-sm" />
          </Field>
          <Field label="Primary public launch date">
            <input type="date" value={settings.launchDate} onChange={e => updateLaunchSettings({ launchDate: e.target.value })} className="w-full bg-secondary border border-border rounded-md p-2 text-sm" />
          </Field>
          <p className="text-xs border-l-2 border-primary pl-3 text-muted-foreground mt-2">Do not buy a domain or announce the name until trademark, APR name, relevant market overlap, and handles have been examined.</p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="text-lg font-serif mb-3">Website map (reference)</h2>
        <div className="grid md:grid-cols-3 gap-4">
          {[
            { name: 'Home', desc: 'Positioning, proof, founder intro, and clear inquiry path.' },
            { name: 'Selected Work', desc: 'Wonder Strings and Belgrade Philharmonic experience, accurately attributed.' },
            { name: 'Services', desc: 'Digital, editorial/web, PR and strategic communications.' },
            { name: 'About', desc: 'Founder experience, music-sector understanding, and approach.' },
            { name: 'Contact', desc: 'Branded email, short inquiry form, Instagram and LinkedIn links.' },
          ].map(page => (
            <div key={page.name} className="border border-border rounded-lg p-4">
              <h3 className="font-serif text-base mb-1">{page.name}</h3>
              <p className="text-xs text-muted-foreground">{page.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="text-lg font-serif mb-3">Content strategy (reference)</h2>
        <p className="text-sm text-muted-foreground mb-3">Initial cadence: approximately two quality Instagram posts per month, plus two substantive founder-led LinkedIn posts. Build around real projects rather than generic marketing advice.</p>
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h3 className="text-sm font-semibold mb-1.5">Instagram: proof and creativity</h3>
            <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
              <li>Wonder Strings website before/after</li>
              <li>A case study on concert promotion</li>
              <li>Messaging/visual breakdowns</li>
              <li>Selected behind-the-scenes work</li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold mb-1.5">LinkedIn: expertise and credibility</h3>
            <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
              <li>Lessons from music communications</li>
              <li>Audience-development perspectives</li>
              <li>Founder journey and selected work</li>
              <li>Thoughtful institutional marketing commentary</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Notes ------------------------------------------------------------------------

function NotesTab() {
  const { launchNotes } = useStore();
  const { addLaunchNote, deleteLaunchNote } = useMutateStore();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');

  function save() {
    if (!title.trim() || !text.trim()) return;
    addLaunchNote({ date, title, text });
    setTitle('');
    setText('');
  }

  function handleDelete(id: string) {
    if (confirm('Delete this note?')) deleteLaunchNote(id);
  }

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="text-lg font-serif mb-3">Add session note</h2>
        <Field label="Date">
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full bg-secondary border border-border rounded-md p-2 text-sm" />
        </Field>
        <Field label="Topic">
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Pricing discussion with an ensemble" className="w-full bg-secondary border border-border rounded-md p-2 text-sm" />
        </Field>
        <Field label="Observations, decisions, and next actions">
          <textarea value={text} onChange={e => setText(e.target.value)} placeholder="What did we learn? What changed? What happens next?" className="w-full bg-secondary border border-border rounded-md p-2 text-sm min-h-[140px]" />
        </Field>
        <button onClick={save} disabled={!title.trim() || !text.trim()} className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50">Save note</button>
      </div>
      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="text-lg font-serif mb-3">Founder decision log</h2>
        {launchNotes.length === 0 && <p className="text-sm text-muted-foreground">No notes yet.</p>}
        <div className="space-y-0">
          {launchNotes.map(n => (
            <div key={n.id} className="border-t border-border/50 py-3 first:border-t-0">
              <div className="text-xs text-muted-foreground">{n.date}</div>
              <h3 className="font-serif text-base">{n.title}</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap mt-1">{n.text}</p>
              <button onClick={() => handleDelete(n.id)} className="text-xs text-destructive hover:underline mt-2">Delete note</button>
            </div>
          ))}
        </div>
      </div>

      <div className="md:col-span-2 bg-card border border-border rounded-xl p-5">
        <h2 className="text-lg font-serif mb-3">Important unresolved matters</h2>
        <ul className="text-sm text-muted-foreground space-y-1.5 list-disc pl-4">
          <li>Validate the working name and trademarks before public use.</li>
          <li>Test pricing with local music-sector buyers.</li>
          <li>Choose the Serbian legal/tax structure based on real predominant services; confirm 2027 classification.</li>
          <li>Determine actual tax/contribution and bookkeeping costs.</li>
          <li>Establish the first compliant invoicing route before relevant new commercial engagements.</li>
          <li>Verify health-insurance status for tax estimates.</li>
        </ul>
      </div>
    </div>
  );
}

// --- Memo (static reference) -----------------------------------------------------

function MemoTab() {
  return (
    <div className="bg-card border border-border rounded-xl p-6 md:p-10 max-w-3xl">
      <p className="text-xs font-bold tracking-widest text-primary uppercase mb-3">Confidential · Founder brief</p>
      <h1 className="text-3xl font-serif mb-4">Algo-Rhythm Studio launch memorandum</h1>
      <div className="font-serif text-[15px] leading-relaxed space-y-4 text-foreground/90">
        <p><b>To:</b> Tisa · <b>Purpose:</b> An actionable roadmap to establish a founder-led music and cultural communications studio.</p>

        <h2 className="font-sans text-lg font-semibold !mb-1 pt-2">The decision</h2>
        <p>Build Algo-Rhythm as a lean, solo communications studio serving music and cultural organizations, starting in Serbia and maintaining an international-ready profile. Conduct targeted commercial conversations ahead of any public launch. Treat the brand name as provisional until cleared.</p>

        <h2 className="font-sans text-lg font-semibold !mb-1 pt-2">Starting position</h2>
        <p>The studio has one active client, Wonder Strings, paying €400 monthly for approximately 20–30 hours of social media and production work. The founder is available approximately 15–25 hours per week, has a strong professional network, can show Wonder Strings and Belgrade Philharmonic experience, and can deliver strategy, editorial, PR, social media, branding advice, and WordPress services. Existing Wonder Strings pricing remains unchanged; because the engagement consumes substantial capacity, new work must command materially stronger revenue per hour.</p>

        <h2 className="font-sans text-lg font-semibold !mb-1 pt-2">Commercial model</h2>
        <p>Test three flexible monthly packages: Presence (€450–550), Engagement (€700–900), and Communications Partner (€1,000–1,300). Offer separate WordPress, content, and strategy projects. Define deliverables and revisions precisely; include only capped event attendance in appropriate higher-tier retainers. Use professional relationships, referrals, case studies, and selective founder-led outreach to acquire clients — build an initial list of 20 prospects and aim to secure one additional recurring engagement before public launch, subject to market response.</p>

        <h2 className="font-sans text-lg font-semibold !mb-1 pt-2">Brand and communication</h2>
        <p>Position the studio as "Communications for the world of music." Create an English-first WordPress website with Home, Services, Selected Work, About, and Contact pages. Use founder visibility to establish credibility; avoid implying Belgrade Philharmonic engaged Algo-Rhythm as its agency. Begin Instagram and founder-led LinkedIn at a modest cadence that does not compete with paid work.</p>

        <h2 className="font-sans text-lg font-semibold !mb-1 pt-2">Cash discipline</h2>
        <p>Limit initial website/brand spending to €150: approximately €20 for domain, €50 hosting, €20 email/incidentals, and €60 contingency. Treat registration, accounting, taxes, contributions, and business banking as separate financial decisions. Develop a cash reserve progressively, rather than assuming external funding or personal savings.</p>

        <h2 className="font-sans text-lg font-semibold !mb-1 pt-2">Legal and registration decisions</h2>
        <p>Evaluate entrepreneur structures with a Serbian accountant against the services actually provided. Advertising and market research activities may be ineligible for lump-sum taxation; web-portal classification should not be selected merely for a favorable tax result. Confirm current classification, individual social insurance status, recurring liabilities, contracting, invoicing, and relevant VAT/fiscalization questions before additional engagements requiring a formal business.</p>

        <h2 className="font-sans text-lg font-semibold !mb-1 pt-2">Who does what</h2>
        <p><b>Tisa:</b> all creative direction, sales outreach, client delivery, website building, and routine management. <b>Strategic advisor:</b> occasional feedback on positioning, pricing, and contracts. <b>Accountant:</b> registration/tax assessment and compliance advice.</p>

        <p className="text-xs text-muted-foreground pt-4 border-t border-border">Planning note: financial amounts are illustrative and require testing. This memo is a strategic planning document, not individualized tax or legal advice. Track live progress against it in the Overview, Roadmap, and Clients & Finances tabs.</p>
      </div>
    </div>
  );
}

// --- Discuss panel (AI advisor over live plan data) ------------------------------

type ChatMessage = { role: 'user' | 'assistant'; content: string };

function DiscussPanel({ onClose }: { onClose: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  async function send() {
    const question = input.trim();
    if (!question || loading) return;
    setInput('');
    const history = messages;
    setMessages(m => [...m, { role: 'user', content: question }]);
    setLoading(true);
    try {
      const { result } = await api.launch.discuss(question, history);
      setMessages(m => [...m, { role: 'assistant', content: result }]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The advisor is temporarily unavailable.');
      setMessages(m => m.slice(0, -1));
      setInput(question);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex justify-end bg-background/70 backdrop-blur-sm" onMouseDown={onClose}>
      <div className="flex h-full w-full max-w-md flex-col border-l border-border bg-card shadow-xl" onMouseDown={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <h2 className="font-serif text-lg">Discuss the plan</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && (
            <p className="text-sm text-muted-foreground">Ask anything grounded in the current plan — tasks, leads, gates, or recent notes. For example: "What's blocking the April launch gate?" or "Which tasks are overdue?"</p>
          )}
          {messages.map((m, i) => (
            <div key={i} className={cn('rounded-lg px-3 py-2 text-sm max-w-[90%]', m.role === 'user' ? 'bg-primary text-primary-foreground ml-auto' : 'bg-secondary')}>
              {m.content}
            </div>
          ))}
          {loading && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Thinking…</div>}
        </div>

        <div className="border-t border-border p-3 flex items-center gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') send(); }}
            placeholder="Ask about the plan…"
            className="flex-1 bg-secondary border border-border rounded-md p-2 text-sm outline-none focus:ring-1 focus:ring-primary"
          />
          <button onClick={send} disabled={!input.trim() || loading} className="bg-primary text-primary-foreground p-2 rounded-md disabled:opacity-50">
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
