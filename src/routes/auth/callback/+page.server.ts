import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

const ADMIN_EMAILS = ['gavinpretorius@gmail.com'];
const CLERK_API_URL = 'https://api.clerk.com/v1';

export const load: PageServerLoad = async ({ cookies, platform }) => {
  const db = platform?.env?.DB;
  const secretKey = platform?.env?.CLERK_SECRET_KEY ?? '';

  // Decode the JWT to get email and check admin status
  let isAdmin = false;
  let userEmail = '';
  const clerkSessionToken = cookies.get('__session') ?? cookies.get('__clerk_session');
  if (clerkSessionToken) {
    try {
      const parts = clerkSessionToken.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
        userEmail = payload.email ?? '';
        isAdmin = ADMIN_EMAILS.includes(userEmail);
      }
    } catch {
      // ignore
    }
  }

  // Check if sign-ups are allowed (D1, fast)
  let allowSignups = true;
  if (db && !isAdmin) {
    try {
      const result = await db
        .prepare('SELECT value FROM global_settings WHERE key = ?')
        .bind('allow_signups')
        .first<{ value: string }>();
      allowSignups = result?.value === 'true';
    } catch {
      allowSignups = true;
    }
  }

  if (!allowSignups && !isAdmin) {
    throw redirect(302, '/auth/sign-up?reason=signups_closed');
  }

  // Check has_access revocation via Clerk API
  if (clerkSessionToken && secretKey) {
    try {
      const parts = clerkSessionToken.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
        const userId: string = payload.sub;

        const res = await fetch(`${CLERK_API_URL}/users/${userId}`, {
          headers: {
            Authorization: `Bearer ${secretKey}`,
            'Content-Type': 'application/json'
          }
        });
        if (res.ok) {
          const user = await res.json();
          if (user.public_metadata?.has_access === false) {
            cookies.delete('__session', { path: '/' });
            cookies.delete('__clerk_session', { path: '/' });
            throw redirect(302, '/auth/access-denied?reason=revoked');
          }
        }
      }
    } catch (e) {
      if (e && typeof e === 'object' && 'status' in e) throw e;
    }
  }

  // Normal flow: set __session cookie and redirect to dashboard
  cookies.set('__session', clerkSessionToken ?? '', {
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7
  });

  throw redirect(302, '/dashboard');
};
