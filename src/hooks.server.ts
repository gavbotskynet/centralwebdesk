import type { Handle } from '@sveltejs/kit';

// Cloudflare Workers-compatible server hooks
// Auth is handled client-side via @clerk/clerk-js
// These hooks just allow all requests through

const publicRoutes = [
  '/',
  '/auth/sign-in',
  '/auth/sign-up',
  '/auth/callback',
  '/api/health'
];

export const handle: Handle = async ({ event, resolve }) => {
  const { pathname } = event.url;

  // Allow public routes without auth
  const isPublic = publicRoutes.some(
    (route) => pathname === route || pathname.startsWith('/auth/')
  );

  if (isPublic) {
    return resolve(event);
  }

  // For protected routes, let the client-side auth handle the redirect
  // The +page.svelte components check auth on mount and redirect if needed
  return resolve(event);
};
