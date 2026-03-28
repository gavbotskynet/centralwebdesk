<script lang="ts">
  import { onMount } from 'svelte';

  let { data } = $props();
  let error = $state('');

  // Block Clerk from mounting if sign-ups are disabled
  if (!data.allowSignups) {
    // This runs during SSR too — if we get here client-side, redirect immediately
    if (typeof window !== 'undefined') {
      window.location.href = '/auth/sign-in?reason=signups_closed';
    }
  }

  onMount(async () => {
    // Double-check: if sign-ups were disabled while page was loading, bail out
    if (!data.allowSignups) return;

    const publishableKey = import.meta.env.VITE_PUBLIC_CLERK_PUBLISHABLE_KEY;

    if (!publishableKey) {
      error = 'Clerk key not configured. Set VITE_PUBLIC_CLERK_PUBLISHABLE_KEY in .env';
      return;
    }

    const { Clerk } = await import('@clerk/clerk-js');
    const clerk = new Clerk(publishableKey);

    try {
      await clerk.load();
    } catch (e) {
      error = 'Failed to load Clerk. Check your internet connection.';
      return;
    }

    if (clerk.user) {
      window.location.href = '/dashboard';
      return;
    }

    clerk.mountSignUp(document.getElementById('clerk-sign-up'), {
      routing: 'path',
      path: '/auth/sign-up',
      afterSignInUrl: '/dashboard',
      afterSignUpUrl: '/dashboard'
    });
  });
</script>

<svelte:head>
  <title>Sign Up - Central Web Desk</title>
</svelte:head>

<div class="auth-page">
  <div class="auth-header">
    <a href="/" class="logo">← Central Web Desk</a>
  </div>
  <div class="auth-container">
    {#if !data.allowSignups}
      <div class="signups-closed">
        <div class="icon">🔒</div>
        <h2>Sign-ups are closed</h2>
        <p>New account creation is currently disabled. Please check back later or contact an administrator.</p>
        <a href="/auth/sign-in" class="signin-link">Sign in to existing account</a>
      </div>
    {:else}
      {#if error}
        <p class="error">{error}</p>
      {/if}
      <div id="clerk-sign-up"></div>
      <p class="switch-link">
        Already have an account? <a href="/auth/sign-in">Sign in</a>
      </p>
    {/if}
  </div>
</div>

<style>
  .auth-page {
    min-height: 80vh;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .auth-header {
    width: 100%;
    padding: 1.5rem 2rem;
  }

  .logo {
    color: var(--color-text-muted);
    text-decoration: none;
    font-size: 0.95rem;
  }

  .logo:hover {
    color: var(--color-text);
    text-decoration: none;
  }

  .auth-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    padding-top: 2rem;
    width: 100%;
    max-width: 440px;
  }

  .error {
    color: var(--color-error);
    margin-bottom: 1rem;
    text-align: center;
  }

  .switch-link {
    margin-top: 1.5rem;
    color: var(--color-text-muted);
    font-size: 0.9rem;
  }

  .switch-link a {
    color: var(--color-primary);
  }

  .signups-closed {
    text-align: center;
    padding: 3rem 2rem;
    background: var(--color-surface);
    border-radius: 12px;
    border: 1px solid var(--color-border);
    max-width: 400px;
  }

  .signups-closed .icon {
    font-size: 3rem;
    margin-bottom: 1rem;
  }

  .signups-closed h2 {
    color: #1a1a2e;
    margin-bottom: 0.75rem;
    font-size: 1.3rem;
  }

  .signups-closed p {
    color: var(--color-text-muted);
    font-size: 0.9rem;
    line-height: 1.6;
    margin-bottom: 1.5rem;
  }

  .signin-link {
    color: var(--color-primary);
    font-weight: 600;
    font-size: 0.9rem;
  }
</style>
