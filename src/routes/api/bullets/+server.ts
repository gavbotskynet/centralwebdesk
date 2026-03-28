import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';

function getDb(env: any) {
  return env.DB;
}

function getUserFromSession(request: Request, env: any): string {
  const authHeader = request.headers.get('Authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const cookieName = ['__session', '__clerk_session', 'clerk_session'].find(
    (c) => env?.Cookies?.[c] || (typeof document !== 'undefined' && document.cookie.includes(c))
  );
  const cookieVal = cookieName
    ? (typeof document !== 'undefined'
      ? document.cookie.split(`${cookieName}=`)[1]?.split(';')[0]
      : undefined)
    : undefined;
  const token = bearerToken ?? cookieVal;

  if (!token) return '';
  try {
    const parts = token.split('.');
    if (parts.length === 3) {
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      return payload.sub ?? '';
    }
  } catch { /* ignore */ }
  return '';
}

function getUserFromCookies(cookies: any, env: any): string {
  // Try Clerk session cookie
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

export async function GET({ url, platform, cookies }: RequestEvent) {
  const db = getDb(platform?.env);
  if (!db) return json({ error: 'Database not configured' }, { status: 500 });

  const userId = getUserFromCookies(cookies, platform?.env);
  if (!userId) return json({ error: 'Not authenticated' }, { status: 401 });

  const setId = url.searchParams.get('set_id');
  let stmt: string;
  let bindings: any[];

  if (setId === null) {
    // No filter — return all bullets
    stmt = 'SELECT * FROM bullets WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC';
    bindings = [userId];
  } else if (setId === 'null') {
    // Explicitly filtering to uncategorized bullets
    stmt = 'SELECT * FROM bullets WHERE user_id = ? AND set_id IS NULL ORDER BY sort_order ASC, created_at ASC';
    bindings = [userId];
  } else {
    // Specific set
    stmt = 'SELECT * FROM bullets WHERE user_id = ? AND set_id = ? ORDER BY sort_order ASC, created_at ASC';
    bindings = [userId, setId];
  }

  const bullets = await db.prepare(stmt).bind(...bindings).all();
  return json({ bullets: bullets.results });
}

export async function POST({ request, platform, cookies }: RequestEvent) {
  const db = getDb(platform?.env);
  if (!db) return json({ error: 'Database not configured' }, { status: 500 });

  const userId = getUserFromCookies(cookies, platform?.env);
  if (!userId) return json({ error: 'Not authenticated' }, { status: 401 });

  const body = await request.json();
  const { id, content = '', bullet_type = 'task', status = 'open', indent = 0, sort_order = 0, collapsed = false, set_id } = body;

  if (!id) return json({ error: 'id is required' }, { status: 400 });

  await db
    .prepare(
      `INSERT OR REPLACE INTO bullets (id, user_id, content, bullet_type, status, indent, sort_order, collapsed, set_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch(), unixepoch())`
    )
    .bind(id, userId, content, bullet_type, status, indent, sort_order, collapsed ? 1 : 0, set_id ?? null)
    .run();

  return json({ ok: true });
}
