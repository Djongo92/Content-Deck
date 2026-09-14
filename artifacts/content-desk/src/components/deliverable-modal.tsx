import { useEffect, useRef, useState } from 'react';
import { useStore, useMutateStore } from '@/hooks/use-store';
import { X, Save, FileText, Calendar, Trash2, Wand2, ArrowRight, CheckCircle2, CopyPlus, Copy, ChevronDown, RotateCcw, Loader2 } from 'lucide-react';
import { ALL_PLATFORMS, Deliverable, resolvePlatforms, ReviewLink } from '@/lib/types';
import { format, parseISO } from 'date-fns';
import { api } from '@/lib/api';
import { toast } from 'sonner';

type WeekDraft = { day: string; title: string; platform: string; format: string; copy: string; checklist: string[] };

function wordDiff(before: string, after: string) {
  const a = before.match(/\S+\s*/g) || [];
  const b = after.match(/\S+\s*/g) || [];
  const table = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i][j] = a[i].trim() === b[j].trim() ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const parts: { value: string; kind: 'same' | 'added' | 'removed' }[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i].trim() === b[j].trim()) {
      parts.push({ value: b[j], kind: 'same' }); i++; j++;
    } else if (j < b.length && (i === a.length || table[i][j + 1] >= table[i + 1][j])) {
      parts.push({ value: b[j], kind: 'added' }); j++;
    } else {
      parts.push({ value: a[i], kind: 'removed' }); i++;
    }
  }
  return parts;
}

