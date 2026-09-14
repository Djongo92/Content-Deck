import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export class ObjectNotFoundError extends Error {
  constructor() {
    super('Object not found');
    this.name = 'ObjectNotFoundError';
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

// This app never used per-object ACLs beyond "public" in practice -- every
// upload is created with visibility: "public" (see routes/storage.ts) so
// review-link snapshots can render media without the client needing an
// account. The Supabase bucket itself is public, which is that same policy
// enforced one level up; this type is kept only so callers don't change.
export interface ObjectAclPolicy {
  owner: string;
  visibility: 'public' | 'private';
}

function getSupabaseClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  // The anon/publishable key, not a secret service-role key: this bucket's
  // RLS policies (see the "media_bucket_public_policies" migration) allow
  // the anon role to read/write it directly, matching the rest of this
  // single-user, no-real-auth app -- nothing here was gated by a secret
  // before, so this doesn't lower the bar, and it's one less credential to
  // configure at deploy time.
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_ANON_KEY must be set for media storage.',
    );
  }
  return createClient(url, anonKey);
}

function getBucket(): string {
  return process.env.SUPABASE_STORAGE_BUCKET || 'content-desk-media';
}

export class ObjectStorageService {
  /**
   * Uploads flow through this server (PUT /api/storage/uploads/direct/:id,
   * see routes/storage.ts) rather than a client-side PUT straight to a
   * cloud-signed URL: Supabase's own signed-upload flow uses a different
   * request shape than the plain PUT this app's frontend already does, and
   * routing the bytes through here -- then out to Supabase with the
   * service-role key -- avoided changing that contract just to swap the
   * storage backend.
   */
  getObjectEntityUploadURL(objectId: string): string {
    return `/api/storage/uploads/direct/${objectId}`;
  }

  async uploadObject(
    objectId: string,
    body: Buffer,
    contentType: string,
  ): Promise<void> {
    const { error } = await getSupabaseClient()
      .storage.from(getBucket())
      .upload(`uploads/${objectId}`, body, { contentType, upsert: true });
    if (error) {
      throw new Error(`Upload failed: ${error.message}`);
    }
  }

  /**
   * Accepts either the upload URL this service just handed out or an
   * already-normalized /objects/... path, and returns the stable
   * /objects/uploads/{id} reference the rest of the app stores as fileUrl
   * and fetches through the GET route below.
   */
  normalizeObjectEntityPath(rawPath: string): string {
    const match =
      rawPath.match(/uploads\/direct\/([^/?]+)/) ??
      rawPath.match(/^\/objects\/uploads\/([^/?]+)/);
    const id = match?.[1];
    return id ? `/objects/uploads/${id}` : rawPath;
  }

  async downloadObject(
    objectPath: string,
    cacheTtlSec: number = 3600,
  ): Promise<Response> {
    if (!objectPath.startsWith('/objects/')) {
      throw new ObjectNotFoundError();
    }
    const path = objectPath.slice('/objects/'.length);
    const { data, error } = await getSupabaseClient()
      .storage.from(getBucket())
      .download(path);
    if (error || !data) {
      throw new ObjectNotFoundError();
    }

    return new Response(data, {
      headers: {
        'Content-Type': data.type || 'application/octet-stream',
        'Cache-Control': `public, max-age=${cacheTtlSec}`,
      },
    });
  }

  // No-op: see the ObjectAclPolicy comment above -- there's no per-object
  // policy left to enforce once the bucket itself is public. Kept only so
  // routes/storage.ts doesn't need to change.
  async trySetObjectEntityAclPolicy(
    rawPath: string,
    _aclPolicy: ObjectAclPolicy,
  ): Promise<string> {
    return this.normalizeObjectEntityPath(rawPath);
  }
}
