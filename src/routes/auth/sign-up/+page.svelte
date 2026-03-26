<script lang="ts">
  import { onMount } from 'svelte';

  let error = $state('');

  onMount(async () => {
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
      // Already signed in → go to dashboard
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
    {#if error}
      <p class="error">{error}</p>
    {/if}
    <div id="clerk-sign-up"></div>
    <p class="switch-link">
      Already have an account? <a href="/auth/sign-in">Sign in</a>
    </p>
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
</style>
