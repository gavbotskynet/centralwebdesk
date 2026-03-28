<script lang="ts">
  import { onMount } from 'svelte';

  let loading = $state(true);
  let isAdmin = $state(false);
  let saving = $state(false);
  let saveMessage = $state('');
  let saveError = $state('');
  let loadError = $state('');

  let allowSignups = $state(true);
  let clerk: any = $state(null);

  onMount(async () => {
    const publishableKey = import.meta.env.VITE_PUBLIC_CLERK_PUBLISHABLE_KEY;
    if (!publishableKey) {
      window.location.href = '/auth/sign-in';
      return;
    }

    const { Clerk: ClerkClass } = await import('@clerk/clerk-js');
    const clerkInstance = new ClerkClass(publishableKey);
    await clerkInstance.load();
    clerk = clerkInstance;

    if (!clerkInstance.user) {
      window.location.href = '/auth/sign-in';
      return;
    }

    const email = clerkInstance.user.primaryEmailAddress?.emailAddress ?? '';
    isAdmin = clerkInstance.user.publicMetadata?.is_admin === true;

    if (!isAdmin) {
      window.location.href = '/dashboard';
      return;
    }

    // Load current settings
    try {
      const token = await clerk.session?.getToken?.();
      const res = await fetch('/api/admin/settings', {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (res.ok) {
        const data = await res.json();
        allowSignups = data.allow_signups;
      } else {
        const text = await res.text();
        loadError = `Failed to load settings: ${res.status} — ${text}`;
      }
    } catch {
      loadError = 'Failed to load settings';
    }

    loading = false;
  });

  async function saveSetting(key: 'allow_signups', value: boolean) {
    saving = true;
    saveMessage = '';
    saveError = '';

    try {
      const token = await clerk.session?.getToken?.();
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ [key]: value })
      });
      const data = await res.json();

      if (!res.ok) {
        saveError = data.error ?? 'Failed to save';
      } else {
        saveMessage = 'Saved!';
        setTimeout(() => (saveMessage = ''), 2000);
      }
    } catch {
      saveError = 'Network error';
    } finally {
      saving = false;
    }
  }

  async function toggleSignups() {
    allowSignups = !allowSignups;
    await saveSetting('allow_signups', allowSignups);
  }
</script>

<svelte:head>
  <title>Settings - Admin - Central Web Desk</title>
</svelte:head>

