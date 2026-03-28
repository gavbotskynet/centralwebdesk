<script lang="ts">
  import { onMount } from 'svelte';

  let loading = $state(true);
  let userEmail = $state('');
  let isAdmin = $state(false);

  onMount(async () => {
    const publishableKey = import.meta.env.VITE_PUBLIC_CLERK_PUBLISHABLE_KEY;
    if (!publishableKey) {
      window.location.href = '/auth/sign-in';
      return;
    }

    const { Clerk } = await import('@clerk/clerk-js');
    const clerk = new Clerk(publishableKey);
    await clerk.load();

    if (!clerk.user) {
      window.location.href = '/auth/sign-in';
      return;
    }

    userEmail = clerk.user.primaryEmailAddress?.emailAddress ?? '';
    isAdmin = clerk.user.publicMetadata?.is_admin === true;

    if (!isAdmin) {
      window.location.href = '/dashboard';
      return;
    }

    loading = false;
  });
</script>

<svelte:head>
  <title>Admin - Central Web Desk</title>
</svelte:head>

{#if loading}
  <p>Loading...</p>
{:else}
  <section class="admin">
    <h1>Admin</h1>
    <p class="subtitle">Signed in as {userEmail}</p>

    <div class="admin-grid">
      <div class="card">
        <h3>👥 User Management</h3>
        <p>Manage user access and permissions.</p>
        <a href="/admin/users" class="btn">Manage Users</a>
      </div>

      <div class="card">
        <h3>⚙️ Site Settings</h3>
        <p>Configure global site settings like sign-up access.</p>
        <a href="/admin/settings" class="btn">Settings</a>
      </div>

      <div class="card">
        <h3>🔑 API Keys</h3>
        <p>Manage API keys and integrations.</p>
        <a href="/admin/api-keys" class="btn">View Keys</a>
      </div>

      <div class="card">
        <h3>📊 System Status</h3>
        <p>Check system health and metrics.</p>
        <a href="/admin/status" class="btn">View Status</a>
      </div>
    </div>
  </section>
{/if}

<style>
  .admin {
    padding: 2rem 0;
  }

  h1 {
    font-size: 2rem;
    color: #1a1a2e;
    margin-bottom: 0.25rem;
  }

  .subtitle {
    color: var(--color-text-muted);
    margin-bottom: 2rem;
  }

  .admin-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1.5rem;
  }

  .card {
    background: var(--color-surface);
    padding: 1.5rem;
    border-radius: 12px;
    border: 1px solid var(--color-border);
  }

  .card h3 {
    color: #1a1a2e;
    margin-bottom: 0.5rem;
  }

  .card p {
    color: var(--color-text-muted);
    margin-bottom: 1rem;
    font-size: 0.9rem;
  }

  .btn {
    display: inline-block;
    padding: 0.5rem 1rem;
    background: var(--color-primary);
    color: var(--color-text);
    border-radius: 6px;
    font-size: 0.9rem;
    font-weight: 600;
    text-decoration: none;
    transition: background 0.2s;
  }

  .btn:hover {
    background: var(--color-primary-hover);
    text-decoration: none;
  }
</style>
