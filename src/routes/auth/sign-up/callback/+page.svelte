<script lang="ts">
  import { onMount } from 'svelte';

  onMount(async () => {
    const publishableKey = import.meta.env.VITE_PUBLIC_CLERK_PUBLISHABLE_KEY;
    if (!publishableKey) {
      window.location.href = '/auth/sign-up';
      return;
    }

    const { Clerk } = await import('@clerk/clerk-js');
    const clerk = new Clerk(publishableKey);

    try {
      await clerk.load();
    } catch {
      window.location.href = '/auth/sign-up';
      return;
    }

    window.location.href = '/dashboard';
  });
</script>

<svelte:head>
  <title>Signing up... - Central Web Desk</title>
</svelte:head>

<p style="text-align:center;padding:4rem;">Creating your account...</p>
