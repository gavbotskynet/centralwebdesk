import type { Handle } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

// Cloudflare Workers-compatible server hooks
// Auth is handled client-side via @clerk/clerk-js

const publicRoutes = [
  '/',
  '/auth/sign-in',
  '/auth/sign-up',
  '/auth/callback',
  '/api/health'
];

// Decode Clerk JWT payload (base64url) without signature verification
// Clerk tokens are signed, but for access control we decode the payload
// which contains public_metadata set at token creation time
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
      // has_access defaults to true, only explicitly false means revoked
      const hasAccess = payload.public_metadata?.has_access;
      if (hasAccess === false) {
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
