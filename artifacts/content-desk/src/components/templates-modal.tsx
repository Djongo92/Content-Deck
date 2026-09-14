import { FormEvent, useState } from 'react';
import { Repeat, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useMutateStore, useStore } from '@/hooks/use-store';

const platforms = ['Instagram', 'Facebook', 'TikTok', 'LinkedIn', 'YouTube', 'Newsletter', 'Web'];
const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function TemplatesModal({ onClose }: { onClose: () => void }) {
  const { clients, templates } = useStore();
  const { addTemplate, updateTemplate, deleteTemplate, generateFromTemplates } = useMutateStore();
  const activeClients = clients.filter(client => !client.archived);
  const [clientId, setClientId] = useState(activeClients[0]?.id || '');
  const [title, setTitle] = useState('');
  const [platform, setPlatform] = useState('Instagram');
  const [format, setFormat] = useState('Post');
  const [copyTemplate, setCopyTemplate] = useState('');
  const [checklist, setChecklist] = useState('');
  const [estimatedHours, setEstimatedHours] = useState(1);
  const [frequency, setFrequency] = useState<'weekly' | 'biweekly' | 'monthly'>('weekly');
  const [dayOfWeek, setDayOfWeek] = useState(5);
  const [timeOfDay, setTimeOfDay] = useState('09:00');

  const handleCreate = (event: FormEvent) => {
    event.preventDefault();
    if (!clientId || !title.trim()) {
      toast.error('Choose a client and enter a series title.');
      return;
    }
    addTemplate({
      clientId,
      title,
      platform,
      format,
      copyTemplate,
      checklist: checklist.split('\n').map(item => item.trim()).filter(Boolean),
      estimatedHours,
      frequency,
      dayOfWeek,
      timeOfDay,
      active: true,
    });
    const count = generateFromTemplates(4);
    toast.success(`${count} draft${count === 1 ? '' : 's'} created.`);
    setTitle('');
    setCopyTemplate('');
    setChecklist('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xl">
        <header className="flex items-center justify-between border-b border-border p-5">
          <div>
            <h2 className="flex items-center gap-2 font-serif text-xl"><Repeat className="h-5 w-5 text-primary" /> Recurring series</h2>
            <p className="mt-1 text-sm text-muted-foreground">Turn repeatable content into scheduled drafts.</p>
          </div>
          <button onClick={onClose} className="rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="grid flex-1 overflow-y-auto lg:grid-cols-[1fr_1.2fr]">
          <section className="border-b border-border p-5 lg:border-b-0 lg:border-r">
            <h3 className="mb-4 font-medium">Existing series</h3>
            <div className="space-y-3">
              {templates.map(template => {
                const client = clients.find(item => item.id === template.clientId);
                const frequencyLabel = template.frequency === 'biweekly' ? 'Every other week' : template.frequency[0].toUpperCase() + template.frequency.slice(1);
                return (
                  <div key={template.id} className="rounded-md border border-border bg-secondary/20 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{template.title}</p>
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: client?.color }} />
                          {client?.name || 'Unknown client'}
                        </p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {frequencyLabel} · {weekdays[template.dayOfWeek].slice(0, 3)} {template.timeOfDay}
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          if (window.confirm(`Delete “${template.title}”? Existing deliverables will remain.`)) deleteTemplate(template.id);
                        }}
                        className="p-1.5 text-muted-foreground hover:text-destructive"
                        aria-label={`Delete ${template.title}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <label className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                      <input type="checkbox" checked={template.active} onChange={event => updateTemplate(template.id, { active: event.target.checked })} />
                      Active
                    </label>
                  </div>
                );
              })}
              {!templates.length && <p className="text-sm text-muted-foreground">No recurring series yet.</p>}
            </div>
          </section>

          <form onSubmit={handleCreate} className="space-y-4 p-5">
            <h3 className="font-medium">Create a series</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Client">
                <select value={clientId} onChange={event => setClientId(event.target.value)} className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" required>
                  {activeClients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}
                </select>
              </Field>
              <Field label="Title"><input value={title} onChange={event => setTitle(event.target.value)} className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" required /></Field>
              <Field label="Platform">
                <select value={platform} onChange={event => setPlatform(event.target.value)} className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary">
                  {platforms.map(item => <option key={item}>{item}</option>)}
                </select>
              </Field>
              <Field label="Format"><input value={format} onChange={event => setFormat(event.target.value)} className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" /></Field>
            </div>
            <Field label="Copy template"><textarea value={copyTemplate} onChange={event => setCopyTemplate(event.target.value)} className="min-h-20 w-full resize-y rounded-md border border-border bg-secondary px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" /></Field>
            <Field label="Checklist (one item per line)"><textarea value={checklist} onChange={event => setChecklist(event.target.value)} className="min-h-20 w-full resize-y rounded-md border border-border bg-secondary px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Estimated hours"><input type="number" min="0" step="0.25" value={estimatedHours} onChange={event => setEstimatedHours(Number(event.target.value))} className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" /></Field>
              <Field label="Frequency">
                <select value={frequency} onChange={event => setFrequency(event.target.value as typeof frequency)} className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary">
                  <option value="weekly">Weekly</option><option value="biweekly">Biweekly</option><option value="monthly">Monthly</option>
                </select>
              </Field>
              <Field label="Day of week">
                <select value={dayOfWeek} onChange={event => setDayOfWeek(Number(event.target.value))} className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary">
                  {weekdays.map((day, index) => <option key={day} value={index}>{day}</option>)}
                </select>
              </Field>
              <Field label="Time"><input type="time" value={timeOfDay} onChange={event => setTimeOfDay(event.target.value)} className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary [color-scheme:dark]" /></Field>
            </div>
            <button type="submit" className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:brightness-110">
              Create series and generate drafts
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}