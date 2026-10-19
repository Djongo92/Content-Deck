import { useEffect, useState } from 'react';
import { X, Loader2, ThumbsUp, Pencil, ThumbsDown } from 'lucide-react';
import { api } from '@/lib/api';

type VoiceExample = { id: string; clientId: string; kind: string; original: string; final: string; createdAt: string };

export function VoiceConsistencyModal({ clientId, clientName, onClose }: { clientId: string; clientName: string; onClose: () => void }) {
  const [examples, setExamples] = useState<VoiceExample[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.getState()
      .then(state => {
        if (cancelled) return;
        setExamples(state.voiceExamples.filter(e => e.clientId === clientId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      })
      .catch(() => { if (!cancelled) setError('Could not load voice history.'); });
    return () => { cancelled = true; };
  }, [clientId]);

  const kept = examples?.filter(e => e.kind === 'kept') ?? [];
  const edited = examples?.filter(e => e.kind === 'edited') ?? [];
  const rejected = examples?.filter(e => e.kind === 'rejected') ?? [];
  const total = (examples?.length ?? 0);
  const driftScore = total ? Math.round((kept.length / total) * 100) : null;

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div className="w-full max-w-2xl rounded-xl border border-border bg-card p-5 shadow-xl max-h-[85vh] overflow-y-auto" onMouseDown={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-serif text-xl">Voice consistency — {clientName}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>
        <p className="text-sm text-muted-foreground mb-4">Built from every AI draft you kept, edited, or rejected for this client — not a separate rating, just what already happened.</p>

        {examples === null && !error && <div className="flex items-center gap-2 text-sm text-muted-foreground py-6"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>}
        {error && <p className="text-sm text-destructive py-6">{error}</p>}

        {examples !== null && (
          <>
            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className="rounded-lg border border-border p-3 text-center">
                <ThumbsUp className="h-4 w-4 mx-auto text-emerald-600 mb-1" />
                <p className="text-2xl font-serif">{kept.length}</p>
                <p className="text-[11px] text-muted-foreground">Kept as-is</p>
              </div>
              <div className="rounded-lg border border-border p-3 text-center">
                <Pencil className="h-4 w-4 mx-auto text-amber-600 mb-1" />
                <p className="text-2xl font-serif">{edited.length}</p>
                <p className="text-[11px] text-muted-foreground">Edited</p>
              </div>
              <div className="rounded-lg border border-border p-3 text-center">
                <ThumbsDown className="h-4 w-4 mx-auto text-destructive mb-1" />
                <p className="text-2xl font-serif">{rejected.length}</p>
                <p className="text-[11px] text-muted-foreground">Rejected</p>
              </div>
            </div>

            {driftScore !== null && (
              <p className="text-sm mb-5">
                <b>{driftScore}%</b> of AI drafts for this client needed no changes at all.
                {driftScore < 40 && total >= 5 && <span className="text-muted-foreground"> That's a lot of rework — worth tightening the client's voice notes.</span>}
              </p>
            )}

            {edited.length > 0 && (
              <div className="mb-5">
                <h3 className="text-sm font-semibold mb-2">Recent corrections (learn the direction of these)</h3>
                <div className="space-y-3">
                  {edited.slice(0, 5).map(e => (
                    <div key={e.id} className="rounded-md border border-border p-3 text-xs">
                      <p className="text-muted-foreground mb-1">AI draft:</p>
                      <p className="mb-2">{e.original.slice(0, 220)}{e.original.length > 220 ? '…' : ''}</p>
                      <p className="text-muted-foreground mb-1">You corrected to:</p>
                      <p>{e.final.slice(0, 220)}{e.final.length > 220 ? '…' : ''}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {rejected.length > 0 && (
              <div className="mb-2">
                <h3 className="text-sm font-semibold mb-2">Rejected styles (don't produce these again)</h3>
                <div className="space-y-2">
                  {rejected.slice(0, 5).map(e => (
                    <p key={e.id} className="rounded-md border border-destructive/30 p-2 text-xs text-muted-foreground">{e.original.slice(0, 220)}{e.original.length > 220 ? '…' : ''}</p>
                  ))}
                </div>
              </div>
            )}

            {total === 0 && <p className="text-sm text-muted-foreground py-4">No voice history yet for this client — it builds up automatically as you use the AI writing tools and keep, edit, or reject drafts.</p>}
          </>
        )}
      </div>
    </div>
  );
}
