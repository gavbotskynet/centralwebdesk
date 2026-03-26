<script lang="ts">
</script>

<svelte:head>
  <title>Central Web Desk - Your Digital Hub</title>
</svelte:head>

<section class="hero">
  <h1>Your Central Web Desk</h1>
  <p class="tagline">
    One place for your lists, reminders, and files.<br />
    Access from anywhere. Always in sync.
  </p>

  <div class="cta-buttons">
    <a href="/auth/sign-in" class="btn primary">Get Started</a>
    <a href="#features" class="btn secondary">Learn More</a>
  </div>
</section>

<section id="features" class="features">
  <div class="feature">
    <h3>📝 Bullet Lists</h3>
    <p>Create and organize lists for anything — groceries, tasks, projects. Fast and searchable.</p>
  </div>
  <div class="feature">
    <h3>⏰ Reminders</h3>
    <p>Set reminders that sync across all your devices. Never miss an important deadline.</p>
  </div>
  <div class="feature">
    <h3>📁 File Storage</h3>
    <p>Upload and download your files from anywhere. Secure, fast, and always accessible.</p>
  </div>
  <div class="feature">
    <h3>🔒 Secure by Design</h3>
    <p>Your data is isolated and protected. No one else can access your files or lists.</p>
  </div>
</section>

<section class="auth-providers">
  <h2>Sign in with your existing accounts</h2>
  <p>No new password to remember. Use Google, Apple, or GitHub.</p>
  <div class="provider-icons">
    <a href="/auth/sign-in" class="provider-btn" title="Sign in with Google">G</a>
    <a href="/auth/sign-in" class="provider-btn" title="Sign in with Apple">🍎</a>
    <a href="/auth/sign-in" class="provider-btn" title="Sign in with GitHub">🐙</a>
  </div>
</section>

<style>
  .hero {
    text-align: center;
    padding: 4rem 1rem;
  }

  h1 {
    font-size: 3rem;
    color: #1a1a2e;
    margin-bottom: 1rem;
  }

  .tagline {
    font-size: 1.25rem;
    color: #666;
    line-height: 1.6;
    margin-bottom: 2rem;
  }

  .cta-buttons {
    display: flex;
    gap: 1rem;
    justify-content: center;
    margin-bottom: 4rem;
  }

  .btn {
    padding: 0.75rem 1.5rem;
    border-radius: 8px;
    text-decoration: none;
    font-weight: 600;
    transition: all 0.2s;
  }

  .btn.primary {
    background: #00d4ff;
    color: #1a1a2e;
  }

  .btn.primary:hover {
    background: #00b8e6;
  }

  .btn.secondary {
    background: transparent;
    color: #1a1a2e;
    border: 2px solid #1a1a2e;
  }

  .btn.secondary:hover {
    background: #1a1a2e;
    color: white;
  }

  .features {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 2rem;
    margin-bottom: 4rem;
  }

  .feature {
    background: #f9f9f9;
    padding: 1.5rem;
    border-radius: 12px;
  }

  .feature h3 {
    margin-bottom: 0.5rem;
    color: #1a1a2e;
  }

  .feature p {
    color: #666;
    line-height: 1.5;
  }

  .auth-providers {
    text-align: center;
    padding: 3rem;
    background: #1a1a2e;
    color: white;
    border-radius: 16px;
    margin-bottom: 2rem;
  }

  .auth-providers h2 {
    margin-bottom: 0.5rem;
  }

  .auth-providers p {
    color: #a0a0a0;
    margin-bottom: 1.5rem;
  }

  .provider-icons {
    display: flex;
    gap: 1rem;
    justify-content: center;
    font-size: 2rem;
  }

  .provider-icons {
    display: flex;
    gap: 1rem;
    justify-content: center;
  }

  .provider-btn {
    background: rgba(255, 255, 255, 0.1);
    padding: 0.75rem 1.5rem;
    border-radius: 8px;
    font-size: 1.25rem;
    color: white;
    text-decoration: none;
    transition: background 0.2s;
  }

  .provider-btn:hover {
    background: rgba(255, 255, 255, 0.2);
    text-decoration: none;
  }
</style>
