<script lang="ts">
  // This page is shown when sign-ups are closed and a user clicks "Sign up" in Clerk's UI
</script>

<svelte:head>
  <title>Sign-ups Closed - Central Web Desk</title>
</svelte:head>

<div class="auth-page">
  <div class="auth-header">
    <a href="/" class="logo">← Central Web Desk</a>
  </div>
  <div class="auth-container">
    <div class="signups-closed">
      <div class="icon">🔒</div>
      <h2>Sign-ups are closed</h2>
      <p>New account creation is currently disabled. Please check back later or contact an administrator.</p>
      <a href="/auth/sign-in" class="signin-link">← Back to Sign In</a>
    </div>
  </div>
</div>

<style>
  .auth-page {
    min-height: 80vh;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .auth-header {
    width: 100%;
    padding: 1.5rem 2rem;
  }

  .logo {
    color: var(--color-text-muted);
    text-decoration: none;
    font-size: 0.95rem;
  }

  .auth-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    padding-top: 2rem;
    width: 100%;
    max-width: 440px;
  }

  .signups-closed {
    text-align: center;
    padding: 3rem 2rem;
    background: var(--color-surface);
    border-radius: 12px;
    border: 1px solid var(--color-border);
    max-width: 400px;
  }

  .signups-closed .icon {
    font-size: 3rem;
    margin-bottom: 1rem;
  }

  .signups-closed h2 {
    color: #1a1a2e;
    margin-bottom: 0.75rem;
    font-size: 1.3rem;
  }

  .signups-closed p {
    color: var(--color-text-muted);
    font-size: 0.9rem;
    line-height: 1.6;
    margin-bottom: 1.5rem;
  }

  .signin-link {
    color: var(--color-primary);
    font-weight: 600;
    font-size: 0.9rem;
  }
</style>
