<script lang="ts">
  const publishableKey = import.meta.env.VITE_PUBLIC_CLERK_PUBLISHABLE_KEY;
  
  async function initClerk() {
    const { Clerk } = await import('@clerk/clerk-js');
    const clerk = new Clerk(publishableKey);
    await clerk.load();
    
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
  }
  
  initClerk();
</script>

<svelte:head>
  <title>Sign Up - Central Web Desk</title>
</svelte:head>

<div class="auth-container">
  <div id="clerk-sign-up"></div>
</div>

<style>
  .auth-container {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 60vh;
  }
</style>
