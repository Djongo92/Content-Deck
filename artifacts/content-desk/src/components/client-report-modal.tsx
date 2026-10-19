import { useMemo, useState } from 'react';
import { format, isSameMonth, parseISO } from 'date-fns';
import { Printer, X } from 'lucide-react';
import { useStore } from '@/hooks/use-store';
import type { Deliverable, PerformanceMetrics } from '@/lib/types';

type ReportMetrics = Required<PerformanceMetrics>;
const engagement = (m: ReportMetrics) => m.likes + m.comments + m.shares;

export function ClientReportModal({ onClose }: { onClose: () => void }) {
  const { clients, deliverables, metrics } = useStore();
  const activeClients = clients.filter(c => !c.archived);
  const [clientId, setClientId] = useState(activeClients[0]?.id ?? '');
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));

  const client = clients.find(c => c.id === clientId);

  const metricByDeliverable = useMemo(() => {
    const latest = new Map<string, typeof metrics[number]>();
    metrics.forEach(m => {
      const existing = latest.get(m.deliverableId);
      if (!existing || m.capturedAt > existing.capturedAt) latest.set(m.deliverableId, m);
    });
    return latest;
  }, [metrics]);

  const metricsFor = (d: Deliverable): ReportMetrics => {
    const m = metricByDeliverable.get(d.id);
    return {
      views: m?.views ?? d.performance.views ?? 0,
      likes: m?.likes ?? d.performance.likes ?? 0,
      comments: m?.comments ?? d.performance.comments ?? 0,
      shares: m?.shares ?? d.performance.shares ?? 0,
      clicks: m?.clicks ?? d.performance.clicks ?? 0,
    };
  };

  const monthDate = new Date(`${month}-01T00:00:00`);

  const published = useMemo(() => deliverables.filter(d =>
    d.clientId === clientId && d.publishingStatus === 'published' && (d.publishedAt || d.publishAt)
    && isSameMonth(parseISO(d.publishedAt || d.publishAt!), monthDate)
  ).sort((a, b) => engagement(metricsFor(b)) - engagement(metricsFor(a))),
  [deliverables, clientId, month, metricByDeliverable]);

  const platformBreakdown = published.reduce((acc, d) => {
    acc[d.platform] = (acc[d.platform] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const totalEngagement = published.reduce((sum, d) => sum + engagement(metricsFor(d)), 0);
  const totalViews = published.reduce((sum, d) => sum + metricsFor(d).views, 0);
  const top = published[0];

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm print:bg-white print:p-0" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #client-report-printable, #client-report-printable * { visibility: visible; }
          #client-report-printable { position: absolute; top: 0; left: 0; width: 100%; box-shadow: none !important; border: none !important; }
          .no-print { display: none !important; }
        }
      `}</style>
      <div className="w-full max-w-2xl rounded-xl border border-border bg-card shadow-xl max-h-[90vh] overflow-y-auto print:max-h-none print:overflow-visible print:rounded-none">
        <div className="no-print flex items-center justify-between p-5 border-b border-border">
          <h2 className="font-serif text-xl">Client report</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>

        <div className="no-print flex flex-wrap items-end gap-3 p-5 border-b border-border bg-secondary/20">
          <label className="text-xs text-muted-foreground">
            Client
            <select value={clientId} onChange={e => setClientId(e.target.value)} className="mt-1 block bg-secondary border border-border rounded-md p-2 text-sm min-w-[180px]">
              {activeClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            Month
            <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="mt-1 block bg-secondary border border-border rounded-md p-2 text-sm" />
          </label>
          <button onClick={() => window.print()} className="ml-auto flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:brightness-110">
            <Printer className="h-4 w-4" /> Print / Save as PDF
          </button>
        </div>

        <div id="client-report-printable" className="p-8">
          <div className="flex items-center gap-2 mb-1">
            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: client?.color }} />
            <h1 className="font-serif text-2xl">{client?.name ?? 'Client'}</h1>
          </div>
          <p className="text-sm text-muted-foreground mb-6">{format(monthDate, 'MMMM yyyy')} — performance summary</p>

          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="rounded-lg border border-border p-4">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Published</p>
              <p className="text-3xl font-serif mt-1">{published.length}</p>
            </div>
            <div className="rounded-lg border border-border p-4">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total views</p>
              <p className="text-3xl font-serif mt-1">{totalViews.toLocaleString()}</p>
            </div>
            <div className="rounded-lg border border-border p-4">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total engagement</p>
              <p className="text-3xl font-serif mt-1">{totalEngagement.toLocaleString()}</p>
            </div>
          </div>

          {Object.keys(platformBreakdown).length > 0 && (
            <div className="mb-8">
              <h3 className="font-serif text-lg mb-3">Platform mix</h3>
              <div className="space-y-2">
                {Object.entries(platformBreakdown).sort((a, b) => b[1] - a[1]).map(([platform, count]) => (
                  <div key={platform} className="flex items-center gap-3 text-sm">
                    <span className="w-24 shrink-0">{platform}</span>
                    <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${Math.round((count / published.length) * 100)}%` }} />
                    </div>
                    <span className="w-10 text-right text-muted-foreground">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {top && (
            <div className="mb-8 rounded-lg border-l-2 border-primary bg-secondary/30 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Top performer</p>
              <p className="font-medium">{top.title}</p>
              <p className="text-sm text-muted-foreground mt-1">{engagement(metricsFor(top)).toLocaleString()} total engagement · {metricsFor(top).views.toLocaleString()} views</p>
            </div>
          )}

          <h3 className="font-serif text-lg mb-3">All published work this month</h3>
          <div className="divide-y divide-border">
            {published.map(d => {
              const v = metricsFor(d);
              return (
                <div key={d.id} className="py-3 flex items-center justify-between gap-4 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{d.title}</p>
                    <p className="text-xs text-muted-foreground">{d.platform} · {d.format} · {d.publishedAt || d.publishAt ? format(parseISO(d.publishedAt || d.publishAt!), 'MMM d') : ''}</p>
                  </div>
                  <p className="shrink-0 text-muted-foreground">{v.views.toLocaleString()} views · {engagement(v).toLocaleString()} engaged</p>
                </div>
              );
            })}
            {published.length === 0 && <p className="py-6 text-sm text-muted-foreground">Nothing published for {client?.name ?? 'this client'} in {format(monthDate, 'MMMM yyyy')}.</p>}
          </div>

          <p className="mt-8 text-xs text-muted-foreground">Generated from Content Desk · {format(new Date(), 'MMM d, yyyy')}</p>
        </div>
      </div>
    </div>
  );
}
