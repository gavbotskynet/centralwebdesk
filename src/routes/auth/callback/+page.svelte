<script lang="ts">
  import { onMount } from 'svelte';

  let status = $state('Loading...');
  let error = $state('');

  onMount(async () => {
    const publishableKey = import.meta.env.VITE_PUBLIC_CLERK_PUBLISHABLE_KEY;
    
    if (!publishableKey) {
      error = 'Missing Clerk key';
      return;
    }

    try {
      const { Clerk } = await import('@clerk/clerk-js');
      const clerk = new Clerk(publishableKey);
      await clerk.load();

      if (!clerk.user) {
        window.location.href = '/auth/sign-in';
        return;
      }

      // Successfully authenticated — go to dashboard
      window.location.href = '/dashboard';
    } catch (e) {
      error = 'Auth failed: ' + (e instanceof Error ? e.message : 'Unknown error');
    }
  });
</script>

<svelte:head>
  <title>Signing in... - Central Web Desk</title>
</svelte:head>

<div class="callback-page">
  <p>{status}</p>
  {#if error}
    <p class="error">{error}</p>
    <a href="/auth/sign-in">Back to sign in</a>
  {/if}
</div>

<style>
  .callback-page {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 60vh;
    font-size: 1.2rem;
    color: var(--color-text-muted);
  }
  .error {
    color: var(--color-error);
    margin-top: 1rem;
  }
  a {
    margin-top: 1rem;
    color: var(--color-primary);
  }
</style>
