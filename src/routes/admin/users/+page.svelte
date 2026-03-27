<script lang="ts">
  import { onMount } from 'svelte';

  const ADMIN_EMAILS = ['gavinpretorius@gmail.com'];

  let loading = $state(true);
  let isAdmin = $state(false);
  let currentUserEmail = $state('');

  // Users list
  let users = $state<any[]>([]);
  let total = $state(0);
  let hasMore = $state(false);
  let offset = $state(0);
  let loadingMore = $state(false);
  let search = $state('');
  let searchTimeout: ReturnType<typeof setTimeout>;

  // UI state
  let actionLoading = $state<string | null>(null);
  let error = $state('');
  let openDropdown = $state<string | null>(null);
  let dropdownPos = $state<{ x: number; y: number; flipUp: boolean } | null>(null);

  const LIMIT = 20;

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

    currentUserEmail = clerk.user.primaryEmailAddress?.emailAddress ?? '';
    isAdmin = ADMIN_EMAILS.includes(currentUserEmail);

    if (!isAdmin) {
      window.location.href = '/dashboard';
      return;
    }

    loading = false;
    await loadUsers(true);
  });

  async function loadUsers(resetOffset = false) {
    if (resetOffset) {
      offset = 0;
      users = [];
    }
    error = '';

    try {
      const params = new URLSearchParams({
        limit: LIMIT.toString(),
        offset: offset.toString()
      });
      if (search.trim()) params.set('search', search.trim());

      const res = await fetch(`/api/admin/users?${params}`);
      const data = await res.json();

      if (!res.ok) throw new Error(data.error ?? 'Failed to load users');

      if (resetOffset) {
        users = data.users;
      } else {
        users = [...users, ...data.users];
      }
      total = data.total;
      hasMore = data.users.length === LIMIT;
    } catch (e: any) {
      error = e.message;
    }
  }

  async function grantAdmin(userId: string, email: string) {
    actionLoading = userId;
    try {
      const res = await fetch('/api/admin/users/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'grant', userId, email })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Failed to grant admin');
      }
      users = users.map(u => u.id === userId ? { ...u, isAdmin: true } : u);
    } catch (e: any) {
      error = e.message;
    } finally {
      actionLoading = null;
    }
  }

  async function revokeAdmin(userId: string) {
    actionLoading = userId;
    try {
      const res = await fetch('/api/admin/users/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'revoke', userId })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Failed to revoke admin');
      }
      users = users.map(u => u.id === userId ? { ...u, isAdmin: false } : u);
    } catch (e: any) {
      error = e.message;
    } finally {
      actionLoading = null;
    }
  }

  async function grantAccess(userId: string) {
    actionLoading = userId + '_access';
    try {
      const res = await fetch('/api/admin/users/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'grant_access', userId })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Failed to grant access');
      }
      users = users.map(u => u.id === userId ? { ...u, hasAccess: true } : u);
    } catch (e: any) {
      error = e.message;
    } finally {
      actionLoading = null;
    }
  }

  async function revokeAccess(userId: string) {
    actionLoading = userId + '_access';
    try {
      const res = await fetch('/api/admin/users/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'revoke_access', userId })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Failed to revoke access');
      }
      users = users.map(u => u.id === userId ? { ...u, hasAccess: false } : u);
    } catch (e: any) {
      error = e.message;
    } finally {
      actionLoading = null;
    }
  }

  function onSearchInput() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => loadUsers(true), 400);
  }

  async function loadMore() {
    loadingMore = true;
    offset += LIMIT;
    await loadUsers(false);
    loadingMore = false;
  }

  function formatDate(ts: number | null) {
    if (!ts) return 'Never';
    return new Date(ts * 1000).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  function getInitials(name: string) {
    return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2) || '??';
  }

  function toggleDropdown(userId: string, e: MouseEvent) {
    if (openDropdown === userId) {
      openDropdown = null;
      dropdownPos = null;
      return;
    }
    const trigger = e.currentTarget as HTMLElement;
    const rect = trigger.getBoundingClientRect();
    const menuHeight = 96;
    const flipUp = rect.bottom + menuHeight > window.innerHeight;
    // Position menu below the trigger, aligned to the right edge
    // x: right edge of trigger (menu aligns right edge here)
    // y: top of trigger when flipped, bottom of trigger when not
    const x = rect.right;
    const y = flipUp ? rect.top - menuHeight : rect.bottom;
    openDropdown = userId;
    dropdownPos = { x, y, flipUp };
  }

  function closeDropdown() {
    openDropdown = null;
    dropdownPos = null;
  }
</script>

<svelte:window on:click={closeDropdown} />

<svelte:head>
  <title>User Management - Central Web Desk</title>
</svelte:head>

