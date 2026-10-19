import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import { addDays, addWeeks, differenceInCalendarWeeks, format, formatDistanceToNow, startOfWeek } from 'date-fns';
import { toast } from 'sonner';
import { Sparkles, X, ExternalLink, CheckCircle2, Check, GripVertical, History, Printer, Repeat, Send, Loader2, ShieldAlert } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useMutateStore, useStore } from '@/hooks/use-store';
import { api, type ProposedChange } from '@/lib/api';
import { LAUNCH_PHASE_LABELS, LaunchActivity, LaunchGate, LaunchLead, LaunchLeadStatus, LaunchNote, LaunchRecurringTask, LaunchSettings, LaunchTask, STICKY_COLORS } from '@/lib/types';
import { cn } from '@/lib/utils';

const LEAD_STATUSES: LaunchLeadStatus[] = ['Lead', 'Contacted', 'Proposal', 'Active', 'Paused', 'Closed'];

function fmtEUR(n: number): string {
  return '€' + Math.round(n || 0).toLocaleString('en-US');
}

function snoozedDue(due: string): string {
  const base = due ? new Date(due + 'T00:00:00') : new Date();
  const next = isNaN(base.getTime()) ? new Date() : base;
  return format(addDays(next, 7), 'yyyy-MM-dd');
}

const TABS = ['Overview', 'Roadmap', 'Clients & Finances', 'Brand & Settings', 'Notes', 'Memo'] as const;
type Tab = typeof TABS[number];

type DiscussContext =
  | { type: 'general' }
  | { type: 'task'; task: LaunchTask }
  | { type: 'gate'; gate: LaunchGate }
  | { type: 'custom'; label: string; starter: string };

const CONFETTI_COLORS = ['#d94e38', '#3F7169', '#C6A15B', '#6B5B95', '#9C3B4A'];

function ConfettiBurst() {
  const pieces = useMemo(() => Array.from({ length: 28 }, (_, i) => ({
    left: Math.random() * 100,
    delay: Math.random() * 0.25,
    duration: 1.1 + Math.random() * 0.6,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    rotate: Math.round(Math.random() * 360),
  })), []);
  return (
    <div className="fixed inset-0 z-[110] pointer-events-none overflow-hidden">
      <style>{`
        @keyframes launch-confetti-fall { to { transform: translateY(100vh) rotate(360deg); opacity: 0; } }
      `}</style>
      {pieces.map((p, i) => (
        <span
          key={i}
          style={{
            position: 'absolute', top: '-12px', left: `${p.left}%`, width: '8px', height: '14px',
            backgroundColor: p.color, opacity: 0.9, transform: `rotate(${p.rotate}deg)`,
            animation: `launch-confetti-fall ${p.duration}s ease-in ${p.delay}s forwards`,
          }}
        />
      ))}
    </div>
  );
}

