<script lang="ts">
  import type { PageData } from './$types';

  // Load Clerk from CDN and mount the sign-in component
  const publishableKey = import.meta.env.VITE_PUBLIC_CLERK_PUBLISHABLE_KEY;
  
  async function initClerk() {
    const { Clerk } = await import('@clerk/clerk-js');
    const clerk = new Clerk(publishableKey);
    await clerk.load();
    
    if (clerk.user) {
      // Already signed in
      window.location.href = '/dashboard';
      return;
    }
    
    clerk.mountSignIn(document.getElementById('clerk-sign-in'), {
      routing: 'path',
      path: '/auth/sign-in',
      afterSignInUrl: '/dashboard',
      afterSignUpUrl: '/dashboard'
    });
  }
  
  initClerk();
</script>

<svelte:head>
  <title>Sign In - Central Web Desk</title>
</svelte:head>

<div class="auth-container">
  <div id="clerk-sign-in"></div>
</div>

<style>
  .auth-container {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 60vh;
  }
</style>
