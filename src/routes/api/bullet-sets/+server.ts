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

export async function GET({ platform, cookies }: RequestEvent) {
  const db = getDb(platform?.env);
  if (!db) return json({ error: 'Database not configured' }, { status: 500 });

  const userId = getUserFromCookies(cookies, platform?.env);
  if (!userId) return json({ error: 'Not authenticated' }, { status: 401 });

  const sets = await db
    .prepare('SELECT * FROM bullet_sets WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC')
    .bind(userId)
    .all();

  // Get bullet counts per set
  const counts = await db
    .prepare('SELECT set_id, COUNT(*) as count FROM bullets WHERE user_id = ? AND set_id IS NOT NULL GROUP BY set_id')
    .bind(userId)
    .all();

  const countMap: Record<string, number> = {};
  for (const row of counts.results) {
    countMap[row.set_id as string] = row.count as number;
  }

  const setsWithCounts = sets.results.map((s: any) => ({
    ...s,
    bullet_count: countMap[s.id] ?? 0,
  }));

  return json({ sets: setsWithCounts });
}

export async function POST({ request, platform, cookies }: RequestEvent) {
  const db = getDb(platform?.env);
  if (!db) return json({ error: 'Database not configured' }, { status: 500 });

  const userId = getUserFromCookies(cookies, platform?.env);
  if (!userId) return json({ error: 'Not authenticated' }, { status: 401 });

  const body = await request.json();
  const { id, name = 'Untitled Set', sort_order = 0 } = body;

  if (!id) return json({ error: 'id is required' }, { status: 400 });

  await db
    .prepare(
      `INSERT OR REPLACE INTO bullet_sets (id, user_id, name, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, unixepoch(), unixepoch())`
    )
    .bind(id, userId, name, sort_order)
    .run();

  return json({ ok: true });
}
