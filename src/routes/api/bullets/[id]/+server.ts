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
  const { content, bullet_type, status, indent, sort_order, collapsed, set_id } = body;

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

  await db
    .prepare('DELETE FROM bullets WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .run();

  return json({ ok: true });
}
