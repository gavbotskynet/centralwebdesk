<script lang="ts">
  import { onMount } from 'svelte';

  onMount(async () => {
    const publishableKey = import.meta.env.VITE_PUBLIC_CLERK_PUBLISHABLE_KEY;
    if (publishableKey) {
      const { Clerk } = await import('@clerk/clerk-js');
      const clerk = new Clerk(publishableKey);
      await clerk.load();
      await clerk.signOut();
    }
    // Clear our own session cookie via form action
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = '/auth/sign-out';
    document.body.appendChild(form);
    form.submit();
  });
</script>

<p style="text-align:center;padding:4rem;">Signing out...</p>
