<script lang="ts">
  import { onMount } from 'svelte';

  let { data } = $props();
  let error = $state('');
  let signupsClosed = $state(false);

  onMount(async () => {
    const publishableKey = import.meta.env.VITE_PUBLIC_CLERK_PUBLISHABLE_KEY;

    if (!publishableKey) {
      error = 'Clerk key not configured. Set VITE_PUBLIC_CLERK_PUBLISHABLE_KEY in .env';
      return;
    }

    // Check if we were redirected here due to access revocation or sign-ups closed
    const urlParams = new URLSearchParams(window.location.search);
    const reason = urlParams.get('reason');

    if (reason === 'signups_closed') {
      signupsClosed = true;
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

    // If redirected due to access revocation, clear the Clerk session first
    if (reason === 'access_revoked' && clerk.user) {
      await clerk.signOut();
      // Clear our own session cookie
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = '/auth/sign-out';
      document.body.appendChild(form);
      form.submit();
      // Don't continue - the form submit will redirect
      return;
    }

    if (clerk.user) {
      // Already signed in → go to dashboard
      window.location.href = '/dashboard';
      return;
    }

    clerk.mountSignIn(document.getElementById('clerk-sign-in'), {
      routing: 'path',
      path: '/auth/sign-in',
      afterSignInUrl: '/dashboard',
      afterSignUpUrl: '/dashboard',
      // When sign-ups are disabled, redirect the Clerk sign-up link to our closed page
      signUpUrl: data.allowSignups ? '/auth/sign-up' : '/auth/sign-up-closed'
    });
  });
</script>

<svelte:head>
  <title>Sign In - Central Web Desk</title>
</svelte:head>

<div class="auth-page">
  <div class="auth-header">
    <a href="/" class="logo">← Central Web Desk</a>
  </div>
  <div class="auth-container">
    {#if error}
      <p class="error">{error}</p>
    {/if}
    {#if signupsClosed}
      <div class="signups-closed-banner">
        <span class="icon">🔒</span>
        <div>
          <strong>Sign-ups are currently closed</strong>
          <p>New account creation is disabled. Please sign in to your existing account.</p>
        </div>
      </div>
    {/if}
    <div id="clerk-sign-in"></div>
    {#if data.allowSignups && !signupsClosed}
      <p class="switch-link">
        Don't have an account? <a href="/auth/sign-up">Sign up</a>
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

  .signups-closed-banner {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    background: #fef3c7;
    border: 1px solid #f59e0b;
    border-radius: 8px;
    padding: 1rem;
    margin-bottom: 1.5rem;
    width: 100%;
    max-width: 400px;
  }

  .signups-closed-banner .icon {
    font-size: 1.5rem;
    flex-shrink: 0;
  }

  .signups-closed-banner strong {
    display: block;
    color: #92400e;
    margin-bottom: 0.25rem;
    font-size: 0.9rem;
  }

  .signups-closed-banner p {
    color: #b45309;
    font-size: 0.8rem;
    margin: 0;
    line-height: 1.4;
  }
</style>
