import { DEFAULT_LAUNCH_SETTINGS, SaveStatus, StoreState } from './types';
import { uuidv4 } from './utils';
import { api } from './api';

const STORAGE_KEY = 'content-desk-db-v2';
const PENDING_SYNC_KEY = 'content-desk-pending-sync-v1';

export const DEFAULT_CLIENTS = [
  {
    id: "c1",
    name: "Philharmonic Orchestra",
    color: "#9C3B4A",
    archived: false,
    voice: "Authoritative, cultured, deeply passionate but accessible.",
    audience: "Classical music lovers, affluent patrons, students.",
    pillars: ["Performance Highlights", "Behind the Scenes", "Education"],
    approvedTerms: ["Maestro", "Symphony", "Virtuoso"],
    avoidedTerms: ["Gig", "Show", "Band"],
    timezone: "Europe/London",
    monthlyRetainerHours: 40,
    monthlyDeliverableTarget: 15,
    monthlyRetainerAmount: 4800,
  },
  {
    id: "c2",
    name: "Wonder Kvartet",
    color: "#3F7169",
    archived: false,
    voice: "Young, dynamic, slightly irreverent, intimate.",
    audience: "Millennial/Gen Z music fans, indie crossover listeners.",
    pillars: ["Tour Life", "Rehearsal Snippets", "Personal Stories"],
    approvedTerms: ["Session", "Vibe", "Collab"],
    avoidedTerms: ["Formal", "Traditional"],
    timezone: "America/New_York",
    monthlyRetainerHours: 20,
    monthlyDeliverableTarget: 8,
    monthlyRetainerAmount: 2200,
  }
];

const LAUNCH_SEED_RAW: [string, string, number][] = [
  ['Write a one-page positioning statement', '2026-10-25', 0],
  ['Document Wonder Strings scope and begin time tracking', '2026-10-25', 0],
  ['List 20 qualified prospects and relationships', '2026-10-25', 0],
  ['Check name, trademark, APR, domain, and handles', '2026-11-01', 0],
  ['Set three provisional packages and prices', '2026-11-01', 0],
  ['Collect Wonder Strings portfolio materials', '2026-11-01', 0],
  ['Collect Belgrade Philharmonic portfolio evidence', '2026-11-01', 0],
  ["Write Wonder Strings case study", '2026-11-15', 0],
  ['Write founder-experience case study', '2026-11-15', 0],
  ['Prepare one-page services PDF', '2026-12-05', 1],
  ['Prepare proposal and scope templates', '2026-12-10', 1],
  ['Choose website domain after clearance', '2026-12-15', 1],
  ['Prepare 8 selective prospect introductions', '2027-01-20', 2],
  ['Hold at least 3 discovery conversations', '2027-01-31', 2],
  ['Draft WordPress website and page copy', '2027-01-31', 2],
  ['Validate package prices against actual requests', '2027-01-31', 2],
  ['Get written accountant view on classification and tax structure', '2027-02-15', 3],
  ['Create fixed-cost and cash-reserve forecast', '2027-02-20', 3],
  ['Create compliant contract/invoicing workflow', '2027-02-28', 3],
  ['Complete website and inquiry process', '2027-03-15', 4],
  ['Prepare six quality social content assets', '2027-03-20', 4],
  ['Set up founder LinkedIn and agency Instagram presence', '2027-03-25', 4],
  ['Test website, contacts, legal pages, and mobile layouts', '2027-03-31', 4],
  ['Make public-launch go/no-go decision', '2027-03-31', 4],
  ['Publish website and studio announcement', '2027-04-12', 5],
  ['Contact selected launch network personally', '2027-04-16', 5],
];

const LAUNCH_SEED_TASKS = LAUNCH_SEED_RAW.map(([title, due, phase]) => ({
  id: uuidv4(),
  title,
  due,
  phase,
  owner: 'Tisa',
  done: false,
  createdAt: new Date().toISOString(),
}));

