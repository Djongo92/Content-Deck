export type Client = {
  id: string;
  name: string;
  color: string;
  archived: boolean;
  voice: string;
  audience: string;
  pillars: string[];
  approvedTerms: string[];
  avoidedTerms: string[];
  timezone: string;
  monthlyRetainerHours: number;
  monthlyDeliverableTarget: number;
  monthlyRetainerAmount: number;
  /** Social platforms enabled for this client. Empty/absent = all platforms available. */
  platforms?: string[];
};

export const ALL_PLATFORMS = ['Instagram', 'Facebook', 'TikTok', 'LinkedIn', 'YouTube', 'Newsletter', 'Web'] as const;

/** Platforms enabled for a client; an empty/absent list means all platforms. */
export function resolvePlatforms(client?: { platforms?: string[] } | null): string[] {
  return client?.platforms?.length ? client.platforms : [...ALL_PLATFORMS];
}

export type Brief = {
  id: string;
  clientId: string;
  title: string;
  objective: string;
  essentialFacts: string;
  keyMessage: string;
  campaign: string;
  sourceLinks: string[];
  createdAt: string;
};

export type DeliverableProductionStatus = 'idea' | 'in-progress' | 'in-review' | 'changes-requested' | 'approved';
export type DeliverablePublishingStatus = 'not-scheduled' | 'scheduled' | 'published';

export type PerformanceMetrics = {
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  clicks?: number;
};

export type Deliverable = {
  id: string;
  briefId: string | null;
  clientId: string;
  platform: string;
  format: string;
  title: string;
  copy: string;
  productionStatus: DeliverableProductionStatus;
  publishingStatus: DeliverablePublishingStatus;
  owner: string;
  productionDueAt: string | null;
  publishAt: string | null;
  publishedAt: string | null;
  assetChecklist: string[];
  approvedVersionId: string | null;
  currentVersionId: string | null;
  estimatedHours: number;
  actualHours: number;
  performance: PerformanceMetrics;
  seriesId?: string | null;
  createdAt?: string;
};

export type Version = {
  id: string;
  deliverableId: string;
  copy: string;
  assetIds: string[];
  createdAt: string;
  approvalState: 'pending' | 'approved' | 'rejected';
  approver: string | null;
  approvalTimestamp: string | null;
};

export type Asset = {
  id: string;
  clientId: string;
  name: string;
  type: 'image' | 'video' | 'audio' | 'document';
  fileUrl: string;
  tags: string[];
  credit: string;
  rightsExpiry: string | null;
  altText: string;
};

export type Task = { id: string; text: string; done: boolean; createdAt: string };

export type CalendarEvent = {
  id: string;
  title: string;
  description: string;
  eventType: 'shoot' | 'performance' | 'meeting' | 'other';
  clientId: string | null;
  location: string;
  startAt: string;
  endAt: string;
  createdAt: string;
};

export type Note = {
  id: string;
  date: string;
  text: string;
  title: string;
  url: string;
  kind: 'idea' | 'capture';
};

export type Metric = {
  id: string;
  deliverableId: string;
  capturedAt: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  clicks: number;
  source: string;
};

export type Template = {
  id: string;
  clientId: string;
  title: string;
  platform: string;
  format: string;
  copyTemplate: string;
  checklist: string[];
  estimatedHours: number;
  frequency: 'weekly' | 'biweekly' | 'monthly';
  dayOfWeek: number; // 0=Sunday
  timeOfDay: string; // HH:mm
  active: boolean;
  lastGeneratedOn: string | null; // YYYY-MM-DD
};

export type ReviewLink = {
  token: string;
  deliverableId: string;
  versionId: string;
  status: 'pending' | 'approved' | 'changes-requested' | 'expired';
  approverName: string | null;
  comment: string | null;
  createdAt: string;
  respondedAt: string | null;
  expiresAt: string;
  path: string;
};

// --- Launch planner (Algo-Rhythm Studio Launch Companion) -------------------

export const LAUNCH_PHASE_LABELS = [
  'Foundation',
  'Commercial assets',
  'Market validation',
  'Legal & operational',
  'Launch prep',
  'Public launch',
] as const;

export type LaunchTask = {
  id: string;
  title: string;
  due: string;
  phase: number;
  owner: string;
  done: boolean;
  createdAt: string;
  notes: string;
  seriesId: string | null;
};

export type LaunchLeadStatus = 'Lead' | 'Contacted' | 'Proposal' | 'Active' | 'Paused' | 'Closed';

export type LaunchLead = {
  id: string;
  name: string;
  status: LaunchLeadStatus;
  fee: number;
  hours: number;
  next: string;
  linkedClientId: string | null;
};

export type LaunchNoteKind = 'journal' | 'idea' | 'market';

export type LaunchNote = {
  id: string;
  date: string;
  title: string;
  text: string;
  kind: LaunchNoteKind;
  x: number | null;
  y: number | null;
  color: string | null;
};

export const STICKY_COLORS = ['#f7d774', '#8bd3c7', '#f5a6a6', '#a8c7f0', '#c9a8e8'] as const;

export type LaunchGateKind = 'milestone' | 'question';

export type LaunchGate = {
  id: string;
  title: string;
  description: string;
  done: boolean;
  relatedPhase: number | null;
  kind: LaunchGateKind;
};

export type LaunchActivity = {
  id: string;
  at: string;
  summary: string;
  kind: string;
  refId: string | null;
  refType: string | null;
};

export type LaunchRecurringTask = {
  id: string;
  title: string;
  phase: number;
  owner: string;
  frequency: 'weekly' | 'biweekly' | 'monthly';
  dayOfWeek: number;
  active: boolean;
  lastGeneratedOn: string | null;
};

export type CaseStudy = {
  id: string;
  clientId: string;
  title: string;
  narrative: string;
  deliverableIds: string[];
  createdAt: string;
};

export type LaunchSettings = {
  id: string;
  weeklyHours: number;
  adminPercent: number;
  monthlyCosts: number;
  monthlyReserve: number;
  brandName: string;
  headline: string;
  proposition: string;
  visualDirection: string;
  domain: string;
  clearance: string;
  stack: string;
  launchDate: string;
};

export const DEFAULT_LAUNCH_SETTINGS: LaunchSettings = {
  id: 'default',
  weeklyHours: 20,
  adminPercent: 25,
  monthlyCosts: 0,
  monthlyReserve: 0,
  brandName: '',
  headline: '',
  proposition: '',
  visualDirection: '',
  domain: '',
  clearance: 'Not checked',
  stack: '',
  launchDate: '',
};

export type StoreState = {
  clients: Client[];
  briefs: Brief[];
  deliverables: Deliverable[];
  events: CalendarEvent[];
  versions: Version[];
  assets: Asset[];
  tasks: Task[];
  notes: Note[];
  metrics: Metric[];
  templates: Template[];
  launchTasks: LaunchTask[];
  launchLeads: LaunchLead[];
  launchNotes: LaunchNote[];
  launchGates: LaunchGate[];
  launchSettings: LaunchSettings[];
  launchActivity: LaunchActivity[];
  launchRecurringTasks: LaunchRecurringTask[];
  caseStudies: CaseStudy[];
};

export type SaveStatus = 'saved' | 'saving' | 'offline' | 'loading';
