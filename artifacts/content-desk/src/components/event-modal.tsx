import { useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { CalendarClock, Trash2, X } from 'lucide-react';
import { useMutateStore, useStore } from '@/hooks/use-store';
import { CalendarEvent } from '@/lib/types';

function toInputValue(value: string) {
  return format(parseISO(value), "yyyy-MM-dd'T'HH:mm");
}

export function EventModal({
  eventId,
  initialDate,
  onClose,
}: {
  eventId: string;
  initialDate?: Date;
  onClose: () => void;
}) {
  const { events, clients } = useStore();
  const { addEvent, updateEvent, deleteEvent } = useMutateStore();
  const [draft, setDraft] = useState<Partial<CalendarEvent> | null>(null);

  useEffect(() => {
    if (eventId === 'new') {
      const start = initialDate ? new Date(initialDate) : new Date();
      if (initialDate) start.setHours(9, 0, 0, 0);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      setDraft({
        title: '',
        description: '',
        eventType: 'other',
        clientId: null,
        location: '',
        startAt: start.toISOString(),
        endAt: end.toISOString(),
      });
      return;
    }
    const existing = events.find(event => event.id === eventId);
    if (existing) setDraft({ ...existing });
  }, [eventId, events, initialDate]);

  if (!draft?.startAt || !draft.endAt) return null;

  const save = () => {
    if (!draft.title?.trim()) return;
    if (eventId === 'new') addEvent(draft);
    else updateEvent(eventId, draft);
    onClose();
  };

  const updateStart = (value: string) => {
    if (!value) return;
    const nextStart = new Date(value);
    const duration = Math.max(15 * 60 * 1000, new Date(draft.endAt!).getTime() - new Date(draft.startAt!).getTime());
    setDraft(current => ({
      ...current!,
      startAt: nextStart.toISOString(),
      endAt: new Date(nextStart.getTime() + duration).toISOString(),
    }));
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-background/80 p-0 backdrop-blur-sm md:p-4">
      <div className="flex h-[100dvh] w-full max-w-xl flex-col overflow-hidden bg-card shadow-xl md:h-auto md:max-h-[90vh] md:rounded-xl md:border md:border-border">
        <header className="flex items-center justify-between border-b border-border p-4">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-primary" />
            <h2 className="font-serif text-lg">{eventId === 'new' ? 'New calendar event' : 'Edit calendar event'}</h2>
          </div>
          <div className="flex items-center gap-1">
            {eventId !== 'new' && (
              <button
                onClick={() => {
                  if (confirm('Delete this event?')) {
                    deleteEvent(eventId);
                    onClose();
                  }
                }}
                className="rounded-md p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                aria-label="Delete event"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            <button onClick={onClose} className="rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          <label className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Event title
            <input
              autoFocus
              value={draft.title || ''}
              onChange={event => setDraft(current => ({ ...current!, title: event.target.value }))}
              placeholder="Content shoot, performance, meeting…"
              className="mt-2 w-full rounded-md border border-border bg-secondary px-3 py-2.5 text-base normal-case tracking-normal text-foreground outline-none focus:ring-1 focus:ring-primary"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Type
              <select
                value={draft.eventType || 'other'}
                onChange={event => setDraft(current => ({ ...current!, eventType: event.target.value as CalendarEvent['eventType'] }))}
                className="mt-2 block w-full rounded-md border border-border bg-secondary px-3 py-2.5 text-sm normal-case tracking-normal text-foreground"
              >
                <option value="shoot">Content shoot</option>
                <option value="performance">Performance</option>
                <option value="meeting">Meeting</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Client (optional)
              <select
                value={draft.clientId || ''}
                onChange={event => setDraft(current => ({ ...current!, clientId: event.target.value || null }))}
                className="mt-2 block w-full rounded-md border border-border bg-secondary px-3 py-2.5 text-sm normal-case tracking-normal text-foreground"
              >
                <option value="">No client</option>
                {clients.filter(client => !client.archived).map(client => <option key={client.id} value={client.id}>{client.name}</option>)}
              </select>
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Starts
              <input type="datetime-local" value={toInputValue(draft.startAt)} onChange={event => updateStart(event.target.value)} className="mt-2 block w-full rounded-md border border-border bg-secondary px-3 py-2.5 text-sm normal-case tracking-normal text-foreground [color-scheme:dark]" />
            </label>
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Ends
              <input
                type="datetime-local"
                value={toInputValue(draft.endAt)}
                min={toInputValue(draft.startAt)}
                onChange={event => event.target.value && setDraft(current => ({ ...current!, endAt: new Date(event.target.value).toISOString() }))}
                className="mt-2 block w-full rounded-md border border-border bg-secondary px-3 py-2.5 text-sm normal-case tracking-normal text-foreground [color-scheme:dark]"
              />
            </label>
          </div>

          <label className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Location
            <input value={draft.location || ''} onChange={event => setDraft(current => ({ ...current!, location: event.target.value }))} placeholder="Venue, studio, or call link" className="mt-2 w-full rounded-md border border-border bg-secondary px-3 py-2.5 text-sm normal-case tracking-normal text-foreground" />
          </label>

          <label className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Notes
            <textarea value={draft.description || ''} onChange={event => setDraft(current => ({ ...current!, description: event.target.value }))} placeholder="Anything needed for this event…" className="mt-2 min-h-28 w-full rounded-md border border-border bg-secondary px-3 py-2.5 text-sm normal-case tracking-normal text-foreground" />
          </label>
        </div>

        <footer className="flex justify-end gap-3 border-t border-border p-4">
          <button onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-secondary">Cancel</button>
          <button disabled={!draft.title?.trim()} onClick={save} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40">Save event</button>
        </footer>
      </div>
    </div>
  );
}