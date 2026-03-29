import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { uploadToR2 } from '$lib/server/r2';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif'];

function getDb(env: any) {
  return env.DB;
}

function getUserFromCookies(cookies: any): string {
  const clerkCookie = cookies.get('__session') ?? cookies.get('__clerk_session') ?? cookies.get('session');
  if (!clerkCookie) return '';
  try {
    const parts = clerkCookie.split('.');
    if (parts.length === 3) {
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      return payload.sub ?? '';
    }
  } catch { /* ignore */ }
  return '';
}

function getR2Config(env: any) {
  return {
    bucket: env.R2_BUCKET_NAME ?? 'centralwebdesk-files',
    accountId: env.CLOUDFLARE_ACCOUNT_ID ?? '',
    accessKeyId: env.R2_ACCESS_KEY_ID ?? '',
    secretAccessKey: env.R2_SECRET_ACCESS_KEY ?? '',
  };
}

export async function POST({ params, request, platform, cookies }: RequestEvent) {
  const db = getDb(platform?.env);
  if (!db) return json({ error: 'Database not configured' }, { status: 500 });

  const userId = getUserFromCookies(cookies);
  if (!userId) return json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = params;

  // Verify bullet belongs to user
  const existing = await db
    .prepare('SELECT id, image_key FROM bullets WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .first();

  if (!existing) return json({ error: 'Not found' }, { status: 404 });

  // Parse content-type and size from headers before reading body
  const contentType = request.headers.get('content-type') ?? '';
  const contentLengthStr = request.headers.get('content-length');
  const contentLength = contentLengthStr ? parseInt(contentLengthStr, 10) : 0;

  if (!ALLOWED_TYPES.includes(contentType.toLowerCase())) {
    return json({ error: `Unsupported file type: ${contentType}. Allowed: JPEG, PNG, GIF, WebP, AVIF.` }, { status: 400 });
  }

  if (contentLength > MAX_FILE_SIZE) {
    return json({ error: 'File too large. Maximum size is 10MB.' }, { status: 400 });
  }

  // Read the body
  const arrayBuffer = await request.arrayBuffer();

  if (arrayBuffer.byteLength > MAX_FILE_SIZE) {
    return json({ error: 'File too large. Maximum size is 10MB.' }, { status: 400 });
  }

  // Build filename: {bullet-id}-{timestamp}.{ext}
  const ext = extFromMime(contentType);
  const filename = `${id}-${Date.now()}.${ext}`;

  const cfg = getR2Config(platform?.env);
  if (!cfg.accountId || !cfg.accessKeyId || !cfg.secretAccessKey) {
    return json({ error: 'R2 not configured' }, { status: 500 });
  }

  // Delete old image from R2 if one exists
  const oldImageKey = (existing as any).image_key;
  if (oldImageKey) {
    try {
      const { deleteFromR2 } = await import('$lib/server/r2');
      await deleteFromR2(oldImageKey, cfg);
    } catch { /* ignore deletion errors */ }
  }

  // Upload new image
  let result;
  try {
    result = await uploadToR2(arrayBuffer, filename, contentType, cfg);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('R2 upload error:', msg);
    return json({ error: 'Upload failed: ' + msg }, { status: 500 });
  }

  // Update bullet in D1
  await db
    .prepare('UPDATE bullets SET image_key = ?, image_url = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?')
    .bind(result.key, result.url, id, userId)
    .run();

  return json({ ok: true, image_url: result.url, image_key: result.key });
}

export async function DELETE({ params, platform, cookies }: RequestEvent) {
  const db = getDb(platform?.env);
  if (!db) return json({ error: 'Database not configured' }, { status: 500 });

  const userId = getUserFromCookies(cookies);
  if (!userId) return json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = params;

  const existing = await db
    .prepare('SELECT id, image_key FROM bullets WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .first();

  if (!existing) return json({ error: 'Not found' }, { status: 404 });

  const oldImageKey = (existing as any).image_key;
  if (oldImageKey) {
    try {
      const { deleteFromR2 } = await import('$lib/server/r2');
      const cfg = getR2Config(platform?.env);
      await deleteFromR2(oldImageKey, cfg);
    } catch { /* ignore deletion errors */ }
  }

  await db
    .prepare('UPDATE bullets SET image_key = NULL, image_url = NULL, updated_at = unixepoch() WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .run();

  return json({ ok: true });
}

function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/avif': 'avif',
  };
  return map[mime.toLowerCase()] ?? 'bin';
}
