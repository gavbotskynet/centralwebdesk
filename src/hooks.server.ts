import { createClerkClient } from '@clerk/clerk-sdk-node';
import type { Handle } from '@sveltejs/kit';
import { CLERK_SECRET_KEY } from '$env/static/private';

const clerkClient = createClerkClient({
  secretKey: CLERK_SECRET_KEY
});

const publicRoutes = [
  '/',
  '/auth/sign-in',
  '/auth/sign-up',
  '/auth/callback',
  '/api/health'
];

export const handle: Handle = async ({ event, resolve }) => {
  const { pathname } = event.url;

  // Allow public routes
  const isPublic = publicRoutes.some(
    (route) => pathname === route || pathname.startsWith('/auth/')
  );

  if (isPublic) {
    return resolve(event);
  }

  // Get session from Clerk's cookie
  const sessionToken = event.cookies.get('__session');

  if (!sessionToken) {
    throw new Response(null, {
      status: 302,
      headers: { Location: '/auth/sign-in' }
    });
  }

  try {
    const session = await clerkClient.verifySession(sessionToken);
    event.locals.auth = {
      userId: session.userId,
      user: null
    };
  } catch {
    event.cookies.delete('__session', { path: '/' });
    throw new Response(null, {
      status: 302,
      headers: { Location: '/auth/sign-in' }
    });
  }

  return resolve(event);
};
