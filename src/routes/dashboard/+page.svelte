<script lang="ts">
  import { onMount } from 'svelte';
  import { requireAuth } from '$lib/auth';

  let loading = $state(true);
  let userEmail = $state('');
  let isAdminUser = $state(false);

  onMount(async () => {
    const ok = await requireAuth();
    if (!ok) return;

    const { Clerk } = await import('@clerk/clerk-js');
    const clerk = new Clerk(import.meta.env.VITE_PUBLIC_CLERK_PUBLISHABLE_KEY);
    await clerk.load();

    // Check if user has been revoked (has_access === false in Clerk public_metadata)
    // This is a real-time check since Clerk restores sessions from its own cookies
    const hasAccess = clerk.user?.publicMetadata?.has_access;
    if (hasAccess === false) {
      // Clear Clerk's session and redirect to sign-in
      clerk.signOut();
      window.location.href = '/auth/sign-in?reason=access_revoked';
      return;
    }

    userEmail = clerk.user?.primaryEmailAddress?.emailAddress ?? '';
    // Check is_admin from Clerk public_metadata (set via 3-dot menu on admin/users page)
    isAdminUser = clerk.user?.publicMetadata?.is_admin === true;
    loading = false;
  });
</script>

<svelte:head>
  <title>Dashboard - Central Web Desk</title>
</svelte:head>

{#if loading}
  <p>Loading...</p>
{:else}
  <section class="dashboard">
    <div class="welcome-bar">
      <h1>Welcome to your Desk</h1>
      <span class="user-email">{userEmail}</span>
    </div>

    <div class="quick-actions">
      {#if isAdminUser}
        <a href="/admin" class="card admin-card">
          <span class="icon">⚙️</span>
          <h3>Admin</h3>
          <p>Manage users and settings</p>
        </a>
      {/if}
      <a href="/bullet-points" class="card">
        <span class="icon">📝</span>
        <h3>Bullet Points</h3>
        <p>Capture thoughts, tasks, and ideas</p>
      </a>
      <a href="/reminders/new" class="card">
        <span class="icon">⏰</span>
        <h3>New Reminder</h3>
        <p>Set a reminder</p>
      </a>
      <a href="/files/upload" class="card">
        <span class="icon">📁</span>
        <h3>Upload File</h3>
        <p>Store a file</p>
      </a>
    </div>

    <section class="recent">
      <h2>Recent Items</h2>
      <p class="empty-state">No items yet. Create your first list, reminder, or upload a file to get started.</p>
    </section>
  </section>
{/if}

<style>
  .dashboard {
    padding: 2rem 0;
  }

  .welcome-bar {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 2rem;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  h1 {
    font-size: 2rem;
    color: #1a1a2e;
  }

  .user-email {
    color: var(--color-text-muted);
    font-size: 0.9rem;
  }

  .quick-actions {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1.5rem;
    margin-bottom: 3rem;
  }

  .card {
    background: var(--color-surface);
    padding: 1.5rem;
    border-radius: 12px;
    text-decoration: none;
    color: inherit;
    transition: transform 0.2s, box-shadow 0.2s;
    border: 1px solid var(--color-border);
  }

  .card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
    text-decoration: none;
  }

  .card .icon {
    font-size: 2rem;
    display: block;
    margin-bottom: 0.5rem;
  }

  .card h3 {
    color: #1a1a2e;
    margin-bottom: 0.25rem;
  }

  .card p {
    color: var(--color-text-muted);
    font-size: 0.9rem;
  }

  .admin-card {
    border-color: #f0c040;
    background: #fffbf0;
  }

  .admin-card h3 {
    color: #b8860b;
  }

  .recent h2 {
    font-size: 1.25rem;
    margin-bottom: 1rem;
    color: #1a1a2e;
  }

  .empty-state {
    color: var(--color-text-muted);
    font-style: italic;
  }
</style>
