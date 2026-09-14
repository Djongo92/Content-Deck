import { useState, useRef, useMemo, useEffect } from 'react';
import { useStore, useMutateStore } from '@/hooks/use-store';
import { Upload, Search, Image as ImageIcon, Video, FileText, Music, Trash2, X, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from 'sonner';

export default function AssetsPage() {
  const { assets, clients, versions, deliverables } = useStore();
  const { addAsset, deleteAsset, updateAsset } = useMutateStore();
  const [search, setSearch] = useState('');
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [clientFilter, setClientFilter] = useState('');
  const [rightsExpiring, setRightsExpiring] = useState(false);
  const [uploading, setUploading] = useState<{ key: string; name: string; type: string }[]>([]);
  const [pendingTags, setPendingTags] = useState<{ fileUrl: string; dataUrl: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredAssets = useMemo(() => {
    const now = Date.now();
    const cutoff = now + 30 * 86400000;
    return assets.filter(a => {
      if (clientFilter && a.clientId !== clientFilter) return false;
      if (rightsExpiring && (!a.rightsExpiry || new Date(a.rightsExpiry).getTime() > cutoff)) return false;
      if (search && !a.name.toLowerCase().includes(search.toLowerCase()) && !a.tags.some(t => t.toLowerCase().includes(search.toLowerCase()))) {
        return false;
      }
      return true;
    }).sort((a, b) => rightsExpiring
      ? new Date(a.rightsExpiry || '9999-12-31').getTime() - new Date(b.rightsExpiry || '9999-12-31').getTime()
      : 0);
  }, [assets, search, clientFilter, rightsExpiring]);

  const emptyState = filteredAssets.length === 0 && uploading.length === 0;

  useEffect(() => {
    pendingTags.forEach(pending => {
      const asset = assets.find(item => item.fileUrl === pending.fileUrl);
      if (!asset) return;
      setPendingTags(items => items.filter(item => item.fileUrl !== pending.fileUrl));
      void api.autoTag(pending.dataUrl).then(({ altText, tags }) => {
        updateAsset(asset.id, { altText, tags: Array.from(new Set([...asset.tags, ...tags])) });
      }).catch(() => undefined);
    });
  }, [assets, pendingTags, updateAsset]);

  const imageDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      const scale = Math.min(1, 1024 / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read image')); };
    image.src = url;
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const clientId = clientFilter || clients.find(c => !c.archived)?.id || '';
    files.forEach(async file => {
      const type: 'image' | 'video' | 'audio' | 'document' | null =
        file.type.startsWith('image/') ? 'image'
          : file.type.startsWith('video/') ? 'video'
            : file.type.startsWith('audio/') ? 'audio'
              : (file.type === 'application/pdf' || file.type.startsWith('text/') || file.type.includes('document') || file.type.includes('sheet') || file.type.includes('presentation')) ? 'document'
                : null;
      if (!type) {
        toast.error(`${file.name}: unsupported file type`);
        return;
      }
      if (file.size > 200 * 1024 * 1024) {
        toast.error(`${file.name}: file is larger than 200MB`);
        return;
      }
      const key = `${file.name}-${file.size}-${file.lastModified}`;
      setUploading(items => [...items, { key, name: file.name, type }]);
      try {
        const tagDataPromise = type === 'image' && file.size <= 8 * 1024 * 1024
          ? imageDataUrl(file).catch(() => null)
          : Promise.resolve(null);
        const { uploadURL, objectPath } = await api.requestUploadUrl({ name: file.name, size: file.size, contentType: file.type });
        const response = await fetch(uploadURL, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
        if (!response.ok) throw new Error(`Upload failed (${response.status})`);
        const fileUrl = `/api/storage${objectPath}`;
        addAsset({ name: file.name, type, fileUrl, clientId });
        void tagDataPromise.then(dataUrl => {
          if (dataUrl) setPendingTags(items => [...items, { fileUrl, dataUrl }]);
        });
      } catch (error) {
        toast.error(`${file.name}: ${error instanceof Error ? error.message : 'upload failed'}`);
      } finally {
        setUploading(items => items.filter(item => item.key !== key));
      }
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'image': return <ImageIcon className="w-8 h-8 text-muted-foreground" />;
      case 'video': return <Video className="w-8 h-8 text-muted-foreground" />;
      case 'audio': return <Music className="w-8 h-8 text-muted-foreground" />;
      default: return <FileText className="w-8 h-8 text-muted-foreground" />;
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden p-8 max-w-7xl mx-auto w-full">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-serif text-foreground">Media Library</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage assets, rights, and credits</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input 
              type="text"
              placeholder="Search assets..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 bg-secondary border border-border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary w-64"
            />
          </div>
          <select value={clientFilter} onChange={e => setClientFilter(e.target.value)} className="bg-secondary border border-border rounded-md px-3 py-2 text-sm">
            <option value="">All clients</option>
            {clients.filter(c => !c.archived).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button onClick={() => setRightsExpiring(value => !value)} className={`px-3 py-2 text-sm border rounded-md ${rightsExpiring ? 'border-primary text-primary' : 'border-border text-muted-foreground'}`}>Rights expiring</button>
          
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            onChange={handleFileUpload} 
             accept="image/*,video/*,audio/*,.pdf,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
             multiple
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md font-medium text-sm hover:brightness-110 transition-all shadow-sm"
          >
            <Upload className="w-4 h-4" /> Upload
          </button>
        </div>
      </header>

      <div className={`flex-1 bg-card border border-border rounded-xl p-6 ${emptyState ? 'flex items-center justify-center' : 'overflow-y-auto'}`}>
        {emptyState ? (
          <div className="text-center max-w-md">
            <div className="w-16 h-16 bg-secondary rounded-2xl flex items-center justify-center mx-auto mb-4 border border-border">
              <ImageIcon className="w-8 h-8 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-serif mb-2">No assets found</h2>
            <p className="text-sm text-muted-foreground mb-6">
              {search ? "No assets matched your search." : "Upload images, videos, and audio to build your media library. Assets can be tagged, credited, and linked directly to your deliverables."}
            </p>
            {!search && (
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="bg-primary text-primary-foreground px-6 py-2.5 rounded-md font-medium text-sm shadow-sm hover:brightness-110 transition-all"
              >
                Upload first asset
              </button>
            )}
          </div>
        ) : (
           <div className="w-full grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
             {uploading.map(item => (
               <div key={item.key} className="relative bg-secondary border border-border rounded-xl overflow-hidden">
                 <div className="aspect-square bg-background flex flex-col items-center justify-center gap-3">
                   <Loader2 className="w-8 h-8 animate-spin text-primary" />
                   <span className="text-xs text-muted-foreground px-3 text-center truncate max-w-full">{item.name}</span>
                 </div>
               </div>
             ))}
             {filteredAssets.map(asset => {
               const client = clients.find(c => c.id === asset.clientId);
                const expiryDays = asset.rightsExpiry ? Math.ceil((new Date(asset.rightsExpiry).getTime() - Date.now()) / 86400000) : null;
               return (
                  <div key={asset.id} onClick={() => setSelectedAssetId(asset.id)} className="group relative bg-secondary border border-border rounded-xl overflow-hidden flex flex-col shadow-sm hover:border-primary/50 transition-colors cursor-pointer">
                   <div className="aspect-square bg-background flex items-center justify-center relative overflow-hidden">
                     {asset.type === 'image' ? (
                       <img src={asset.fileUrl} alt={asset.altText || asset.name} className="w-full h-full object-cover" />
                     ) : (
                       getIcon(asset.type)
                     )}
                      {expiryDays !== null && expiryDays < 0 && <span className="absolute top-2 left-2 text-[10px] px-2 py-1 rounded bg-rose-500/90 text-white">Rights expired</span>}
                      {expiryDays !== null && expiryDays >= 0 && expiryDays <= 30 && <span className="absolute top-2 left-2 text-[10px] px-2 py-1 rounded bg-amber-500/90 text-black">Expires in {expiryDays}d</span>}
                     
                     <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                       <button 
                          onClick={(event) => { event.stopPropagation(); deleteAsset(asset.id); }}
                         className="p-2 bg-destructive/90 text-destructive-foreground rounded-md hover:bg-destructive transition-colors"
                         title="Delete Asset"
                       >
                         <Trash2 className="w-4 h-4" />
                       </button>
                     </div>
                   </div>
                   
                   <div className="p-3">
                     <p className="text-sm font-medium truncate text-foreground mb-1">{asset.name}</p>
                     <div className="flex items-center justify-between">
                       <span className="text-xs text-muted-foreground capitalize">{asset.type}</span>
                       {client && (
                         <div className="w-2 h-2 rounded-full" style={{ backgroundColor: client.color }} title={client.name} />
                       )}
                     </div>
                   </div>
                 </div>
               );
             })}
          </div>
        )}
      </div>
      {selectedAssetId && (() => {
        const asset = assets.find(a => a.id === selectedAssetId);
        if (!asset) return null;
        return (
          <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setSelectedAssetId(null)}>
            <div className="w-full max-w-2xl bg-card border border-border rounded-xl overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between p-4 border-b border-border">
                <h2 className="font-serif text-xl">Asset details</h2>
                <button onClick={() => setSelectedAssetId(null)} aria-label="Close asset details"><X className="w-5 h-5" /></button>
              </div>
              <div className="grid md:grid-cols-2 gap-6 p-6">
                <div className="aspect-square bg-background rounded-lg overflow-hidden flex items-center justify-center">
                  {asset.type === 'image' ? <img src={asset.fileUrl} alt={asset.altText || asset.name} className="w-full h-full object-contain" /> : getIcon(asset.type)}
                </div>
                <div className="space-y-4">
                  <label className="block text-xs text-muted-foreground">Name
                    <input value={asset.name} onChange={e => updateAsset(asset.id, { name: e.target.value })} className="mt-1 w-full bg-secondary border border-border rounded-md p-2 text-sm text-foreground" />
                  </label>
                  <label className="block text-xs text-muted-foreground">Client
                    <select value={asset.clientId} onChange={e => updateAsset(asset.id, { clientId: e.target.value })} className="mt-1 w-full bg-secondary border border-border rounded-md p-2 text-sm">
                      {clients.filter(c => !c.archived).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </label>
                  <label className="block text-xs text-muted-foreground">Tags
                    <input value={asset.tags.join(', ')} onChange={e => updateAsset(asset.id, { tags: e.target.value.split(',').map(v => v.trim()).filter(Boolean) })} placeholder="rehearsal, portrait, approved" className="mt-1 w-full bg-secondary border border-border rounded-md p-2 text-sm text-foreground" />
                  </label>
                  <label className="block text-xs text-muted-foreground">Credit
                    <input value={asset.credit} onChange={e => updateAsset(asset.id, { credit: e.target.value })} className="mt-1 w-full bg-secondary border border-border rounded-md p-2 text-sm text-foreground" />
                  </label>
                  <label className="block text-xs text-muted-foreground">Rights expiry
                    <input type="date" value={asset.rightsExpiry || ''} onChange={e => updateAsset(asset.id, { rightsExpiry: e.target.value || null })} className="mt-1 w-full bg-secondary border border-border rounded-md p-2 text-sm text-foreground [color-scheme:dark]" />
                  </label>
                  <label className="block text-xs text-muted-foreground">Alt text
                    <textarea value={asset.altText} onChange={e => updateAsset(asset.id, { altText: e.target.value })} className="mt-1 w-full bg-secondary border border-border rounded-md p-2 text-sm text-foreground min-h-[70px]" />
                  </label>
                   <div className="pt-3 border-t border-border">
                     <h3 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Used in</h3>
                     {(() => {
                       const used = versions
                         .filter(version => version.assetIds.includes(asset.id))
                         .map(version => deliverables.find(item => item.id === version.deliverableId))
                         .filter((item, index, all) => item && all.findIndex(other => other?.id === item.id) === index);
                       return used.length ? (
                         <div className="space-y-2">
                           {used.map(item => item && <div key={item.id} className="text-sm bg-secondary border border-border rounded-md p-2"><span>{item.title}</span><span className="text-muted-foreground"> · {item.platform}</span></div>)}
                         </div>
                       ) : <p className="text-sm text-muted-foreground">Not used in any deliverable yet.</p>;
                     })()}
                   </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
