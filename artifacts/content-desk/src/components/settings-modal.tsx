import { useEffect, useState, useRef } from 'react';
import { store } from '@/lib/store';
import { X, Download, AlertCircle, Info, Copy, Bookmark, RotateCcw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { toast as sonnerToast } from 'sonner';

type BackupSummary = { id: string; createdAt: string; reason: string };

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [backups, setBackups] = useState<BackupSummary[]>([]);
  const [backupsLoading, setBackupsLoading] = useState(true);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const appOrigin = window.location.origin;
  const bookmarklet = `javascript:window.open('${appOrigin}/api/capture?url='+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title))`;

  const refreshBackups = async () => {
    setBackupsLoading(true);
    try {
      const result = await api.listBackups();
      setBackups(result.backups);
    } catch (error) {
      sonnerToast.error(error instanceof Error ? error.message : 'Could not load backups');
    } finally {
      setBackupsLoading(false);
    }
  };

  useEffect(() => {
    void refreshBackups();
  }, []);

  const downloadServerBackup = async (id: string) => {
    try {
      const backup = await api.getBackup(id);
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `content-desk-backup-${backup.createdAt.slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      sonnerToast.error(error instanceof Error ? error.message : 'Could not download backup');
    }
  };

  const restoreServerBackup = async (id: string) => {
    if (!window.confirm('Restore this backup over your current data?')) return;
    try {
      const backup = await api.getBackup(id);
      store.restoreFromState(backup.state);
      sonnerToast.success('Backup restored and merged over your current data');
    } catch (error) {
      sonnerToast.error(error instanceof Error ? error.message : 'Could not restore backup');
    }
  };

  const handleExport = () => {
    const data = store.exportBackup();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `content-desk-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const json = event.target?.result as string;
      if (store.importBackup(json)) {
        toast({
          title: "Backup imported",
          description: "Your data has been successfully restored.",
        });
        setTimeout(() => window.location.reload(), 500); // Reload to ensure full state reset
      } else {
        toast({
          variant: "destructive",
          title: "Import failed",
          description: "The selected file is not a valid Content Desk backup.",
        });
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-serif text-lg">Settings</h2>
          <button onClick={onClose} className="p-2 text-muted-foreground hover:text-foreground rounded-md transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto">
          
          <section>
            <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-2">
              <Download className="w-4 h-4" /> Data & Backups
            </h3>
            <div className="bg-secondary/50 border border-border rounded-lg p-4 space-y-4">
              <div>
                <p className="text-sm font-medium mb-1">Export Data</p>
                <p className="text-xs text-muted-foreground mb-3">Download a complete JSON backup of all clients, deliverables, and assets.</p>
                <button 
                  onClick={handleExport}
                  className="bg-secondary border border-border text-foreground px-3 py-1.5 rounded-md text-sm font-medium hover:bg-secondary/80 transition-colors"
                >
                  Download Backup
                </button>
              </div>
              
              <div className="pt-4 border-t border-border/50">
                <p className="text-sm font-medium text-destructive mb-1 flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" /> Restore Data
                </p>
                <p className="text-xs text-muted-foreground mb-3">Upload a backup file. This will completely overwrite your current local data.</p>
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={handleImport}
                  accept="application/json"
                  className="hidden"
                />
                <button 
                  onClick={() => {
                    if (confirm("Warning: Importing a backup will overwrite ALL your current data. Are you sure?")) {
                      fileInputRef.current?.click();
                    }
                  }}
                  className="bg-destructive/10 text-destructive border border-destructive/20 px-3 py-1.5 rounded-md text-sm font-medium hover:bg-destructive hover:text-destructive-foreground transition-colors"
                >
                  Import Backup
                </button>
              </div>
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-muted-foreground">
                <RotateCcw className="h-4 w-4" /> Backups
              </h3>
              <button
                disabled={creatingBackup}
                onClick={async () => {
                  setCreatingBackup(true);
                  try {
                    await api.createBackup('manual');
                    await refreshBackups();
                    sonnerToast.success('Backup created');
                  } catch (error) {
                    sonnerToast.error(error instanceof Error ? error.message : 'Could not create backup');
                  } finally {
                    setCreatingBackup(false);
                  }
                }}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
              >
                {creatingBackup ? 'Backing up…' : 'Back up now'}
              </button>
            </div>
            <div className="overflow-hidden rounded-lg border border-border bg-secondary/50">
              {backupsLoading && <p className="p-4 text-sm text-muted-foreground">Loading backups…</p>}
              {!backupsLoading && backups.length === 0 && <p className="p-4 text-sm text-muted-foreground">No server backups yet.</p>}
              <div className="divide-y divide-border">
                {backups.map(backup => (
                  <div key={backup.id} className="flex items-center gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">{new Date(backup.createdAt).toLocaleString()}</p>
                      <p className="truncate text-xs capitalize text-muted-foreground">{backup.reason}</p>
                    </div>
                    <button onClick={() => void downloadServerBackup(backup.id)} className="text-xs text-muted-foreground hover:text-foreground">Download</button>
                    <button onClick={() => void restoreServerBackup(backup.id)} className="text-xs text-destructive hover:underline">Restore</button>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-muted-foreground">
              <Bookmark className="h-4 w-4" /> Capture bookmarklet
            </h3>
            <div className="rounded-lg border border-border bg-secondary/50 p-4">
              <p className="mb-3 text-xs text-muted-foreground">Drag this to your bookmarks bar; click it on any page to save the page to your Ideas inbox.</p>
              <div className="flex items-center gap-2">
                <a href={bookmarklet} className="min-w-0 flex-1 truncate rounded-md border border-border bg-background px-3 py-2 font-mono text-xs text-primary">
                  {bookmarklet}
                </a>
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(bookmarklet);
                      sonnerToast.success('Bookmarklet copied');
                    } catch {
                      sonnerToast.error('Could not copy bookmarklet');
                    }
                  }}
                  aria-label="Copy bookmarklet"
                  className="rounded-md border border-border bg-secondary p-2 text-muted-foreground hover:text-foreground"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-2">
              <Info className="w-4 h-4" /> Future Roadmap
            </h3>
            <div className="bg-secondary/50 border border-border rounded-lg p-4">
              <ul className="text-sm text-muted-foreground space-y-2 list-disc pl-4">
                <li>Client-facing portal & approval links</li>
                <li>Multi-user collaboration & permissions</li>
                <li>Cloud sync & real-time updates</li>
                <li>Direct API publishing to social platforms</li>
              </ul>
              <p className="text-xs text-primary mt-4 font-medium">Currently unavailable in the local beta.</p>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