export const SEED_DATA: StoreState = {
  clients: DEFAULT_CLIENTS,
  briefs: [
    {
      id: "b1",
      clientId: "c1",
      title: "Mahler 5th Symphony Series",
      objective: "Drive ticket sales for the upcoming weekend performances.",
      essentialFacts: "Performances are Friday 8PM, Saturday 8PM, Sunday 2PM. Guest conductor: Marin Alsop.",
      keyMessage: "Experience the monumental emotional journey of Mahler's 5th.",
      campaign: "Spring Season 2024",
      sourceLinks: ["https://example.com/mahler"],
      createdAt: new Date().toISOString(),
    }
  ],
  deliverables: [
    {
      id: "d1",
      briefId: "b1",
      clientId: "c1",
      platform: "Instagram",
      format: "Reel",
      title: "Mahler 5 Rehearsal Teaser",
      copy: "The calm before the storm. Join us this weekend for Mahler's magnificent 5th.",
      productionStatus: "in-progress",
      publishingStatus: "not-scheduled",
      owner: "Editor",
      productionDueAt: new Date(Date.now() + 86400000).toISOString(),
      publishAt: new Date(Date.now() + 172800000).toISOString(),
      publishedAt: null,
      assetChecklist: ["Rehearsal Video", "Thumbnail", "Audio Mix"],
      approvedVersionId: null,
      currentVersionId: "v1",
      estimatedHours: 2,
      actualHours: 0,
      performance: {},
      createdAt: new Date().toISOString(),
    },
    {
      id: "d2",
      briefId: null,
      clientId: "c2",
      platform: "TikTok",
      format: "Video",
      title: "Morning scales check",
      copy: "Gotta warm up those fingers #stringquartet #practice",
      productionStatus: "approved",
      publishingStatus: "scheduled",
      owner: "Creator",
      productionDueAt: new Date().toISOString(),
      publishAt: new Date(Date.now() + 43200000).toISOString(),
      publishedAt: null,
      assetChecklist: ["Raw video"],
      approvedVersionId: "v2",
      currentVersionId: "v2",
      estimatedHours: 1,
      actualHours: 1,
      performance: {},
      createdAt: new Date().toISOString(),
    }
  ],
  events: [],
  versions: [
    {
      id: "v1",
      deliverableId: "d1",
      copy: "The calm before the storm. Join us this weekend for Mahler's magnificent 5th.",
      assetIds: [],
      createdAt: new Date().toISOString(),
      approvalState: 'pending',
      approver: null,
      approvalTimestamp: null,
    },
    {
      id: "v2",
      deliverableId: "d2",
      copy: "Gotta warm up those fingers #stringquartet #practice",
      assetIds: [],
      createdAt: new Date().toISOString(),
      approvalState: 'approved',
      approver: 'Client',
      approvalTimestamp: new Date().toISOString(),
    }
  ],
  assets: [],
  tasks: [
    { id: uuidv4(), text: "Invoice Philharmonia", done: false, createdAt: new Date().toISOString() },
    { id: uuidv4(), text: "Reply to comments on last week's post", done: true, createdAt: new Date().toISOString() }
  ],
  notes: [],
  metrics: [],
  templates: [],
  launchTasks: LAUNCH_SEED_TASKS,
  launchLeads: [
    { id: uuidv4(), name: 'Wonder Strings', status: 'Active', fee: 400, hours: 25, next: 'Track time and prepare case study', linkedClientId: null },
  ],
  launchNotes: [
    {
      id: uuidv4(),
      date: new Date().toISOString().slice(0, 10),
      title: 'Business baseline agreed',
      text: 'Local-first, internationally credible. Solo studio; mixed retainers and projects; six-month public-launch horizon. Founder owns sales. Name remains provisional.',
    },
  ],
  launchGates: [
    { id: uuidv4(), title: 'Brand/name clearance', description: 'Check relevant trademarks, APR names, domains and handles before investing or publishing.', done: false, relatedPhase: 0 },
    { id: uuidv4(), title: 'Offer validation', description: 'Confirm at least some positive willingness-to-pay evidence from real prospects.', done: false, relatedPhase: 2 },
    { id: uuidv4(), title: 'Tax and invoicing readiness', description: 'Accountant verifies predominant activity, eligibility, likely costs, and lawful contracting route.', done: false, relatedPhase: 3 },
    { id: uuidv4(), title: 'Public launch package', description: 'Completed site, portfolio, contact path, founder identity, and social announcement.', done: false, relatedPhase: 4 },
  ],
  launchSettings: [{
    ...DEFAULT_LAUNCH_SETTINGS,
    weeklyHours: 20,
    adminPercent: 25,
    monthlyCosts: 500,
    monthlyReserve: 150,
    brandName: 'Algo-Rhythm',
    headline: 'Communications for the world of music.',
    proposition: 'An independent communications studio helping musicians, ensembles, festivals, and cultural organizations connect with their audiences.',
    visualDirection: 'Contemporary, creative, editorial. Rhythmic typography, off-white/charcoal foundation, one expressive accent; avoid musical-note clichés.',
    stack: 'WordPress · English-first · five pages',
    launchDate: '2027-04-12',
  }],
};

