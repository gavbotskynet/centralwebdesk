import type { PageServerLoad } from './$types';

const ADMIN_EMAILS = ['gavinpretorius@gmail.com'];

async function getAllowSignups(db: any): Promise<boolean> {
  if (!db) return true;
  try {
    const result = await db
      .prepare('SELECT value FROM global_settings WHERE key = ?')
      .bind('allow_signups')
      .first<{ value: string }>();
    return result?.value === 'true';
  } catch {
    return true; // fail open
  }
}

export const load: PageServerLoad = async ({ platform, cookies }) => {
  const db = platform?.env?.DB;
  let allowSignups = true;

  if (db) {
    allowSignups = await getAllowSignups(db);
  }

  // Admins can always access the sign-up page even if sign-ups are disabled
  const clerkToken = cookies.get('__session') ?? cookies.get('__clerk_session');
  let isAdmin = false;
  if (clerkToken) {
    try {
      const parts = clerkToken.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
        isAdmin = ADMIN_EMAILS.includes(payload.email ?? '');
      }
    } catch {
      // ignore
    }
  }

  return {
    allowSignups: allowSignups || isAdmin
  };
};
