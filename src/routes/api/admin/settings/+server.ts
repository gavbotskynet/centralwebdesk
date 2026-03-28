import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';

const ADMIN_EMAILS = ['gavinpretorius@gmail.com'];

function getDb(env: any) {
  return env.DB;
}

export async function GET({ platform }: RequestEvent) {
  const db = getDb(platform?.env);
  if (!db) {
    return json({ error: 'Database not configured' }, { status: 500 });
  }

  const result = await db
    .prepare('SELECT value FROM global_settings WHERE key = ?')
    .bind('allow_signups')
    .first<{ value: string }>();

  return json({ allow_signups: result?.value === 'true' });
}

export async function POST({ request, platform, cookies }: RequestEvent) {
  const db = getDb(platform?.env);
  if (!db) {
    return json({ error: 'Database not configured' }, { status: 500 });
  }

  // Get Clerk session token from cookie or Authorization header
  const authHeader = request.headers.get('Authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const clerkToken = bearerToken ?? cookies.get('__session') ?? cookies.get('__clerk_session');
  if (!clerkToken) {
    return json({ error: 'Not authenticated' }, { status: 401 });
  }

  // Decode JWT to get user ID (sub claim)
  let userId = '';
  try {
    const parts = clerkToken.split('.');
    if (parts.length === 3) {
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      userId = payload.sub ?? '';
    }
  } catch {
    return json({ error: 'Invalid session' }, { status: 401 });
  }

  if (!userId) {
    return json({ error: 'Invalid session: no user ID' }, { status: 401 });
  }

  // Look up the user's email from Clerk's Backend API
  const secretKey = platform?.env?.CLERK_SECRET_KEY ?? '';
  let userEmail = '';
  if (secretKey && userId) {
    try {
      const userRes = await fetch(`https://api.clerk.com/v1/users/${userId}`, {
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json'
        }
      });
      if (userRes.ok) {
        const userData = await userRes.json();
        userEmail =
          userData.email_addresses?.find(
            (e: any) => e.id === userData.primary_email_address_id
          )?.email_address
          ?? userData.email_addresses?.[0]?.email_address
          ?? '';
      }
    } catch {
      // ignore — userEmail stays empty
    }
  }

  if (!ADMIN_EMAILS.includes(userEmail)) {
    return json(
      { error: 'Not authorized', debug: { userEmail, userId, hasSecret: !!secretKey } },
      { status: 403 }
    );
  }

  const body = await request.json();
  const { allow_signups } = body;

  if (typeof allow_signups !== 'boolean') {
    return json({ error: 'allow_signups must be a boolean' }, { status: 400 });
  }

  await db
    .prepare(
      `INSERT INTO global_settings (key, value, updated_at, updated_by)
       VALUES (?, ?, unixepoch(), ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`
    )
    .bind('allow_signups', String(allow_signups), userEmail)
    .run();

  return json({ ok: true, allow_signups });
}
