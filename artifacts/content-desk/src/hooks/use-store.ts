import { useState, useEffect, useCallback } from 'react';
import { store } from '@/lib/store';
import { api } from '@/lib/api';
import { DEFAULT_LAUNCH_SETTINGS, LaunchGate, LaunchLead, resolvePlatforms, SaveStatus, StoreState, Template } from '@/lib/types';
import { uuidv4 } from '@/lib/utils';

export function useStore(): StoreState {
  const [state, setState] = useState<StoreState>(store.get());

  useEffect(() => {
    void store.hydrate().then(() => setState({ ...store.get() }));
    return store.subscribe(() => {
      setState({ ...store.get() });
    });
  }, []);

  return state;
}

export function useSaveStatus(): { status: SaveStatus; lastSavedAt: string | null } {
  const [tick, setTick] = useState(0);
  useEffect(() => store.subscribeStatus(() => setTick(t => t + 1)), []);
  void tick;
  return { status: store.getStatus(), lastSavedAt: store.getLastSavedAt() };
}

// Custom hook helpers for mutating collections
export function useMutateStore() {
  const addTask = useCallback((text: string) => {
    const s = store.get();
    store.update('tasks', [...s.tasks, { id: uuidv4(), text, done: false, createdAt: new Date().toISOString() }]);
  }, []);

  const toggleTask = useCallback((id: string) => {
    const s = store.get();
    store.update('tasks', s.tasks.map(t => t.id === id ? { ...t, done: !t.done } : t));
  }, []);

  const deleteTask = useCallback((id: string) => {
    const s = store.get();
    store.update('tasks', s.tasks.filter(t => t.id !== id));
  }, []);

  const addDeliverable = useCallback((deliv: Partial<StoreState['deliverables'][0]>) => {
    const s = store.get();
    const id = uuidv4();
    const now = new Date().toISOString();
    const defaultClientId = deliv.clientId || s.clients[0]?.id || '';
    const defaultClient = s.clients.find(c => c.id === defaultClientId);
    const newDeliv: StoreState['deliverables'][0] = {
      id,
      briefId: null,
      clientId: defaultClientId,
      platform: resolvePlatforms(defaultClient)[0] || 'Instagram',
      format: 'Post',
      title: 'New Idea',
      copy: '',
      productionStatus: 'idea',
      publishingStatus: 'not-scheduled',
      owner: 'Me',
      productionDueAt: null,
      publishAt: null,
      publishedAt: null,
      assetChecklist: [],
      approvedVersionId: null,
      currentVersionId: null,
      estimatedHours: 0,
      actualHours: 0,
      performance: {},
      ...deliv,
    };
    
    const version: StoreState['versions'][0] = {
      id: uuidv4(),
      deliverableId: id,
      copy: newDeliv.copy,
      assetIds: [],
      createdAt: now,
      approvalState: 'pending',
      approver: null,
      approvalTimestamp: null,
    };
    newDeliv.currentVersionId = version.id;

    store.update('deliverables', [...s.deliverables, newDeliv]);
    store.update('versions', [...s.versions, version]);
  }, []);

  const updateDeliverable = useCallback((id: string, updates: Partial<StoreState['deliverables'][0]>) => {
    const s = store.get();
    const existing = s.deliverables.find(d => d.id === id);
    if (!existing) return;

    let next = { ...existing, ...updates };
    if (typeof updates.copy === 'string' && updates.copy !== existing.copy) {
      const version = {
        id: uuidv4(),
        deliverableId: id,
        copy: updates.copy,
        assetIds: s.versions.find(v => v.id === existing.currentVersionId)?.assetIds || [],
        createdAt: new Date().toISOString(),
        approvalState: 'pending' as const,
        approver: null,
        approvalTimestamp: null,
      };
      next = {
        ...next,
        currentVersionId: version.id,
        productionStatus: existing.productionStatus === 'approved' ? 'in-progress' : next.productionStatus,
      };
      store.update('versions', [...s.versions, version]);
    }
    store.update('deliverables', s.deliverables.map(d => d.id === id ? next : d));
  }, []);

  const markDeliverablePublished = useCallback((id: string) => {
    const s = store.get();
    const now = new Date().toISOString();
    store.update('deliverables', s.deliverables.map(d => d.id === id
      ? { ...d, publishingStatus: 'published' as const, publishedAt: now }
      : d));
  }, []);

  const unmarkDeliverablePublished = useCallback((id: string) => {
    const s = store.get();
    store.update('deliverables', s.deliverables.map(d => d.id === id
      ? { ...d, publishingStatus: d.publishAt ? 'scheduled' as const : 'not-scheduled' as const, publishedAt: null }
      : d));
  }, []);

  const approveCurrentVersion = useCallback((deliverableId: string, approver: string) => {
    const s = store.get();
    const deliverable = s.deliverables.find(d => d.id === deliverableId);
    if (!deliverable?.currentVersionId) return;
    store.update('versions', s.versions.map(v => v.id === deliverable.currentVersionId ? {
      ...v,
      approvalState: 'approved' as const,
      approver: approver.trim() || 'Client',
      approvalTimestamp: new Date().toISOString(),
    } : v));
    store.update('deliverables', s.deliverables.map(d => d.id === deliverableId ? {
      ...d,
      approvedVersionId: d.currentVersionId,
      productionStatus: 'approved' as const,
    } : d));
  }, []);

  const repurposeDeliverable = useCallback((sourceId: string, platform: string) => {
    const s = store.get();
    const source = s.deliverables.find(d => d.id === sourceId);
    if (!source) return null;
    const id = uuidv4();
    const versionId = uuidv4();
    const repurposed = {
      ...source,
      id,
      platform,
      title: `${source.title} — ${platform}`,
      productionStatus: 'idea' as const,
      publishingStatus: 'not-scheduled' as const,
      productionDueAt: null,
      publishAt: null,
      approvedVersionId: null,
      currentVersionId: versionId,
      actualHours: 0,
      performance: {},
    };
    store.update('deliverables', [repurposed, ...s.deliverables]);
    store.update('versions', [...s.versions, {
      id: versionId,
      deliverableId: id,
      copy: source.copy,
      assetIds: [],
      createdAt: new Date().toISOString(),
      approvalState: 'pending',
      approver: null,
      approvalTimestamp: null,
    }]);
    return id;
  }, []);

  const addBrief = useCallback((brief: Partial<StoreState['briefs'][0]>) => {
    const s = store.get();
    const created = {
      id: uuidv4(),
      clientId: brief.clientId || s.clients[0]?.id || '',
      title: brief.title?.trim() || 'Untitled brief',
      objective: brief.objective || '',
      essentialFacts: brief.essentialFacts || '',
      keyMessage: brief.keyMessage || '',
      campaign: brief.campaign || '',
      sourceLinks: brief.sourceLinks || [],
      createdAt: new Date().toISOString(),
    };
    store.update('briefs', [created, ...s.briefs]);
    return created.id;
  }, []);

  const deleteDeliverable = useCallback((id: string) => {
    const s = store.get();
    store.update('deliverables', s.deliverables.filter(d => d.id !== id));
  }, []);

  const addEvent = useCallback((input: Partial<StoreState['events'][0]>) => {
    const s = store.get();
    const startAt = input.startAt || new Date().toISOString();
    const start = new Date(startAt);
    const endAt = input.endAt || new Date(start.getTime() + 60 * 60 * 1000).toISOString();
    const event: StoreState['events'][0] = {
      id: uuidv4(),
      title: input.title?.trim() || 'New event',
      description: input.description || '',
      eventType: input.eventType || 'other',
      clientId: input.clientId || null,
      location: input.location || '',
      startAt,
      endAt,
      createdAt: new Date().toISOString(),
    };
    store.update('events', [event, ...s.events]);
    return event.id;
  }, []);

  const updateEvent = useCallback((id: string, patch: Partial<StoreState['events'][0]>) => {
    const s = store.get();
    store.update('events', s.events.map(event => event.id === id ? { ...event, ...patch } : event));
  }, []);

  const deleteEvent = useCallback((id: string) => {
    const s = store.get();
    store.update('events', s.events.filter(event => event.id !== id));
  }, []);

  const addClient = useCallback(() => {
    const s = store.get();
    const palette = ["#9C3B4A", "#3F7169", "#5C7A99", "#C6A15B", "#6B5B95", "#4E7A51", "#B0763B"];
    const color = palette[s.clients.length % palette.length];
    
    store.update('clients', [...s.clients, {
      id: uuidv4(),
      name: "New Client",
      color,
      archived: false,
      voice: "",
      audience: "",
      pillars: [],
      approvedTerms: [],
      avoidedTerms: [],
      timezone: "UTC",
      monthlyRetainerHours: 0,
      monthlyDeliverableTarget: 0,
      monthlyRetainerAmount: 0,
      platforms: ['Instagram'],
    }]);
  }, []);

  const updateClient = useCallback((id: string, patch: Partial<StoreState['clients'][0]>) => {
    const s = store.get();
    store.update('clients', s.clients.map(c => c.id === id ? { ...c, ...patch } : c));
  }, []);

  const addAsset = useCallback((asset: Partial<StoreState['assets'][0]>) => {
    const s = store.get();
    const id = uuidv4();
    store.update('assets', [{
      id,
      clientId: s.clients[0]?.id || '',
      name: asset.name || 'Untitled',
      type: asset.type || 'image',
      fileUrl: asset.fileUrl || '',
      tags: [],
      credit: '',
      rightsExpiry: null,
      altText: '',
      ...asset
    }, ...s.assets]);
  }, []);

  const deleteAsset = useCallback((id: string) => {
    const s = store.get();
    store.update('assets', s.assets.filter(a => a.id !== id));
  }, []);

  const updateAsset = useCallback((id: string, patch: Partial<StoreState['assets'][0]>) => {
    const s = store.get();
    store.update('assets', s.assets.map(a => a.id === id ? { ...a, ...patch } : a));
  }, []);

  // --- Ideas / captures -------------------------------------------------------

  const addNote = useCallback((input: { text: string; title?: string; url?: string; kind?: 'idea' | 'capture' }) => {
    const s = store.get();
    const note = {
      id: uuidv4(),
      date: new Date().toISOString(),
      text: input.text,
      title: input.title ?? '',
      url: input.url ?? '',
      kind: input.kind ?? ('idea' as const),
    };
    store.update('notes', [note, ...s.notes]);
    return note.id;
  }, []);

  const deleteNote = useCallback((id: string) => {
    const s = store.get();
    store.update('notes', s.notes.filter(n => n.id !== id));
  }, []);

  const convertNoteToDeliverable = useCallback((noteId: string, clientId: string, platform?: string) => {
    const s = store.get();
    const note = s.notes.find(n => n.id === noteId);
    if (!note) return null;
    const client = s.clients.find(c => c.id === clientId);
    const resolvedPlatform = platform || resolvePlatforms(client)[0] || 'Instagram';
    const id = uuidv4();
    const versionId = uuidv4();
    const now = new Date().toISOString();
    store.update('deliverables', [{
      id,
      briefId: null,
      clientId,
      platform: resolvedPlatform,
      format: 'Post',
      title: note.title || note.text.slice(0, 60) || 'New idea',
      copy: note.url ? `${note.text}\n\nSource: ${note.url}` : note.text,
      productionStatus: 'idea' as const,
      publishingStatus: 'not-scheduled' as const,
      owner: 'Me',
      productionDueAt: null,
      publishAt: null,
      publishedAt: null,
      assetChecklist: [],
      approvedVersionId: null,
      currentVersionId: versionId,
      estimatedHours: 0,
      actualHours: 0,
      performance: {},
      seriesId: null,
      createdAt: now,
    }, ...s.deliverables]);
    store.update('versions', [...s.versions, {
      id: versionId, deliverableId: id, copy: note.text, assetIds: [],
      createdAt: now, approvalState: 'pending' as const, approver: null, approvalTimestamp: null,
    }]);
    store.update('notes', s.notes.filter(n => n.id !== noteId));
    return id;
  }, []);

  // --- Recurring templates ----------------------------------------------------

  const addTemplate = useCallback((template: Partial<Template>) => {
    const s = store.get();
    const created: Template = {
      id: uuidv4(),
      clientId: template.clientId || s.clients[0]?.id || '',
      title: template.title?.trim() || 'Weekly series',
      platform: template.platform || 'Instagram',
      format: template.format || 'Post',
      copyTemplate: template.copyTemplate || '',
      checklist: template.checklist || [],
      estimatedHours: template.estimatedHours ?? 1,
      frequency: template.frequency || 'weekly',
      dayOfWeek: template.dayOfWeek ?? 5,
      timeOfDay: template.timeOfDay || '09:00',
      active: template.active ?? true,
      lastGeneratedOn: null,
    };
    store.update('templates', [created, ...s.templates]);
    return created.id;
  }, []);

  const updateTemplate = useCallback((id: string, patch: Partial<Template>) => {
    const s = store.get();
    store.update('templates', s.templates.map(t => t.id === id ? { ...t, ...patch } : t));
  }, []);

  const deleteTemplate = useCallback((id: string) => {
    const s = store.get();
    store.update('templates', s.templates.filter(t => t.id !== id));
  }, []);

  /**
   * Materialize draft deliverables from active templates for the coming
   * `weeksAhead` weeks. Occurrences already generated (by seriesId+date) are
   * skipped, so this is safe to run on every calendar visit.
   */
  const generateFromTemplates = useCallback((weeksAhead = 4) => {
    const s = store.get();
    const now = new Date();
    const todayKey = now.toISOString().slice(0, 10);
    const newDeliverables: StoreState['deliverables'] = [];
    const newVersions: StoreState['versions'] = [];
    const updatedTemplates = s.templates.map(t => {
      if (!t.active) return t;
      let lastGeneratedOn = t.lastGeneratedOn;
      for (let w = 0; w < weeksAhead; w++) {
        const occurrence = nextOccurrence(t, now, w);
        if (!occurrence) continue;
        const dateKey = occurrence.toISOString().slice(0, 10);
        if (dateKey < todayKey) continue;
        const alreadyExists = s.deliverables.some(d => d.seriesId === t.id && d.publishAt?.slice(0, 10) === dateKey)
          || newDeliverables.some(d => d.seriesId === t.id && d.publishAt?.slice(0, 10) === dateKey);
        if (alreadyExists) continue;
        const id = uuidv4();
        const versionId = uuidv4();
        const createdAt = new Date().toISOString();
        newDeliverables.push({
          id, briefId: null, clientId: t.clientId, platform: t.platform, format: t.format,
          title: `${t.title} — ${dateKey}`,
          copy: t.copyTemplate,
          productionStatus: 'idea', publishingStatus: 'scheduled', owner: 'Me',
          productionDueAt: null, publishAt: occurrence.toISOString(), publishedAt: null,
          assetChecklist: [...t.checklist],
          approvedVersionId: null, currentVersionId: versionId,
          estimatedHours: t.estimatedHours, actualHours: 0,
          performance: {}, seriesId: t.id, createdAt,
        });
        newVersions.push({
          id: versionId, deliverableId: id, copy: t.copyTemplate, assetIds: [],
          createdAt, approvalState: 'pending', approver: null, approvalTimestamp: null,
        });
        lastGeneratedOn = dateKey;
      }
      return { ...t, lastGeneratedOn };
    });
    if (newDeliverables.length) {
      store.update('deliverables', [...newDeliverables, ...s.deliverables]);
      store.update('versions', [...s.versions, ...newVersions]);
      store.update('templates', updatedTemplates);
    }
    return newDeliverables.length;
  }, []);

  // --- Voice learning ---------------------------------------------------------

  const recordVoiceExample = useCallback((clientId: string, kind: 'kept' | 'edited' | 'rejected', original: string, final: string) => {
    if (!clientId || !original.trim()) return;
    void api.recordVoice({ clientId, kind, original, final }).catch(() => {});
  }, []);

  // --- Launch planner (Algo-Rhythm) -------------------------------------------

  const addLaunchTask = useCallback((input: { title?: string; due?: string; phase?: number; owner?: string } = {}) => {
    const s = store.get();
    store.update('launchTasks', [...s.launchTasks, {
      id: uuidv4(),
      title: input.title?.trim() || 'New task',
      due: input.due || new Date().toISOString().slice(0, 10),
      phase: input.phase ?? 0,
      owner: input.owner || 'Tisa',
      done: false,
      createdAt: new Date().toISOString(),
    }]);
  }, []);

  const updateLaunchTask = useCallback((id: string, patch: Partial<StoreState['launchTasks'][0]>) => {
    const s = store.get();
    store.update('launchTasks', s.launchTasks.map(t => t.id === id ? { ...t, ...patch } : t));
  }, []);

  const toggleLaunchTask = useCallback((id: string, done: boolean) => {
    const s = store.get();
    store.update('launchTasks', s.launchTasks.map(t => t.id === id ? { ...t, done } : t));
  }, []);

  const deleteLaunchTask = useCallback((id: string) => {
    const s = store.get();
    store.update('launchTasks', s.launchTasks.filter(t => t.id !== id));
  }, []);

  const addLaunchLead = useCallback((input: Partial<LaunchLead> = {}) => {
    const s = store.get();
    const lead: LaunchLead = {
      id: uuidv4(),
      name: input.name?.trim() || 'New prospect',
      status: input.status || 'Lead',
      fee: input.fee ?? 0,
      hours: input.hours ?? 0,
      next: input.next || 'Identify contact and need',
      linkedClientId: null,
    };
    store.update('launchLeads', [...s.launchLeads, lead]);
    return lead.id;
  }, []);

  const updateLaunchLead = useCallback((id: string, patch: Partial<LaunchLead>) => {
    const s = store.get();
    store.update('launchLeads', s.launchLeads.map(l => l.id === id ? { ...l, ...patch } : l));
  }, []);

  const deleteLaunchLead = useCallback((id: string) => {
    const s = store.get();
    store.update('launchLeads', s.launchLeads.filter(l => l.id !== id));
  }, []);

  /** Converts a launch lead into a real Content Desk client via the server
   *  (the server owns creating the client row), then mirrors the result
   *  into local state so it shows up without waiting on the next pull. */
  const convertLaunchLead = useCallback(async (id: string) => {
    const { clientId } = await api.launch.convertLead(id);
    const s = store.get();
    store.update('launchLeads', s.launchLeads.map(l => l.id === id ? { ...l, linkedClientId: clientId } : l));
    const server = await api.getState();
    const client = server.clients.find(c => c.id === clientId);
    if (client && !store.get().clients.some(c => c.id === clientId)) {
      store.update('clients', [...store.get().clients, client]);
    }
    return clientId;
  }, []);

  const addLaunchNote = useCallback((input: { title: string; text: string; date?: string }) => {
    const s = store.get();
    const note = {
      id: uuidv4(),
      date: input.date || new Date().toISOString().slice(0, 10),
      title: input.title.trim(),
      text: input.text.trim(),
    };
    store.update('launchNotes', [note, ...s.launchNotes]);
    return note.id;
  }, []);

  const deleteLaunchNote = useCallback((id: string) => {
    const s = store.get();
    store.update('launchNotes', s.launchNotes.filter(n => n.id !== id));
  }, []);

  const addLaunchGate = useCallback((input: Partial<LaunchGate> = {}) => {
    const s = store.get();
    store.update('launchGates', [...s.launchGates, {
      id: uuidv4(),
      title: input.title?.trim() || 'New decision gate',
      description: input.description || '',
      done: false,
      relatedPhase: input.relatedPhase ?? null,
    }]);
  }, []);

  const updateLaunchGate = useCallback((id: string, patch: Partial<LaunchGate>) => {
    const s = store.get();
    store.update('launchGates', s.launchGates.map(g => g.id === id ? { ...g, ...patch } : g));
  }, []);

  const deleteLaunchGate = useCallback((id: string) => {
    const s = store.get();
    store.update('launchGates', s.launchGates.filter(g => g.id !== id));
  }, []);

  const updateLaunchSettings = useCallback((patch: Partial<StoreState['launchSettings'][0]>) => {
    const s = store.get();
    const current = s.launchSettings[0] ?? DEFAULT_LAUNCH_SETTINGS;
    store.update('launchSettings', [{ ...current, ...patch, id: 'default' }]);
  }, []);

  return {
    addTask,
    toggleTask,
    deleteTask,
    addDeliverable,
    updateDeliverable,
      markDeliverablePublished,
      unmarkDeliverablePublished,
    approveCurrentVersion,
    repurposeDeliverable,
    addBrief,
    deleteDeliverable,
    addEvent,
    updateEvent,
    deleteEvent,
    addClient,
    updateClient,
    addAsset,
    updateAsset,
    deleteAsset,
    addNote,
    deleteNote,
    convertNoteToDeliverable,
    addTemplate,
    updateTemplate,
    deleteTemplate,
    generateFromTemplates,
    recordVoiceExample,
    addLaunchTask,
    updateLaunchTask,
    toggleLaunchTask,
    deleteLaunchTask,
    addLaunchLead,
    updateLaunchLead,
    deleteLaunchLead,
    convertLaunchLead,
    addLaunchNote,
    deleteLaunchNote,
    addLaunchGate,
    updateLaunchGate,
    deleteLaunchGate,
    updateLaunchSettings,
  };
}

function nextOccurrence(template: Template, from: Date, weekOffset: number): Date | null {
  const base = new Date(from);
  base.setDate(base.getDate() + weekOffset * 7);
  const [hours, minutes] = (template.timeOfDay || '09:00').split(':').map(Number);
  const delta = (template.dayOfWeek - base.getDay() + 7) % 7;
  const occurrence = new Date(base);
  occurrence.setDate(base.getDate() + delta);
  occurrence.setHours(hours || 9, minutes || 0, 0, 0);
  if (template.frequency === 'monthly' && weekOffset % 4 !== 0) return null;
  if (template.frequency === 'biweekly' && weekOffset % 2 !== 0) return null;
  return occurrence;
}
