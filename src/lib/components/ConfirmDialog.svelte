<script lang="ts">
  interface Props {
    title?: string;
    message?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    danger?: boolean;
    open: boolean;
    onconfirm: () => void;
    oncancel: () => void;
  }

  let {
    title = 'Are you sure?',
    message = 'This action cannot be undone.',
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    danger = false,
    open = false,
    onconfirm,
    oncancel,
  }: Props = $props();

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) oncancel();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') oncancel();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="dialog-backdrop" onclick={handleBackdropClick}>
    <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
      {#if title}
        <h3 id="dialog-title" class="dialog-title">{title}</h3>
      {/if}

      <p class="dialog-message">{message}</p>

      <div class="dialog-actions">
        <button class="btn btn-secondary" onclick={oncancel}>
          {cancelLabel}
        </button>
        <button
          class="btn"
          class:btn-danger={danger}
          class:btn-primary={!danger}
          onclick={onconfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .dialog-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    animation: fadeIn 0.15s ease;
  }

  .dialog {
    background: var(--color-bg, #fff);
    border-radius: 12px;
    padding: 1.75rem;
    max-width: 420px;
    width: 90%;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
    animation: slideUp 0.2s ease;
  }

  .dialog-title {
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--color-text, #1a1a2e);
    margin: 0 0 0.6rem;
  }

  .dialog-message {
    font-size: 0.95rem;
    color: var(--color-text-muted, #666);
    margin: 0 0 1.5rem;
    line-height: 1.55;
  }

  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.6rem;
  }

  .btn {
    padding: 0.5rem 1.1rem;
    border-radius: 8px;
    border: 1px solid transparent;
    font-size: 0.9rem;
    font-family: inherit;
    cursor: pointer;
    transition: opacity 0.15s, background 0.15s;
    font-weight: 500;
  }

  .btn-secondary {
    background: var(--color-bg, #f0f0f0);
    color: var(--color-text, #333);
    border-color: var(--color-border, #ddd);
  }

  .btn-secondary:hover {
    background: var(--color-border, #e0e0e0);
  }

  .btn-primary {
    background: var(--color-primary, #3b82f6);
    color: #fff;
  }

  .btn-primary:hover {
    opacity: 0.85;
  }

  .btn-danger {
    background: var(--color-error, #ef4444);
    color: #fff;
  }

  .btn-danger:hover {
    opacity: 0.85;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes slideUp {
    from { transform: translateY(12px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }
</style>
