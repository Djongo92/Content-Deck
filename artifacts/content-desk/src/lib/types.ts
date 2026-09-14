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
};

export type SaveStatus = 'saved' | 'saving' | 'offline' | 'loading';
