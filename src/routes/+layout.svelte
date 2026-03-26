<script lang="ts">
  import '../app.css';
  let { children } = $props();
</script>

<div class="app-shell">
  <header>
    <nav>
      <a href="/" class="logo">Central Web Desk</a>
      <div class="nav-links">
        <a href="/dashboard">Dashboard</a>
        <a href="/lists">Lists</a>
        <a href="/reminders">Reminders</a>
        <a href="/files">Files</a>
      </div>
      <div class="auth-section">
        <a href="/auth/sign-in">Sign In</a>
      </div>
    </nav>
  </header>

  <main>
    {@render children()}
  </main>

  <footer>
    <p>&copy; {new Date().getFullYear()} Central Web Desk</p>
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
    align-items: center;
    gap: 2rem;
    max-width: 1200px;
    margin: 0 auto;
  }

  .logo {
    font-size: 1.5rem;
    font-weight: bold;
    color: #00d4ff;
    text-decoration: none;
  }

  .nav-links {
    display: flex;
    gap: 1.5rem;
    flex: 1;
  }

  .nav-links a {
    color: #a0a0a0;
    text-decoration: none;
    transition: color 0.2s;
  }

  .nav-links a:hover {
    color: white;
  }

  .auth-section a {
    color: #00d4ff;
    text-decoration: none;
  }

  main {
    flex: 1;
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem;
    width: 100%;
  }

  footer {
    text-align: center;
    padding: 1rem;
    background: #f5f5f5;
    color: #666;
  }
</style>