export function DeliverableModal({ deliverableId, initialDate, onClose }: { deliverableId: string, initialDate?: Date, onClose: () => void }) {
  const { deliverables, clients, versions } = useStore();
  const { addDeliverable, updateDeliverable, deleteDeliverable, markDeliverablePublished, unmarkDeliverablePublished, approveCurrentVersion, repurposeDeliverable, recordVoiceExample } = useMutateStore();
  
  const [draft, setDraft] = useState<Partial<Deliverable> | null>(null);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [lastAiResult, setLastAiResult] = useState('');
  const [appliedAiText, setAppliedAiText] = useState('');
  const [aiAction, setAiAction] = useState('rewrite');
  const [aiError, setAiError] = useState('');
  const [aiInstructions, setAiInstructions] = useState('');
  const [askFirst, setAskFirst] = useState(true);
  const [clarifyingQuestion, setClarifyingQuestion] = useState('');
  const [clarifyingAnswer, setClarifyingAnswer] = useState('');
  const [pendingInstructions, setPendingInstructions] = useState('');
  const [weekOpen, setWeekOpen] = useState(false);
  const [weekDays, setWeekDays] = useState(5);
  const [weekLinks, setWeekLinks] = useState('');
  const [weekDirection, setWeekDirection] = useState('');
  const [weekDrafts, setWeekDrafts] = useState<WeekDraft[]>([]);
  const [weekLoading, setWeekLoading] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewLinks, setReviewLinks] = useState<ReviewLink[]>([]);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [versionA, setVersionA] = useState('');
  const [versionB, setVersionB] = useState('');
  const [showDiff, setShowDiff] = useState(false);
  const resultSequence = useRef(0);
  const currentResultId = useRef(0);
  const rejectedResults = useRef(new Set<number>());
  const [repurposePlatform, setRepurposePlatform] = useState('LinkedIn');
  const [approver, setApprover] = useState('Client');
  
  useEffect(() => {
    if (deliverableId === 'new') {
      const publishAt = initialDate ? new Date(initialDate) : null;
      if (publishAt) publishAt.setHours(9, 0, 0, 0);
      const firstClient = clients.find(c => !c.archived) || clients[0];
      setDraft({
        clientId: firstClient?.id || '',
        platform: resolvePlatforms(firstClient)[0] || 'Instagram',
        format: 'Post',
        title: '',
        copy: '',
        productionStatus: 'idea',
        publishingStatus: publishAt ? 'scheduled' : 'not-scheduled',
        publishAt: publishAt?.toISOString() || null,
      });
    } else {
      const existing = deliverables.find(d => d.id === deliverableId);
      if (existing) setDraft({ ...existing });
    }
  }, [deliverableId, deliverables, clients, initialDate]);

  if (!draft) return null;

  const rejectUnappliedResult = () => {
    if (lastAiResult && appliedAiText !== lastAiResult && !rejectedResults.current.has(currentResultId.current)) {
      rejectedResults.current.add(currentResultId.current);
      void recordVoiceExample(draft.clientId || '', 'rejected', lastAiResult, '');
    }
  };

  const handleClose = () => {
    rejectUnappliedResult();
    onClose();
  };

  const handleSave = () => {
    if (!draft.title?.trim()) return;
    if (appliedAiText && draft.copy !== appliedAiText) {
      void recordVoiceExample(draft.clientId || '', 'edited', appliedAiText, draft.copy || '');
    }
    rejectUnappliedResult();
    
    if (deliverableId === 'new') {
      addDeliverable(draft);
    } else {
      updateDeliverable(deliverableId, draft);
    }
    onClose();
  };

  const activeClient = clients.find(c => c.id === draft.clientId);

  const runAiAction = async (instructions: string) => {
    if (!draft.copy) return;
    setAiLoading(true);
    rejectUnappliedResult();
    setLastAiResult('');
    setAppliedAiText('');
    setAiError('');
    try {
      const data = await api.ai({
        action: aiAction,
        text: draft.copy,
        platform: draft.platform || '',
        clientContext: activeClient?.voice || '',
        instructions,
        clientId: draft.clientId || '',
      });
      currentResultId.current = ++resultSequence.current;
      setLastAiResult(data.result);
    } catch {
      setAiError('The writing assistant is unavailable. Your draft is safe.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleAiAction = async () => {
    if (!draft.copy) return;
    setClarifyingQuestion('');
    if (askFirst) {
      setAiLoading(true);
      try {
        const { question } = await api.clarify({
          text: draft.copy,
          clientContext: activeClient?.voice,
          platform: draft.platform,
          instructions: aiInstructions,
        });
        if (question) {
          setClarifyingQuestion(question);
          setClarifyingAnswer('');
          setPendingInstructions(aiInstructions);
          return;
        }
      } catch { /* Clarification is optional. */ }
      finally { setAiLoading(false); }
    }
    await runAiAction(aiInstructions);
  };

  const loadReviewLinks = async () => {
    setReviewLoading(true);
    try {
      setReviewLinks((await api.listReviewLinks(deliverableId)).links);
    } catch {
      toast.error('Could not load review links');
    } finally {
      setReviewLoading(false);
    }
  };

  const deliverableVersions = versions
    .filter(v => v.deliverableId === deliverableId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const comparedA = deliverableVersions.find(v => v.id === versionA);
  const comparedB = deliverableVersions.find(v => v.id === versionB);

  const createWeekDrafts = async () => {
    if (!activeClient) return;
    setWeekLoading(true);
    try {
      const result = await api.draftWeek({
        clientId: draft.clientId,
        clientName: activeClient.name,
        voice: activeClient.voice,
        pillars: activeClient.pillars,
        platforms: [draft.platform || 'Other'],
        days: weekDays,
        links: weekLinks,
        instructions: weekDirection,
      });
      setWeekDrafts(result.drafts);
    } catch {
      toast.error('Could not draft the week');
    } finally {
      setWeekLoading(false);
    }
  };

  const createWeekItem = (item: WeekDraft) => {
    addDeliverable({
      clientId: draft.clientId,
      title: item.title,
      platform: item.platform,
      format: item.format,
      copy: item.copy,
      assetChecklist: item.checklist,
      productionStatus: 'idea',
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-4 bg-background/80 backdrop-blur-sm">
      <div className="relative bg-card border-0 md:border border-border rounded-none md:rounded-xl shadow-xl w-full max-w-4xl h-[100dvh] md:h-auto md:max-h-[90vh] flex flex-col md:flex-row overflow-hidden animate-in fade-in zoom-in-95 duration-200">

        {/* Main Editor */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-border h-full min-h-0 md:max-h-[90vh]">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border bg-secondary/10">
            <div className="flex items-center gap-3">
              <div 
                className="w-3 h-3 rounded-full" 
                style={{ backgroundColor: activeClient?.color || '#888' }} 
              />
              <h2 className="font-serif text-lg">
                {deliverableId === 'new' ? 'New Deliverable' : 'Edit Deliverable'}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              {deliverableId !== 'new' && (
                <button 
                  onClick={() => {
                    if (confirm('Delete this deliverable?')) {
                      deleteDeliverable(deliverableId);
                       handleClose();
                    }
                  }}
                  className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              {!aiPanelOpen && (
                 <button onClick={handleClose} className="p-2 text-muted-foreground hover:text-foreground rounded-md transition-colors md:hidden">
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hidden">
            <input
              type="text"
              placeholder="Deliverable Title..."
              value={draft.title || ''}
              onChange={(e) => setDraft(p => ({ ...p!, title: e.target.value }))}
              className="w-full text-2xl font-serif bg-transparent border-none focus:outline-none focus:ring-0 p-0 text-foreground placeholder:text-muted-foreground"
            />

            <div className="flex flex-wrap gap-4">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Client</label>
                <select
                  value={draft.clientId || ''}
                  onChange={e => {
                    const clientId = e.target.value;
                    const client = clients.find(c => c.id === clientId);
                    const enabled = resolvePlatforms(client);
                    setDraft(p => ({
                      ...p!,
                      clientId,
                      platform: p!.platform && enabled.includes(p!.platform) ? p!.platform : enabled[0],
                    }));
                  }}
                  className="block w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {clients.filter(c => !c.archived).map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Platform</label>
                <select
                  value={draft.platform || ''}
                  onChange={e => setDraft(p => ({ ...p!, platform: e.target.value }))}
                  className="block w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {(() => {
                    const enabled = resolvePlatforms(activeClient);
                    const options = draft.platform && !enabled.includes(draft.platform)
                      ? [...enabled, draft.platform]
                      : enabled;
                    return options.map(platform => (
                      <option key={platform} value={platform}>
                        {enabled.includes(platform) ? platform : `${platform} (disabled for this client)`}
                      </option>
                    ));
                  })()}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> Publish At
                </label>
                <input
                  type="datetime-local"
                  value={draft.publishAt ? format(parseISO(draft.publishAt), "yyyy-MM-dd'T'HH:mm") : ''}
                  onChange={e => {
                    const val = e.target.value ? new Date(e.target.value).toISOString() : null;
                    setDraft(p => ({ ...p!, publishAt: val, publishingStatus: val ? 'scheduled' : 'not-scheduled' }));
                  }}
                  className="block w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary [color-scheme:dark]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="text-xs text-muted-foreground">Format
                <input value={draft.format || ''} onChange={e => setDraft(p => ({ ...p!, format: e.target.value }))} className="mt-1 w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm text-foreground" />
              </label>
              <label className="text-xs text-muted-foreground">Estimated hours
                <input type="number" min="0" step=".25" value={draft.estimatedHours || 0} onChange={e => setDraft(p => ({ ...p!, estimatedHours: Number(e.target.value) }))} className="mt-1 w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm text-foreground" />
              </label>
              <label className="text-xs text-muted-foreground">Actual hours
                <input type="number" min="0" step=".25" value={draft.actualHours || 0} onChange={e => setDraft(p => ({ ...p!, actualHours: Number(e.target.value) }))} className="mt-1 w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm text-foreground" />
              </label>
            </div>

            <div className="space-y-2 flex-1 flex flex-col">
              <div className="flex justify-between items-end">
                <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide flex items-center gap-1">
                  <FileText className="w-3 h-3" /> Copy & Content
                </label>
                <button 
                  onClick={() => setAiPanelOpen(!aiPanelOpen)}
                  className={`text-xs flex items-center gap-1 px-2 py-1 rounded transition-colors ${aiPanelOpen ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}
                >
                  <Wand2 className="w-3 h-3" /> AI Assist
                </button>
              </div>
              <textarea
                value={draft.copy || ''}
                onChange={e => setDraft(p => ({ ...p!, copy: e.target.value }))}
                placeholder="Write your caption, post, or article content here..."
                className="block w-full flex-1 bg-secondary border border-border rounded-md px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary min-h-[160px] resize-none"
              />
              <div className="flex justify-end">
                <span className="text-xs text-muted-foreground">
                  {draft.copy?.length || 0} characters
                </span>
              </div>
            </div>

            {deliverableId !== 'new' && (
              <div className="border border-border rounded-xl">
                <button
                  onClick={() => {
                    const next = !reviewOpen;
                    setReviewOpen(next);
                    if (next) void loadReviewLinks();
                  }}
                  className="w-full p-4 flex items-center justify-between text-left"
                >
                  <span className="font-serif">Review, approval & versions</span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${reviewOpen ? 'rotate-180' : ''}`} />
                </button>
                {reviewOpen && (
                  <div className="p-4 pt-0 space-y-5 border-t border-border">
                    <div className="pt-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs uppercase tracking-wide text-muted-foreground">Client review links</h4>
                        <button
                          onClick={async () => {
                            try {
                              await api.createReviewLink(deliverableId);
                              toast.success('Review link created');
                              await loadReviewLinks();
                            } catch { toast.error('Could not create review link'); }
                          }}
                          className="text-xs px-3 py-1.5 border border-primary text-primary rounded-md"
                        >
                          Create review link
                        </button>
                      </div>
                      <p className="text-xs text-muted-foreground">Freezes this exact version. Link expires in 14 days. No account needed.</p>
                      {reviewLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                      {!reviewLoading && reviewLinks.length === 0 && <p className="text-sm text-muted-foreground">No review links yet.</p>}
                      {reviewLinks.map(link => {
                        const statusClass = link.status === 'approved' ? 'bg-emerald-500/15 text-emerald-400' : link.status === 'changes-requested' ? 'bg-rose-500/15 text-rose-400' : link.status === 'pending' ? 'bg-amber-500/15 text-amber-400' : 'bg-secondary text-muted-foreground';
                        return (
                          <div key={link.token} className="bg-secondary/40 border border-border rounded-md p-3 text-sm space-y-1">
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] uppercase px-2 py-0.5 rounded ${statusClass}`}>{link.status}</span>
                              <span className="text-muted-foreground">{link.approverName || 'Awaiting reviewer'}</span>
                              {link.status === 'pending' && (
                                <button
                                  className="ml-auto p-1 text-muted-foreground hover:text-primary"
                                  title="Copy review link"
                                  onClick={async () => {
                                    await navigator.clipboard.writeText(window.location.origin + link.path);
                                    toast.success('Link copied');
                                  }}
                                ><Copy className="w-3.5 h-3.5" /></button>
                              )}
                            </div>
                            {link.comment && <p className="italic">“{link.comment}”</p>}
                            <p className="text-xs text-muted-foreground">{format(parseISO(link.createdAt), 'MMM d, yyyy')}</p>
                          </div>
                        );
                      })}
                    </div>
                    <div className="space-y-3">
                      <h4 className="text-xs uppercase tracking-wide text-muted-foreground">Version history</h4>
                      <div className="grid grid-cols-2 gap-2">
                        <select value={versionA} onChange={e => { setVersionA(e.target.value); setShowDiff(false); }} className="bg-secondary border border-border rounded-md p-2 text-xs">
                          <option value="">Earlier version</option>
                          {deliverableVersions.map(v => <option key={v.id} value={v.id}>{v.id.slice(0, 8)} · {format(parseISO(v.createdAt), 'MMM d')}</option>)}
                        </select>
                        <select value={versionB} onChange={e => { setVersionB(e.target.value); setShowDiff(false); }} className="bg-secondary border border-border rounded-md p-2 text-xs">
                          <option value="">Later version</option>
                          {deliverableVersions.map(v => <option key={v.id} value={v.id}>{v.id.slice(0, 8)} · {format(parseISO(v.createdAt), 'MMM d')}</option>)}
                        </select>
                      </div>
                      <button disabled={!comparedA || !comparedB} onClick={() => setShowDiff(true)} className="px-3 py-1.5 text-xs border border-border rounded-md disabled:opacity-50">Compare</button>
                      {showDiff && comparedA && comparedB && (
                        <div className="p-3 bg-background border border-border rounded-md text-sm whitespace-pre-wrap">
                          {wordDiff(comparedA.copy, comparedB.copy).map((part, index) => (
                            <span key={index} className={part.kind === 'added' ? 'bg-emerald-500/20 text-emerald-300' : part.kind === 'removed' ? 'bg-rose-500/20 text-rose-300 line-through opacity-80' : ''}>{part.value}</span>
                          ))}
                        </div>
                      )}
                      <div className="space-y-2">
                        {deliverableVersions.map(version => (
                          <div key={version.id} className="flex items-center gap-2 border border-border rounded-md p-2 text-xs">
                            <span className="font-mono">{version.id.slice(0, 8)}</span>
                            <span className="text-muted-foreground">{format(parseISO(version.createdAt), 'MMM d, yyyy h:mm a')}</span>
                            <span className={`ml-auto px-2 py-0.5 rounded ${version.approvalState === 'approved' ? 'bg-emerald-500/15 text-emerald-400' : version.approvalState === 'rejected' ? 'bg-rose-500/15 text-rose-400' : 'bg-amber-500/15 text-amber-400'}`}>{version.approvalState}</span>
                            {version.approver && <span>{version.approver}</span>}
                            <button onClick={() => setDraft(p => ({ ...p!, copy: version.copy }))} title="Restore this version" className="p-1 hover:text-primary flex items-center gap-1"><RotateCcw className="w-3.5 h-3.5" /><span>Restore this version</span></button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-border bg-secondary/30 flex flex-wrap justify-end gap-3 mt-auto">
            {deliverableId !== 'new' && (
              <>
                <button onClick={() => {
                  const newId = repurposeDeliverable(deliverableId, repurposePlatform);
                   if (newId) handleClose();
                }} className="mr-auto flex items-center gap-2 px-3 py-2 text-sm border border-border rounded-md hover:border-primary">
                  <CopyPlus className="w-4 h-4" /> Repurpose to {repurposePlatform}
                </button>
                <select value={repurposePlatform} onChange={e => setRepurposePlatform(e.target.value)} className="bg-secondary border border-border rounded-md px-2 text-xs">
                  {['Instagram','Facebook','TikTok','LinkedIn','YouTube','Newsletter','Web'].filter(p => p !== draft.platform).map(p => <option key={p}>{p}</option>)}
                </select>
                {draft.currentVersionId !== draft.approvedVersionId && (
                  <button onClick={() => { approveCurrentVersion(deliverableId, approver); handleClose(); }} className="flex items-center gap-2 px-3 py-2 text-sm border border-primary text-primary rounded-md">
                    <CheckCircle2 className="w-4 h-4" /> Approve version
                  </button>
                )}
                 {draft.publishingStatus === 'published' ? (
                   <button
                     onClick={() => { unmarkDeliverablePublished(deliverableId); handleClose(); }}
                     className="flex items-center gap-2 rounded-md border border-emerald-500/50 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400"
                     title={draft.publishedAt ? `Published ${format(parseISO(draft.publishedAt), 'MMM d, yyyy h:mm a')}` : 'Published'}
                   >
                     <CheckCircle2 className="h-4 w-4" /> Published
                   </button>
                 ) : (
                   <button
                     onClick={() => { markDeliverablePublished(deliverableId); handleClose(); }}
                     className="flex items-center gap-2 rounded-md border border-primary bg-primary/10 px-3 py-2 text-sm text-primary hover:bg-primary/20"
                   >
                     <CheckCircle2 className="h-4 w-4" /> Mark as published
                   </button>
                 )}
              </>
            )}
            <button 
               onClick={handleClose}
              className="px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary rounded-md transition-colors"
            >
              Cancel
            </button>
            <button 
              onClick={handleSave}
              disabled={!draft.title?.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="w-4 h-4" /> Save
            </button>
          </div>
        </div>

        {/* AI Panel */}
        {aiPanelOpen && (
          <div className="absolute inset-0 z-20 md:static md:z-auto w-full md:w-80 bg-secondary md:bg-secondary/50 flex flex-col overflow-hidden animate-in slide-in-from-right-4 duration-200">
            <div className="flex items-center justify-between p-4 border-b border-border bg-card">
              <h3 className="font-serif text-md flex items-center gap-2">
                <Wand2 className="w-4 h-4 text-primary" /> AI Workspace
              </h3>
               <button onClick={() => { rejectUnappliedResult(); setLastAiResult(''); setAiPanelOpen(false); }} className="p-1 text-muted-foreground hover:text-foreground rounded-md">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-4 overflow-y-auto flex-1 scrollbar-hidden">
              <label className="flex items-center justify-between text-sm">
                <span>Ask me first</span>
                <input type="checkbox" checked={askFirst} onChange={e => setAskFirst(e.target.checked)} className="accent-primary" />
              </label>
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Action</label>
                <select 
                  value={aiAction} 
                  onChange={e => setAiAction(e.target.value)}
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="rewrite">Rewrite & Polish</option>
                  <option value="shorten">Make it Shorter</option>
                  <option value="expand">Expand & Detail</option>
                  <option value="tone">Adjust Tone for Client</option>
                  <option value="adapt">Adapt for Platform</option>
                  <option value="hooks">Generate Hooks</option>
                  <option value="ctas">Generate CTAs</option>
                  <option value="proofread">Proofread</option>
                  <option value="repurpose">Repurpose Structure</option>
                </select>
              </div>
              <textarea value={aiInstructions} onChange={e => setAiInstructions(e.target.value)} placeholder="Optional direction, tone, facts to preserve…" className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm min-h-[72px]" />

              {clarifyingQuestion && (
                <div className="space-y-2 border border-primary/40 bg-background rounded-md p-3">
                  <p className="text-sm">{clarifyingQuestion}</p>
                  <input value={clarifyingAnswer} onChange={e => setClarifyingAnswer(e.target.value)} placeholder="Your answer" className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm" />
                  <button
                    onClick={() => {
                      const next = `${pendingInstructions}${pendingInstructions ? '\n' : ''}Answer: ${clarifyingAnswer}`;
                      setClarifyingQuestion('');
                      void runAiAction(next);
                    }}
                    className="text-xs bg-primary text-primary-foreground rounded-md px-3 py-1.5"
                  >Continue</button>
                </div>
              )}

              <button
                onClick={handleAiAction}
                disabled={aiLoading || !draft.copy?.trim()}
                className="w-full bg-background border border-primary text-primary px-4 py-2 rounded-md font-medium text-sm hover:bg-primary hover:text-primary-foreground transition-all disabled:opacity-50 flex justify-center items-center gap-2"
              >
                {aiLoading ? 'Generating...' : `Run ${aiAction}`}
                {!aiLoading && <ArrowRight className="w-4 h-4" />}
              </button>

               {lastAiResult && (
                <div className="space-y-2 mt-4 pt-4 border-t border-border">
                  <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Result</label>
                  <div className="bg-background border border-border rounded-md p-3 text-sm min-h-[100px] whitespace-pre-wrap">
                     {lastAiResult}
                  </div>
                  <button 
                    onClick={() => {
                       setDraft(p => ({ ...p!, copy: lastAiResult }));
                       if (appliedAiText !== lastAiResult) {
                         void recordVoiceExample(draft.clientId || '', 'kept', lastAiResult, lastAiResult);
                       }
                       setAppliedAiText(lastAiResult);
                    }}
                    className="w-full bg-secondary border border-border text-foreground px-4 py-2 rounded-md font-medium text-sm hover:bg-secondary/80 transition-all"
                  >
                    Apply to Copy
                  </button>
                </div>
              )}
              {aiError && <p className="text-xs text-destructive border border-destructive/30 bg-destructive/10 rounded-md p-3">{aiError}</p>}

              <div className="pt-4 border-t border-border space-y-3">
                <button onClick={() => setWeekOpen(!weekOpen)} className="w-full border border-border rounded-md px-3 py-2 text-sm">Draft the week</button>
                {weekOpen && (
                  <div className="space-y-2">
                    <label className="block text-xs text-muted-foreground">Days
                      <input type="number" min="1" max="7" value={weekDays} onChange={e => setWeekDays(Math.max(1, Math.min(7, Number(e.target.value))))} className="mt-1 w-full bg-background border border-border rounded-md p-2 text-sm" />
                    </label>
                    <textarea value={weekLinks} onChange={e => setWeekLinks(e.target.value)} placeholder="Links and sources" className="w-full bg-background border border-border rounded-md p-2 text-sm min-h-[60px]" />
                    <textarea value={weekDirection} onChange={e => setWeekDirection(e.target.value)} placeholder="Direction" className="w-full bg-background border border-border rounded-md p-2 text-sm min-h-[60px]" />
                    <button disabled={weekLoading || !activeClient} onClick={createWeekDrafts} className="w-full bg-primary text-primary-foreground rounded-md p-2 text-sm disabled:opacity-50">{weekLoading ? 'Drafting…' : 'Generate week'}</button>
                    {weekDrafts.length > 0 && (
                      <>
                        <button onClick={() => { weekDrafts.forEach(createWeekItem); toast.success(`Created ${weekDrafts.length} deliverables`); setWeekDrafts([]); }} className="w-full border border-primary text-primary rounded-md p-2 text-sm">Create all</button>
                        {weekDrafts.map((item, index) => (
                          <div key={`${item.day}-${index}`} className="bg-background border border-border rounded-md p-3 space-y-1">
                            <p className="text-xs text-muted-foreground">{item.day} · {item.platform}</p>
                            <p className="text-sm font-medium">{item.title}</p>
                            <p className="text-xs text-muted-foreground">{item.copy.slice(0, 140)}{item.copy.length > 140 ? '…' : ''}</p>
                            <button onClick={() => { createWeekItem(item); setWeekDrafts(items => items.filter((_, i) => i !== index)); toast.success('Deliverable created'); }} className="text-xs text-primary">Create</button>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
