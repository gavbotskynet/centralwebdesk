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

export async function POST({ request }: RequestEvent) {
  if (!CLERK_SECRET_KEY) {
    return json({ error: 'Clerk secret key not configured' }, { status: 500 });
  }

  const body = await request.json();
  const { action, userId } = body;

  if (!action || !userId) {
    return json({ error: 'Missing action or userId' }, { status: 400 });
  }

  if (action === 'grant') {
    // Update Clerk's public_metadata for the user
    const res = await clerkFetch(`/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ public_metadata: { is_admin: true } })
    });

    if (!res.ok) {
      const err = await res.json();
      return json({ error: (err as any)?.message ?? 'Failed to grant admin' }, { status: res.status });
    }
    return json({ ok: true, action: 'grant', userId });
  }

  if (action === 'revoke') {
    const res = await clerkFetch(`/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ public_metadata: { is_admin: false } })
    });

    if (!res.ok) {
      const err = await res.json();
      return json({ error: (err as any)?.message ?? 'Failed to revoke admin' }, { status: res.status });
    }
    return json({ ok: true, action: 'revoke', userId });
  }

  if (action === 'grant_access') {
    const res = await clerkFetch(`/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ public_metadata: { has_access: true } })
    });

    if (!res.ok) {
      const err = await res.json();
      return json({ error: (err as any)?.message ?? 'Failed to grant access' }, { status: res.status });
    }
    return json({ ok: true, action: 'grant_access', userId });
  }

  if (action === 'revoke_access') {
    const res = await clerkFetch(`/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ public_metadata: { has_access: false } })
    });

    if (!res.ok) {
      const err = await res.json();
      return json({ error: (err as any)?.message ?? 'Failed to revoke access' }, { status: res.status });
    }
    return json({ ok: true, action: 'revoke_access', userId });
  }

  return json({ error: 'Unknown action' }, { status: 400 });
}
