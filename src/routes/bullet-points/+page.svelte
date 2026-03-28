<script lang="ts">
  import { onMount } from 'svelte';
  import { requireAuth } from '$lib/auth';
  import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';

  interface Bullet {
    id: string;
    content: string;
    bullet_type: 'task' | 'note' | 'event';
    status: 'open' | 'done' | 'migrated';
    indent: number;
    sort_order: number;
    collapsed: boolean;
    set_id: string | null;
    created_at: number;
    updated_at: number;
  }

  interface BulletSet {
    id: string;
    name: string;
    sort_order: number;
    bullet_count: number;
    created_at: number;
    updated_at: number;
  }

  const BULLET_TYPES = ['task', 'note', 'event'] as const;
  const STATUSES = ['open', 'done', 'migrated'] as const;

  const TYPE_SYMBOLS: Record<string, string> = {
    task: '→',
    note: '•',
    event: '○',
  };

  const STATUS_SYMBOLS: Record<string, string> = {
    open: '•',
    done: '✓',
    migrated: '→',
  };

  const STATUS_COLORS: Record<string, string> = {
    open: '#888',
    done: '#22c55e',
    migrated: '#f59e0b',
  };

  let bullets = $state<Bullet[]>([]);
  let sets = $state<BulletSet[]>([]);
  let activeSetId = $state<string | null>(null); // null = All Bullets
  let loading = $state(true);
  let saving = $state(false);
  let textareaRefs: Record<string, HTMLTextAreaElement | null> = {};

  // Drag state (bullets)
  let draggingId = $state<string | null>(null);
  let dropTargetId = $state<string | null>(null);
  let dropPosition = $state<'above' | 'below' | 'inside' | null>(null); // above/below = reorder, inside = make child

  // Drag state (sets)
  let draggingSetId = $state<string | null>(null);
  let dropSetTargetId = $state<string | null>(null);
  let dropSetPosition = $state<'above' | 'below' | null>(null);

  // Set management state
  let renamingSetId = $state<string | null>(null);
  let renamingValue = $state('');
  let showMoveMenu = $state<string | null>(null); // bullet id
  let creatingSet = $state(false);
  let newSetName = $state('');
  let sidebarOpen = $state(true);
  let showUnassigned = $state(false);
  let showInfo = $state(false);
  let deleteDialog = $state<{ open: boolean; setId: string; setName: string }>({
    open: false,
    setId: '',
    setName: '',
  });

  // Derived: bullets filtered by active set
  let filteredBullets = $derived(
    activeSetId === null ? bullets : bullets.filter((b) => b.set_id === activeSetId)
  );

  // Compute visible bullets (respecting collapse)
  let visibleBullets = $derived.by(() => {
    const visible: Bullet[] = [];
    const hiddenStacks: number[] = [];
    const bulletsToShow = activeSetId === null ? bullets : filteredBullets;
    for (const bullet of bulletsToShow) {
      if (hiddenStacks.length === 0) {
        visible.push(bullet);
      }
      const topHidden = hiddenStacks[hiddenStacks.length - 1];
      if (bullet.indent <= topHidden) {
        while (hiddenStacks.length > 0 && hiddenStacks[hiddenStacks.length - 1] >= bullet.indent) {
          hiddenStacks.pop();
        }
        visible.push(bullet);
      }
      if (bullet.collapsed) {
        hiddenStacks.push(bullet.indent);
      }
    }
    return visible;
  });

  let totalBulletCount = $derived(bullets.length);
  let activeSet = $derived(sets.find((s) => s.id === activeSetId));

  function uuid(): string {
    return crypto.randomUUID();
  }

  async function apiFetch(url: string, opts?: RequestInit) {
    const res = await fetch(url, {
      ...opts,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...opts?.headers },
    });
    if (!res.ok) throw new Error(`API error ${res.status}`);
    return res.json();
  }

  async function loadSets() {
    const data = await apiFetch('/api/bullet-sets');
    sets = data.sets ?? [];
  }

  async function loadBullets() {
    const data = await apiFetch('/api/bullets');
    bullets = data.bullets ?? [];
    if (bullets.length === 0) {
      const b = makeBullet('');
      bullets = [b];
      await saveBullet(b);
    }
  }

  function makeBullet(content: string, type = 'task', status = 'open', indent = 0, collapsed = false, setId: string | null = null): Bullet {
    const now = Date.now();
    return {
      id: uuid(),
      content,
      bullet_type: type as Bullet['bullet_type'],
      status: status as Bullet['status'],
      indent,
      sort_order: bullets.length,
      collapsed,
      set_id: setId,
      created_at: now,
      updated_at: now,
    };
  }

  async function saveBullet(b: Bullet) {
    saving = true;
    try {
      await apiFetch('/api/bullets', {
        method: 'POST',
        body: JSON.stringify(b),
      });
    } finally {
      saving = false;
    }
  }

  async function updateBullet(id: string, patch: Partial<Bullet>) {
    const idx = bullets.findIndex((b) => b.id === id);
    if (idx === -1) return;
    bullets[idx] = { ...bullets[idx], ...patch, updated_at: Date.now() };
    bullets = [...bullets]; // trigger reactivity
    await apiFetch(`/api/bullets/${id}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    });
  }

  async function deleteBullet(id: string) {
    const bullet = bullets.find((b) => b.id === id);
    bullets = bullets.filter((b) => b.id !== id);
    await apiFetch(`/api/bullets/${id}`, { method: 'DELETE' }).catch(() => {});
    if (bullets.length === 0) {
      const b = makeBullet('', 'task', 'open', 0, false, activeSetId);
      bullets = [b];
      await saveBullet(b);
    }
    // Refresh sets (count may have changed)
    await loadSets();
  }

  async function createSet(name: string) {
    const s: BulletSet = {
      id: uuid(),
      name: name || 'Untitled Set',
      sort_order: sets.length,
      bullet_count: 0,
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    await apiFetch('/api/bullet-sets', {
      method: 'POST',
      body: JSON.stringify(s),
    });
    sets = [...sets, s];
    newSetName = '';
    creatingSet = false;
  }

  async function renameSet(id: string, name: string) {
    await apiFetch(`/api/bullet-sets/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ name }),
    });
    const idx = sets.findIndex((s) => s.id === id);
    if (idx !== -1) {
      sets[idx] = { ...sets[idx], name, updated_at: Date.now() };
      sets = [...sets];
    }
    renamingSetId = null;
  }

  async function deleteSet(id: string) {
    await apiFetch(`/api/bullet-sets/${id}`, { method: 'DELETE' });
    sets = sets.filter((s) => s.id !== id);
    if (activeSetId === id) {
      activeSetId = null;
    }
    await loadBullets();
  }

  function autoResize(textarea: HTMLTextAreaElement) {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  }

  function handleKeydown(e: KeyboardEvent, bullet: Bullet, idx: number) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const textarea = e.target as HTMLTextAreaElement;
      // Read live value from DOM — oninput hasn't fired yet for the last keystroke
      const liveContent = textarea.value;
      const cursorPos = textarea.selectionStart;
      const before = liveContent.slice(0, cursorPos);
      const after = liveContent.slice(cursorPos);

      const newBullet = makeBullet(after, bullet.bullet_type, 'open', bullet.indent, false, bullet.set_id);
      const realIdx = bullets.indexOf(bullet);
      bullets = [...bullets.slice(0, realIdx + 1), newBullet, ...bullets.slice(realIdx + 1)];
      bullets.forEach((b, i) => (b.sort_order = i));

      setTimeout(() => {
        const ref = textareaRefs[newBullet.id];
        if (ref) {
          ref.focus();
          ref.selectionStart = 0;
          ref.selectionEnd = 0;
          autoResize(ref);
        }
      }, 0);

      saveBullet(newBullet);
      // Also persist the parent's updated content
      const updatedParent = { ...bullet, content: before, updated_at: Date.now() };
      bullets[realIdx] = updatedParent;
      bullets = [...bullets];
      saveBullet(updatedParent);
      loadSets();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        if (bullet.indent > 0) {
          updateBullet(bullet.id, { indent: bullet.indent - 1 });
        }
      } else {
        updateBullet(bullet.id, { indent: bullet.indent + 1 });
      }
    } else if (e.key === 'Backspace' && bullet.content === '') {
      e.preventDefault();
      if (bullets.length > 1) {
        const realIdx = bullets.indexOf(bullet);
        const prevBullet = bullets[realIdx - 1];
        deleteBullet(bullet.id);
        if (prevBullet) {
          setTimeout(() => {
            const ref = textareaRefs[prevBullet.id];
            if (ref) {
              ref.focus();
              const len = ref.value.length;
              ref.selectionStart = len;
              ref.selectionEnd = len;
            }
          }, 0);
        }
      }
    }
  }

  function cycleType(bullet: Bullet) {
    const idx = BULLET_TYPES.indexOf(bullet.bullet_type);
    const next = BULLET_TYPES[(idx + 1) % BULLET_TYPES.length];
    updateBullet(bullet.id, { bullet_type: next });
  }

  function cycleStatus(bullet: Bullet) {
    const idx = STATUSES.indexOf(bullet.status);
    const next = STATUSES[(idx + 1) % STATUSES.length];
    updateBullet(bullet.id, { status: next });
  }

  function hasChildren(bullet: Bullet): boolean {
    const bulletsToCheck = activeSetId === null ? bullets : filteredBullets;
    const realIdx = bulletsToCheck.indexOf(bullet);
    for (let i = realIdx + 1; i < bulletsToCheck.length; i++) {
      if (bulletsToCheck[i].indent > bullet.indent) return true;
      if (bulletsToCheck[i].indent <= bullet.indent) break;
    }
    return false;
  }

  // Get all descendant indices of a bullet (for moving a branch)
  function getDescendantIndices(bullet: Bullet): number[] {
    const idx = bullets.findIndex((b) => b.id === bullet.id);
    if (idx === -1) return [];
    const descendants: number[] = [];
    for (let i = idx + 1; i < bullets.length; i++) {
      if (bullets[i].indent > bullet.indent) {
        descendants.push(i);
      } else {
        break;
      }
    }
    return descendants;
  }

  function handleDragStart(e: DragEvent, bullet: Bullet) {
    draggingId = bullet.id;
    e.dataTransfer!.effectAllowed = 'move';
    e.dataTransfer!.setData('text/plain', bullet.id);
  }

  function handleDragEnd() {
    draggingId = null;
    dropTargetId = null;
    dropPosition = null;
  }

  function handleDragOver(e: DragEvent, targetBullet: Bullet) {
    e.preventDefault();
    if (!draggingId || draggingId === targetBullet.id) return;

    // Don't allow dropping into own descendant (would create a cycle)
    const descendantIdxs = getDescendantIndices(targetBullet);
    const draggingIdx = bullets.findIndex((b) => b.id === draggingId);
    if (descendantIdxs.includes(draggingIdx)) return;

    e.dataTransfer!.dropEffect = 'move';
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const relY = e.clientY - rect.top;
    const threshold = rect.height * 0.4;

    if (relY < threshold) {
      dropTargetId = targetBullet.id;
      dropPosition = 'above';
    } else if (relY > rect.height - threshold) {
      dropTargetId = targetBullet.id;
      dropPosition = 'below';
    } else {
      dropTargetId = targetBullet.id;
      dropPosition = 'inside';
    }
  }

  function handleDragLeave() {
    dropTargetId = null;
    dropPosition = null;
  }

  async function handleDrop(e: DragEvent, targetBullet: Bullet) {
    e.preventDefault();
    if (!draggingId || draggingId === targetBullet.id) {
      handleDragEnd();
      return;
    }

    const draggedIdx = bullets.findIndex((b) => b.id === draggingId);
    const targetIdx = bullets.findIndex((b) => b.id === targetBullet.id);
    if (draggedIdx === -1 || targetIdx === -1) {
      handleDragEnd();
      return;
    }

    const dragged = bullets[draggedIdx];
    const descendants = getDescendantIndices(dragged);
    const allMovedIdxs = [draggedIdx, ...descendants];
    const allMovedIds = new Set(allMovedIdxs.map((i) => bullets[i].id));

    // Determine new indent
    let newIndent = dragged.indent;
    if (dropPosition === 'inside') {
      // Make dragged bullet a child of target
      newIndent = targetBullet.indent + 1;
    } else {
      // Reorder: put before or after target
      newIndent = targetBullet.indent;
    }

    // Remove dragged + descendants from their current positions
    const remaining = bullets.filter((_, i) => !allMovedIds.has(bullets[i].id));
    const draggedBranch = allMovedIdxs.map((i) => bullets[i]);

    // Update indent of root of dragged branch
    draggedBranch[0] = { ...draggedBranch[0], indent: newIndent };

    // Insert at new position
    let insertAt: number;
    if (dropPosition === 'above') {
      insertAt = targetIdx;
    } else if (dropPosition === 'below') {
      // If target is in the dragged branch, insert after the branch
      insertAt = targetIdx > draggedIdx ? targetIdx + 1 : targetIdx;
    } else {
      // inside: insert as first child of target (after target)
      insertAt = targetIdx + 1;
    }

    // Remove target from remaining if it's in dragged branch (handled by filter above, but recalculate insertAt)
    const newBullets = [
      ...remaining.slice(0, insertAt),
      ...draggedBranch,
      ...remaining.slice(insertAt),
    ];

    // Renumber sort_order
    newBullets.forEach((b, i) => (b.sort_order = i));

    bullets = newBullets;

    // Persist: update all moved bullets
    const promises = draggedBranch.map((b) =>
      apiFetch(`/api/bullets/${b.id}`, {
        method: 'PUT',
        body: JSON.stringify({ indent: b.indent, sort_order: b.sort_order }),
      })
    );
    // Also update remaining bullets that shifted
    const remainingUpdated = newBullets
      .filter((b) => !allMovedIds.has(b.id))
      .map((b) => ({ ...b, sort_order: b.sort_order }));

    for (const b of remainingUpdated) {
      const orig = bullets.find((x) => x.id === b.id);
      if (orig && orig.sort_order !== b.sort_order) {
        promises.push(
          apiFetch(`/api/bullets/${b.id}`, {
            method: 'PUT',
            body: JSON.stringify({ sort_order: b.sort_order }),
          })
        );
      }
    }

    await Promise.all(promises);
    handleDragEnd();
  }

  function toggleCollapse(bullet: Bullet) {
    updateBullet(bullet.id, { collapsed: !bullet.collapsed });
  }

  // ---- Sets drag-and-drop ----
  function handleSetDragStart(e: DragEvent, s: BulletSet) {
    draggingSetId = s.id;
    e.dataTransfer!.effectAllowed = 'move';
    e.dataTransfer!.setData('text/plain', s.id);
  }

  function handleSetDragEnd() {
    draggingSetId = null;
    dropSetTargetId = null;
    dropSetPosition = null;
  }

  function handleSetDragOver(e: DragEvent, s: BulletSet) {
    e.preventDefault();
    if (!draggingSetId || draggingSetId === s.id) return;
    e.dataTransfer!.dropEffect = 'move';
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const relY = e.clientY - rect.top;
    dropSetTargetId = s.id;
    dropSetPosition = relY < rect.height / 2 ? 'above' : 'below';
  }

  function handleSetDragLeave() {
    dropSetTargetId = null;
    dropSetPosition = null;
  }

  async function handleSetDrop(e: DragEvent, targetSet: BulletSet) {
    e.preventDefault();
    if (!draggingSetId || draggingSetId === targetSet.id) {
      handleSetDragEnd();
      return;
    }

    const draggedIdx = sets.findIndex((s) => s.id === draggingSetId);
    const targetIdx = sets.findIndex((s) => s.id === targetSet.id);
    if (draggedIdx === -1 || targetIdx === -1) {
      handleSetDragEnd();
      return;
    }

    // Remove dragged from current position
    const draggedSet = sets[draggedIdx];
    const remaining = sets.filter((s) => s.id !== draggingSetId);

    // Insert at new position
    let insertAt = targetIdx;
    if (dropSetPosition === 'below') {
      insertAt = targetIdx > draggedIdx ? targetIdx : targetIdx + 1;
    } else {
      insertAt = targetIdx > draggedIdx ? targetIdx - 1 : targetIdx;
    }
    insertAt = Math.max(0, Math.min(insertAt, remaining.length));

    const newSets = [
      ...remaining.slice(0, insertAt),
      draggedSet,
      ...remaining.slice(insertAt),
    ];

    // Renumber sort_order
    newSets.forEach((s, i) => (s.sort_order = i));
    sets = [...newSets];

    // Persist all sort_orders
    await Promise.all(
      newSets.map((s) =>
        apiFetch(`/api/bullet-sets/${s.id}`, {
          method: 'PUT',
          body: JSON.stringify({ name: s.name, sort_order: s.sort_order }),
        })
      )
    );

    handleSetDragEnd();
  }

  async function moveBulletToSet(bulletId: string, setId: string | null) {
    // Move the bullet and all its descendants to the new set
    const bulletIdx = bullets.findIndex((b) => b.id === bulletId);
    if (bulletIdx === -1) return;

    const bullet = bullets[bulletIdx];
    const targetIndent = bullet.indent;

    // Find all bullets that are descendants (greater indent, and no intermediate
    // bullet at the same or higher level breaks the chain)
    const descendantIndices: number[] = [];
    for (let i = bulletIdx + 1; i < bullets.length; i++) {
      const b = bullets[i];
      if (b.indent > targetIndent) {
        descendantIndices.push(i);
      } else {
        break;
      }
    }

    // Move the parent + all descendants
    const toMove = [bulletIdx, ...descendantIndices];
    const patch = { set_id: setId };

    // Update local state immediately
    for (const idx of toMove) {
      bullets[idx] = { ...bullets[idx], ...patch, updated_at: Date.now() };
    }
    bullets = [...bullets];

    // Persist each one
    const promises = toMove.map((idx) =>
      apiFetch(`/api/bullets/${bullets[idx].id}`, {
        method: 'PUT',
        body: JSON.stringify(patch),
      })
    );
    await Promise.all(promises);

    showMoveMenu = null;
    await loadSets();
  }

  function handleInput(e: Event, bullet: Bullet) {
    const textarea = e.target as HTMLTextAreaElement;
    autoResize(textarea);
    bullet.content = textarea.value;
  }

  function handleBlur(e: FocusEvent, bullet: Bullet) {
    const textarea = e.target as HTMLTextAreaElement;
    bullet.content = textarea.value;
    saveBullet(bullet);
  }

  function startRename(s: BulletSet) {
    renamingSetId = s.id;
    renamingValue = s.name;
  }

  function handleRenameKey(e: KeyboardEvent, s: BulletSet) {
    if (e.key === 'Enter') {
      e.preventDefault();
      renameSet(s.id, renamingValue);
    } else if (e.key === 'Escape') {
      renamingSetId = null;
    }
  }

  function handleCreateSetKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      createSet(newSetName);
    } else if (e.key === 'Escape') {
      creatingSet = false;
      newSetName = '';
    }
  }

  onMount(async () => {
    const ok = await requireAuth();
    if (!ok) return;
    await Promise.all([loadSets(), loadBullets()]);
    loading = false;

    setTimeout(() => {
      bullets.forEach((b) => {
        const ref = textareaRefs[b.id];
        if (ref) autoResize(ref);
      });
    }, 50);
  });
