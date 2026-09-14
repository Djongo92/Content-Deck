import { useEffect, useRef, useState } from 'react';
import { Link as LinkIcon, X } from 'lucide-react';
import { toast } from 'sonner';
import { useMutateStore, useStore } from '@/hooks/use-store';
import { OPEN_QUICK_CAPTURE_EVENT } from '@/components/command-palette';

export function QuickCapture() {
  const { clients } = useStore();
  const { addNote } = useMutateStore();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [clientId, setClientId] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const openCapture = () => setOpen(true);
    const hotkey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.matches('input, textarea, select, [contenteditable="true"]');
      const paletteOpen = !!document.querySelector('[data-command-palette]');
      if (event.key.toLowerCase() === 'c' && !event.metaKey && !event.ctrlKey && !event.altKey && !typing && !paletteOpen) {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener(OPEN_QUICK_CAPTURE_EVENT, openCapture);
    window.addEventListener('keydown', hotkey);
    return () => {
      window.removeEventListener(OPEN_QUICK_CAPTURE_EVENT, openCapture);
      window.removeEventListener('keydown', hotkey);
    };
  }, []);

  useEffect(() => {
    if (open) requestAnimationFrame(() => textareaRef.current?.focus());
  }, [open]);

  const close = () => {
    setOpen(false);
    setText('');
    setUrl('');
    setClientId('');
  };

  const save = () => {
    if (!text.trim()) return;
    addNote({ text: text.trim(), url: url.trim(), kind: url.trim() ? 'capture' : 'idea' });
    toast.success('Captured');
    close();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center bg-background/80 p-4 pt-[18vh] backdrop-blur-sm" onMouseDown={close}>
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-xl" onMouseDown={event => event.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-serif text-xl">Capture an idea</h2>
          <button onClick={close} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={event => setText(event.target.value)}
          onKeyDown={event => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') save();
            if (event.key === 'Escape') close();
          }}
          placeholder="What's the idea?"
          rows={5}
          className="w-full resize-none rounded-md border border-border bg-secondary p-3 text-base outline-none focus:ring-1 focus:ring-primary"
        />
        <div className="mt-3 flex items-center gap-2 rounded-md border border-border bg-secondary px-3">
          <LinkIcon className="h-4 w-4 text-muted-foreground" />
          <input value={url} onChange={event => setUrl(event.target.value)} placeholder="Optional source URL" className="h-10 flex-1 bg-transparent text-sm outline-none" />
        </div>
        <select value={clientId} onChange={event => setClientId(event.target.value)} className="mt-3 h-10 w-full rounded-md border border-border bg-secondary px-3 text-sm outline-none">
          <option value="">No client yet</option>
          {clients.filter(client => !client.archived).map(client => <option key={client.id} value={client.id}>{client.name}</option>)}
        </select>
        <div className="mt-4 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">⌘ Enter to save</span>
          <button onClick={save} disabled={!text.trim()} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">Save idea</button>
        </div>
      </div>
    </div>
  );
}