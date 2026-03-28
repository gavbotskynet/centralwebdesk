<svelte:head>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <title>Central Web Desk</title>
</svelte:head>

<script lang="ts">
  import '../app.css';
  let { children } = $props();

  const buildId = __BUILD_ID__ ?? 'local';

  let userEmail = $state('');
  let userName = $state('');
  let isAdminUser = $state(false);
  let loaded = $state(false);

  $effect(() => {
    const publishableKey = import.meta.env.VITE_PUBLIC_CLERK_PUBLISHABLE_KEY;
    if (!publishableKey) return;

    import('@clerk/clerk-js').then(async ({ Clerk }) => {
      const clerk = new Clerk(publishableKey);
      await clerk.load();

      const email = clerk.user?.primaryEmailAddress?.emailAddress ?? '';
      const firstName = clerk.user?.firstName ?? '';
      const admins = ['gavinpretorius@gmail.com'];
      userEmail = email;
      userName = firstName || email.split('@')[0];
      isAdminUser = admins.includes(email);
      loaded = true;
    });
  });
</script>

<div class="app-shell">
  <header>
    <nav>
      <a href="/" class="logo">Central Web Desk</a>
      <div class="nav-links">
        {#if userEmail}
          <a href="/dashboard">Dashboard</a>
          <a href="/bullet-points">Bullet Points</a>
          <a href="/reminders">Reminders</a>
          <a href="/files">Files</a>
          {#if isAdminUser}
            <a href="/admin" class="admin-link">Admin</a>
          {/if}
        {/if}
      </div>
      <div class="auth-section">
        {#if userEmail}
          <span class="user-email">{userName}</span>
          <a href="/auth/sign-out">Sign Out</a>
        {:else}
          <a href="/auth/sign-in">Sign In</a>
        {/if}
      </div>
    </nav>
  </header>

  <main>
    {@render children()}
  </main>

  <footer>
    <p>&copy; {new Date().getFullYear()} Central Web Desk</p>
    {#if buildId}
      <p class="build-id">Build {buildId}</p>
    {/if}
  </footer>
</div>

<style>
  .app-shell {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  header {
    background: #1a1a2e;
    padding: 1rem 2rem;
    color: white;
  }

  nav {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    max-width: 1200px;
    margin: 0 auto;
  }

  .logo {
    font-size: 1.5rem;
    font-weight: bold;
    color: #00d4ff;
    text-decoration: none;
  }

  .logo:hover {
    text-decoration: none;
  }

  .nav-links {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .nav-links a {
    color: #a0a0a0;
    text-decoration: none;
    transition: color 0.2s;
  }

  .nav-links a:hover {
    color: white;
    text-decoration: none;
  }

  .admin-link {
    color: #f0c040 !important;
    font-weight: 600;
  }

  .admin-link:hover {
    color: #ffd700 !important;
  }

  .auth-section {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .auth-section a {
    color: #00d4ff;
    text-decoration: none;
  }

  .auth-section a:hover {
    text-decoration: underline;
  }

  .user-email {
    color: #f0c040;
    font-size: 0.85rem;
    font-weight: 600;
  }

  @media (min-width: 640px) {
    nav {
      flex-direction: row;
      align-items: center;
      gap: 2rem;
    }

    .auth-section {
      justify-content: flex-end;
    }
  }

  main {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem;
    width: 100%;
  }

  footer {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    padding: 1rem;
    background: #f5f5f5;
    color: #666;
  }

  .build-id {
    font-size: 0.75rem;
    color: #999;
    font-family: monospace;
  }
</style>
