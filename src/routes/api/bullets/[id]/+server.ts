import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';

function getDb(env: any) {
  return env.DB;
}

function getUserFromCookies(cookies: any, env: any): string {
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

export async function PUT({ params, request, platform, cookies }: RequestEvent) {
  const db = getDb(platform?.env);
  if (!db) return json({ error: 'Database not configured' }, { status: 500 });

  const userId = getUserFromCookies(cookies, platform?.env);
  if (!userId) return json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = params;
  const body = await request.json();
  const { content, bullet_type, status, indent, sort_order, collapsed, set_id, parent_id } = body;

  const existing = await db
    .prepare('SELECT id FROM bullets WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .first();

  if (!existing) return json({ error: 'Not found' }, { status: 404 });

  await db
    .prepare(
      `UPDATE bullets SET
        content = COALESCE(?, content),
        bullet_type = COALESCE(?, bullet_type),
        status = COALESCE(?, status),
        indent = COALESCE(?, indent),
        sort_order = COALESCE(?, sort_order),
        collapsed = COALESCE(?, collapsed),
        set_id = COALESCE(?, set_id),
        parent_id = ?,
        updated_at = unixepoch()
       WHERE id = ? AND user_id = ?`
    )
    .bind(
      content ?? null,
      bullet_type ?? null,
      status ?? null,
      indent ?? null,
      sort_order ?? null,
      collapsed ?? null,
      set_id ?? null,
      parent_id,
      id,
      userId
    )
    .run();

  return json({ ok: true });
}

export async function DELETE({ params, platform, cookies }: RequestEvent) {
  const db = getDb(platform?.env);
  if (!db) return json({ error: 'Database not configured' }, { status: 500 });

  const userId = getUserFromCookies(cookies, platform?.env);
  if (!userId) return json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = params;

  // Fetch the bullet first to get its image_key (if any)
  const bullet = await db
    .prepare('SELECT id, image_key FROM bullets WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .first();

  if (!bullet) return json({ error: 'Not found' }, { status: 404 });

  const imageKey = (bullet as any).image_key;

  // Delete image from R2 if present
  if (imageKey) {
    try {
      const { deleteFromR2 } = await import('$lib/server/r2');
      const cfg = {
        bucket: platform?.env?.R2_BUCKET_NAME ?? 'centralwebdesk-files',
        accountId: platform?.env?.CLOUDFLARE_ACCOUNT_ID ?? '',
        accessKeyId: platform?.env?.R2_ACCESS_KEY_ID ?? '',
        secretAccessKey: platform?.env?.R2_SECRET_ACCESS_KEY ?? '',
      };
      await deleteFromR2(imageKey, cfg);
    } catch { /* ignore R2 delete errors */ }
  }

  await db
    .prepare('DELETE FROM bullets WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .run();

  return json({ ok: true });
}