// --- Sync machinery -----------------------------------------------------------
// The local store is the optimistic cache (instant + offline-tolerant).
// Every update diffs the changed collection and queues upserts/deletes that
// flush to the API server, debounced. On boot the server wins if it has data;
// otherwise local data is pushed up (one-time migration).

type CollectionKey = keyof StoreState;
const SYNC_KEYS: CollectionKey[] = [
  'clients', 'briefs', 'deliverables', 'events', 'versions', 'assets', 'tasks', 'notes', 'metrics', 'templates',
  'launchTasks', 'launchLeads', 'launchNotes', 'launchGates', 'launchSettings',
];

let storeState: StoreState | null = null;
let subscribers: (() => void)[] = [];
let statusSubscribers: (() => void)[] = [];
let saveStatus: SaveStatus = 'loading';
let lastSavedAt: string | null = null;
let hydratePromise: Promise<void> | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setInterval> | null = null;

const pendingUpserts: Record<string, Map<string, Record<string, unknown>>> = {};
const pendingDeletes: Record<string, Set<string>> = {};
let pendingRestored = false;

function persistPending() {
  if (typeof localStorage === 'undefined') return;
  const serialized = {
    upserts: Object.fromEntries(
      Object.entries(pendingUpserts)
        .filter(([, rows]) => rows.size)
        .map(([key, rows]) => [key, [...rows.values()]])
    ),
    deletes: Object.fromEntries(
      Object.entries(pendingDeletes)
        .filter(([, ids]) => ids.size)
        .map(([key, ids]) => [key, [...ids]])
    ),
  };
  try {
    if (Object.keys(serialized.upserts).length || Object.keys(serialized.deletes).length) {
      localStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(serialized));
    } else {
      localStorage.removeItem(PENDING_SYNC_KEY);
    }
  } catch { /* storage unavailable */ }
}

