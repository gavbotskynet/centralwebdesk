<script lang="ts">
</script>

<svelte:head>
  <title>Dashboard - Central Web Desk</title>
</svelte:head>

<section class="dashboard">
  <h1>Welcome to your Desk</h1>

  <div class="quick-actions">
    <a href="/lists/new" class="card">
      <span class="icon">📝</span>
      <h3>New List</h3>
      <p>Create a new bullet list</p>
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

<style>
  .dashboard {
    padding: 2rem 0;
  }

  h1 {
    font-size: 2rem;
    margin-bottom: 2rem;
    color: #1a1a2e;
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
  }

  .card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
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
