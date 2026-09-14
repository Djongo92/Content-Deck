import { FormEvent, useMemo, useState } from 'react';
import { addDays, format, isAfter, isBefore, isSameMonth, startOfDay, subDays, subMonths } from 'date-fns';
import { AlertTriangle, BarChart3, Clock3, FileCheck2, Import, Layout, ShieldAlert, Sparkles, Target, TrendingUp, X } from 'lucide-react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { useMutateStore, useStore } from '@/hooks/use-store';
import { api } from '@/lib/api';
import type { Deliverable, PerformanceMetrics } from '@/lib/types';
import { cn } from '@/lib/utils';

type ReportMetrics = Required<PerformanceMetrics>;

const emptyMetrics: ReportMetrics = { views: 0, likes: 0, comments: 0, shares: 0, clicks: 0 };
const engagement = (metrics: ReportMetrics) => metrics.likes + metrics.comments + metrics.shares;
const compact = (value: number) => Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value);

export default function ReportsPage() {
  const { deliverables, clients, metrics, versions, assets } = useStore();
  const { addBrief } = useMutateStore();
  const [, navigate] = useLocation();
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const now = new Date();
  const lastMonth = subMonths(now, 1);
  const activeClients = clients.filter(client => !client.archived);

  const metricByDeliverable = useMemo(() => {
    const latest = new Map<string, typeof metrics[number]>();
    metrics.forEach(metric => {
      const existing = latest.get(metric.deliverableId);
      if (!existing || metric.capturedAt > existing.capturedAt) latest.set(metric.deliverableId, metric);
    });
    return latest;
  }, [metrics]);

  const metricsFor = (deliverable: Deliverable): ReportMetrics => {
    const metric = metricByDeliverable.get(deliverable.id);
    return {
      views: metric?.views ?? deliverable.performance.views ?? 0,
      likes: metric?.likes ?? deliverable.performance.likes ?? 0,
      comments: metric?.comments ?? deliverable.performance.comments ?? 0,
      shares: metric?.shares ?? deliverable.performance.shares ?? 0,
      clicks: metric?.clicks ?? deliverable.performance.clicks ?? 0,
    };
  };

  const stats = useMemo(() => {
    const published = deliverables.filter(deliverable => deliverable.publishingStatus === 'published');
    const thisMonth = published.filter(deliverable => (deliverable.publishedAt || deliverable.publishAt) && isSameMonth(new Date(deliverable.publishedAt || deliverable.publishAt!), now));
    const previousMonth = published.filter(deliverable => (deliverable.publishedAt || deliverable.publishAt) && isSameMonth(new Date(deliverable.publishedAt || deliverable.publishAt!), lastMonth));
    const platformBreakdown = published.reduce((result, deliverable) => {
      result[deliverable.platform] = (result[deliverable.platform] || 0) + 1;
      return result;
    }, {} as Record<string, number>);
    const totalEngagement = published.reduce((sum, deliverable) => sum + engagement(metricsFor(deliverable)), 0);
    const approved = deliverables.filter(deliverable => deliverable.approvedVersionId).length;
    return {
      published,
      total: published.length,
      thisMonth: thisMonth.length,
      lastMonth: previousMonth.length,
      platformBreakdown,
      engagement: totalEngagement,
      approvalRate: deliverables.length ? Math.round(approved / deliverables.length * 100) : 0,
      trend: previousMonth.length ? Math.round((thisMonth.length - previousMonth.length) / previousMonth.length * 100) : (thisMonth.length ? 100 : 0),
    };
  // metricsFor reads the memoized metric map and deliverables in this render.
  }, [deliverables, metricByDeliverable, now.getMonth(), now.getFullYear()]);

  const weeklyBrief = useMemo(() => {
    const sevenDaysAgo = subDays(now, 7);
    const recent = stats.published.filter(deliverable => (deliverable.publishedAt || deliverable.publishAt)
      && isAfter(new Date(deliverable.publishedAt || deliverable.publishAt!), sevenDaysAgo)
      && !isAfter(new Date(deliverable.publishedAt || deliverable.publishAt!), now));
    const ranked = [...stats.published].sort((a, b) => engagement(metricsFor(b)) - engagement(metricsFor(a)));
    const top = ranked[0];
    const elapsedPace = now.getDate() / new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const overPace = activeClients.filter(client => {
      const hours = deliverables.filter(deliverable => deliverable.clientId === client.id
        && [deliverable.publishAt, deliverable.productionDueAt].some(date => date && isSameMonth(new Date(date), now)))
        .reduce((sum, deliverable) => sum + (deliverable.actualHours || 0), 0);
      return client.monthlyRetainerHours > 0 && hours > client.monthlyRetainerHours * elapsedPace;
    });
    const cutoff = subDays(now, 2);
    const waiting = versions.filter(version => version.approvalState === 'pending' && isBefore(new Date(version.createdAt), cutoff)).length;
    const expiryLimit = addDays(startOfDay(now), 30);
    const expiring = assets.filter(asset => asset.rightsExpiry
      && isAfter(new Date(asset.rightsExpiry), startOfDay(now))
      && isBefore(new Date(asset.rightsExpiry), expiryLimit)).length;
    return { recent, top, overPace, waiting, expiring };
  }, [stats.published, activeClients, deliverables, versions, assets, metricByDeliverable, now.getDate(), now.getMonth()]);

  const profitability = useMemo(() => activeClients.map(client => {
    const hours = deliverables.filter(deliverable => deliverable.clientId === client.id
      && [deliverable.publishAt, deliverable.productionDueAt].some(date => date && isSameMonth(new Date(date), now)))
      .reduce((sum, deliverable) => sum + (deliverable.actualHours || 0), 0);
    const effectiveRate = hours ? client.monthlyRetainerAmount / hours : null;
    const elapsedPace = now.getDate() / new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const actualPace = client.monthlyRetainerHours ? hours / client.monthlyRetainerHours : 0;
    const pace = actualPace > elapsedPace * 1.1 ? 'over' : actualPace < elapsedPace * 0.9 ? 'under' : 'on-track';
    return { client, hours, effectiveRate, pace };
  }).sort((a, b) => (a.effectiveRate ?? Number.POSITIVE_INFINITY) - (b.effectiveRate ?? Number.POSITIVE_INFINITY)),
  [activeClients, deliverables, now.getDate(), now.getMonth()]);

  const portfolio = useMemo(() => [...stats.published].sort((a, b) => engagement(metricsFor(b)) - engagement(metricsFor(a))),
    [stats.published, metricByDeliverable]);

  const createFollowup = (deliverable: Deliverable) => {
    const values = metricsFor(deliverable);
    const summary = `${values.views} views, ${values.likes} likes, ${values.comments} comments, ${values.shares} shares, ${values.clicks} clicks`;
    addBrief({
      clientId: deliverable.clientId,
      title: `More like: ${deliverable.title}`,
      objective: `Replicate what worked: ${summary}`,
      keyMessage: deliverable.copy.slice(0, 200),
    });
    toast.success('Brief created.');
    navigate('/calendar');
  };

  const handleImport = async (event: FormEvent) => {
    event.preventDefault();
    const misses: string[] = [];
    const rows = importText.split('\n').map(line => line.trim()).filter(Boolean).flatMap(line => {
      const parts = line.split(',').map(part => part.trim());
      if (parts.length < 6) {
        misses.push(line);
        return [];
      }
      const identifier = parts.slice(0, -5).join(',').trim();
      const values = parts.slice(-5).map(Number);
      const deliverable = deliverables.find(item => item.id === identifier)
        || deliverables.find(item => item.title.toLocaleLowerCase() === identifier.toLocaleLowerCase());
      if (!deliverable || values.some(value => !Number.isFinite(value))) {
        misses.push(line);
        return [];
      }
      return [{
        deliverableId: deliverable.id,
        views: values[0],
        likes: values[1],
        comments: values[2],
        shares: values[3],
        clicks: values[4],
        capturedAt: new Date().toISOString(),
        source: 'CSV paste',
      }];
    });
    setUnmatched(misses);
    if (!rows.length) {
      toast.warning('No matching metric rows found.');
      return;
    }
    setImporting(true);
    try {
      const result = await api.importMetrics(rows);
      toast.success(`${result.imported} metric row${result.imported === 1 ? '' : 's'} imported.`);
      if (misses.length) toast.warning(`Unmatched lines: ${misses.join(' | ')}`);
      if (!misses.length) {
        setImportText('');
        setImportOpen(false);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Metrics could not be imported.');
    } finally {
      setImporting(false);
    }
  };

  const topMetrics = weeklyBrief.top ? metricsFor(weeklyBrief.top) : emptyMetrics;

  return (
    <div className="mx-auto w-full max-w-7xl flex-1 overflow-y-auto p-8">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif text-foreground">Performance & Reports</h1>
          <p className="mt-1 text-sm text-muted-foreground">Decisions across every client and platform</p>
        </div>
        <button onClick={() => setImportOpen(true)} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:brightness-110"><Import className="h-4 w-4" /> Import metrics</button>
      </header>

      <section className="mb-8 rounded-xl border border-border bg-card p-6">
        <h2 className="mb-4 font-serif text-xl">Weekly brief</h2>
        <div className="divide-y divide-border">
          <BriefLine icon={FileCheck2}>{weeklyBrief.recent.length} piece{weeklyBrief.recent.length === 1 ? '' : 's'} published in the last 7 days.</BriefLine>
          <BriefLine icon={Sparkles}>{weeklyBrief.top ? `${weeklyBrief.top.title} is the top performer with ${topMetrics.likes} likes, ${topMetrics.comments} comments and ${topMetrics.shares} shares.` : 'No published work has performance data yet.'}</BriefLine>
          <BriefLine icon={TrendingUp}>{weeklyBrief.overPace.length ? `${weeklyBrief.overPace.map(client => client.name).join(', ')} ${weeklyBrief.overPace.length === 1 ? 'is' : 'are'} pacing over retainer.` : 'No clients are pacing over their prorated retainer.'}</BriefLine>
          <BriefLine icon={Clock3}>{weeklyBrief.waiting} approval{weeklyBrief.waiting === 1 ? '' : 's'} waiting longer than 48 hours.</BriefLine>
          <BriefLine icon={ShieldAlert}>{weeklyBrief.expiring} asset right{weeklyBrief.expiring === 1 ? '' : 's'} expiring in the next 30 days.</BriefLine>
        </div>
      </section>

      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
        <StatCard icon={BarChart3} label="Total Published" value={stats.total.toString()} note="All-time content pieces" />
        <StatCard icon={TrendingUp} label="This Month" value={stats.thisMonth.toString()} note={`${stats.trend > 0 ? '+' : ''}${stats.trend}% vs ${stats.lastMonth} last month`} />
        <StatCard icon={Target} label="Approval Rate" value={`${stats.approvalRate}%`} note={`${stats.engagement.toLocaleString()} recorded engagements`} />
      </div>

      <section className="mb-8 overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border p-6"><h2 className="font-serif text-xl">Client profitability</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="bg-secondary/30 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-6 py-3">Client</th><th className="px-6 py-3">Monthly retainer</th><th className="px-6 py-3">Actual hours</th><th className="px-6 py-3">Effective rate</th><th className="px-6 py-3">Pace</th></tr></thead>
            <tbody>{profitability.map(({ client, hours, effectiveRate, pace }) => (
              <tr key={client.id} className="border-t border-border">
                <td className="px-6 py-4 font-medium"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: client.color }} />{client.name}</td>
                <td className="px-6 py-4">{client.monthlyRetainerAmount.toLocaleString(undefined, { style: 'currency', currency: 'USD' })}</td>
                <td className="px-6 py-4">{hours}h</td>
                <td className="px-6 py-4">{effectiveRate === null ? '—' : effectiveRate.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }) + '/h'}</td>
                <td className="px-6 py-4"><span className={cn('rounded-full border px-2 py-1 text-xs', pace === 'over' ? 'border-destructive/40 text-destructive' : pace === 'under' ? 'border-border text-muted-foreground' : 'border-primary/40 text-primary')}>{pace}</span></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>

      <div className="mb-8 grid grid-cols-1 gap-8 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-6">
          <h3 className="mb-6 flex items-center gap-2 font-serif text-lg"><Layout className="h-5 w-5 text-muted-foreground" /> Platform Breakdown</h3>
          <div className="space-y-4">
            {Object.entries(stats.platformBreakdown).sort((a, b) => b[1] - a[1]).map(([platform, count]) => {
              const percentage = Math.round(count / stats.total * 100) || 0;
              return <div key={platform}><div className="mb-1 flex justify-between text-sm"><span className="font-medium">{platform}</span><span className="text-muted-foreground">{count} ({percentage}%)</span></div><div className="h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary" style={{ width: `${percentage}%` }} /></div></div>;
            })}
            {!Object.keys(stats.platformBreakdown).length && <p className="text-sm text-muted-foreground">No data available yet.</p>}
          </div>
        </section>
        <section className="rounded-xl border border-border bg-card p-6">
          <h3 className="mb-6 font-serif text-lg">Client Hours (This Month)</h3>
          <div className="space-y-5">{profitability.map(({ client, hours }) => {
            const percentage = client.monthlyRetainerHours ? Math.round(hours / client.monthlyRetainerHours * 100) : 0;
            return <div key={client.id}><div className="mb-2 flex justify-between text-sm"><span className="font-medium">{client.name}</span><span className="text-muted-foreground">{hours} / {client.monthlyRetainerHours}h</span></div><div className="h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full" style={{ width: `${Math.min(100, percentage)}%`, backgroundColor: client.color }} /></div></div>;
          })}</div>
        </section>
      </div>

      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border p-6"><h2 className="font-serif text-xl">Portfolio</h2><p className="mt-1 text-sm text-muted-foreground">Published work ranked by engagement.</p></div>
        <div className="divide-y divide-border">
          {portfolio.map(deliverable => {
            const client = clients.find(item => item.id === deliverable.clientId);
            const values = metricsFor(deliverable);
            return (
              <div key={deliverable.id} className="grid gap-4 p-5 lg:grid-cols-[minmax(200px,1fr)_auto_auto_auto_auto] lg:items-center">
                <div><p className="font-medium">{deliverable.title}</p><p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: client?.color }} />{client?.name || 'Unknown client'} · {deliverable.platform} · {deliverable.format}</p></div>
                <div className="text-xs text-muted-foreground"><span title="Views">{compact(values.views)} views</span> · <span title="Likes">{compact(values.likes)} likes</span> · <span title="Comments">{compact(values.comments)} comments</span> · <span title="Shares">{compact(values.shares)} shares</span></div>
                <time className="text-xs text-muted-foreground">{deliverable.publishAt ? format(new Date(deliverable.publishAt), 'MMM d, yyyy') : '—'}</time>
                <span className="text-sm font-medium">{compact(engagement(values))} engaged</span>
                <button onClick={() => createFollowup(deliverable)} className="rounded-md border border-border bg-secondary px-3 py-2 text-xs font-medium hover:border-primary">Make more like this</button>
              </div>
            );
          })}
          {!portfolio.length && <p className="p-6 text-sm text-muted-foreground">No published work yet.</p>}
        </div>
      </section>

      {importOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <form onSubmit={handleImport} className="w-full max-w-2xl rounded-xl border border-border bg-card p-6 shadow-xl">
            <div className="mb-5 flex items-start justify-between"><div><h2 className="font-serif text-xl">Import metrics</h2><p className="mt-1 text-sm text-muted-foreground">Paste one line per deliverable using:</p><code className="mt-2 block rounded-md bg-secondary p-2 text-xs">deliverable title or id, views, likes, comments, shares, clicks</code></div><button type="button" onClick={() => setImportOpen(false)} className="p-2 text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button></div>
            <textarea value={importText} onChange={event => setImportText(event.target.value)} className="min-h-56 w-full resize-y rounded-md border border-border bg-secondary p-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary" placeholder="Spring launch, 12000, 450, 32, 18, 105" />
            {!!unmatched.length && <div className="mt-3 rounded-md border border-destructive/30 p-3 text-xs text-destructive"><p className="mb-1 flex items-center gap-1 font-medium"><AlertTriangle className="h-3.5 w-3.5" /> Unmatched lines</p>{unmatched.map(line => <p key={line} className="truncate">{line}</p>)}</div>}
            <div className="mt-5 flex justify-end gap-3"><button type="button" onClick={() => setImportOpen(false)} className="rounded-md border border-border px-4 py-2 text-sm">Cancel</button><button type="submit" disabled={importing || !importText.trim()} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">{importing ? 'Importing…' : 'Import metrics'}</button></div>
          </form>
        </div>
      )}
    </div>
  );
}

function BriefLine({ icon: Icon, children }: { icon: typeof FileCheck2; children: React.ReactNode }) {
  return <p className="flex items-center gap-3 py-3 text-sm"><Icon className="h-4 w-4 shrink-0 text-primary" />{children}</p>;
}

function StatCard({ icon: Icon, label, value, note }: { icon: typeof BarChart3; label: string; value: string; note: string }) {
  return <div className="rounded-xl border border-border bg-card p-6"><div className="mb-4 flex items-center gap-3"><div className="rounded-lg bg-primary/10 p-2 text-primary"><Icon className="h-5 w-5" /></div><h3 className="font-medium">{label}</h3></div><p className="text-4xl font-serif">{value}</p><p className="mt-2 text-sm text-muted-foreground">{note}</p></div>;
}