function restorePending() {
  if (pendingRestored || typeof localStorage === 'undefined') return;
  pendingRestored = true;
  try {
    const raw = localStorage.getItem(PENDING_SYNC_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as {
      upserts?: Record<string, Record<string, unknown>[]>;
      deletes?: Record<string, string[]>;
    };
    for (const [key, rows] of Object.entries(parsed.upserts ?? {})) {
      pendingUpserts[key] = new Map(rows.map(row => [String(row.id), row]));
    }
    for (const [key, ids] of Object.entries(parsed.deletes ?? {})) {
      pendingDeletes[key] = new Set(ids);
    }
  } catch {
    localStorage.removeItem(PENDING_SYNC_KEY);
  }
}

function notify() {
  subscribers.forEach(sub => sub());
}

function setStatus(status: SaveStatus) {
  saveStatus = status;
  if (status === 'saved') lastSavedAt = new Date().toISOString();
  statusSubscribers.forEach(sub => sub());
}

function normalize(state: Partial<StoreState> | null | undefined): StoreState {
  const s = (state ?? {}) as Partial<StoreState>;
  return {
    clients: (s.clients ?? []).map(c => ({ ...c, monthlyRetainerAmount: c.monthlyRetainerAmount ?? 0, platforms: c.platforms ?? [] })),
    briefs: s.briefs ?? [],
    deliverables: (s.deliverables ?? []).map(d => ({ seriesId: null, createdAt: new Date().toISOString(), ...d, publishedAt: d.publishedAt ?? null })),
    events: s.events ?? [],
    versions: s.versions ?? [],
    assets: s.assets ?? [],
    tasks: s.tasks ?? [],
    notes: (s.notes ?? []).map(n => ({ ...n, title: n.title ?? '', url: n.url ?? '', kind: n.kind ?? ('idea' as const) })),
    metrics: s.metrics ?? [],
    templates: s.templates ?? [],
    launchTasks: s.launchTasks ?? [],
    launchLeads: (s.launchLeads ?? []).map(l => ({ ...l, linkedClientId: l.linkedClientId ?? null })),
    launchNotes: s.launchNotes ?? [],
    launchGates: (s.launchGates ?? []).map(g => ({ ...g, relatedPhase: g.relatedPhase ?? null })),
    launchSettings: s.launchSettings?.length ? s.launchSettings.map(ls => ({ ...DEFAULT_LAUNCH_SETTINGS, ...ls })) : [DEFAULT_LAUNCH_SETTINGS],
  };
}

function hasServerData(state: Partial<StoreState>): boolean {
  // Core entities only — a stray note/metric must not block the one-time
  // local→server migration of an existing workspace.
  return (state.clients?.length ?? 0) > 0 || (state.deliverables?.length ?? 0) > 0;
}

function queueUpsert(key: CollectionKey, row: Record<string, unknown>) {
  if (!pendingUpserts[key]) pendingUpserts[key] = new Map();
  pendingUpserts[key].set(String(row.id), row);
  pendingDeletes[key]?.delete(String(row.id));
  persistPending();
}

function queueDelete(key: CollectionKey, id: string) {
  if (!pendingDeletes[key]) pendingDeletes[key] = new Set();
  pendingDeletes[key].add(id);
  pendingUpserts[key]?.delete(id);
  persistPending();
}

function hasPending(): boolean {
  return Object.values(pendingUpserts).some(m => m.size > 0) || Object.values(pendingDeletes).some(s => s.size > 0);
}

async function flush() {
  if (!hasPending()) return;
  const upserts: Record<string, Record<string, unknown>[]> = {};
  const deletes: Record<string, string[]> = {};
  for (const [key, map] of Object.entries(pendingUpserts)) {
    if (map.size) upserts[key] = [...map.values()];
  }
  for (const [key, set] of Object.entries(pendingDeletes)) {
    if (set.size) deletes[key] = [...set];
  }
  // Clear optimistically; re-queue on failure
  for (const map of Object.values(pendingUpserts)) map.clear();
  for (const set of Object.values(pendingDeletes)) set.clear();
  persistPending();

  try {
    await api.sync(upserts, deletes);
    setStatus(hasPending() ? 'saving' : 'saved');
  } catch {
    // Re-queue everything and keep working offline
    for (const [key, rows] of Object.entries(upserts)) {
      rows.forEach(row => queueUpsert(key as CollectionKey, row));
    }
    for (const [key, ids] of Object.entries(deletes)) {
      ids.forEach(id => queueDelete(key as CollectionKey, id));
    }
    setStatus('offline');
    ensureRetry();
  }
}

function scheduleFlush() {
  setStatus('saving');
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => { void flush(); }, 700);
}

function ensureRetry() {
  if (retryTimer) return;
  retryTimer = setInterval(() => {
    if (hasPending()) void flush();
    else if (retryTimer) { clearInterval(retryTimer); retryTimer = null; }
  }, 20000);
}

// --- Server pull --------------------------------------------------------------
// Server-side changes (e.g. a client approving via a public review link) never
// reach an open session through the push-only sync. Pull on an interval and on
// window focus; skip entirely while local edits are pending so we never
// clobber unsaved work. Last-writer-wins stays in effect on the push side.

let pullTimer: ReturnType<typeof setInterval> | null = null;
let pulling = false;

async function pullFromServer() {
  if (pulling || hasPending() || !storeState) return;
  pulling = true;
  try {
    const server = normalize(await api.getState());
    const local = store.get();
    let changed = false;
    const next = { ...local };
    for (const key of SYNC_KEYS) {
      if (JSON.stringify(local[key]) !== JSON.stringify(server[key])) {
        (next as Record<string, unknown>)[key] = server[key];
        changed = true;
      }
    }
    if (changed) {
      storeState = next;
      store.save();
    }
  } catch { /* offline — keep local state */ }
  finally { pulling = false; }
}

function startPulling() {
  if (pullTimer || typeof window === 'undefined') return;
  pullTimer = setInterval(() => { void pullFromServer(); }, 30000);
  window.addEventListener('focus', () => { void pullFromServer(); });
}

