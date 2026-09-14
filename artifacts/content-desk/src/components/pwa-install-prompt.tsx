import { useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const DISMISSED_KEY = 'content-desk-pwa-install-dismissed';

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || ('standalone' in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
}

function isIosSafari() {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const safari = /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent);
  return ios && safari;
}

export function PwaInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const ios = typeof window !== 'undefined' && isIosSafari();

  useEffect(() => {
    if (isStandalone() || sessionStorage.getItem(DISMISSED_KEY)) return;

    const reveal = window.setTimeout(() => {
      if (isIosSafari()) setShow(true);
    }, 1800);

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      setShow(true);
    };
    const onInstalled = () => {
      setShow(false);
      setInstallEvent(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      clearTimeout(reveal);
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!show) return null;

  const dismiss = () => {
    sessionStorage.setItem(DISMISSED_KEY, '1');
    setShow(false);
  };

  const install = async () => {
    if (ios) {
      setShowIosHelp(true);
      return;
    }
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === 'accepted') setShow(false);
    setInstallEvent(null);
  };

  return (
    <aside
      role="dialog"
      aria-label="Install Content Desk"
      className="fixed inset-x-3 bottom-20 z-[45] rounded-xl border border-border bg-card p-4 shadow-2xl md:inset-x-auto md:bottom-5 md:right-5 md:w-[360px]"
    >
      <button onClick={dismiss} className="absolute right-2 top-2 rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="Dismiss install prompt">
        <X className="h-4 w-4" />
      </button>
      <div className="flex gap-3 pr-6">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Download className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-serif text-base">Install Content Desk</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Open it from your home screen or desktop and keep the workspace available offline.
          </p>
        </div>
      </div>

      {showIosHelp ? (
        <div className="mt-3 rounded-lg border border-border bg-secondary/60 p-3 text-sm">
          <p className="flex items-center gap-2 font-medium"><Share className="h-4 w-4 text-primary" /> In Safari</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Tap the Share button, scroll down, then choose <strong className="text-foreground">Add to Home Screen</strong>.
          </p>
        </div>
      ) : (
        <button onClick={install} className="mt-3 w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:brightness-110">
          Install app
        </button>
      )}
    </aside>
  );
}