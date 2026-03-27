import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestEvent } from '@sveltejs/kit';

const CLERK_API_URL = 'https://api.clerk.com/v1';
const CLERK_SECRET_KEY = env.CLERK_SECRET_KEY ?? '';

function clerkFetch(path: string, options?: RequestInit) {
  return fetch(`${CLERK_API_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${CLERK_SECRET_KEY}`,
      'Content-Type': 'application/json',
      ...options?.headers
    }
  });
}

export async function GET({ url }: RequestEvent) {
  if (!CLERK_SECRET_KEY) {
    return json({ error: 'Clerk secret key not configured' }, { status: 500 });
  }

  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50'), 100);
  const offset = parseInt(url.searchParams.get('offset') ?? '0');
  const search = url.searchParams.get('search') ?? '';

  try {
    const params = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString(),
      ...(search ? { query: search } : {})
    });

    const res = await clerkFetch(`/users?${params}`);
    const raw = await res.json();

    if (!res.ok) {
      return json({ error: (raw as any)?.message ?? 'Clerk API error' }, { status: res.status });
    }

    // Clerk v1 API returns an array of users directly
    const userList: any[] = Array.isArray(raw) ? raw : [];

    const users = userList.map((user: any) => ({
      id: user.id,
      email: user.email_addresses?.[0]?.email_address ?? '—',
      name: [user.first_name, user.last_name].filter(Boolean).join(' ') || '—',
      imageUrl: user.image_url,
      createdAt: user.created_at,
      lastSignInAt: user.last_sign_in_at,
      isAdmin: user.public_metadata?.is_admin === true,
      hasAccess: user.public_metadata?.has_access !== false
    }));

    return json({
      users,
      total: users.length
    });
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
  }
}
