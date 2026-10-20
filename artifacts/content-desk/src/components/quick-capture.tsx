import { useEffect, useRef, useState } from 'react';
import { Link as LinkIcon, Mic, Square, X } from 'lucide-react';
import { toast } from 'sonner';
import { useMutateStore, useStore } from '@/hooks/use-store';
import { OPEN_QUICK_CAPTURE_EVENT } from '@/components/command-palette';

function getSpeechRecognitionCtor(): (new () => SpeechRecognition) | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition;
}

export function QuickCapture() {
  const { clients } = useStore();
  const { addNote } = useMutateStore();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [clientId, setClientId] = useState('');
  const [recording, setRecording] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const stopRequestedRef = useRef(false);
  const baseTextRef = useRef('');
  const finalTranscriptRef = useRef('');
  const speechSupported = !!getSpeechRecognitionCtor();

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

  function stopRecording() {
    stopRequestedRef.current = true;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setRecording(false);
  }

  const close = () => {
    if (recording) stopRecording();
    setOpen(false);
    setText('');
    setUrl('');
    setClientId('');
  };

  function startRecording() {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      toast.error("Voice capture isn't supported in this browser — try Chrome or Edge.");
      return;
    }
    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || 'en-US';
    baseTextRef.current = text;
    finalTranscriptRef.current = '';
    stopRequestedRef.current = false;

    recognition.onresult = event => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finalTranscriptRef.current += result[0].transcript;
        else interim += result[0].transcript;
      }
      const spoken = (finalTranscriptRef.current + interim).trim();
      setText([baseTextRef.current, spoken].filter(Boolean).join('\n'));
    };
    recognition.onerror = event => {
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      toast.error('Microphone access was denied or voice capture failed.');
      stopRecording();
    };
    recognition.onend = () => {
      // Some browsers end the session after a pause even in continuous mode --
      // restart automatically unless the user actually hit stop.
      if (!stopRequestedRef.current) {
        try { recognition.start(); } catch { /* already running */ }
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setRecording(true);
    } catch {
      toast.error('Could not start voice capture.');
    }
  }

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
          <div className="flex items-center gap-1">
            <button
              onClick={recording ? stopRecording : startRecording}
              disabled={!speechSupported}
              title={speechSupported ? (recording ? 'Stop recording' : 'Record a voice note') : "Voice capture isn't supported in this browser"}
              className={recording ? 'rounded-md p-1.5 text-destructive animate-pulse' : 'rounded-md p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-40'}
            >
              {recording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
            <button onClick={close} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
          </div>
        </div>
        {recording && (
          <p className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            Listening… click the square to stop.
          </p>
        )}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={event => setText(event.target.value)}
          onKeyDown={event => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') save();
            if (event.key === 'Escape') close();
          }}
          placeholder="What's the idea? Or hit the mic and say it out loud."
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
