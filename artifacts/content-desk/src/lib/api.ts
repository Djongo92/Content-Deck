import type { Metric, ReviewLink, StoreState, Template } from './types';

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } : init?.headers,
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch { /* keep default */ }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export type ServerState = StoreState & {
  voiceExamples: { id: string; clientId: string; kind: string; original: string; final: string; createdAt: string }[];
};

export const api = {
  getState: () => req<ServerState>('/api/state'),

  sync: (upserts: Record<string, Record<string, unknown>[]>, deletes: Record<string, string[]>) =>
    req<{ ok: boolean }>('/api/sync', { method: 'POST', body: JSON.stringify({ upserts, deletes }) }),

  autoBackup: () => req<{ created: boolean; id?: string }>('/api/backups/auto', { method: 'POST', body: '{}' }),
  createBackup: (reason: string) => req<{ created: boolean; id: string }>('/api/backups', { method: 'POST', body: JSON.stringify({ reason }) }),
  listBackups: () => req<{ backups: { id: string; createdAt: string; reason: string }[] }>('/api/backups'),
  getBackup: (id: string) => req<{ id: string; createdAt: string; reason: string; state: ServerState }>(`/api/backups/${id}`),

  capture: (input: { url?: string; title?: string; text?: string }) =>
    req<{ ok: boolean }>('/api/capture', { method: 'POST', body: JSON.stringify(input) }),

  importMetrics: (rows: Partial<Metric>[]) =>
    req<{ imported: number }>('/api/metrics/import', { method: 'POST', body: JSON.stringify({ rows }) }),

  recordVoice: (input: { clientId: string; kind: 'kept' | 'edited' | 'rejected'; original: string; final: string }) =>
    req<{ ok: boolean }>('/api/voice', { method: 'POST', body: JSON.stringify(input) }),

  createReviewLink: (deliverableId: string, versionId?: string) =>
    req<{ token: string; path: string; expiresAt: string }>('/api/review-links', {
      method: 'POST',
      body: JSON.stringify({ deliverableId, versionId }),
    }),

  listReviewLinks: (deliverableId?: string) =>
    req<{ links: ReviewLink[] }>(`/api/review-links${deliverableId ? `?deliverableId=${encodeURIComponent(deliverableId)}` : ''}`),

  ai: (body: Record<string, string>) =>
    req<{ result: string }>('/api/content-ai', { method: 'POST', body: JSON.stringify(body) }),

  clarify: (body: { text: string; clientContext?: string; platform?: string; instructions?: string }) =>
    req<{ question: string | null }>('/api/content-ai/clarify', { method: 'POST', body: JSON.stringify(body) }),

  draftWeek: (body: {
    clientName: string; voice?: string; pillars?: string[]; topPerformers?: string;
    links?: string; instructions?: string; platforms?: string[]; days?: number; clientId?: string;
  }) => req<{ drafts: { day: string; title: string; platform: string; format: string; copy: string; checklist: string[] }[] }>(
    '/api/content-ai/draft-week', { method: 'POST', body: JSON.stringify(body) }),

  autoTag: (image: string) =>
    req<{ altText: string; tags: string[] }>('/api/content-ai/auto-tag', { method: 'POST', body: JSON.stringify({ image }) }),

  requestUploadUrl: (meta: { name: string; size: number; contentType: string }) =>
    req<{ uploadURL: string; objectPath: string }>('/api/storage/uploads/request-url', {
      method: 'POST', body: JSON.stringify(meta),
    }),
};

export type { Template };
