import { createClerkClient } from '@clerk/clerk-sdk-node';
import type { Handle } from '@sveltejs/kit';

const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY
});

export const handle: Handle = async ({ event, resolve }) => {
  const { pathname } = event.url;

  // Allow public routes
  const publicRoutes = ['/', '/auth/callback', '/api/health'];
  const isPublic = publicRoutes.some((route) => pathname === route || pathname.startsWith('/auth/'));

  if (isPublic) {
    return resolve(event);
  }

  // Check auth for protected routes
  const sessionToken = event.request.headers.get('cookie')?.match(/__session=([^;]+)/)?.[1];

  if (!sessionToken) {
    return new Response(null, {
      status: 302,
      headers: { Location: '/' }
    });
  }

  try {
    const session = await clerkClient.verifySession(sessionToken);
    event.locals.auth = {
      userId: session.userId,
      user: null // User details fetched separately if needed
    };
  } catch {
    return new Response(null, {
      status: 302,
      headers: { Location: '/' }
    });
  }

  return resolve(event);
};