function diffCollection<K extends CollectionKey>(key: K, prev: StoreState[K], next: StoreState[K]) {
  const prevArr = prev as { id: string }[];
  const nextArr = next as { id: string }[];
  const prevById = new Map(prevArr.map(r => [r.id, r]));
  const nextIds = new Set(nextArr.map(r => r.id));
  for (const row of nextArr) {
    const old = prevById.get(row.id);
    if (!old || JSON.stringify(old) !== JSON.stringify(row)) {
      queueUpsert(key, row as unknown as Record<string, unknown>);
    }
  }
  for (const row of prevArr) {
    if (!nextIds.has(row.id)) queueDelete(key, row.id);
  }
}

export const store = {
  get(): StoreState {
    if (storeState) return storeState;
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('content-desk-db-v1');
      storeState = stored ? normalize(JSON.parse(stored)) : normalize(SEED_DATA);
    } catch {
      storeState = normalize(SEED_DATA);
    }
    if (!stored) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(storeState)); } catch { /* full */ }
    }
    return storeState!;
  },

  save() {
    if (storeState) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(storeState)); } catch { /* quota */ }
      notify();
    }
  },

  subscribe(callback: () => void) {
    subscribers.push(callback);
    return () => { subscribers = subscribers.filter(sub => sub !== callback); };
  },

  subscribeStatus(callback: () => void) {
    statusSubscribers.push(callback);
    return () => { statusSubscribers = statusSubscribers.filter(sub => sub !== callback); };
  },

  getStatus(): SaveStatus { return saveStatus; },
  getLastSavedAt(): string | null { return lastSavedAt; },

  update<K extends CollectionKey>(key: K, data: StoreState[K]) {
    const prev = this.get()[key];
    this.get()[key] = data;
    this.save();
    diffCollection(key, prev, data);
    scheduleFlush();
  },

  /** Pull server state on boot; push local data up if the server is empty. */
  hydrate(): Promise<void> {
    if (hydratePromise) return hydratePromise;
    hydratePromise = (async () => {
      try {
        restorePending();
        const server = await api.getState();
        const local = this.get();
        if (hasPending()) {
          // Offline changes from a previous app session take precedence and
          // are flushed before any server snapshot can replace local state.
          await flush();
          if (hasPending()) throw new Error('Offline changes are still pending');
        } else if (hasServerData(server)) {
          storeState = normalize(server);
          this.save();
        } else if (hasServerData(local)) {
          // One-time migration: push the local workspace up
          const upserts: Record<string, Record<string, unknown>[]> = {};
          for (const key of SYNC_KEYS) {
            const rows = local[key] as Record<string, unknown>[];
            if (rows.length) upserts[key] = rows;
          }
          await api.sync(upserts, {});
        }
        setStatus('saved');
        void api.autoBackup().catch(() => {});
        startPulling();
      } catch {
        setStatus('offline');
        ensureRetry();
      }
    })();
    return hydratePromise;
  },

  exportBackup() {
    return JSON.stringify(this.get(), null, 2);
  },

  importBackup(json: string) {
    try {
      const parsed = JSON.parse(json);
      if (parsed && parsed.clients) {
        storeState = normalize(parsed);
        this.save();
        for (const key of SYNC_KEYS) {
          (storeState[key] as Record<string, unknown>[]).forEach(row => queueUpsert(key, row));
        }
        scheduleFlush();
        return true;
      }
    } catch { /* invalid */ }
    return false;
  },

  /** Replace local state with a server snapshot, mirroring it exactly:
   *  entities absent from the snapshot are deleted server-side too. */
  restoreFromState(state: Partial<StoreState>) {
    const current = this.get();
    const restored = normalize(state);
    for (const key of SYNC_KEYS) {
      const restoredIds = new Set((restored[key] as { id: string }[]).map(r => r.id));
      (current[key] as { id: string }[]).forEach(row => {
        if (!restoredIds.has(row.id)) queueDelete(key, row.id);
      });
      (restored[key] as Record<string, unknown>[]).forEach(row => queueUpsert(key, row));
    }
    storeState = restored;
    this.save();
    scheduleFlush();
  },
};
