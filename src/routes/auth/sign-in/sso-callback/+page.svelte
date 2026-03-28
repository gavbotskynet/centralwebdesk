<script lang="ts">
  import { onMount } from 'svelte';

  let error = $state('');

  onMount(async () => {
    const publishableKey = import.meta.env.VITE_PUBLIC_CLERK_PUBLISHABLE_KEY;

    if (!publishableKey) {
      error = 'Clerk key not configured.';
      return;
    }

    const { Clerk } = await import('@clerk/clerk-js');
    const clerk = new Clerk(publishableKey);

    try {
      await clerk.load();
    } catch (e) {
      error = 'Failed to load Clerk.';
      return;
    }

    // Mount at the parent path so Clerk's internal router handles sso-callback
    clerk.mountSignIn(document.getElementById('clerk-sign-in'), {
      routing: 'path',
      path: '/auth/sign-in',
      afterSignInUrl: '/dashboard',
      afterSignUpUrl: '/dashboard'
    });
  });
</script>

<svelte:head>
  <title>Signing In... - Central Web Desk</title>
</svelte:head>

<div class="auth-page">
  <div class="auth-header">
    <a href="/" class="logo">← Central Web Desk</a>
  </div>
  <div class="auth-container">
    {#if error}
      <p class="error">{error}</p>
    {:else}
      <p class="loading">Completing sign-in...</p>
    {/if}
    <div id="clerk-sign-in"></div>
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
    text-align: center;
  }

  .loading {
    color: var(--color-text-muted);
    font-size: 0.9rem;
    text-align: center;
    margin-bottom: 1rem;
  }
</style>