/** Watches for a gate or phase flipping to done and fires a celebratory toast + confetti burst. */
function useCelebration(launchTasks: LaunchTask[], launchGates: LaunchGate[]) {
  const [confettiKey, setConfettiKey] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevGatesDone = useRef<Record<string, boolean>>({});
  const prevPhaseComplete = useRef<Record<number, boolean>>({});

  function fire() {
    setConfettiKey(k => k + 1);
    setShowConfetti(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setShowConfetti(false), 1600);
  }

  useEffect(() => {
    const prev = prevGatesDone.current;
    launchGates.forEach(g => {
      if (g.done && prev[g.id] === false) {
        toast.success(`🎉 ${g.kind === 'question' ? 'Resolved' : 'Milestone reached'}: "${g.title}"`);
        fire();
      }
    });
    prevGatesDone.current = Object.fromEntries(launchGates.map(g => [g.id, g.done]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launchGates]);

  useEffect(() => {
    const prev = prevPhaseComplete.current;
    LAUNCH_PHASE_LABELS.forEach((label, p) => {
      const tasks = launchTasks.filter(t => t.phase === p);
      const complete = tasks.length > 0 && tasks.every(t => t.done);
      if (complete && prev[p] === false) {
        toast.success(`🎉 "${label}" phase complete!`);
        fire();
      }
      prev[p] = complete;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launchTasks]);

  return { showConfetti, confettiKey };
}

function ChangelogPanel({ activity, onClose }: { activity: LaunchActivity[]; onClose: () => void }) {
  const sorted = [...activity].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 100);
  return (
    <div className="fixed inset-0 z-[90] flex justify-end bg-background/70 backdrop-blur-sm" onMouseDown={onClose}>
      <div className="flex h-full w-full max-w-md flex-col border-l border-border bg-card shadow-xl" onMouseDown={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-primary" />
            <h2 className="font-serif text-lg">Changelog</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {sorted.length === 0 && <p className="text-sm text-muted-foreground">Nothing logged yet — this fills in as tasks get done, leads get added, and milestones get hit.</p>}
          {sorted.map(a => (
            <div key={a.id} className="border-t border-border/50 pt-2 first:border-t-0 first:pt-0">
              <p className="text-sm">{a.summary}</p>
              <p className="text-[11px] text-muted-foreground">{formatDistanceToNow(new Date(a.at), { addSuffix: true })}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PlanExportModal({
  launchTasks, launchGates, launchLeads, launchSettings, onClose,
}: {
  launchTasks: LaunchTask[];
  launchGates: LaunchGate[];
  launchLeads: LaunchLead[];
  launchSettings: LaunchSettings[];
  onClose: () => void;
}) {
  const settings = launchSettings[0];
  const revenue = launchLeads.filter(l => l.status === 'Active').reduce((sum, l) => sum + (l.fee || 0), 0);
  const readiness = computeReadiness(launchTasks, launchGates, revenue);
  const milestoneGates = launchGates.filter(g => g.kind === 'milestone');
  const questionGates = launchGates.filter(g => g.kind === 'question');

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm print:bg-white print:p-0" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #plan-export-printable, #plan-export-printable * { visibility: visible; }
          #plan-export-printable { position: absolute; top: 0; left: 0; width: 100%; box-shadow: none !important; border: none !important; }
          .no-print { display: none !important; }
        }
      `}</style>
      <div className="w-full max-w-2xl rounded-xl border border-border bg-card shadow-xl max-h-[90vh] overflow-y-auto print:max-h-none print:overflow-visible print:rounded-none">
        <div className="no-print flex items-center justify-between p-5 border-b border-border">
          <h2 className="font-serif text-xl">One-page plan export</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => window.print()} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:brightness-110">
              <Printer className="h-4 w-4" /> Print / Save as PDF
            </button>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
          </div>
        </div>

        <div id="plan-export-printable" className="p-8 text-sm">
          <div className="flex items-start justify-between mb-1">
            <div>
              <p className="text-xs font-bold tracking-widest text-primary uppercase">Launch plan snapshot</p>
              <h1 className="font-serif text-2xl mt-1">{settings?.brandName || 'Algo-Rhythm'}</h1>
              <p className="text-muted-foreground">{settings?.headline}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-3xl font-serif">{readiness.overall}<span className="text-sm text-muted-foreground">/100</span></p>
              <p className="text-xs text-muted-foreground">readiness</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mb-6">Generated {format(new Date(), 'MMM d, yyyy')} · target launch {settings?.launchDate ? format(new Date(settings.launchDate + 'T00:00:00'), 'MMM d, yyyy') : 'not set'}</p>

          <h3 className="font-serif text-base mb-2 mt-5">Roadmap</h3>
          <div className="space-y-1.5 mb-5">
            {LAUNCH_PHASE_LABELS.map((label, p) => {
              const tasks = launchTasks.filter(t => t.phase === p);
              const done = tasks.filter(t => t.done).length;
              return (
                <div key={p} className="flex items-center justify-between border-b border-border/50 py-1">
                  <span>{p + 1}. {label}</span>
                  <span className="text-muted-foreground">{done}/{tasks.length} · {phaseDateRange(tasks)}</span>
                </div>
              );
            })}
          </div>

          <h3 className="font-serif text-base mb-2">Decision gates</h3>
          <div className="space-y-1 mb-5">
            {milestoneGates.map(g => (
              <div key={g.id} className="flex items-center gap-2">
                <span className={cn('inline-block w-1.5 h-1.5 rounded-full', g.done ? 'bg-emerald-500' : 'bg-muted-foreground')} />
                <span className={cn(g.done && 'text-muted-foreground line-through')}>{g.title}</span>
              </div>
            ))}
          </div>

          {questionGates.length > 0 && (
            <>
              <h3 className="font-serif text-base mb-2">Open questions</h3>
              <div className="space-y-1 mb-5">
                {questionGates.map(q => (
                  <div key={q.id} className="flex items-center gap-2">
                    <span className={cn('inline-block w-1.5 h-1.5 rounded-full', q.done ? 'bg-emerald-500' : 'bg-muted-foreground')} />
                    <span className={cn(q.done && 'text-muted-foreground line-through')}>{q.title}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          <h3 className="font-serif text-base mb-2">Clients & leads</h3>
          <div className="space-y-1">
            {launchLeads.map(l => (
              <div key={l.id} className="flex items-center justify-between border-b border-border/50 py-1">
                <span>{l.name} <span className="text-muted-foreground">({l.status})</span></span>
                <span className="text-muted-foreground">{fmtEUR(l.fee)}/mo · {l.hours}h</span>
              </div>
            ))}
            {launchLeads.length === 0 && <p className="text-muted-foreground">No leads tracked yet.</p>}
          </div>
          <p className="mt-2 font-medium">Current recurring revenue: {fmtEUR(revenue)}</p>
        </div>
      </div>
    </div>
  );
}

export default function LaunchPage() {
  const { launchTasks, launchGates, launchActivity, launchLeads, launchSettings } = useStore();
  const [tab, setTab] = useState<Tab>('Overview');
  const [discussContext, setDiscussContext] = useState<DiscussContext | null>(null);
  const [amendPhase, setAmendPhase] = useState<number | null>(null);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [devilsAdvocateOpen, setDevilsAdvocateOpen] = useState(false);
  const { showConfetti, confettiKey } = useCelebration(launchTasks, launchGates);

  return (
    <div className="flex-1 overflow-y-auto p-8 max-w-6xl mx-auto w-full">
      <header className="flex justify-between items-end mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-serif text-foreground">Algo-Rhythm Launch</h1>
          <p className="text-sm text-muted-foreground mt-1">Planning workspace for Tisa's studio launch and ongoing operation</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setDevilsAdvocateOpen(true)}
            className="flex items-center gap-2 border border-border bg-secondary px-3 py-2 rounded-md font-medium text-sm hover:border-primary transition-all"
          >
            <ShieldAlert className="w-4 h-4" /> Reality check
          </button>
          <button
            onClick={() => setExportOpen(true)}
            className="flex items-center gap-2 border border-border bg-secondary px-3 py-2 rounded-md font-medium text-sm hover:border-primary transition-all"
          >
            <Printer className="w-4 h-4" /> Export one-pager
          </button>
          <button
            onClick={() => setDiscussContext({ type: 'general' })}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md font-medium text-sm shadow-sm hover:brightness-110 transition-all"
          >
            <Sparkles className="w-4 h-4" /> Discuss the plan
          </button>
        </div>
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

      {tab === 'Overview' && <OverviewTab onOpenRoadmap={() => setTab('Roadmap')} onDiscuss={setDiscussContext} onOpenChangelog={() => setChangelogOpen(true)} />}
      {tab === 'Roadmap' && <RoadmapTab onDiscuss={setDiscussContext} onAmendPhase={setAmendPhase} />}
      {tab === 'Clients & Finances' && <ClientsFinancesTab />}
      {tab === 'Brand & Settings' && <BrandSettingsTab />}
      {tab === 'Notes' && <NotesTab />}
      {tab === 'Memo' && <MemoTab />}

      {discussContext && <DiscussPanel key={discussContextKey(discussContext)} context={discussContext} onClose={() => setDiscussContext(null)} />}
      {amendPhase != null && <PhaseAmendPanel key={`amend-${amendPhase}`} phase={amendPhase} launchTasks={launchTasks} onClose={() => setAmendPhase(null)} />}
      {changelogOpen && <ChangelogPanel activity={launchActivity} onClose={() => setChangelogOpen(false)} />}
      {exportOpen && (
        <PlanExportModal
          launchTasks={launchTasks}
          launchGates={launchGates}
          launchLeads={launchLeads}
          launchSettings={launchSettings}
          onClose={() => setExportOpen(false)}
        />
      )}
      {devilsAdvocateOpen && <DevilsAdvocateModal onClose={() => setDevilsAdvocateOpen(false)} onDiscuss={setDiscussContext} />}
      {showConfetti && <ConfettiBurst key={confettiKey} />}
    </div>
  );
}

// --- Overview ----------------------------------------------------------------

function computeReadiness(launchTasks: LaunchTask[], launchGates: LaunchGate[], revenue: number) {
  const execution = launchTasks.length ? (launchTasks.filter(t => t.done).length / launchTasks.length) * 100 : 0;

  const milestoneGates = launchGates.filter(g => g.kind === 'milestone');
  const gatesScore = milestoneGates.length ? (milestoneGates.filter(g => g.done).length / milestoneGates.length) * 100 : 0;

  const today = new Date().toISOString().slice(0, 10);
  const next = REVENUE_MILESTONES.find(m => m.date >= today) ?? REVENUE_MILESTONES[REVENUE_MILESTONES.length - 1];
  const target = (next.low + next.high) / 2;
  const revenueScore = target ? Math.min(100, (revenue / target) * 100) : 0;

  const overall = Math.round(execution * 0.4 + gatesScore * 0.35 + revenueScore * 0.25);
  return {
    overall,
    execution: Math.round(execution),
    gatesScore: Math.round(gatesScore),
    revenueScore: Math.round(revenueScore),
    nextLabel: next.label,
  };
}

function ReadinessCard({ launchTasks, launchGates, revenue }: { launchTasks: LaunchTask[]; launchGates: LaunchGate[]; revenue: number }) {
  const r = computeReadiness(launchTasks, launchGates, revenue);
  const band = r.overall >= 70
    ? { label: 'On track', color: 'text-emerald-600' }
    : r.overall >= 40
    ? { label: 'Building', color: 'text-amber-600' }
    : { label: 'Early days', color: 'text-muted-foreground' };

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-serif">Launch readiness</h2>
        <span className={cn('text-xs font-semibold', band.color)}>{band.label}</span>
      </div>
      <div className="flex items-end gap-4 mb-3">
        <p className="text-4xl font-serif leading-none">{r.overall}<span className="text-lg text-muted-foreground">/100</span></p>
        <div className="flex-1 h-2.5 rounded-full bg-secondary overflow-hidden">
          <div className="h-full bg-primary transition-all" style={{ width: `${r.overall}%` }} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 text-xs">
        <div><p className="text-muted-foreground">Execution</p><p className="font-medium text-foreground mt-0.5">{r.execution}%</p></div>
        <div><p className="text-muted-foreground">Gates cleared</p><p className="font-medium text-foreground mt-0.5">{r.gatesScore}%</p></div>
        <div><p className="text-muted-foreground">Revenue vs {r.nextLabel}</p><p className="font-medium text-foreground mt-0.5">{r.revenueScore}%</p></div>
      </div>
    </div>
  );
}

function OverviewTab({
  onOpenRoadmap, onDiscuss, onOpenChangelog,
}: {
  onOpenRoadmap: () => void;
  onDiscuss: (ctx: DiscussContext) => void;
  onOpenChangelog: () => void;
}) {
  const { launchTasks, launchLeads, launchSettings, launchActivity, launchGates } = useStore();
  const { toggleLaunchTask, updateLaunchTask } = useMutateStore();
  const settings = launchSettings[0];
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const openTask = launchTasks.find(t => t.id === openTaskId) ?? null;

  const doneCount = launchTasks.filter(t => t.done).length;
  const progress = launchTasks.length ? Math.round((100 * doneCount) / launchTasks.length) : 0;
  const revenue = launchLeads.filter(l => l.status === 'Active').reduce((sum, l) => sum + (l.fee || 0), 0);
  const nextTasks = launchTasks.filter(t => !t.done).sort((a, b) => a.due.localeCompare(b.due)).slice(0, 6);
  const launchDate = settings?.launchDate ? new Date(settings.launchDate + 'T00:00:00') : null;
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const thisWeek = launchActivity.filter(a => a.at >= weekAgo).sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="space-y-6">
      {thisWeek.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-serif">This week</h2>
            <button onClick={onOpenChangelog} className="text-xs text-primary hover:underline">View full changelog →</button>
          </div>
          <ul className="text-sm text-muted-foreground space-y-1">
            {thisWeek.slice(0, 6).map(a => <li key={a.id}>• {a.summary}</li>)}
          </ul>
          {thisWeek.length > 6 && <p className="text-xs text-muted-foreground mt-2">+ {thisWeek.length - 6} more this week</p>}
        </div>
      )}

      <ReadinessCard launchTasks={launchTasks} launchGates={launchGates} revenue={revenue} />

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
            <div key={t.id} onClick={() => setOpenTaskId(t.id)} className="flex items-center gap-3 border-t border-border/50 py-2.5 first:border-t-0 cursor-pointer hover:bg-secondary/30 -mx-1 px-1 rounded">
              <input type="checkbox" checked={t.done} onClick={e => e.stopPropagation()} onChange={e => toggleLaunchTask(t.id, e.target.checked)} className="accent-primary w-4 h-4" />
              <span className="flex-1 text-sm font-medium">{t.title}</span>
              <span className="text-xs text-muted-foreground">{t.due}</span>
              <button
                onClick={e => { e.stopPropagation(); updateLaunchTask(t.id, { due: snoozedDue(t.due) }); }}
                title="Push the due date back a week"
                className="text-[11px] text-muted-foreground hover:text-primary"
              >
                +7d
              </button>
              <span className="text-[11px] rounded-full bg-secondary px-2 py-0.5">{LAUNCH_PHASE_LABELS[t.phase] ?? '—'}</span>
            </div>
          ))}
        </div>
      </div>

      {openTask && <TaskModal task={openTask} onClose={() => setOpenTaskId(null)} onDiscuss={task => { setOpenTaskId(null); onDiscuss({ type: 'task', task }); }} />}

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

// --- Shared detail modals (opened from the kanban board, gates list, or Overview) ---

function TaskModal({ task, onClose, onDiscuss }: { task: LaunchTask; onClose: () => void; onDiscuss: (task: LaunchTask) => void }) {
  const { updateLaunchTask, toggleLaunchTask, deleteLaunchTask } = useMutateStore();

  function handleDelete() {
    if (confirm('Delete this task?')) {
      deleteLaunchTask(task.id);
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-xl max-h-[85vh] overflow-y-auto" onMouseDown={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <input type="checkbox" checked={task.done} onChange={e => toggleLaunchTask(task.id, e.target.checked)} className="accent-primary w-4 h-4 shrink-0" />
            <input
              value={task.title}
              onChange={e => updateLaunchTask(task.id, { title: e.target.value })}
              className={cn('flex-1 min-w-0 bg-transparent font-serif text-xl outline-none border-b border-transparent focus:border-primary pb-0.5', task.done && 'line-through text-muted-foreground')}
            />
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground shrink-0"><X className="h-5 w-5" /></button>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <Field label="Due date">
            <div className="flex items-center gap-2">
              <input type="date" value={task.due} onChange={e => updateLaunchTask(task.id, { due: e.target.value })} className="flex-1 min-w-0 bg-secondary border border-border rounded-md p-2 text-sm" />
              <button type="button" onClick={() => updateLaunchTask(task.id, { due: snoozedDue(task.due) })} title="Push the due date back a week" className="shrink-0 text-xs font-medium text-muted-foreground hover:text-primary whitespace-nowrap">+7d</button>
            </div>
          </Field>
          <Field label="Owner">
            <input value={task.owner} onChange={e => updateLaunchTask(task.id, { owner: e.target.value })} className="w-full bg-secondary border border-border rounded-md p-2 text-sm" />
          </Field>
          <Field label="Phase">
            <select value={task.phase} onChange={e => updateLaunchTask(task.id, { phase: Number(e.target.value) })} className="w-full bg-secondary border border-border rounded-md p-2 text-sm">
              {LAUNCH_PHASE_LABELS.map((label, p) => <option key={p} value={p}>{label}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <span className={cn('inline-flex items-center text-xs font-medium rounded-full px-2.5 py-1.5', task.done ? 'bg-emerald-500/15 text-emerald-600' : 'bg-secondary text-muted-foreground')}>
              {task.done ? 'Done' : 'Open'}
            </span>
          </Field>
        </div>

        <Field label="Notes">
          <textarea
            value={task.notes}
            onChange={e => updateLaunchTask(task.id, { notes: e.target.value })}
            placeholder="Extra detail, context, links…"
            className="w-full bg-secondary border border-border rounded-md p-2 text-sm min-h-[120px]"
          />
        </Field>

        <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
          <button onClick={handleDelete} className="text-xs text-destructive hover:underline">Delete task</button>
          <button onClick={() => onDiscuss(task)} className="flex items-center gap-1.5 text-xs font-medium bg-primary text-primary-foreground px-3 py-1.5 rounded-md">
            <Sparkles className="w-3.5 h-3.5" /> Discuss this task
          </button>
        </div>
      </div>
    </div>
  );
}

function GateModal({
  gate, launchTasks, onClose, onDiscuss,
}: {
  gate: LaunchGate;
  launchTasks: LaunchTask[];
  onClose: () => void;
  onDiscuss: (gate: LaunchGate) => void;
}) {
  const { updateLaunchGate, deleteLaunchGate, toggleLaunchTask } = useMutateStore();
  const phaseTasks = gate.relatedPhase != null ? launchTasks.filter(t => t.phase === gate.relatedPhase) : [];
  const phaseDone = phaseTasks.filter(t => t.done).length;

  function handleDelete() {
    if (confirm('Delete this decision gate?')) {
      deleteLaunchGate(gate.id);
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-xl max-h-[85vh] overflow-y-auto" onMouseDown={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <input type="checkbox" checked={gate.done} onChange={e => updateLaunchGate(gate.id, { done: e.target.checked })} className="accent-primary w-4 h-4 shrink-0" />
            <input
              value={gate.title}
              onChange={e => updateLaunchGate(gate.id, { title: e.target.value })}
              className={cn('flex-1 min-w-0 bg-transparent font-serif text-xl outline-none border-b border-transparent focus:border-primary pb-0.5', gate.done && 'line-through text-muted-foreground')}
            />
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground shrink-0"><X className="h-5 w-5" /></button>
        </div>

        <Field label="Description">
          <textarea
            value={gate.description}
            onChange={e => updateLaunchGate(gate.id, { description: e.target.value })}
            className="w-full bg-secondary border border-border rounded-md p-2 text-sm min-h-[80px]"
          />
        </Field>

        <Field label="Related phase">
          <select
            value={gate.relatedPhase ?? ''}
            onChange={e => updateLaunchGate(gate.id, { relatedPhase: e.target.value === '' ? null : Number(e.target.value) })}
            className="w-full bg-secondary border border-border rounded-md p-2 text-sm"
          >
            <option value="">None</option>
            {LAUNCH_PHASE_LABELS.map((label, p) => <option key={p} value={p}>{label}</option>)}
          </select>
        </Field>

        {gate.relatedPhase != null && (
          <div className="mt-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-muted-foreground">{LAUNCH_PHASE_LABELS[gate.relatedPhase]} tasks</p>
              <p className="text-xs text-muted-foreground">{phaseDone}/{phaseTasks.length} done</p>
            </div>
            <div className="h-1.5 rounded-full bg-secondary overflow-hidden mb-2">
              <div className="h-full bg-primary" style={{ width: `${phaseTasks.length ? (100 * phaseDone) / phaseTasks.length : 0}%` }} />
            </div>
            <div className="space-y-1 max-h-[160px] overflow-y-auto">
              {phaseTasks.map(t => (
                <label key={t.id} className="flex items-center gap-2 text-sm py-1 cursor-pointer">
                  <input type="checkbox" checked={t.done} onChange={e => toggleLaunchTask(t.id, e.target.checked)} className="accent-primary w-3.5 h-3.5" />
                  <span className={cn(t.done && 'line-through text-muted-foreground')}>{t.title}</span>
                </label>
              ))}
              {phaseTasks.length === 0 && <p className="text-xs text-muted-foreground">No tasks in this phase yet.</p>}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
          <button onClick={handleDelete} className="text-xs text-destructive hover:underline">Delete milestone</button>
          <button onClick={() => onDiscuss(gate)} className="flex items-center gap-1.5 text-xs font-medium bg-primary text-primary-foreground px-3 py-1.5 rounded-md">
            <Sparkles className="w-3.5 h-3.5" /> Discuss this milestone
          </button>
        </div>
      </div>
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

const PHASE_GOALS = [
  "Establish the groundwork before spending money or going public: know what you're selling, who you're selling it to, and that the name is actually safe to use.",
  "Turn the foundation into things you can put in front of a prospect — case studies, a pricing one-pager, proposal templates — so a sales conversation doesn't start from zero.",
  "Test the plan against reality before building anything permanent: talk to real prospects, see if the prices hold up, and start drafting the actual website copy.",
  "Make sure the business can legally and financially carry new paid work — tax structure, contracts, invoicing — before taking on anything beyond Wonder Strings.",
  "Get every launch-critical asset production-ready — the live site, the social presence, the content stockpile — and make the actual go/no-go call.",
  "Announce the studio publicly and start working the network that's been building throughout the plan.",
];

function PhaseStepper({ launchTasks, onOpenPhase }: { launchTasks: LaunchTask[]; onOpenPhase: (phase: number) => void }) {
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
          <div key={p} onClick={() => onOpenPhase(p)} className="flex-1 min-w-[128px] flex flex-col items-center text-center px-1 cursor-pointer rounded-lg py-1 hover:bg-secondary/40 transition-colors">
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

function PhaseModal({
  phase, launchTasks, onClose, onOpenTask, onAmend,
}: {
  phase: number;
  launchTasks: LaunchTask[];
  onClose: () => void;
  onOpenTask: (task: LaunchTask) => void;
  onAmend: (phase: number) => void;
}) {
  const { toggleLaunchTask } = useMutateStore();
  const tasks = launchTasks.filter(t => t.phase === phase);
  const done = tasks.filter(t => t.done).length;
  const label = LAUNCH_PHASE_LABELS[phase];
  const goal = PHASE_GOALS[phase];

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-xl max-h-[85vh] overflow-y-auto" onMouseDown={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-1">
          <div>
            <p className="text-[11px] font-bold text-primary uppercase tracking-wider">Phase {phase + 1} of {LAUNCH_PHASE_LABELS.length}</p>
            <h2 className="font-serif text-xl">{label}</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground shrink-0"><X className="h-5 w-5" /></button>
        </div>
        <p className="text-sm text-muted-foreground mb-2">{phaseDateRange(tasks)} · {done}/{tasks.length} done</p>
        <div className="h-1.5 rounded-full bg-secondary overflow-hidden mb-4">
          <div className="h-full bg-primary" style={{ width: `${tasks.length ? (100 * done) / tasks.length : 0}%` }} />
        </div>

        <div className="bg-secondary/40 rounded-md p-3 mb-4">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">What this phase is actually for</p>
          <p className="text-sm">{goal}</p>
        </div>

        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Tasks</p>
        <div className="space-y-1 max-h-[220px] overflow-y-auto mb-4">
          {tasks.map(t => (
            <div key={t.id} onClick={() => onOpenTask(t)} className="flex items-center gap-2 text-sm py-1.5 px-1 rounded cursor-pointer hover:bg-secondary/40">
              <input type="checkbox" checked={t.done} onClick={e => e.stopPropagation()} onChange={e => toggleLaunchTask(t.id, e.target.checked)} className="accent-primary w-3.5 h-3.5 shrink-0" />
              <span className={cn('flex-1 min-w-0 truncate', t.done && 'line-through text-muted-foreground')}>{t.title}</span>
              <span className="text-[11px] text-muted-foreground shrink-0">{t.due || 'No date'}</span>
            </div>
          ))}
          {tasks.length === 0 && <p className="text-xs text-muted-foreground py-2">No tasks in this phase yet.</p>}
        </div>

        <div className="flex justify-end pt-3 border-t border-border">
          <button onClick={() => onAmend(phase)} className="flex items-center gap-1.5 text-xs font-medium bg-primary text-primary-foreground px-3 py-1.5 rounded-md">
            <Sparkles className="w-3.5 h-3.5" /> Discuss & amend this phase
          </button>
        </div>
      </div>
    </div>
  );
}

type AmendTurn =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; changes: ProposedChange[]; selected: boolean[]; applied: boolean };

function describeChange(change: ProposedChange, launchTasks: LaunchTask[]): string {
  if (change.op === 'add') {
    return `Add: "${change.title}"${change.due ? ` — due ${change.due}` : ''}${change.owner ? ` (${change.owner})` : ''}`;
  }
  const existing = launchTasks.find(t => t.id === change.taskId);
  const name = existing?.title ?? 'a task';
  if (change.op === 'delete') return `Remove: "${name}"`;
  const parts: string[] = [];
  if (change.title) parts.push(`title → "${change.title}"`);
  if (change.due) parts.push(`due → ${change.due}`);
  if (change.owner) parts.push(`owner → ${change.owner}`);
  return `Update "${name}": ${parts.join(', ') || 'no field changes'}`;
}

function PhaseAmendPanel({ phase, launchTasks, onClose }: { phase: number; launchTasks: LaunchTask[]; onClose: () => void }) {
  const { addLaunchTask, updateLaunchTask, deleteLaunchTask, logActivity } = useMutateStore();
  const [turns, setTurns] = useState<AmendTurn[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const label = LAUNCH_PHASE_LABELS[phase];

  async function send() {
    const question = input.trim();
    if (!question || loading) return;
    setInput('');
    const history = turns.map(t => ({ role: t.role, content: t.content }));
    setTurns(t => [...t, { role: 'user', content: question }]);
    setLoading(true);
    try {
      const { reply, changes } = await api.launch.amendPhase(phase, question, history);
      setTurns(t => [...t, { role: 'assistant', content: reply, changes, selected: changes.map(() => true), applied: false }]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The advisor is temporarily unavailable.');
      setTurns(t => t.slice(0, -1));
      setInput(question);
    } finally {
      setLoading(false);
    }
  }

  function toggleSelected(turnIndex: number, changeIndex: number) {
    setTurns(ts => ts.map((t, i) => {
      if (i !== turnIndex || t.role !== 'assistant') return t;
      const selected = [...t.selected];
      selected[changeIndex] = !selected[changeIndex];
      return { ...t, selected };
    }));
  }

  function applyBatch(turnIndex: number) {
    const turn = turns[turnIndex];
    if (turn.role !== 'assistant' || turn.applied) return;
    let appliedCount = 0;
    turn.changes.forEach((change, i) => {
      if (!turn.selected[i]) return;
      if (change.op === 'add') {
        addLaunchTask({ title: change.title, due: change.due, owner: change.owner, phase });
        appliedCount++;
      } else if (change.op === 'update') {
        if (!launchTasks.some(t => t.id === change.taskId && t.phase === phase)) return;
        const patch: Partial<LaunchTask> = {};
        if (change.title) patch.title = change.title;
        if (change.due) patch.due = change.due;
        if (change.owner) patch.owner = change.owner;
        updateLaunchTask(change.taskId, patch);
        appliedCount++;
      } else if (change.op === 'delete') {
        if (!launchTasks.some(t => t.id === change.taskId && t.phase === phase)) return;
        deleteLaunchTask(change.taskId);
        appliedCount++;
      }
    });
    toast.success(appliedCount ? `Applied ${appliedCount} change${appliedCount === 1 ? '' : 's'} to the board` : 'Nothing selected to apply');
    if (appliedCount) logActivity(`Applied ${appliedCount} AI-suggested change${appliedCount === 1 ? '' : 's'} to "${label}" via brainstorm`, 'ai_amend');
    setTurns(ts => ts.map((t, i) => i === turnIndex ? { ...t, applied: true } : t));
  }

  return (
    <div className="fixed inset-0 z-[90] flex justify-end bg-background/70 backdrop-blur-sm" onMouseDown={onClose}>
      <div className="flex h-full w-full max-w-md flex-col border-l border-border bg-card shadow-xl" onMouseDown={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <h2 className="font-serif text-lg">Discuss & amend</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>
        <div className="px-4 pt-3">
          <span className="inline-flex items-center text-[11px] font-medium rounded-full bg-primary/10 text-primary px-2.5 py-1">Phase: {label}</span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {turns.length === 0 && (
            <p className="text-sm text-muted-foreground">Brainstorm this phase out loud — add missing work, reschedule something, cut what doesn't matter. Approved changes land on the board immediately below.</p>
          )}
          {turns.map((t, i) => t.role === 'user' ? (
            <div key={i} className="rounded-lg px-3 py-2 text-sm max-w-[90%] bg-primary text-primary-foreground ml-auto">{t.content}</div>
          ) : (
            <div key={i} className="space-y-2">
              <div className="rounded-lg px-3 py-2 text-sm max-w-[90%] bg-secondary">{t.content}</div>
              {t.changes.length > 0 && (
                <div className="rounded-lg border border-border p-3 space-y-2 max-w-[95%]">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Proposed changes</p>
                  {t.changes.map((change, ci) => (
                    <label key={ci} className="flex items-start gap-2 text-xs cursor-pointer">
                      <input type="checkbox" checked={t.selected[ci]} disabled={t.applied} onChange={() => toggleSelected(i, ci)} className="accent-primary w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <span>{describeChange(change, launchTasks)}</span>
                    </label>
                  ))}
                  {t.applied ? (
                    <p className="text-[11px] text-emerald-600 font-medium flex items-center gap-1 pt-1"><Check className="w-3 h-3" /> Applied to the board</p>
                  ) : (
                    <button onClick={() => applyBatch(i)} className="text-xs font-medium bg-primary text-primary-foreground px-3 py-1.5 rounded-md mt-1">Apply selected changes</button>
                  )}
                </div>
              )}
            </div>
          ))}
          {loading && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Thinking…</div>}
        </div>

        <div className="border-t border-border p-3 flex items-center gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') send(); }}
            placeholder={`Brainstorm "${label}"…`}
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

function WeeklyLoadHeatmap({ launchTasks }: { launchTasks: LaunchTask[] }) {
  const dues = launchTasks
    .map(t => (t.due ? new Date(t.due + 'T00:00:00') : null))
    .filter((d): d is Date => !!d && !isNaN(d.getTime()));
  if (!dues.length) return null;

  const minDate = startOfWeek(new Date(Math.min(...dues.map(d => d.getTime()))), { weekStartsOn: 1 });
  const maxDate = new Date(Math.max(...dues.map(d => d.getTime())));
  const weekCount = Math.max(1, differenceInCalendarWeeks(maxDate, minDate, { weekStartsOn: 1 }) + 1);
  const weeks = Array.from({ length: weekCount }, (_, i) => {
    const start = addWeeks(minDate, i);
    const end = addWeeks(start, 1);
    const count = dues.filter(d => d >= start && d < end).length;
    return { start, count };
  });
  const maxCount = Math.max(1, ...weeks.map(w => w.count));

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <h2 className="text-lg font-serif mb-1">Load across the roadmap</h2>
      <p className="text-xs text-muted-foreground mb-3">Tasks due per week, start to launch — spot an overloaded week before it arrives.</p>
      <div className="flex gap-1 overflow-x-auto pb-1">
        {weeks.map((w, i) => {
          const intensity = w.count / maxCount;
          return (
            <div
              key={i}
              title={`Week of ${format(w.start, 'MMM d')} — ${w.count} task${w.count === 1 ? '' : 's'} due`}
              className="shrink-0 w-6 h-10 rounded-sm flex items-end justify-center bg-secondary"
              style={w.count ? { backgroundColor: `rgba(217,78,56,${0.15 + intensity * 0.65})` } : undefined}
            >
              {w.count > 0 && <span className={cn('text-[10px] font-semibold pb-0.5', intensity > 0.5 ? 'text-white' : 'text-foreground')}>{w.count}</span>}
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[11px] text-muted-foreground mt-1.5">
        <span>{format(minDate, 'MMM yyyy')}</span>
        <span>{format(maxDate, 'MMM yyyy')}</span>
      </div>
    </div>
  );
}

const RECURRING_FREQUENCIES: LaunchRecurringTask['frequency'][] = ['weekly', 'biweekly', 'monthly'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function RecurringTasksModal({ rules, onClose }: { rules: LaunchRecurringTask[]; onClose: () => void }) {
  const { addRecurringLaunchTask, updateRecurringLaunchTask, deleteRecurringLaunchTask } = useMutateStore();
  const [title, setTitle] = useState('');

  function add() {
    if (!title.trim()) return;
    addRecurringLaunchTask({ title });
    setTitle('');
  }

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-xl max-h-[85vh] overflow-y-auto" onMouseDown={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-serif text-xl">Recurring tasks</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>
        <p className="text-sm text-muted-foreground mb-4">Standing roadmap items that regenerate on their own schedule — e.g. "every Monday: review the pipeline" — instead of being re-added by hand.</p>

        <div className="flex gap-2 mb-4">
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') add(); }}
            placeholder="e.g. Review the pipeline"
            className="flex-1 bg-secondary border border-border rounded-md p-2 text-sm"
          />
          <button onClick={add} disabled={!title.trim()} className="text-xs font-medium bg-primary text-primary-foreground px-3 py-2 rounded-md disabled:opacity-50">Add</button>
        </div>

        <div className="space-y-3">
          {rules.map(r => (
            <div key={r.id} className="border border-border rounded-md p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <input value={r.title} onChange={e => updateRecurringLaunchTask(r.id, { title: e.target.value })} className="flex-1 bg-transparent text-sm font-medium outline-none border-b border-transparent focus:border-primary" />
                <button onClick={() => deleteRecurringLaunchTask(r.id)} className="text-xs text-destructive hover:underline shrink-0">Remove</button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <select value={r.phase} onChange={e => updateRecurringLaunchTask(r.id, { phase: Number(e.target.value) })} className="bg-secondary border border-border rounded-md p-1.5">
                  {LAUNCH_PHASE_LABELS.map((label, p) => <option key={p} value={p}>{label}</option>)}
                </select>
                <select value={r.frequency} onChange={e => updateRecurringLaunchTask(r.id, { frequency: e.target.value as LaunchRecurringTask['frequency'] })} className="bg-secondary border border-border rounded-md p-1.5">
                  {RECURRING_FREQUENCIES.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
                <select value={r.dayOfWeek} onChange={e => updateRecurringLaunchTask(r.id, { dayOfWeek: Number(e.target.value) })} className="bg-secondary border border-border rounded-md p-1.5">
                  {DAY_NAMES.map((d, i) => <option key={d} value={i}>{d}</option>)}
                </select>
                <label className="flex items-center gap-1.5 bg-secondary border border-border rounded-md p-1.5">
                  <input type="checkbox" checked={r.active} onChange={e => updateRecurringLaunchTask(r.id, { active: e.target.checked })} className="accent-primary w-3.5 h-3.5" /> Active
                </label>
              </div>
            </div>
          ))}
          {rules.length === 0 && <p className="text-sm text-muted-foreground py-2">No recurring tasks yet.</p>}
        </div>
      </div>
    </div>
  );
}

function RoadmapTab({ onDiscuss, onAmendPhase }: { onDiscuss: (ctx: DiscussContext) => void; onAmendPhase: (phase: number) => void }) {
  const { launchTasks, launchGates, launchRecurringTasks } = useStore();
  const { addLaunchTask, updateLaunchTask, toggleLaunchTask, updateLaunchGate, generateLaunchTasksFromRecurring } = useMutateStore();
  const [dragOverPhase, setDragOverPhase] = useState<number | null>(null);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [openGateId, setOpenGateId] = useState<string | null>(null);
  const [openPhaseId, setOpenPhaseId] = useState<number | null>(null);
  const [recurringOpen, setRecurringOpen] = useState(false);
  const openTask = launchTasks.find(t => t.id === openTaskId) ?? null;
  const openGate = launchGates.find(g => g.id === openGateId) ?? null;

  useEffect(() => {
    generateLaunchTasksFromRecurring(4);
  }, [generateLaunchTasksFromRecurring]);

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
        <PhaseStepper launchTasks={launchTasks} onOpenPhase={setOpenPhaseId} />
      </div>

      <WeeklyLoadHeatmap launchTasks={launchTasks} />

      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="text-xl font-serif">Execution board</h2>
          <div className="flex items-center gap-3">
            <p className="text-xs text-muted-foreground">{doneCount} of {launchTasks.length} complete · drag a card to move it, click to open it</p>
            <button onClick={() => setRecurringOpen(true)} className="text-xs font-medium text-muted-foreground hover:text-primary hover:underline flex items-center gap-1 shrink-0">
              <Repeat className="w-3.5 h-3.5" /> Recurring tasks
            </button>
          </div>
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
                      onClick={() => setOpenTaskId(t.id)}
                      className="group rounded-md border border-border bg-card p-2 cursor-pointer hover:border-primary/50 active:cursor-grabbing"
                    >
                      <div className="flex items-start gap-1.5">
                        <input type="checkbox" checked={t.done} onClick={e => e.stopPropagation()} onChange={e => toggleLaunchTask(t.id, e.target.checked)} className="accent-primary w-3.5 h-3.5 mt-0.5 shrink-0" />
                        <span className={cn('flex-1 min-w-0 text-xs font-medium leading-snug', t.done && 'line-through text-muted-foreground')}>{t.title}</span>
                        <GripVertical className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0 mt-0.5 opacity-0 group-hover:opacity-100" />
                      </div>
                      <div className="flex items-center justify-between mt-1.5 pl-5">
                        <span className="text-[11px] text-muted-foreground">{t.due || 'No date'}</span>
                        <span className="text-[10px] rounded-full bg-secondary px-1.5 py-0.5 text-muted-foreground">{t.owner}</span>
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
          {launchGates.filter(g => g.kind === 'milestone').map(g => {
            const phaseTasks = g.relatedPhase != null ? launchTasks.filter(t => t.phase === g.relatedPhase) : [];
            const phaseDone = phaseTasks.filter(t => t.done).length;
            const ready = g.relatedPhase != null && phaseTasks.length > 0 && phaseDone === phaseTasks.length;
            return (
              <div key={g.id} onClick={() => setOpenGateId(g.id)} className="grid grid-cols-[20px_1fr] gap-3 border-t border-border/50 py-3 first:border-t-0 cursor-pointer hover:bg-secondary/30 -mx-1 px-1 rounded">
                <input type="checkbox" checked={g.done} onClick={e => e.stopPropagation()} onChange={e => updateLaunchGate(g.id, { done: e.target.checked })} className="accent-primary w-4 h-4 mt-0.5" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{g.title}</span>
                    {g.relatedPhase != null && (
                      <span className={cn('text-[11px] rounded-full px-2 py-0.5 flex items-center gap-1', ready ? 'bg-emerald-500/15 text-emerald-600' : 'bg-secondary text-muted-foreground')}>
                        {ready && <CheckCircle2 className="w-3 h-3" />}
                        {phaseDone}/{phaseTasks.length} phase tasks done
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{g.description}</p>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 border-l-2 border-primary pl-3 text-xs text-muted-foreground">
          The public launch and business registration are separate decisions. Commercial engagements need compliant contracting and invoicing when required, regardless of launch timing.
        </div>
      </div>

      {openTask && <TaskModal task={openTask} onClose={() => setOpenTaskId(null)} onDiscuss={task => { setOpenTaskId(null); onDiscuss({ type: 'task', task }); }} />}
      {openGate && <GateModal gate={openGate} launchTasks={launchTasks} onClose={() => setOpenGateId(null)} onDiscuss={gate => { setOpenGateId(null); onDiscuss({ type: 'gate', gate }); }} />}
      {openPhaseId != null && (
        <PhaseModal
          phase={openPhaseId}
          launchTasks={launchTasks}
          onClose={() => setOpenPhaseId(null)}
          onOpenTask={task => { setOpenPhaseId(null); setOpenTaskId(task.id); }}
          onAmend={phase => { setOpenPhaseId(null); onAmendPhase(phase); }}
        />
      )}
      {recurringOpen && <RecurringTasksModal rules={launchRecurringTasks} onClose={() => setRecurringOpen(false)} />}
    </div>
  );
}

// --- Clients & Finances --------------------------------------------------------

const FUNNEL_STAGES: LaunchLeadStatus[] = ['Lead', 'Contacted', 'Proposal', 'Active'];

function LeadFunnel({ launchLeads }: { launchLeads: LaunchLead[] }) {
  const counts = FUNNEL_STAGES.map(stage => launchLeads.filter(l => l.status === stage).length);
  const max = Math.max(1, ...counts);
  const sidelined = launchLeads.filter(l => l.status === 'Paused' || l.status === 'Closed').length;

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <h2 className="text-lg font-serif mb-1">Pipeline funnel</h2>
      <p className="text-xs text-muted-foreground mb-4">Where prospects are getting stuck, at a glance.</p>
      <div className="space-y-2.5">
        {FUNNEL_STAGES.map((stage, i) => {
          const pct = Math.max(16, (counts[i] / max) * 100);
          return (
            <div key={stage} className="flex items-center gap-3">
              <span className="w-20 shrink-0 text-xs text-muted-foreground text-right">{stage}</span>
              <div className="flex-1 flex justify-center">
                <div
                  className="h-8 rounded-md flex items-center justify-center text-xs font-semibold text-white transition-all"
                  style={{ width: `${pct}%`, backgroundColor: '#d94e38', opacity: counts[i] ? 0.5 + 0.5 * (counts[i] / max) : 0.25 }}
                >
                  {counts[i]}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {sidelined > 0 && <p className="text-xs text-muted-foreground mt-3">{sidelined} paused/closed, not shown above.</p>}
    </div>
  );
}

const REVENUE_MILESTONES = [
  { label: 'Feb 2027', date: '2027-02-01', low: 900, high: 1300 },
  { label: 'Apr 2027', date: '2027-04-01', low: 1200, high: 1800 },
  { label: 'Sep 2027', date: '2027-09-01', low: 2500, high: 3000 },
];

function RevenueMilestoneChart({ revenue }: { revenue: number }) {
  const data = [
    { label: 'Today', target: null as number | null },
    ...REVENUE_MILESTONES.map(m => ({ label: m.label, target: (m.low + m.high) / 2 })),
  ];
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <h2 className="text-lg font-serif mb-1">Revenue vs. milestone hypotheses</h2>
      <p className="text-xs text-muted-foreground mb-3">Today's actual recurring revenue against the memo's planning targets — a check-in, not a forecast.</p>
      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 10, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#88888833" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#888" />
            <YAxis tick={{ fontSize: 11 }} stroke="#888" tickFormatter={v => `€${v}`} width={55} />
            <Tooltip formatter={(v: number) => [`€${Math.round(v)}`, 'Target']} labelFormatter={label => label} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <Line type="monotone" dataKey="target" name="Target" stroke="#d94e38" strokeDasharray="4 3" strokeWidth={2} dot={{ r: 3 }} connectNulls />
            <ReferenceDot x="Today" y={revenue} r={5} fill="#3F7169" stroke="white" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-muted-foreground mt-1">Dashed line: the memo's hypothesis targets. Teal dot: today's actual, from the tracker below.</p>
    </div>
  );
}

function PricingSandbox({
  revenue, hours, delivery, settings,
}: {
  revenue: number;
  hours: number;
  delivery: number;
  settings: LaunchSettings | undefined;
}) {
  const [fee, setFee] = useState(600);
  const [hrs, setHrs] = useState(15);
  const hypoRevenue = revenue + fee;
  const hypoHours = hours + hrs;
  const hypoRemaining = delivery - hypoHours;
  const currentTakeHome = revenue - (settings?.monthlyCosts || 0) - (settings?.monthlyReserve || 0);
  const hypoTakeHome = hypoRevenue - (settings?.monthlyCosts || 0) - (settings?.monthlyReserve || 0);

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <h2 className="text-lg font-serif mb-1">What if I add a client?</h2>
      <p className="text-xs text-muted-foreground mb-4">Drag before you say yes to anything — see the effect on capacity and take-home up front.</p>
      <div className="grid sm:grid-cols-2 gap-4 mb-4">
        <div>
          <div className="flex justify-between text-xs text-muted-foreground mb-1"><span>Monthly fee</span><span className="font-medium text-foreground">{fmtEUR(fee)}</span></div>
          <input type="range" min={0} max={2000} step={50} value={fee} onChange={e => setFee(Number(e.target.value))} className="w-full accent-primary" />
        </div>
        <div>
          <div className="flex justify-between text-xs text-muted-foreground mb-1"><span>Hours/month</span><span className="font-medium text-foreground">{hrs}h</span></div>
          <input type="range" min={0} max={40} step={1} value={hrs} onChange={e => setHrs(Number(e.target.value))} className="w-full accent-primary" />
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <div className="rounded-md bg-secondary/50 p-3">
          <p className="text-[11px] text-muted-foreground mb-0.5">Revenue</p>
          <p className="font-medium">{fmtEUR(revenue)} → <span className="text-primary">{fmtEUR(hypoRevenue)}</span></p>
        </div>
        <div className="rounded-md bg-secondary/50 p-3">
          <p className="text-[11px] text-muted-foreground mb-0.5">Delivery hours used</p>
          <p className="font-medium">{Math.round(hours)}h → <span className="text-primary">{Math.round(hypoHours)}h</span></p>
        </div>
        <div className="rounded-md bg-secondary/50 p-3">
          <p className="text-[11px] text-muted-foreground mb-0.5">Capacity remaining</p>
          <p className={cn('font-medium', hypoRemaining < 0 ? 'text-destructive' : 'text-emerald-600')}>{Math.round(hypoRemaining)}h</p>
        </div>
        <div className="rounded-md bg-secondary/50 p-3">
          <p className="text-[11px] text-muted-foreground mb-0.5">Take-home</p>
          <p className="font-medium">{fmtEUR(currentTakeHome)} → <span className="text-primary">{fmtEUR(hypoTakeHome)}</span></p>
        </div>
      </div>
      {hypoRemaining < 0 && <p className="text-xs text-destructive mt-3">This would put you over capacity — something else would need to move or shrink first.</p>}
    </div>
  );
}

function LeadTimelineModal({ lead, activity, onClose }: { lead: LaunchLead; activity: LaunchActivity[]; onClose: () => void }) {
  const entries = activity.filter(a => a.refType === 'lead' && a.refId === lead.id).sort((a, b) => b.at.localeCompare(a.at));
  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl max-h-[80vh] overflow-y-auto" onMouseDown={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-serif text-xl">{lead.name} — history</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-3">
          {entries.map(e => (
            <div key={e.id} className="border-t border-border/50 pt-2 first:border-t-0 first:pt-0">
              <p className="text-sm">{e.summary}</p>
              <p className="text-[11px] text-muted-foreground">{formatDistanceToNow(new Date(e.at), { addSuffix: true })}</p>
            </div>
          ))}
          {entries.length === 0 && <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>}
        </div>
      </div>
    </div>
  );
}

function ClientsFinancesTab() {
  const { launchLeads, launchSettings, launchActivity } = useStore();
  const { addLaunchLead, updateLaunchLead, deleteLaunchLead, convertLaunchLead, updateLaunchSettings, logActivity } = useMutateStore();
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [timelineLeadId, setTimelineLeadId] = useState<string | null>(null);
  const nextOnFocusRef = useRef<Record<string, string>>({});
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

      <div className="grid md:grid-cols-2 gap-6">
        <LeadFunnel launchLeads={launchLeads} />
        <RevenueMilestoneChart revenue={revenue} />
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
                  <td className="py-2 pr-2">
                    <input
                      value={l.next}
                      onFocus={() => { nextOnFocusRef.current[l.id] = l.next; }}
                      onChange={e => updateLaunchLead(l.id, { next: e.target.value })}
                      onBlur={() => {
                        const before = nextOnFocusRef.current[l.id];
                        if (before !== undefined && before !== l.next && l.next.trim()) {
                          logActivity(`"${l.name}" next action: "${l.next.trim()}"`, 'lead_next', { id: l.id, type: 'lead' });
                        }
                      }}
                      className="w-full min-w-[140px] bg-transparent rounded px-1.5 py-1 border border-transparent hover:border-border focus:border-primary focus:bg-secondary outline-none"
                    />
                  </td>
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
                  <td className="py-2 flex items-center gap-1">
                    <button onClick={() => setTimelineLeadId(l.id)} title="History" className="text-muted-foreground hover:text-primary p-1"><History className="w-3.5 h-3.5" /></button>
                    <button onClick={() => handleDelete(l.id)} className="text-destructive text-sm font-bold px-1">×</button>
                  </td>
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

      <PricingSandbox revenue={revenue} hours={hours} delivery={delivery} settings={settings} />

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

      {timelineLeadId && (() => {
        const lead = launchLeads.find(l => l.id === timelineLeadId);
        return lead ? <LeadTimelineModal lead={lead} activity={launchActivity} onClose={() => setTimelineLeadId(null)} /> : null;
      })()}
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

const STICKY_W = 160;
const STICKY_H = 110;

function IdeaBoard() {
  const { launchNotes } = useStore();
  const { addIdeaNote, updateLaunchNote, deleteLaunchNote, promoteIdeaToTask } = useMutateStore();
  const boardRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const ideas = launchNotes.filter((n): n is LaunchNote & { x: number; y: number } => n.kind === 'idea');

  function addSticky() {
    const board = boardRef.current;
    const w = board?.clientWidth ?? 600;
    const h = board?.clientHeight ?? 380;
    addIdeaNote({
      x: clamp(Math.random() * w, 0, Math.max(0, w - STICKY_W)),
      y: clamp(Math.random() * h, 0, Math.max(0, h - STICKY_H)),
      color: STICKY_COLORS[ideas.length % STICKY_COLORS.length],
    });
  }

  function onStickyPointerDown(e: React.PointerEvent<HTMLDivElement>, note: LaunchNote & { x: number; y: number }) {
    const board = boardRef.current;
    if (!board) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const boardRect = board.getBoundingClientRect();
    dragRef.current = { id: note.id, offsetX: e.clientX - (boardRect.left + note.x), offsetY: e.clientY - (boardRect.top + note.y) };
  }

  function onStickyPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const board = boardRef.current;
    if (!drag || !board) return;
    const boardRect = board.getBoundingClientRect();
    updateLaunchNote(drag.id, {
      x: clamp(e.clientX - boardRect.left - drag.offsetX, 0, Math.max(0, boardRect.width - STICKY_W)),
      y: clamp(e.clientY - boardRect.top - drag.offsetY, 0, Math.max(0, boardRect.height - STICKY_H)),
    });
  }

  function onStickyPointerUp() {
    dragRef.current = null;
  }

  function handlePromote(id: string) {
    promoteIdeaToTask(id, 0);
    toast.success('Added to the roadmap as a task');
  }

  return (
    <div className="md:col-span-2 bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-serif">Idea board</h2>
          <p className="text-xs text-muted-foreground">Drag stickies around to group loose thoughts before they're decisions. "→ Task" turns one into a real roadmap item.</p>
        </div>
        <button onClick={addSticky} className="text-xs font-medium bg-primary text-primary-foreground px-3 py-1.5 rounded-md shrink-0">+ New idea</button>
      </div>
      <div ref={boardRef} className="relative w-full h-[380px] rounded-lg border border-dashed border-border bg-secondary/20 overflow-hidden">
        {ideas.length === 0 && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground px-6 text-center">
            Nothing here yet — click "+ New idea" to drop the first sticky.
          </p>
        )}
        {ideas.map(note => (
          <div
            key={note.id}
            onPointerDown={e => onStickyPointerDown(e, note)}
            onPointerMove={onStickyPointerMove}
            onPointerUp={onStickyPointerUp}
            style={{ left: note.x, top: note.y, width: STICKY_W, backgroundColor: note.color ?? STICKY_COLORS[0] }}
            className="absolute rounded-md shadow-md p-2 cursor-grab active:cursor-grabbing select-none touch-none"
          >
            <textarea
              value={note.text}
              onChange={e => updateLaunchNote(note.id, { text: e.target.value })}
              onPointerDown={e => e.stopPropagation()}
              placeholder="Type an idea…"
              className="w-full bg-transparent text-xs text-black/80 resize-none outline-none min-h-[70px]"
            />
            <div className="flex items-center justify-between mt-1" onPointerDown={e => e.stopPropagation()}>
              <button onClick={() => handlePromote(note.id)} title="Promote to a roadmap task" className="text-[10px] font-semibold text-black/60 hover:text-black">→ Task</button>
              <button onClick={() => deleteLaunchNote(note.id)} className="text-[10px] text-black/50 hover:text-black">✕</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NotesTab() {
  const { launchNotes, launchGates } = useStore();
  const { addLaunchNote, deleteLaunchNote, addLaunchGate, updateLaunchGate, deleteLaunchGate } = useMutateStore();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [marketText, setMarketText] = useState('');
  const [newQuestion, setNewQuestion] = useState('');
  const journalNotes = launchNotes.filter(n => n.kind === 'journal');
  const marketNotes = launchNotes.filter(n => n.kind === 'market');
  const openQuestions = launchGates.filter(g => g.kind === 'question');

  function save() {
    if (!title.trim() || !text.trim()) return;
    addLaunchNote({ date, title, text });
    setTitle('');
    setText('');
  }

  function handleDelete(id: string) {
    if (confirm('Delete this note?')) deleteLaunchNote(id);
  }

  function saveMarketNote() {
    if (!marketText.trim()) return;
    addLaunchNote({ title: '', text: marketText, kind: 'market' });
    setMarketText('');
  }

  function addQuestion() {
    if (!newQuestion.trim()) return;
    addLaunchGate({ title: newQuestion.trim(), description: '', kind: 'question' });
    setNewQuestion('');
  }

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <IdeaBoard />

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
        {journalNotes.length === 0 && <p className="text-sm text-muted-foreground">No notes yet.</p>}
        <div className="space-y-0">
          {journalNotes.map(n => (
            <div key={n.id} className="border-t border-border/50 py-3 first:border-t-0">
              <div className="text-xs text-muted-foreground">{n.date}</div>
              <h3 className="font-serif text-base">{n.title}</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap mt-1">{n.text}</p>
              <button onClick={() => handleDelete(n.id)} className="text-xs text-destructive hover:underline mt-2">Delete note</button>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-serif">Open questions</h2>
          <span className="text-xs text-muted-foreground">{openQuestions.filter(q => q.done).length}/{openQuestions.length} resolved</span>
        </div>
        <div className="flex gap-2 mb-3">
          <input
            value={newQuestion}
            onChange={e => setNewQuestion(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addQuestion(); }}
            placeholder="Add an open question or risk…"
            className="flex-1 bg-secondary border border-border rounded-md p-2 text-sm"
          />
          <button onClick={addQuestion} disabled={!newQuestion.trim()} className="text-xs font-medium bg-primary text-primary-foreground px-3 py-2 rounded-md disabled:opacity-50">Add</button>
        </div>
        <div className="space-y-0">
          {openQuestions.map(q => (
            <div key={q.id} className="flex items-start gap-2 border-t border-border/50 py-2 first:border-t-0">
              <input type="checkbox" checked={q.done} onChange={e => updateLaunchGate(q.id, { done: e.target.checked })} className="accent-primary w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span className={cn('flex-1 text-sm', q.done && 'line-through text-muted-foreground')}>{q.title}{q.description && <span className="block text-xs text-muted-foreground mt-0.5">{q.description}</span>}</span>
              <button onClick={() => deleteLaunchGate(q.id)} className="text-xs text-destructive hover:underline shrink-0">Remove</button>
            </div>
          ))}
          {openQuestions.length === 0 && <p className="text-sm text-muted-foreground py-2">Nothing open right now.</p>}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="text-lg font-serif mb-1">Market watch</h2>
        <p className="text-xs text-muted-foreground mb-3">What comparable studios and competitors are doing — feeds the idea board.</p>
        <div className="flex gap-2 mb-3">
          <input
            value={marketText}
            onChange={e => setMarketText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') saveMarketNote(); }}
            placeholder="e.g. Studio X launched a TikTok behind-the-scenes series…"
            className="flex-1 bg-secondary border border-border rounded-md p-2 text-sm"
          />
          <button onClick={saveMarketNote} disabled={!marketText.trim()} className="text-xs font-medium bg-primary text-primary-foreground px-3 py-2 rounded-md disabled:opacity-50">Log it</button>
        </div>
        <div className="space-y-0 max-h-[220px] overflow-y-auto">
          {marketNotes.map(n => (
            <div key={n.id} className="flex items-start justify-between gap-2 border-t border-border/50 py-2 first:border-t-0">
              <div>
                <p className="text-sm">{n.text}</p>
                <p className="text-[11px] text-muted-foreground">{n.date}</p>
              </div>
              <button onClick={() => deleteLaunchNote(n.id)} className="text-xs text-destructive hover:underline shrink-0">Remove</button>
            </div>
          ))}
          {marketNotes.length === 0 && <p className="text-sm text-muted-foreground py-2">Nothing logged yet.</p>}
        </div>
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

function discussContextKey(context: DiscussContext): string {
  if (context.type === 'task') return `task-${context.task.id}`;
  if (context.type === 'gate') return `gate-${context.gate.id}`;
  if (context.type === 'custom') return `custom-${context.label}`;
  return 'general';
}

function discussStarter(context: DiscussContext): string {
  if (context.type === 'task') {
    const phase = LAUNCH_PHASE_LABELS[context.task.phase] ?? 'unphased';
    return `Let's talk about the task "${context.task.title}" (due ${context.task.due || 'no date set'}, phase: ${phase}, owner: ${context.task.owner}, status: ${context.task.done ? 'done' : 'open'}). `;
  }
  if (context.type === 'gate') {
    return `Let's talk about the milestone "${context.gate.title}". `;
  }
  if (context.type === 'custom') {
    return context.starter;
  }
  return '';
}

function discussLabel(context: DiscussContext): string | null {
  if (context.type === 'task') return `Task: ${context.task.title}`;
  if (context.type === 'gate') return `Milestone: ${context.gate.title}`;
  if (context.type === 'custom') return context.label;
  return null;
}

function DevilsAdvocateModal({ onClose, onDiscuss }: { onClose: () => void; onDiscuss: (ctx: DiscussContext) => void }) {
  const [critique, setCritique] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const { critique: result } = await api.launch.devilsAdvocate();
      setCritique(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The reality check is temporarily unavailable.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { run(); }, []);

  function handleDiscuss() {
    onClose();
    onDiscuss({ type: 'custom', label: 'Reality check', starter: "Let's dig into the reality check you just gave me. " });
  }

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-xl max-h-[85vh] overflow-y-auto" onMouseDown={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-primary" />
            <h2 className="font-serif text-xl">Reality check</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>
        <p className="text-sm text-muted-foreground mb-4">A deliberately skeptical pass over the whole plan — not a collaborator, a critic.</p>

        {loading && <div className="flex items-center gap-2 text-sm text-muted-foreground py-6"><Loader2 className="h-4 w-4 animate-spin" /> Looking for holes…</div>}
        {error && <p className="text-sm text-destructive py-4">{error}</p>}
        {critique && !loading && <p className="text-sm whitespace-pre-wrap leading-relaxed">{critique}</p>}

        {!loading && (
          <div className="flex items-center justify-between mt-5 pt-4 border-t border-border">
            <button onClick={run} className="text-xs text-muted-foreground hover:text-foreground hover:underline">Run again</button>
            {critique && (
              <button onClick={handleDiscuss} className="flex items-center gap-1.5 text-xs font-medium bg-primary text-primary-foreground px-3 py-1.5 rounded-md">
                <Sparkles className="w-3.5 h-3.5" /> Discuss this
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function DiscussPanel({ context, onClose }: { context: DiscussContext; onClose: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState(discussStarter(context));
  const [loading, setLoading] = useState(false);
  const label = discussLabel(context);

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

        {label && (
          <div className="px-4 pt-3">
            <span className="inline-flex items-center text-[11px] font-medium rounded-full bg-primary/10 text-primary px-2.5 py-1">{label}</span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {label
                ? 'Edit the question below, or send it as-is — the advisor has the full plan, not just this item.'
                : 'Ask anything grounded in the current plan — tasks, leads, gates, or recent notes. For example: "What\'s blocking the April launch gate?" or "Which tasks are overdue?"'}
            </p>
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
