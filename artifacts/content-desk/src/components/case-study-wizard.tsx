import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Plus, Printer, Sparkles, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useMutateStore, useStore } from '@/hooks/use-store';
import { api } from '@/lib/api';
import type { CaseStudy, Deliverable, PerformanceMetrics, PortfolioHighlight, PortfolioSection } from '@/lib/types';

type ReportMetrics = Required<PerformanceMetrics>;
const engagement = (m: ReportMetrics) => m.likes + m.comments + m.shares;

export function CaseStudyWizard({ existing, onClose }: { existing?: CaseStudy; onClose: () => void }) {
  const { clients, deliverables, metrics } = useStore();
  const { addCaseStudy, updateCaseStudy } = useMutateStore();
  const activeClients = clients.filter(c => !c.archived);

  const [step, setStep] = useState<1 | 2 | 3>(existing ? 3 : 1);
  const [clientId, setClientId] = useState(existing?.clientId ?? '');
  const [subject, setSubject] = useState(existing?.subject ?? '');
  const [dateRange, setDateRange] = useState(existing?.dateRange ?? '');
  const [selected, setSelected] = useState<Set<string>>(new Set(existing?.deliverableIds ?? []));
  const [title, setTitle] = useState(existing?.title ?? '');
  const [notes, setNotes] = useState('');
  const [narrative, setNarrative] = useState(existing?.narrative ?? '');
  const [highlights, setHighlights] = useState<PortfolioHighlight[]>(existing?.highlights ?? []);
  const [sections, setSections] = useState<PortfolioSection[]>(existing?.sections ?? []);
  const [drafting, setDrafting] = useState(false);

  const client = clients.find(c => c.id === clientId);

  const metricByDeliverable = useMemo(() => {
    const latest = new Map<string, typeof metrics[number]>();
    metrics.forEach(m => {
      const e = latest.get(m.deliverableId);
      if (!e || m.capturedAt > e.capturedAt) latest.set(m.deliverableId, m);
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

  const ranked = useMemo(() => clientId ? deliverables
    .filter(d => d.clientId === clientId && d.publishingStatus === 'published')
    .sort((a, b) => engagement(metricsFor(b)) - engagement(metricsFor(a))) : [],
  [deliverables, clientId, metricByDeliverable]);

  function handlePickClient(id: string) {
    setClientId(id);
    const picked = clients.find(c => c.id === id);
    if (picked && !subject.trim()) setSubject(picked.name);
    const top = id ? deliverables
      .filter(d => d.clientId === id && d.publishingStatus === 'published')
      .sort((a, b) => engagement(metricsFor(b)) - engagement(metricsFor(a)))
      .slice(0, 3)
      .map(d => d.id) : [];
    setSelected(new Set(top));
  }

  function toggleSelected(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const selectedPieces = ranked.filter(d => selected.has(d.id));

  function addHighlight() { setHighlights(h => [...h, { label: '', value: '' }]); }
  function updateHighlight(i: number, patch: Partial<PortfolioHighlight>) { setHighlights(h => h.map((x, idx) => idx === i ? { ...x, ...patch } : x)); }
  function removeHighlight(i: number) { setHighlights(h => h.filter((_, idx) => idx !== i)); }

  function addSection() { setSections(s => [...s, { heading: '', body: '' }]); }
  function updateSection(i: number, patch: Partial<PortfolioSection>) { setSections(s => s.map((x, idx) => idx === i ? { ...x, ...patch } : x)); }
  function removeSection(i: number) { setSections(s => s.filter((_, idx) => idx !== i)); }

  async function draftWithAI() {
    if (!subject.trim()) return;
    setDrafting(true);
    try {
      const { narrative: draft } = await api.caseStudyDraft({
        subject: subject.trim(),
        clientName: client?.name,
        voice: client?.voice,
        notes,
        pieces: selectedPieces.map(d => ({ title: d.title, platform: d.platform, copy: d.copy, ...metricsFor(d) })),
      });
      setNarrative(draft);
      if (!title.trim()) setTitle(`${subject.trim()} case study`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not draft a narrative.');
    } finally {
      setDrafting(false);
    }
  }

  function handleSave() {
    const ids = [...selected];
    const payload = {
      clientId: clientId || null,
      subject: subject.trim(),
      dateRange: dateRange.trim(),
      title: title.trim() || `${subject.trim() || 'Untitled'} case study`,
      narrative,
      sections,
      highlights,
      deliverableIds: ids,
    };
    if (existing) {
      updateCaseStudy(existing.id, payload);
      toast.success('Case study updated');
    } else {
      addCaseStudy(payload);
      toast.success('Case study saved');
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm print:bg-white print:p-0" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #case-study-printable, #case-study-printable * { visibility: visible; }
          #case-study-printable { position: absolute; top: 0; left: 0; width: 100%; box-shadow: none !important; border: none !important; }
          .no-print { display: none !important; }
        }
      `}</style>
      <div className="w-full max-w-2xl rounded-xl border border-border bg-card shadow-xl max-h-[90vh] overflow-y-auto print:max-h-none print:overflow-visible print:rounded-none" onMouseDown={e => e.stopPropagation()}>
        <div className="no-print flex items-center justify-between p-5 border-b border-border">
          <div>
            <h2 className="font-serif text-xl">Case study {existing ? '— edit' : 'builder'}</h2>
            {step < 3 && <p className="text-xs text-muted-foreground mt-0.5">Step {step} of 3</p>}
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>

        {step === 1 && (
          <div className="p-5 space-y-4">
            <label className="text-xs text-muted-foreground block">
              Subject <span className="text-destructive">*</span>
              <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g. Belgrade Philharmonic, Totema Agency, Radio Belgrade 2…" className="mt-1 block w-full bg-secondary border border-border rounded-md p-2 text-sm" />
            </label>
            <label className="text-xs text-muted-foreground block">
              Date range
              <input value={dateRange} onChange={e => setDateRange(e.target.value)} placeholder="e.g. 2023–2026" className="mt-1 block w-full bg-secondary border border-border rounded-md p-2 text-sm" />
            </label>
            <label className="text-xs text-muted-foreground block">
              Link to a Content Desk client (optional)
              <select value={clientId} onChange={e => handlePickClient(e.target.value)} className="mt-1 block w-full bg-secondary border border-border rounded-md p-2 text-sm">
                <option value="">Not a Content Desk client</option>
                {activeClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            {clientId && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">Published work, ranked by engagement — optional supporting evidence:</p>
                <div className="space-y-1 max-h-[240px] overflow-y-auto">
                  {ranked.map(d => (
                    <label key={d.id} className="flex items-center gap-2 text-sm py-1.5 px-1 rounded hover:bg-secondary/40 cursor-pointer">
                      <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggleSelected(d.id)} className="accent-primary w-3.5 h-3.5" />
                      <span className="flex-1 min-w-0 truncate">{d.title}</span>
                      <span className="text-xs text-muted-foreground shrink-0">{d.platform} · {engagement(metricsFor(d)).toLocaleString()} engaged</span>
                    </label>
                  ))}
                  {ranked.length === 0 && <p className="text-sm text-muted-foreground py-2">No published work for this client yet.</p>}
                </div>
              </div>
            )}
            <div className="flex justify-end mt-5">
              <button onClick={() => setStep(2)} disabled={!subject.trim()} className="flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50">
                Next <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="p-5 space-y-5">
            <label className="text-xs text-muted-foreground block">
              Title
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder={`${subject || 'Subject'} case study`} className="mt-1 block w-full bg-secondary border border-border rounded-md p-2 text-sm" />
            </label>

            <label className="text-xs text-muted-foreground block">
              Rough notes
              <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Describe the work freeform — approach, what happened, results. Drop in anything from a deck or brief; the AI draft below will ground itself in this." className="mt-1 w-full bg-secondary border border-border rounded-md p-2 text-sm min-h-[90px]" />
            </label>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-muted-foreground">Narrative</label>
                <button onClick={draftWithAI} disabled={drafting || (!notes.trim() && !selectedPieces.length)} className="flex items-center gap-1.5 text-xs font-medium bg-primary text-primary-foreground px-3 py-1.5 rounded-md disabled:opacity-50">
                  {drafting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} Draft with AI
                </button>
              </div>
              <textarea value={narrative} onChange={e => setNarrative(e.target.value)} placeholder="Context, approach, results…" className="w-full bg-secondary border border-border rounded-md p-3 text-sm min-h-[160px]" />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-muted-foreground">Highlights (stat callouts)</label>
                <button onClick={addHighlight} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"><Plus className="w-3.5 h-3.5" /> Add</button>
              </div>
              <div className="space-y-2">
                {highlights.map((h, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <input value={h.label} onChange={e => updateHighlight(i, { label: e.target.value })} placeholder="Instagram" className="flex-1 min-w-0 bg-secondary border border-border rounded-md p-2 text-sm" />
                    <input value={h.value} onChange={e => updateHighlight(i, { value: e.target.value })} placeholder="2.5x follower increase" className="flex-1 min-w-0 bg-secondary border border-border rounded-md p-2 text-sm" />
                    <button onClick={() => removeHighlight(i)} className="text-muted-foreground hover:text-destructive shrink-0"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
                {!highlights.length && <p className="text-xs text-muted-foreground">No stat highlights yet — e.g. "Top post" → "4+ Million Views".</p>}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-muted-foreground">Sections</label>
                <button onClick={addSection} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"><Plus className="w-3.5 h-3.5" /> Add</button>
              </div>
              <div className="space-y-3">
                {sections.map((sec, i) => (
                  <div key={i} className="border border-border rounded-md p-3 space-y-2">
                    <div className="flex gap-2 items-center">
                      <input value={sec.heading} onChange={e => updateSection(i, { heading: e.target.value })} placeholder="SOCIAL MEDIA MARKETING" className="flex-1 min-w-0 bg-secondary border border-border rounded-md p-2 text-xs font-semibold uppercase tracking-wide" />
                      <button onClick={() => removeSection(i)} className="text-muted-foreground hover:text-destructive shrink-0"><Trash2 className="w-4 h-4" /></button>
                    </div>
                    <textarea value={sec.body} onChange={e => updateSection(i, { body: e.target.value })} placeholder="What happened in this area of work…" className="w-full bg-secondary border border-border rounded-md p-2 text-sm min-h-[60px]" />
                  </div>
                ))}
                {!sections.length && <p className="text-xs text-muted-foreground">No sections yet — add one per area of work, e.g. "Website maintenance", "Focus campaigns".</p>}
              </div>
            </div>

            <div className="flex justify-between">
              <button onClick={() => setStep(1)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="w-4 h-4" /> Back</button>
              <button onClick={() => setStep(3)} disabled={!narrative.trim()} className="flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50">
                Review <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <>
            <div className="no-print flex items-center justify-between p-5 border-b border-border bg-secondary/20">
              {!existing && <button onClick={() => setStep(2)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="w-4 h-4" /> Back</button>}
              <div className="flex items-center gap-2 ml-auto">
                <button onClick={() => window.print()} className="flex items-center gap-2 border border-border bg-secondary px-3 py-2 rounded-md text-sm font-medium hover:border-primary">
                  <Printer className="h-4 w-4" /> Print / Save as PDF
                </button>
                <button onClick={handleSave} className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium">
                  {existing ? 'Update' : 'Save'} case study
                </button>
              </div>
            </div>
            <div id="case-study-printable" className="p-8">
              <p className="text-xs font-bold tracking-widest text-primary uppercase mb-2">Case study</p>
              <input value={title} onChange={e => setTitle(e.target.value)} className="font-serif text-2xl bg-transparent outline-none border-b border-transparent focus:border-primary w-full mb-1" />
              <p className="text-sm text-muted-foreground mb-6 flex items-center gap-2">
                {client && <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: client.color }} />}
                {subject || client?.name || 'Untitled subject'}{dateRange ? ` · ${dateRange}` : ''}
              </p>
              <textarea value={narrative} onChange={e => setNarrative(e.target.value)} className="w-full bg-transparent text-sm leading-relaxed outline-none resize-none min-h-[160px] mb-6" rows={8} />

              {highlights.length > 0 && (
                <>
                  <h3 className="font-serif text-base mb-3">Impact snapshot</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
                    {highlights.map((h, i) => (
                      <div key={i} className="rounded-lg border border-border bg-secondary/30 p-3">
                        <p className="text-xs text-muted-foreground">{h.label || '—'}</p>
                        <p className="font-serif text-base mt-0.5">{h.value || '—'}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {sections.length > 0 && (
                <div className="space-y-4 mb-6">
                  {sections.map((sec, i) => (
                    <div key={i}>
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">{sec.heading || 'Untitled section'}</h4>
                      <p className="text-sm leading-relaxed">{sec.body}</p>
                    </div>
                  ))}
                </div>
              )}

              {selectedPieces.length > 0 && (
                <>
                  <h3 className="font-serif text-base mb-2">Selected work</h3>
                  <div className="divide-y divide-border">
                    {selectedPieces.map(d => (
                      <div key={d.id} className="py-2 flex items-center justify-between gap-4 text-sm">
                        <span className="min-w-0 truncate">{d.title} <span className="text-muted-foreground">· {d.platform}</span></span>
                        <span className="shrink-0 text-muted-foreground">{engagement(metricsFor(d)).toLocaleString()} engaged</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
