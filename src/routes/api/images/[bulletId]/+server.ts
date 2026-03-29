import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { getSignedGetUrl } from '$lib/server/r2';

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

export async function GET({ params, platform, cookies }: RequestEvent) {
  const db = getDb(platform?.env);
  if (!db) return json({ error: 'Database not configured' }, { status: 500 });

  const userId = getUserFromCookies(cookies);
  if (!userId) return json({ error: 'Not authenticated' }, { status: 401 });

  const { bulletId } = params;

  const bullet = await db
    .prepare('SELECT id, user_id, image_key, image_url FROM bullets WHERE id = ? AND user_id = ?')
    .bind(bulletId, userId)
    .first();

  if (!bullet) return json({ error: 'Not found' }, { status: 404 });

  const imageKey = (bullet as any).image_key;
  const imageUrl = (bullet as any).image_url;

  if (!imageKey) {
    return json({ error: 'No image attached' }, { status: 404 });
  }

  const cfg = getR2Config(platform?.env);
  if (!cfg.accountId || !cfg.accessKeyId || !cfg.secretAccessKey) {
    return json({ error: 'R2 not configured' }, { status: 500 });
  }

  // Generate a short-lived pre-signed URL and redirect the browser to it
  // R2 serves the image directly — Worker never touches the bytes
  const signedUrl = await getSignedGetUrl(imageKey, cfg);

  return new Response(null, {
    status: 302,
    headers: {
      'Location': signedUrl,
      'Cache-Control': 'private, max-age=60', // short cache since URL is temp
    },
  });
}
