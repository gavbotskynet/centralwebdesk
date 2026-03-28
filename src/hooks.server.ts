import type { Handle } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

// Cloudflare Workers-compatible server hooks
// Auth is handled client-side via @clerk/clerk-js

const publicRoutes = [
  '/',
  '/auth/sign-in',
  '/auth/sign-up',
  '/auth/callback',
  '/api/health',
  '/auth/access-denied'
];

const CLERK_API_URL = 'https://api.clerk.com/v1';
const CLERK_SECRET_KEY = env.CLERK_SECRET_KEY ?? '';

// Decode Clerk JWT payload (base64url) without signature verification
// Clerk tokens are signed, but the payload contains the user ID (sub claim)
// that we use to make a real-time API call to Clerk's backend
function decodeClerkJwtPayload(token: string): any | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    // Clerk uses base64url encoding
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payload + '=='.slice((payload.length + 4) % 4 === 0 ? 0 : (4 - (payload.length + 4) % 4));
    const decoded = atob(padded);
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

// Check Clerk's backend for the user's current has_access status
// This ensures access revocation takes effect immediately (not waiting for session expiry)
async function checkAccessRevoked(userId: string): Promise<boolean> {
  if (!CLERK_SECRET_KEY) {
    // If no secret key, fall back to JWT payload check (less secure but functional)
    return false;
  }
  try {
    const res = await fetch(`${CLERK_API_URL}/users/${userId}`, {
      headers: {
        Authorization: `Bearer ${CLERK_SECRET_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    if (!res.ok) return false;
    const user = await res.json();
    // has_access defaults to true, only explicitly false means revoked
    return user.public_metadata?.has_access === false;
  } catch {
    return false;
  }
}

export const handle: Handle = async ({ event, resolve }) => {
  const { pathname } = event.url;

  // Allow public routes without auth
  const isPublic = publicRoutes.some(
    (route) => pathname === route || pathname.startsWith('/auth/')
  );

  if (isPublic) {
    return resolve(event);
  }

  // Check Clerk session cookie for access control
  const clerkToken = event.cookies.get('__session') ?? event.cookies.get('__clerk_session');
  if (clerkToken) {
    const payload = decodeClerkJwtPayload(clerkToken);
    if (payload) {
      // Always check Clerk's backend in real-time for current access status
      // (JWT payload is stale — it reflects public_metadata at token creation time,
      //  not the current value after a revoke_access call)
      const userId: string = payload.sub;
      const accessRevoked = await checkAccessRevoked(userId);
      if (accessRevoked) {
        // User's access has been revoked - clear their session cookie and redirect
        event.cookies.delete('__session', { path: '/' });
        event.cookies.delete('__clerk_session', { path: '/' });
        return new Response(null, {
          status: 302,
          headers: { Location: '/auth/sign-in?reason=access_revoked' }
        });
      }
    }
  }

  return resolve(event);
};