</script>

<svelte:head>
  <title>Bullet Points - Central Web Desk</title>
</svelte:head>

{#if loading}
  <div class="loading">
    <span class="spinner"></span>
    <p>Loading bullets...</p>
  </div>
{:else}
  <div class="bp-layout">
    <!-- Sidebar -->
    <aside class="bp-sidebar" class:open={sidebarOpen}>
      <div class="sidebar-header">
        <h2>Sets</h2>
        <div class="sidebar-header-actions">
          <button class="icon-btn" title="New set" onclick={() => { creatingSet = true; }}>
            +
          </button>
          <button class="icon-btn mobile-only sidebar-close-btn" title="Close panel" onclick={() => sidebarOpen = false}>
            ◀
          </button>
        </div>
      </div>

      <nav class="set-list">
        <!-- All Bullets -->
        <div class="set-item-row" class:active={activeSetId === null}>
          <button class="set-item" onclick={() => activeSetId = null}>
            <span class="set-name">All Bullets</span>
            <span class="set-count">{totalBulletCount}</span>
          </button>
        </div>

        <!-- Individual sets -->
        {#each sets as s (s.id)}
          <div
            class="set-item-row"
            class:active={activeSetId === s.id}
            class:dragging-set={draggingSetId === s.id}
            class:drop-set-above={dropSetTargetId === s.id && dropSetPosition === 'above'}
            class:drop-set-below={dropSetTargetId === s.id && dropSetPosition === 'below'}
            draggable="true"
            ondragstart={(e) => handleSetDragStart(e, s)}
            ondragend={handleSetDragEnd}
            ondragover={(e) => handleSetDragOver(e, s)}
            ondragleave={handleSetDragLeave}
            ondrop={(e) => handleSetDrop(e, s)}
          >
            {#if renamingSetId === s.id}
              <input
                class="rename-input"
                bind:value={renamingValue}
                onkeydown={(e) => handleRenameKey(e, s)}
                onblur={() => renameSet(s.id, renamingValue)}
                autofocus
              />
            {:else}
              <button class="set-item" onclick={() => activeSetId = s.id}>
                <span class="set-name">{s.name}</span>
                <span class="set-count">{s.bullet_count}</span>
              </button>
              <div class="set-actions">
                <button class="action-btn" onclick={() => startRename(s)} title="Rename">✎</button>
                <button class="action-btn danger" onclick={() => deleteDialog = { open: true, setId: s.id, setName: s.name }} title="Delete">✕</button>
              </div>
            {/if}
          </div>
        {/each}

        <!-- New set inline creation -->
        {#if creatingSet}
          <div class="set-item-row">
            <input
              class="rename-input new-set-input"
              placeholder="Set name..."
              bind:value={newSetName}
              onkeydown={handleCreateSetKey}
              onblur={() => { if (!newSetName.trim()) { creatingSet = false; } }}
              autofocus
            />
            <div class="set-actions">
              <button class="action-btn" onclick={() => createSet(newSetName)}>✓</button>
              <button class="action-btn danger" onclick={() => { creatingSet = false; newSetName = ''; }}>✕</button>
            </div>
          </div>
        {/if}
      </nav>
    </aside>

    <!-- Main content -->
    <div class="bp-main">
      <header class="bp-header">
        <div class="bp-title-group">
          <button class="sidebar-toggle" onclick={() => sidebarOpen = !sidebarOpen}>
            {sidebarOpen ? '◀' : '▶'}
          </button>
          <div class="bp-heading-row">
            <h1>{activeSet ? activeSet.name : 'All Bullets'}</h1>
            {#if activeSetId === null}
              <button
                class="toggle-unassigned-btn"
                class:active={showUnassigned}
                onclick={() => showUnassigned = !showUnassigned}
                title="Toggle uncategorized bullets highlight"
              >
                {showUnassigned ? 'Showing uncategorized' : 'Show uncategorized'}
              </button>
            {/if}
          </div>
        </div>
        {#if saving}
          <span class="saving-indicator">Saving...</span>
        {/if}
        <div class="bp-set-heading-row">
          {#if activeSetId !== null}
            <button class="create-in-set-btn" onclick={() => {
              const b = makeBullet('', 'task', 'open', 0, false, activeSetId);
              bullets = [...bullets, b];
              saveBullet(b);
              loadSets();
              setTimeout(() => {
                const ref = textareaRefs[b.id];
                if (ref) { ref.focus(); autoResize(ref); }
              }, 50);
            }}>
              + Add bullet
            </button>
          {/if}
        </div>
        <button
          class="info-btn"
          title="Help & legend"
          onclick={() => showInfo = !showInfo}
          aria-label="Toggle help info"
        >
          {showInfo ? '✕' : 'i'}
        </button>
      </header>

      {#if showInfo}
        <div class="info-panel">
          <p class="subtitle">
            {#if activeSetId === null}
              Viewing all bullets. Press <kbd>Enter</kbd> for a new bullet.
            {:else}
              Press <kbd>Enter</kbd> for a new bullet in this set.
            {/if}
            Drag bullets to reorder or change hierarchy — drop <strong>above/below</strong> to reorder, <strong>on a bullet</strong> to make it a child.
            Use <kbd>Tab</kbd> to indent, <kbd>Shift+Tab</kbd> to outdent.
          </p>
          <div class="legend">
            <span class="legend-item"><span class="legend-sym">•</span> note</span>
            <span class="legend-item"><span class="legend-sym">→</span> task</span>
            <span class="legend-item"><span class="legend-sym">○</span> event</span>
            <span class="legend-divider">·</span>
            <span class="legend-item"><span class="legend-sym" style="color:#888">•</span> open</span>
            <span class="legend-item"><span class="legend-sym" style="color:#22c55e">✓</span> done</span>
            <span class="legend-item"><span class="legend-sym" style="color:#f59e0b">→</span> delegated</span>
          </div>
        </div>
      {/if}

      <div class="bullet-list" role="list">
        {#each visibleBullets as bullet (bullet.id)}
          <div
            class="bullet-row"
            class:collapsed={bullet.collapsed}
            class:dragging={draggingId === bullet.id}
            class:drop-above={dropTargetId === bullet.id && dropPosition === 'above'}
            class:drop-below={dropTargetId === bullet.id && dropPosition === 'below'}
            class:drop-inside={dropTargetId === bullet.id && dropPosition === 'inside'}
            class:unassigned={showUnassigned && bullet.set_id === null}
            role="listitem"
            style="--indent: {bullet.indent}"
            draggable="true"
            ondragstart={(e) => handleDragStart(e, bullet)}
            ondragend={handleDragEnd}
            ondragover={(e) => handleDragOver(e, bullet)}
            ondragleave={handleDragLeave}
            ondrop={(e) => handleDrop(e, bullet)}
          >
            {#if hasChildren(bullet)}
              <button
                type="button"
                class="collapse-btn"
                title={bullet.collapsed ? 'Expand' : 'Collapse'}
                onclick={() => toggleCollapse(bullet)}
                aria-label={bullet.collapsed ? 'Expand' : 'Collapse'}
              >
                {bullet.collapsed ? '▶' : '▼'}
              </button>
            {:else}
              <span class="collapse-spacer"></span>
            {/if}

            <button
              type="button"
              class="indicator type-indicator"
              title="{bullet.bullet_type} (click to change)"
              onclick={() => cycleType(bullet)}
              aria-label="Bullet type: {bullet.bullet_type}"
            >
              {TYPE_SYMBOLS[bullet.bullet_type]}
            </button>

            <button
              type="button"
              class="indicator status-indicator"
              title="{bullet.status} (click to change)"
              style="color: {STATUS_COLORS[bullet.status]}"
              onclick={() => cycleStatus(bullet)}
              aria-label="Bullet status: {bullet.status}"
            >
              {STATUS_SYMBOLS[bullet.status]}
            </button>

            <textarea
              bind:this={textareaRefs[bullet.id]}
              class="bullet-textarea"
              rows="1"
              placeholder="Type a bullet point..."
              value={bullet.content}
              oninput={(e) => handleInput(e, bullet)}
              onkeydown={(e) => handleKeydown(e, bullet, 0)}
              onblur={(e) => handleBlur(e, bullet)}
              aria-label="Bullet content"
            ></textarea>

            <div class="indent-controls">
              <button
                type="button"
                class="indent-btn"
                title="Outdent (Shift+Tab)"
                onclick={() => bullet.indent > 0 && updateBullet(bullet.id, { indent: bullet.indent - 1 })}
                disabled={bullet.indent === 0}
                aria-label="Outdent"
              >
                ‹
              </button>
              <button
                type="button"
                class="indent-btn"
                title="Indent (Tab)"
                onclick={() => updateBullet(bullet.id, { indent: bullet.indent + 1 })}
                aria-label="Indent"
              >
                ›
              </button>
            </div>

            <!-- Move to set menu -->
            <div class="move-menu-wrapper">
              <button
                type="button"
                class="kebab-btn bullet-kebab"
                title="Move to set"
                onclick={() => showMoveMenu = showMoveMenu === bullet.id ? null : bullet.id}
              >
                ⋯
              </button>
              {#if showMoveMenu === bullet.id}
                <div class="move-menu">
                  <button class="move-menu-item" onclick={() => moveBulletToSet(bullet.id, null)}>
                    All Bullets
                  </button>
                  {#each sets as s (s.id)}
                    <button
                      class="move-menu-item"
                      class:active-set={bullet.set_id === s.id}
                      onclick={() => moveBulletToSet(bullet.id, s.id)}
                    >
                      {s.name}
                    </button>
                  {/each}
                </div>
              {/if}
            </div>

            <button
              type="button"
              class="delete-btn"
              title="Delete bullet"
              onclick={() => deleteBullet(bullet.id)}
              aria-label="Delete bullet"
            >
              ✕
            </button>
          </div>
        {/each}
      </div>
    </div>
  </div>
{/if}

<style>
  .bp-layout {
    display: flex;
    min-height: 0;
    flex: 1;
    overflow: hidden;
  }

  /* Sidebar */
  .bp-sidebar {
    width: 0;
    min-width: 0;
    overflow: hidden;
    border-right: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    transition: width 0.2s ease;
  }

  .bp-sidebar.open {
    width: 240px;
    min-width: 240px;
  }

  .sidebar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem;
    border-bottom: 1px solid var(--color-border);
  }

  .sidebar-header h2 {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .sidebar-header-actions {
    display: flex;
    gap: 0.25rem;
    align-items: center;
  }

  .mobile-only {
    display: none;
  }

  @media (max-width: 600px) {
    .mobile-only {
      display: flex;
    }

    .sidebar-header-actions {
      gap: 0.5rem;
    }
  }

  .set-list {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .set-item-row {
    display: flex;
    align-items: center;
    border-radius: 6px;
    transition: background 0.15s;
  }

  .set-item-row:hover {
    background: var(--color-border);
  }

  .set-item-row:hover .set-actions {
    opacity: 1;
  }

  .set-item-row.active {
    background: var(--color-primary);
  }

  .set-item-row.active:hover {
    background: var(--color-primary);
    filter: brightness(0.92);
  }

  .set-item {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.5rem 0.5rem;
    color: var(--color-text);
    font-size: 0.9rem;
    text-align: left;
    gap: 0.5rem;
    min-width: 0;
  }

  .set-item.active {
    color: white;
  }

  .set-item.active .set-count {
    color: rgba(255,255,255,0.7);
  }

  .set-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
  }

  .set-count {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    flex-shrink: 0;
  }

  .set-item-row.active .set-count {
    color: rgba(255,255,255,0.7);
  }

  .set-actions {
    display: flex;
    gap: 1px;
    opacity: 0;
    transition: opacity 0.15s;
    padding: 0 0.4rem 0 0.1rem;
    flex-shrink: 0;
  }

  .set-item-row.active .set-actions {
    opacity: 1;
  }

  .action-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--color-text-muted);
    font-size: 0.85rem;
    padding: 0.15rem 0.25rem;
    border-radius: 4px;
    transition: color 0.15s, background 0.15s;
    line-height: 1;
    min-width: 1.4rem;
    text-align: center;
  }

  .set-item-row.active .action-btn {
    color: rgba(255,255,255,0.8);
  }

  .set-item-row.active .action-btn:hover {
    color: white;
    background: rgba(255,255,255,0.15);
  }

  .action-btn.danger:hover {
    color: var(--color-error);
    background: rgba(239, 68, 68, 0.1);
  }

  .set-item-row.dragging-set {
    opacity: 0.4;
    background: var(--color-border);
    cursor: grabbing;
  }

  .set-item-row.drop-set-above {
    border-top: 2px solid var(--color-primary);
    margin-top: -1px;
  }

  .set-item-row.drop-set-below {
    border-bottom: 2px solid var(--color-primary);
    margin-bottom: -1px;
  }

  .rename-input {
    flex: 1;
    padding: 0.4rem 0.6rem;
    border: 1px solid var(--color-primary);
    border-radius: 6px;
    background: var(--color-bg);
    color: var(--color-text);
    font-size: 0.9rem;
    outline: none;
    margin-right: 0.25rem;
  }

  .new-set-input {
    border-color: var(--color-success);
  }

  /* Main */
  .bp-main {
    flex: 1;
    min-width: 0;
    overflow-y: auto;
    padding: 0 2rem 4rem;
  }

  .bp-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.25rem;
    padding-top: 1.5rem;
  }

  .bp-title-group {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex: 1;
    min-width: 0;
  }

  .bp-header h1 {
    font-size: 1.75rem;
    color: #1a1a2e;
    margin: 0;
  }

  .bp-heading-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .info-btn {
    background: none;
    border: 1px solid var(--color-border);
    cursor: pointer;
    color: var(--color-text-muted);
    font-size: 0.75rem;
    font-weight: 700;
    width: 1.6rem;
    height: 1.6rem;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
    flex-shrink: 0;
    font-style: normal;
    font-family: Georgia, serif;
  }

  .info-btn:hover {
    background: var(--color-border);
    color: var(--color-text);
  }

  .info-panel {
    margin-bottom: 1rem;
    animation: fadeIn 0.15s ease;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .sidebar-toggle {
    background: none;
    border: 1px solid var(--color-border);
    cursor: pointer;
    padding: 0.2rem 0.5rem;
    border-radius: 6px;
    color: var(--color-text-muted);
    font-size: 0.8rem;
    transition: background 0.15s;
  }

  .sidebar-toggle:hover {
    background: var(--color-border);
  }

  .create-in-set-btn {
    background: var(--color-primary);
    color: white;
    border: none;
    padding: 0.35rem 0.85rem;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.85rem;
    transition: opacity 0.15s;
    margin-top: 0.5rem;
    align-self: flex-start;
  }

  .create-in-set-btn:hover {
    opacity: 0.85;
  }

  .subtitle {
    color: var(--color-text-muted);
    font-size: 0.9rem;
    line-height: 1.6;
    margin-bottom: 0.75rem;
  }

  .legend {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8rem;
    color: var(--color-text-muted);
    margin-bottom: 1.25rem;
    flex-wrap: wrap;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .legend-sym {
    font-size: 1.1rem;
    font-weight: 700;
    color: #888;
    min-width: 1rem;
    text-align: center;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  }

  .legend-divider {
    color: var(--color-border);
    margin: 0 0.25rem;
  }

  kbd {
    background: #e5e5e5;
    border: 1px solid #ccc;
    border-radius: 3px;
    padding: 1px 5px;
    font-size: 0.8em;
    font-family: inherit;
  }

  .saving-indicator {
    font-size: 0.8rem;
    color: var(--color-text-muted);
  }

  .bullet-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .bullet-row {
    display: flex;
    align-items: flex-start;
    gap: 0.4rem;
    padding-left: calc(var(--indent, 0) * 1.5rem);
    transition: padding-left 0.15s;
    border-radius: 4px;
    padding-top: 2px;
    padding-bottom: 2px;
    cursor: grab;
  }

  .bullet-row:hover {
    background: rgba(0,0,0,0.02);
  }

  .bullet-row.collapsed .bullet-textarea {
    opacity: 0.7;
  }

  .bullet-row.dragging {
    opacity: 0.4;
    background: var(--color-border);
  }

  .bullet-row.drop-above {
    border-top: 2px solid var(--color-primary);
  }

  .bullet-row.drop-below {
    border-bottom: 2px solid var(--color-primary);
  }

  .bullet-row.drop-inside {
    background: rgba(59, 130, 246, 0.08);
    outline: 1.5px dashed var(--color-primary);
  }

  .bullet-row.unassigned {
    border-left: 3px solid #f59e0b;
    margin-left: -3px;
  }

  .toggle-unassigned-btn {
    margin-left: auto;
    background: none;
    border: 1px solid var(--color-border);
    cursor: pointer;
    color: var(--color-text-muted);
    font-size: 0.8rem;
    padding: 0.3rem 0.75rem;
    border-radius: 6px;
    transition: all 0.15s;
    white-space: nowrap;
  }

  .toggle-unassigned-btn:hover {
    background: var(--color-border);
    color: var(--color-text);
  }

  .toggle-unassigned-btn.active {
    background: #fef3c7;
    border-color: #f59e0b;
    color: #92400e;
  }

  .indicator {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 1.2rem;
    font-weight: 700;
    padding: 0.35rem 0.1rem;
    line-height: 1;
    opacity: 0.5;
    transition: opacity 0.15s, color 0.15s;
    flex-shrink: 0;
    color: #888;
    min-width: 1.4rem;
    text-align: center;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  }

  .indicator:hover {
    opacity: 1;
  }

  .indicator:disabled {
    cursor: default;
  }

  .collapse-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 0.75rem;
    font-weight: 700;
    padding: 0.35rem 0.05rem;
    line-height: 1;
    opacity: 0.4;
    transition: opacity 0.15s;
    flex-shrink: 0;
    color: #888;
    min-width: 0.9rem;
    text-align: center;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  }

  .collapse-btn:hover {
    opacity: 1;
  }

  .collapse-spacer {
    min-width: 0.9rem;
    flex-shrink: 0;
  }

  .bullet-textarea {
    flex: 1;
    border: none;
    background: transparent;
    resize: none;
    font-family: inherit;
    font-size: 1rem;
    line-height: 1.6;
    color: #1a1a2e;
    padding: 0.35rem 0;
    min-height: 1.6em;
    overflow: hidden;
    outline: none;
  }

  .bullet-textarea::placeholder {
    color: #bbb;
  }

  .bullet-textarea:focus {
    background: rgba(0, 212, 255, 0.03);
    border-radius: 4px;
    padding-left: 4px;
    padding-right: 4px;
  }

  .indent-controls {
    display: flex;
    gap: 1px;
    flex-shrink: 0;
  }

  .indent-btn {
    background: none;
    border: 1px solid var(--color-border);
    cursor: pointer;
    color: #aaa;
    font-size: 0.9rem;
    padding: 0.2rem 0.3rem;
    line-height: 1;
    border-radius: 4px;
    transition: background 0.15s, color 0.15s;
    min-width: 1.3rem;
    text-align: center;
  }

  .indent-btn:hover:not(:disabled) {
    background: var(--color-border);
    color: #1a1a2e;
  }

  .indent-btn:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .kebab-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: #aaa;
    font-size: 1rem;
    padding: 0.3rem 0.2rem;
    opacity: 0;
    transition: opacity 0.15s, color 0.15s;
    flex-shrink: 0;
    border-radius: 4px;
    min-width: 1.4rem;
    text-align: center;
  }

  .bullet-row:hover .kebab-btn,
  .bullet-row:hover .delete-btn {
    opacity: 1;
  }

  .kebab-btn:hover {
    color: var(--color-text);
  }

  .kebab-btn.danger:hover {
    color: var(--color-error);
  }

  .bullet-kebab {
    font-size: 1.1rem;
    padding: 0.35rem 0.2rem;
  }

  .delete-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: #ccc;
    font-size: 0.8rem;
    padding: 0.4rem 0.2rem;
    opacity: 0;
    transition: opacity 0.15s, color 0.15s;
    flex-shrink: 0;
  }

  .bullet-row:hover .delete-btn {
    opacity: 1;
  }

  .delete-btn:hover {
    color: var(--color-error);
  }

  /* Move to set menu */
  .move-menu-wrapper {
    position: relative;
    flex-shrink: 0;
  }

  .move-menu {
    position: absolute;
    top: 100%;
    right: 0;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.12);
    min-width: 160px;
    z-index: 50;
    overflow: hidden;
    padding: 0.25rem 0;
  }

  .move-menu-item {
    display: block;
    width: 100%;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.5rem 0.85rem;
    text-align: left;
    font-size: 0.85rem;
    color: var(--color-text);
    transition: background 0.1s;
  }

  .move-menu-item:hover {
    background: var(--color-border);
  }

  .move-menu-item.active-set {
    color: var(--color-primary);
    font-weight: 600;
  }

  .loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    padding: 4rem;
    color: var(--color-text-muted);
  }

  .spinner {
    width: 24px;
    height: 24px;
    border: 2px solid var(--color-border);
    border-top-color: #00d4ff;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .icon-btn {
    background: none;
    border: 1px solid var(--color-border);
    cursor: pointer;
    color: var(--color-text-muted);
    font-size: 0.75rem;
    font-weight: 700;
    padding: 0.35rem 0.5rem;
    border-radius: 6px;
    line-height: 1;
    transition: background 0.15s;
    min-width: 2.2rem;
    min-height: 2.2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  }

  .icon-btn:hover {
    background: var(--color-border);
  }

  @media (max-width: 600px) {
    .bp-sidebar {
      position: fixed;
      top: 4rem;
      left: 0;
      bottom: 0;
      z-index: 40;
      background: var(--color-bg);
      box-shadow: 2px 0 8px rgba(0,0,0,0.1);
    }

    .bp-sidebar.open {
      width: 260px;
    }

    .bp-header {
      flex-wrap: wrap;
    }

    .bp-title-group {
      flex-wrap: wrap;
      flex: 1;
    }

    .bp-heading-row {
      flex: 1;
      min-width: 0;
    }

    .toggle-unassigned-btn {
      margin-top: 0.25rem;
      margin-left: 0;
      flex-basis: 100%;
    }

    .bp-set-heading-row {
      flex-basis: 100%;
    }
  }
</style>

<ConfirmDialog
  open={deleteDialog.open}
  title="Delete set"
  message="Deleting “{deleteDialog.setName}” will permanently remove all bullets in this set. This cannot be undone."
  confirmLabel="Delete set"
  cancelLabel="Cancel"
  danger={true}
  onconfirm={() => { deleteSet(deleteDialog.setId); deleteDialog.open = false; }}
  oncancel={() => deleteDialog.open = false}
/>