{#if loading}
  <p>Loading...</p>
{:else}
  <section class="users-page">
    <div class="page-header">
      <div>
        <h1>User Management</h1>
        <p class="subtitle">{total} user{total !== 1 ? 's' : ''} total</p>
      </div>
      <a href="/admin" class="back-link">← Back to Admin</a>
    </div>

    <div class="search-bar">
      <input
        type="search"
        placeholder="Search by email or name..."
        bind:value={search}
        oninput={onSearchInput}
        class="search-input"
      />
      {#if search}
        <button class="clear-btn" onclick={() => { search = ''; loadUsers(true); }}>✕</button>
      {/if}
    </div>

    {#if error}
      <div class="error-banner">{error}</div>
    {/if}

    <div class="users-table">
      <div class="table-header">
        <span>User</span>
        <span>Email</span>
        <span>Joined</span>
        <span>Last Sign In</span>
        <span>Actions</span>
      </div>

      {#each users as user (user.id)}
        <div class="table-row" class:no-access={!user.hasAccess} class:is-admin={user.isAdmin}>
          <div class="user-cell">
            {#if user.imageUrl}
              <img src={user.imageUrl} alt="" class="avatar" />
            {:else}
              <div class="avatar avatar-placeholder">{getInitials(user.name)}</div>
            {/if}
            <div class="user-info">
              <span class="user-name" class:strikethrough={!user.hasAccess}>{user.name}</span>
              <span class="user-role">
                {#if !user.hasAccess}<span class="badge badge-revoked">Revoked</span>
                {:else if user.isAdmin}<span class="badge badge-admin">Admin</span>
                {:else}<span class="badge badge-user">User</span>{/if}
              </span>
            </div>
          </div>
          <div class="email-cell">{user.email}</div>
          <div class="date-cell">{formatDate(user.createdAt)}</div>
          <div class="date-cell">{formatDate(user.lastSignInAt)}</div>
          <div class="actions-cell">
            <button
              class="dropdown-trigger"
              onclick={(e) => { e.stopPropagation(); toggleDropdown(user.id); }}
              disabled={actionLoading !== null}
            >
              ⋮
            </button>
            {#if openDropdown === user.id && dropdownPos}
              <div
                class="dropdown-menu"
                style="position: fixed; right: auto; left: {dropdownPos.x}px; top: {dropdownPos.y}px;"
                class:flip-up={dropdownPos.flipUp}
                onclick={(e) => e.stopPropagation()}
              >
                {#if user.hasAccess}
                  <button
                    class="dropdown-item"
                    onclick={() => { revokeAccess(user.id); closeDropdown(); }}
                    disabled={user.email === currentUserEmail || actionLoading !== null}
                  >Revoke Access</button>
                {:else}
                  <button
                    class="dropdown-item"
                    onclick={() => { grantAccess(user.id); closeDropdown(); }}
                    disabled={actionLoading !== null}
                  >Grant Access</button>
                {/if}
                {#if user.isAdmin}
                  <button
                    class="dropdown-item"
                    onclick={() => { revokeAdmin(user.id); closeDropdown(); }}
                    disabled={user.email === currentUserEmail || actionLoading !== null}
                  >Revoke Admin</button>
                {:else}
                  <button
                    class="dropdown-item"
                    onclick={() => { grantAdmin(user.id, user.email); closeDropdown(); }}
                    disabled={actionLoading !== null}
                  >Make Admin</button>
                {/if}
              </div>
            {/if}
          </div>
        </div>
      {:else}
        <div class="empty-state">
          {search ? 'No users match your search.' : 'No users found.'}
        </div>
      {/each}
    </div>

    {#if users.length > 0}
      <div class="load-more">
        {#if hasMore}
          <button class="btn" onclick={loadMore} disabled={loadingMore}>
            {loadingMore ? 'Loading...' : 'Load More'}
          </button>
        {/if}
        <span class="page-info">{total} user{total !== 1 ? 's' : ''} total</span>
      </div>
    {/if}
  </section>
{/if}

<style>
  .users-page {
    padding: 2rem 0;
    max-width: 1000px;
  }

  .page-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 1.5rem;
  }

  h1 {
    font-size: 2rem;
    color: #1a1a2e;
    margin-bottom: 0.25rem;
  }

  .subtitle {
    color: var(--color-text-muted);
    font-size: 0.9rem;
  }

  .back-link {
    color: var(--color-primary);
    text-decoration: none;
    font-size: 0.9rem;
    padding-top: 0.5rem;
  }

  .back-link:hover {
    text-decoration: underline;
  }

  .search-bar {
    position: relative;
    margin-bottom: 1.5rem;
  }

  .search-input {
    width: 100%;
    padding: 0.65rem 2.5rem 0.65rem 1rem;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    font-size: 1rem;
    background: var(--color-bg);
    color: var(--color-text);
  }

  .search-input:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 3px rgba(0, 212, 255, 0.15);
  }

  .clear-btn {
    position: absolute;
    right: 0.75rem;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    color: var(--color-text-muted);
    cursor: pointer;
    padding: 0.25rem;
    font-size: 0.9rem;
  }

  .error-banner {
    background: #fef2f2;
    color: var(--color-error);
    padding: 0.75rem 1rem;
    border-radius: 8px;
    margin-bottom: 1rem;
    font-size: 0.9rem;
  }

  .users-table {
    border: 1px solid var(--color-border);
    border-radius: 12px;
    overflow: hidden;
    background: white;
  }

  .table-header {
    display: grid;
    grid-template-columns: 2fr 2fr 1.2fr 1.2fr 0.6fr;
    gap: 1rem;
    padding: 0.75rem 1rem;
    background: var(--color-surface);
    font-weight: 600;
    font-size: 0.8rem;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-bottom: 1px solid var(--color-border);
  }

  .table-row {
    display: grid;
    grid-template-columns: 2fr 2fr 1.2fr 1.2fr 0.6fr;
    gap: 1rem;
    padding: 0.85rem 1rem;
    align-items: center;
    border-bottom: 1px solid var(--color-border);
    transition: background 0.15s;
  }

  .table-row:last-child {
    border-bottom: none;
  }

  .table-row:hover {
    background: #fafafa;
  }

  .table-row.is-admin {
    background: #fffbf0;
  }

  .table-row.is-admin:hover {
    background: #fff8e8;
  }

  .table-row.no-access {
    background: #fef2f2;
    opacity: 0.7;
  }

  .table-row.no-access:hover {
    background: #fee2e2;
  }

  .strikethrough {
    text-decoration: line-through;
    color: var(--color-text-muted);
  }

  .user-cell {
    display: flex;
    align-items: center;
    gap: 0.65rem;
  }

  .user-info {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .user-role {
    font-size: 0.75rem;
  }

  .avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;
  }

  .avatar-placeholder {
    background: var(--color-primary);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.7rem;
    font-weight: 700;
  }

  .user-name {
    font-weight: 500;
    color: var(--color-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .email-cell {
    color: var(--color-text-muted);
    font-size: 0.875rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .date-cell {
    color: var(--color-text-muted);
    font-size: 0.85rem;
    white-space: nowrap;
  }

  .actions-cell {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: visible;
  }

  .dropdown-trigger {
    background: none;
    border: 1px solid var(--color-border);
    border-radius: 6px;
    padding: 0.2rem 0.5rem;
    font-size: 1rem;
    cursor: pointer;
    color: var(--color-text-muted);
    transition: all 0.15s;
  }

  .dropdown-trigger:hover:not(:disabled) {
    background: var(--color-surface);
    color: var(--color-text);
  }

  .dropdown-trigger:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .dropdown-menu {
    position: absolute;
    right: 0.5rem;
    top: 100%;
    background: white;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    z-index: 50;
    min-width: 150px;
    overflow: hidden;
  }

  .dropdown-menu.flip-up {
    /* JS sets top directly via inline style */
  }

  .dropdown-item {
    display: block;
    width: 100%;
    padding: 0.6rem 1rem;
    text-align: left;
    background: none;
    border: none;
    font-size: 0.875rem;
    cursor: pointer;
    transition: background 0.1s;
  }

  .dropdown-item:hover:not(:disabled) {
    background: #f5f5f5;
  }

  .dropdown-item:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .badge {
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.2rem 0.5rem;
    border-radius: 100px;
    white-space: nowrap;
  }

  .badge-admin {
    background: #fff3cd;
    color: #856404;
    border: 1px solid #ffeaa7;
  }

  .badge-user {
    background: var(--color-surface);
    color: var(--color-text-muted);
    border: 1px solid var(--color-border);
  }

  .badge-revoked {
    background: #fee2e2;
    color: #991b1b;
    border: 1px solid #fecaca;
  }

  .empty-state {
    padding: 3rem 1rem;
    text-align: center;
    color: var(--color-text-muted);
  }

  .pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    margin-top: 1.5rem;
  }

  .btn {
    padding: 0.5rem 1.25rem;
    background: var(--color-primary);
    color: #1a1a2e;
    border: none;
    border-radius: 6px;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
  }

  .btn:hover:not(:disabled) {
    background: var(--color-primary-hover);
  }

  .btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .page-info {
    color: var(--color-text-muted);
    font-size: 0.9rem;
  }

  @media (max-width: 768px) {
    .table-header {
      display: none;
    }

    .table-row {
      grid-template-columns: 1fr 1fr;
      grid-template-rows: auto auto auto;
    }

    .user-cell {
      grid-column: 1 / -1;
    }

    .access-cell {
      grid-column: 1 / -1;
    }
  }
</style>
