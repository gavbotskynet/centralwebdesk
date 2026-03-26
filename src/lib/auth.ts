/**
 * Auth guard utility - redirects to sign-in if not authenticated
 * Used in onMount of protected pages
 */
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
