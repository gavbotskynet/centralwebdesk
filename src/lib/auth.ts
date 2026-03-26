/**
 * Auth utilities for client-side Clerk auth
 * Admin access is checked against an allowlist for now
 */

const ADMIN_EMAILS = [
  'gavinpretorius@gmail.com'
];

export async function requireAuth(): Promise<boolean> {
  const publishableKey = import.meta.env.VITE_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!publishableKey) {
    window.location.href = '/auth/sign-in';
    return false;
  }

  const { Clerk } = await import('@clerk/clerk-js');
  const clerk = new Clerk(publishableKey);

  try {
    await clerk.load();
  } catch {
    window.location.href = '/auth/sign-in';
    return false;
  }

  if (!clerk.user) {
    window.location.href = '/auth/sign-in';
    return false;
  }

  return true;
}

export async function getUserEmail(): Promise<string> {
  const publishableKey = import.meta.env.VITE_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!publishableKey) return '';

  const { Clerk } = await import('@clerk/clerk-js');
  const clerk = new Clerk(publishableKey);
  await clerk.load();
  return clerk.user?.primaryEmailAddress?.emailAddress ?? '';
}

export async function isAdmin(): Promise<boolean> {
  const email = await getUserEmail();
  return ADMIN_EMAILS.includes(email);
}