{#if loading}
  <p>Loading...</p>
{:else}
  <section class="settings">
    <div class="page-header">
      <a href="/admin" class="back-link">← Admin</a>
      <h1>Site Settings</h1>
    </div>

    {#if loadError}
      <div class="save-err-banner" style="margin-bottom: 1rem;">⚠️ {loadError}</div>
    {/if}

    <div class="settings-list">
      <div class="setting-row">
        <div class="setting-info">
          <h3>Allow New Sign-ups</h3>
          <p>
            When off, new users will not be able to create an account. Existing users
            can still sign in.
          </p>
          {#if !allowSignups}
            <p class="note">
              <strong>Note:</strong> When this is OFF, the sign-up link is hidden from
              Clerk's sign-in dialog. However, you must also set Clerk's sign-up mode
              to <strong>Restricted</strong> (in Clerk Dashboard → User &amp; Authentication
              → Restrictions) for full protection.
            </p>
          {/if}
        </div>
        <div class="setting-control">
          <button
            class="toggle"
            class:on={allowSignups}
            class:off={!allowSignups}
            onclick={toggleSignups}
            disabled={saving}
          >
            <span class="toggle-track">
              <span class="toggle-thumb"></span>
            </span>
            <span class="toggle-label">{allowSignups ? 'ON' : 'OFF'}</span>
          </button>
          {#if saveMessage}<span class="save-msg">{saveMessage}</span>{/if}
          {#if saveError}
            <div class="save-err-banner">
              ⚠️ Save failed: {saveError} — Changes did not persist.
            </div>
          {/if}
        </div>
      </div>
    </div>

    <div class="clerk-info">
      <h2>🔐 Clerk Sign-Up Mode</h2>
      <p>
        The toggle above controls <em>this app's</em> sign-up setting. However, the
        sign-up link in Clerk's dialog is controlled by Clerk's <strong>Sign-up mode</strong>,
        set in the Clerk Dashboard. For full control:
      </p>
      <ol>
        <li>
          Go to <a href="https://dashboard.clerk.com" target="_blank" rel="noopener">Clerk Dashboard</a>
          → <strong>User &amp; Authentication</strong> → <strong>Restrictions</strong>
        </li>
        <li>
          Under <strong>Sign-up modes</strong>, choose:
          <ul>
            <li><strong>Public</strong> — anyone can sign up (use this app's toggle to override)</li>
            <li><strong>Restricted</strong> — only invited users can sign up (recommended for private apps)</li>
          </ul>
        </li>
        <li>
          With <strong>Restricted</strong> mode, the "Don't have an account? Sign up" link
          is hidden from Clerk's dialog automatically. Invited users can still sign up.
        </li>
        <li>
          To invite users: Clerk Dashboard → <strong>Users</strong> → <strong>Invite user</strong>
        </li>
      </ol>
      <p class="current-state">
        Current Clerk sign-up mode:
        <strong>
          {#if allowSignups}Public{:else}Restricted{/if}
        </strong>
      </p>
    </div>
  </section>
{/if}

<style>
  .settings {
    padding: 2rem 0;
    max-width: 700px;
  }

  .page-header {
    margin-bottom: 2rem;
  }

  .back-link {
    display: inline-block;
    margin-bottom: 0.75rem;
    color: var(--color-text-muted);
    text-decoration: none;
    font-size: 0.9rem;
  }

  .back-link:hover {
    color: var(--color-text);
  }

  h1 {
    font-size: 1.75rem;
    color: #1a1a2e;
  }

  .settings-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
    background: var(--color-border);
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid var(--color-border);
  }

  .setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 2rem;
    padding: 1.5rem;
    background: var(--color-surface);
  }

  .setting-info {
    flex: 1;
  }

  .setting-info h3 {
    font-size: 1rem;
    color: #1a1a2e;
    margin-bottom: 0.35rem;
  }

  .setting-info p {
    font-size: 0.875rem;
    color: var(--color-text-muted);
    line-height: 1.5;
    margin: 0;
  }

  .setting-info .note {
    margin-top: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: #fef3c7;
    border-radius: 6px;
    border-left: 3px solid #f59e0b;
    font-size: 0.8rem;
  }

  .setting-info .note strong {
    color: #92400e;
  }

  .setting-control {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  .toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    font-size: 0.8rem;
    font-weight: 600;
  }

  .toggle:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .toggle-track {
    display: block;
    width: 44px;
    height: 24px;
    border-radius: 12px;
    background: #ccc;
    position: relative;
    transition: background 0.2s;
  }

  .toggle.on .toggle-track {
    background: #22c55e;
  }

  .toggle.off .toggle-track {
    background: #ef4444;
  }

  .toggle-thumb {
    display: block;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: white;
    position: absolute;
    top: 2px;
    left: 2px;
    transition: left 0.2s;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  }

  .toggle.on .toggle-thumb {
    left: 22px;
  }

  .toggle-label {
    width: 28px;
    color: var(--color-text-muted);
  }

  .save-msg {
    font-size: 0.8rem;
    color: #22c55e;
  }

  .save-err {
    font-size: 0.8rem;
    color: #ef4444;
  }

  .save-err-banner {
    background: #fee2e2;
    border: 1px solid #ef4444;
    border-radius: 6px;
    padding: 0.5rem 0.75rem;
    font-size: 0.8rem;
    color: #dc2626;
    max-width: 250px;
    text-align: left;
  }

  .clerk-info {
    margin-top: 2rem;
    padding: 1.5rem;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 12px;
  }

  .clerk-info h2 {
    font-size: 1.1rem;
    color: #1a1a2e;
    margin-bottom: 0.75rem;
  }

  .clerk-info p {
    font-size: 0.875rem;
    color: var(--color-text-muted);
    line-height: 1.6;
    margin-bottom: 0.75rem;
  }

  .clerk-info ol {
    padding-left: 1.5rem;
    margin-bottom: 0.75rem;
  }

  .clerk-info li {
    font-size: 0.875rem;
    color: var(--color-text-muted);
    line-height: 1.7;
    margin-bottom: 0.25rem;
  }

  .clerk-info ul {
    list-style: disc;
    padding-left: 1.5rem;
    margin-top: 0.25rem;
  }

  .clerk-info ul li {
    margin-bottom: 0.15rem;
  }

  .clerk-info a {
    color: var(--color-primary);
  }

  .clerk-info .current-state {
    margin-top: 1rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--color-border);
    font-weight: 600;
  }
</style>
