<script lang="ts">
  import { onMount } from 'svelte';
  import { requireAuth } from '$lib/auth';
  import { marked } from 'marked';
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
    image_url: string | null;
    parent_id: string | null;
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
  let activeSetId = $state<string | null>(null); // null = Recent view
  let loading = $state(true);
  let saving = $state(false);
  let uploadingImage = $state(false);
  let fileInputRef = $state<HTMLInputElement | null>(null);
  let activeUploadBulletId = $state<string | null>(null); // which bullet's image is being uploaded
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
  let moveMenuView = $state<'actions' | 'sets'>('actions'); // mobile sub-view
  let creatingSet = $state(false);
  let newSetName = $state('');
  let sidebarOpen = $state(true);
  let showInfo = $state(false);
  let deleteDialog = $state<{ open: boolean; setId: string; setName: string }>({
    open: false,
    setId: '',
    setName: '',
  });
  let deleteBulletDialog = $state<{ open: boolean; bulletId: string; content: string }>({
    open: false,
    bulletId: '',
    content: '',
  });
  let editingBulletId = $state<string | null>(null); // which bullet is being edited (textarea mode)

  // Derived: bullets filtered by active set, or last 50 by updated_at in Recent view
  // The API returns bullets in the right order — no need to re-sort client-side
  let filteredBullets = $derived.by(() => {
    if (activeSetId === null) {
      return bullets.slice(0, 50);
    }
    return bullets.filter((b) => b.set_id === activeSetId);
  });

  // Compute visible bullets (respecting collapse)
  // Algorithm: walk bullets in order, maintain a stack of ancestor scopes.
  // Each scope: { indent, collapsed }
  // collapsed=true: this node is collapsed, blocks all its descendants
  // No "active" flag — instead, we scan ALL ancestors each time (don't break early)
  // so grandchildren are still caught even after the direct child was blocked.
  let visibleBullets = $derived.by(() => {
    const visible: Bullet[] = [];
    const stack: { indent: number; collapsed: boolean }[] = [];
    const bulletsToShow = activeSetId === null ? bullets : filteredBullets;
    for (const bullet of bulletsToShow) {
      // Exit scopes we've genuinely left (bullet indent <= top scope indent)
      while (stack.length > 0 && bullet.indent <= stack[stack.length - 1].indent) {
        stack.pop();
      }
      // Blocked if ANY ancestor scope is collapsed (check all, don't break early)
      let blocked = false;
      for (let i = 0; i < stack.length; i++) {
        if (stack[i].collapsed) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;
      visible.push(bullet);
      // Push scope for visible bullets (collapsed nodes are visible but block children)
      stack.push({ indent: bullet.indent, collapsed: bullet.collapsed });
    }
    return visible;
  });

  let totalBulletCount = $derived(bullets.length);
  let activeSet = $derived(sets.find((s) => s.id === activeSetId));

  function uuid(): string {
    return crypto.randomUUID();
  }

  function renderMarkdown(text: string): string {
    const result = marked.parse(text, { async: false, gfm: true, breaks: true }) as string;
    // Ensure all links open in new tab
    return result.replace(/<a href="/g, '<a target="_blank" rel="noopener noreferrer" href="');
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

  /**
   * Compute parent_id for every bullet in the array by walking in sort_order.
   * Uses a stack of {id, indent} to track ancestors.
   * Call this whenever indent changes for any bullet — it recalculates the
   * entire parent chain for all bullets in the same set.
   * Returns a new array (does not mutate original).
   */
  function recomputeParentIds(bulletList: Bullet[]): Bullet[] {
    // Group by set, process each set independently
    const bySet = new Map<string, Bullet[]>();
    for (const b of bulletList) {
      if (!bySet.has(b.set_id!)) bySet.set(b.set_id!, []);
      bySet.get(b.set_id!)!.push({ ...b });
    }

    const result: Bullet[] = [];

    for (const [, setBullets] of bySet) {
      // Sort by sort_order (stable)
      const sorted = setBullets.slice().sort((a, b) => a.sort_order - b.sort_order);
      // Stack: each entry is { id, indent } for the chain of ancestors
      // stack[depth] = bullet at that depth; stack is always sorted by depth (0 = root)
      const stack: { id: string; indent: number }[] = [];

      for (const bullet of sorted) {
        // Pop to find the correct parent: top of stack must have indent = bullet.indent - 1
        while (stack.length > 0 && stack[stack.length - 1].indent >= bullet.indent) {
          stack.pop();
        }
        // Parent is top of stack if it has indent = bullet.indent - 1, otherwise null
        const parentId = (stack.length > 0 && stack[stack.length - 1].indent === bullet.indent - 1)
          ? stack[stack.length - 1].id
          : null;

        const idx = bulletList.findIndex((b) => b.id === bullet.id);
        const original = bulletList[idx];
        result.push({ ...original, parent_id: parentId });

        // Push this bullet onto the stack as a potential parent
        stack.push({ id: bullet.id, indent: bullet.indent });
      }
    }

    return result;
  }

  /**
   * Change a bullet's indent to newIndent, recompute parent_ids for the whole set,
   * and persist the changed bullets.
   */
  async function changeIndent(bulletId: string, newIndent: number) {
    const bulletIdx = bullets.findIndex((b) => b.id === bulletId);
    if (bulletIdx === -1) return;
    const bullet = bullets[bulletIdx];
    if (newIndent === bullet.indent) return;
    if (newIndent < 0) return;

    const setId = bullet.set_id!;

    // Update indent locally
    bullets[bulletIdx] = { ...bullets[bulletIdx], indent: newIndent, updated_at: Date.now() };

    // Recompute parent_ids for all bullets in the same set
    const setBullets = bullets.filter((b) => b.set_id === setId);
    const recomputed = recomputeParentIds(setBullets);

    // Find bullets with changed parent_id or indent
    const changedIds = new Set<string>();
    for (const b of recomputed) {
      const orig = bullets.find((x) => x.id === b.id);
      if (orig && (orig.parent_id !== b.parent_id || orig.indent !== b.indent)) {
        changedIds.add(b.id);
      }
    }

    // Merge back
    bullets = bullets.map((b) => {
      if (changedIds.has(b.id)) return recomputed.find((x) => x.id === b.id)!;
      return b;
    });

    // Persist changed bullets
    await Promise.all(
      Array.from(changedIds).map((id) => {
        const b = bullets.find((x) => x.id === id)!;
        return apiFetch(`/api/bullets/${id}`, {
          method: 'PUT',
          body: JSON.stringify({ indent: b.indent, parent_id: b.parent_id }),
        });
      })
    );
  }

  async function loadSets() {
    const data = await apiFetch('/api/bullet-sets');
    sets = data.sets ?? [];
  }

  async function loadBullets() {
    const data = await apiFetch('/api/bullets');
    bullets = (data.bullets ?? []).sort((a, b) => a.sort_order - b.sort_order);
    if (bullets.length === 0) {
      const b = makeBullet('');
      bullets = [b];
      await saveBullet(b);
    }
  }

  function makeBullet(content: string, type = 'task', status = 'open', indent = 0, collapsed = false, setId: string | null = null, parentId: string | null = null): Bullet {
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
      image_url: null,
      parent_id: parentId,
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

  function triggerImageUpload(bulletId: string) {
    activeUploadBulletId = bulletId;
    fileInputRef?.click();
  }

  async function handleImageFileChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !activeUploadBulletId) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif'];
    if (!allowedTypes.includes(file.type)) {
      alert('Unsupported file type. Please use JPEG, PNG, GIF, WebP, or AVIF.');
      input.value = '';
      activeUploadBulletId = null;
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      alert('File too large. Maximum size is 10MB.');
      input.value = '';
      activeUploadBulletId = null;
      return;
    }

    uploadingImage = true;
    try {
      const res = await fetch(`/api/bullets/${activeUploadBulletId}/image`, {
        method: 'POST',
        credentials: 'include',
        body: file,
        headers: { 'Content-Type': file.type },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Upload failed' }));
        alert(err.error ?? 'Upload failed');
        return;
      }

      const data = await res.json();
      // Update local bullet with new image
      const idx = bullets.findIndex((b) => b.id === activeUploadBulletId);
      if (idx !== -1) {
        bullets[idx] = { ...bullets[idx], image_url: data.image_url, updated_at: Date.now() };
        bullets = [...bullets];
      }
    } catch (err) {
      alert('Upload failed: ' + (err as Error).message);
    } finally {
      uploadingImage = false;
      activeUploadBulletId = null;
      input.value = '';
    }
  }

  async function deleteBulletImage(bulletId: string) {
    if (!confirm('Remove this image?')) return;
    try {
      await fetch(`/api/bullets/${bulletId}/image`, { method: 'DELETE', credentials: 'include' });
      const idx = bullets.findIndex((b) => b.id === bulletId);
      if (idx !== -1) {
        bullets[idx] = { ...bullets[idx], image_url: null, updated_at: Date.now() };
        bullets = [...bullets];
      }
    } catch (err) {
      alert('Failed to remove image: ' + (err as Error).message);
    }
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
      // Read live value from DOM - oninput hasn't fired yet for the last keystroke
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
      const newIndent = e.shiftKey
        ? Math.max(0, bullet.indent - 1)
        : bullet.indent + 1;

      if (newIndent === bullet.indent) return;

      const setId = bullet.set_id!;

      // Update indent locally
      const bulletIdx = bullets.findIndex((b) => b.id === bullet.id);
      if (bulletIdx === -1) return;

      bullets[bulletIdx] = { ...bullets[bulletIdx], indent: newIndent, updated_at: Date.now() };

      // Recompute parent_ids for all bullets in the same set
      const setBullets = bullets.filter((b) => b.set_id === setId);
      const recomputed = recomputeParentIds(setBullets);

      // Find bullets with changed parent_id or changed indent
      const changedBullets: Bullet[] = [];
      for (const b of recomputed) {
        const orig = bullets.find((x) => x.id === b.id);
        if (!orig) continue;
        if (orig.parent_id !== b.parent_id || orig.indent !== b.indent) {
          changedBullets.push(b);
        }
      }

      // Merge recomputed bullets back into main list
      const changedIds = new Set(changedBullets.map((b) => b.id));
      bullets = bullets.map((b) => {
        if (changedIds.has(b.id)) {
          return recomputed.find((x) => x.id === b.id)!;
        }
        return b;
      });

      // Persist changed bullets (fire-and-forget — don't block the thread)
      Promise.all(
        changedBullets.map((b) =>
          apiFetch(`/api/bullets/${b.id}`, {
            method: 'PUT',
            body: JSON.stringify({ indent: b.indent, parent_id: b.parent_id }),
          })
        )
      );
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
    // Capture draggingId immediately — dragend fires synchronously after drop and clears it
    const draggedId = draggingId;
    if (!draggedId || draggedId === targetBullet.id) {
      handleDragEnd();
      return;
    }

    const draggedIdx = bullets.findIndex((b) => b.id === draggedId);
    const targetIdx = bullets.findIndex((b) => b.id === targetBullet.id);
    if (draggedIdx === -1 || targetIdx === -1) {
      handleDragEnd();
      return;
    }

    const dragged = bullets[draggedIdx];
    const descendants = getDescendantIndices(dragged);
    const allMovedIdxs = [draggedIdx, ...descendants];
    const allMovedIds = new Set(allMovedIdxs.map((i) => bullets[i].id));

    // Determine new indent (reparent signals a new parent_id we'll compute below)
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
      insertAt = targetIdx > draggedIdx ? targetIdx + 1 : targetIdx;
    } else {
      // inside: insert as first child of target (after target)
      insertAt = targetIdx + 1;
    }

    const newBullets = [
      ...remaining.slice(0, insertAt),
      ...draggedBranch,
      ...remaining.slice(insertAt),
    ];

    // Renumber sort_order
    newBullets.forEach((b, i) => (b.sort_order = i));

    // Recompute parent_ids for the entire set — this correctly handles:
    // - The reparented bullet's new parent (from dropPosition='inside')
    // - All other bullets whose ancestor chain changed
    const setId = dragged.set_id!;
    const setBullets = newBullets.filter((b) => b.set_id === setId);
    const recomputed = recomputeParentIds(newBullets);

    // Merge back — replace all bullets in the same set with recomputed versions
    const changedIds = new Set<string>();
    for (const b of recomputed) {
      const orig = newBullets.find((x) => x.id === b.id);
      if (orig && (orig.parent_id !== b.parent_id || orig.indent !== b.indent)) {
        changedIds.add(b.id);
      }
    }
    bullets = newBullets.map((b) => {
      const r = recomputed.find((x) => x.id === b.id);
      return r ?? b;
    });

    // Also update updated_at on every bullet whose sort_order changed
    // (needed for the ORDER BY sort_order ASC, updated_at DESC secondary sort to be deterministic)
    const now = Date.now();
    const sortOrderChanged: Bullet[] = [];
    for (const b of bullets) {
      const orig = newBullets.find((x) => x.id === b.id);
      if (orig && orig.sort_order !== b.sort_order) {
        b.updated_at = now;
        sortOrderChanged.push(b);
      }
    }
    bullets = [...bullets];

    // Persist changed bullets (parent_id/indent changes) — include updated_at for correct ordering
    const promises = Array.from(changedIds).map((id) => {
      const b = bullets.find((x) => x.id === id)!;
      return apiFetch(`/api/bullets/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ indent: b.indent, parent_id: b.parent_id, sort_order: b.sort_order, updated_at: now }),
      });
    });

    // Also persist sort_order + updated_at for bullets whose sort_order changed
    for (const b of sortOrderChanged) {
      promises.push(
        apiFetch(`/api/bullets/${b.id}`, {
          method: 'PUT',
          body: JSON.stringify({ sort_order: b.sort_order }),
        })
      );
    }

    await Promise.all(promises);
    handleDragEnd();
  }

  function toggleCollapse(bullet: Bullet) {
    updateBullet(bullet.id, { collapsed: !bullet.collapsed });
  }

  async function collapseAll() {
    const toCollapse = bullets
      .filter((b) => !b.collapsed && hasChildren(b))
      .map((b) => b.id);

    if (toCollapse.length === 0) return;

    for (const id of toCollapse) {
      const idx = bullets.findIndex((b) => b.id === id);
      if (idx !== -1) {
        bullets[idx] = { ...bullets[idx], collapsed: true, updated_at: Date.now() };
      }
    }
    bullets = [...bullets];

    await Promise.all(
      toCollapse.map((id) =>
        apiFetch(`/api/bullets/${id}`, {
          method: 'PUT',
          body: JSON.stringify({ collapsed: true }),
        })
      )
    );
  }

  async function expandAll() {
    // Find all bullets that have children and are currently collapsed
    const toExpand = bullets
      .filter((b) => b.collapsed && hasChildren(b))
      .map((b) => b.id);

    if (toExpand.length === 0) return;

    // Update local state immediately
    for (const id of toExpand) {
      const idx = bullets.findIndex((b) => b.id === id);
      if (idx !== -1) {
        bullets[idx] = { ...bullets[idx], collapsed: false, updated_at: Date.now() };
      }
    }
    bullets = [...bullets];

    // Persist all in parallel
    await Promise.all(
      toExpand.map((id) =>
        apiFetch(`/api/bullets/${id}`, {
          method: 'PUT',
          body: JSON.stringify({ collapsed: false }),
        })
      )
    );
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
    editingBulletId = null;
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

  function handleOutsideClick(e: MouseEvent) {
    if (window.matchMedia('(max-width: 600px)').matches) {
      const sidebar = document.querySelector('.bp-sidebar');
      const backdrop = document.querySelector('.sidebar-backdrop');
      const toggle = document.querySelector('.sidebar-toggle');
      if (
        sidebarOpen &&
        sidebar &&
        !sidebar.contains(e.target as Node) &&
        !backdrop?.contains(e.target as Node) &&
        !toggle?.contains(e.target as Node)
      ) {
        sidebarOpen = false;
      }
    }
  }
</script>

<svelte:head>
  <title>Bullet Points - Central Web Desk</title>
</svelte:head>

<svelte:window onclick={handleOutsideClick} />

{#if loading}
  <div class="loading">
    <span class="spinner"></span>
    <p>Loading bullets...</p>
  </div>
{:else}
  <div class="bp-layout">
    <!-- Sidebar -->
    {#if sidebarOpen}
      <div class="sidebar-backdrop" onclick={() => sidebarOpen = false} role="presentation"></div>
    {/if}
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
        <!-- Recent -->
        <div class="set-item-row" class:active={activeSetId === null}>
          <button class="set-item" onclick={() => activeSetId = null}>
            <span class="set-name">Recent</span>
            <span class="set-count">{Math.min(bullets.length, 50)}</span>
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
            <h1>{activeSet ? activeSet.name : 'Recent'}</h1>
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
            {#if bullets.some((b) => b.collapsed && hasChildren(b))}
              <button
                class="expand-all-btn"
                onclick={expandAll}
                title="Expand all collapsed nodes"
              >
                ⬇ Expand All
              </button>
            {/if}
            {#if bullets.some((b) => !b.collapsed && hasChildren(b))}
              <button
                class="collapse-all-btn"
                onclick={collapseAll}
                title="Collapse all parent nodes"
              >
                ⬆ Collapse All
              </button>
            {/if}
          </div>
        </div>
        {#if saving}
          <span class="saving-indicator">Saving...</span>
        {/if}
        <button
          class="info-btn"
          title="Help & legend"
          onclick={() => showInfo = !showInfo}
          aria-label="Toggle help info"
        >
          {#if showInfo}
            ✕
          {:else}
            <img src="/info-icon.svg" alt="" aria-hidden="true" class="info-icon-img" />
          {/if}
        </button>
      </header>

      {#if showInfo}
        <div class="info-panel">
          <p class="subtitle">
            {#if activeSetId !== null}
              Press <kbd>Enter</kbd> for a new bullet in this set.
            {:else}
              Recent bullets — last {filteredBullets.length} updated.
            {/if}
            Drag bullets to reorder or change hierarchy - drop <strong>above/below</strong> to reorder, <strong>on a bullet</strong> to make it a child.
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

            {#if editingBulletId === bullet.id}
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
            {:else}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="bullet-content"
                onclick={() => { editingBulletId = bullet.id; setTimeout(() => { const ref = textareaRefs[bullet.id]; if (ref) { ref.focus(); autoResize(ref); } }, 0); }}
              >{@html renderMarkdown(bullet.content) || '<span class="placeholder">Type a bullet point...</span>'}</div>
            {/if}

            {#if bullet.image_url}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div class="bullet-image-wrapper">
                <a
                  href="/api/images/{bullet.id}"
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open full image"
                >
                  <img
                    src="/api/images/{bullet.id}"
                    alt="Bullet attachment"
                    class="bullet-thumbnail"
                  />
                </a>
                <button
                  type="button"
                  class="image-remove-btn"
                  title="Remove image"
                  onclick={() => deleteBulletImage(bullet.id)}
                  aria-label="Remove image"
                >
                  ✕
                </button>
              </div>
            {:else}
              <button
                type="button"
                class="image-btn"
                title="Add image"
                onclick={() => triggerImageUpload(bullet.id)}
                aria-label="Add image"
              >
                📷
              </button>
            {/if}

            <!-- Move to set menu -->
            <div class="move-menu-wrapper">
              <button
                type="button"
                class="kebab-btn bullet-kebab"
                title="Actions"
                onclick={() => { showMoveMenu = showMoveMenu === bullet.id ? null : bullet.id; moveMenuView = 'actions'; }}
              >
                ⋯
              </button>
              {#if showMoveMenu === bullet.id}
                <div class="move-menu">
                  {#if moveMenuView === 'actions'}
                    <button class="move-menu-item" onclick={() => { changeIndent(bullet.id, bullet.indent - 1); showMoveMenu = null; }}>
                      ‹ Outdent
                    </button>
                    <button class="move-menu-item" onclick={() => { changeIndent(bullet.id, bullet.indent + 1); showMoveMenu = null; }}>
                      › Indent
                    </button>
                    <div class="move-menu-divider"></div>
                    {#if !bullet.image_url}
                      <button class="move-menu-item" onclick={() => { triggerImageUpload(bullet.id); showMoveMenu = null; }}>
                        📷 Add image
                      </button>
                    {:else}
                      <button class="move-menu-item danger" onclick={() => { deleteBulletImage(bullet.id); showMoveMenu = null; }}>
                        ✕ Remove image
                      </button>
                    {/if}
                    <button class="move-menu-item" onclick={() => moveMenuView = 'sets'}>
                      Move to Set →
                    </button>
                    <button class="move-menu-item danger" onclick={() => { deleteBulletDialog = { open: true, bulletId: bullet.id, content: bullet.content.slice(0, 50) }; showMoveMenu = null; }}>
                      ✕ Delete bullet
                    </button>
                  {:else}
                    <button class="move-menu-item move-menu-back" onclick={() => moveMenuView = 'actions'}>
                      ◀ Back
                    </button>
                    <div class="move-menu-divider"></div>
                    {#each sets as s (s.id)}
                      <button
                        class="move-menu-item"
                        class:active-set={bullet.set_id === s.id}
                        onclick={() => { moveBulletToSet(bullet.id, s.id); showMoveMenu = null; moveMenuView = 'actions'; }}
                      >
                        {s.name}
                      </button>
                    {/each}
                  {/if}
                </div>
              {/if}
            </div>

            <button
              type="button"
              class="delete-btn"
              title="Delete bullet"
              onclick={() => deleteBulletDialog = { open: true, bulletId: bullet.id, content: bullet.content.slice(0, 50) }}
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

<!-- Hidden file input for image uploads -->
<input
  bind:this={fileInputRef}
  type="file"
  accept="image/jpeg,image/png,image/gif,image/webp,image/avif"
  style="display:none"
  onchange={handleImageFileChange}
/>

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
    font-size: 0.9rem;
    font-weight: 400;
    width: 1.6rem;
    height: 1.6rem;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
    flex-shrink: 0;
  }

  .info-btn:hover {
    background: var(--color-border);
    color: var(--color-text);
  }

  .info-icon-img {
    width: 1.1rem;
    height: 1.1rem;
    pointer-events: none;
    display: block;
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

  .expand-all-btn {
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

  .expand-all-btn:hover {
    background: var(--color-border);
    color: var(--color-text);
  }

  .collapse-all-btn {
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

  .collapse-all-btn:hover {
    background: var(--color-border);
    color: var(--color-text);
  }

  @media (max-width: 600px) {
    .create-in-set-btn {
      flex-basis: 100%;
    }

    .expand-all-btn,
    .collapse-all-btn {
      flex-basis: 100%;
    }
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

  /* Rendered bullet content (non-edit mode) */
  .bullet-content {
    flex: 1;
    font-family: inherit;
    font-size: 1rem;
    line-height: 1.6;
    color: #1a1a2e;
    padding: 0.35rem 4px;
    min-height: 1.6em;
    border-radius: 4px;
    cursor: text;
    word-break: break-word;
    overflow-wrap: break-word;
  }

  .bullet-content:hover {
    background: rgba(0, 212, 255, 0.03);
  }

  .bullet-content .placeholder {
    color: #bbb;
  }

  .bullet-content a {
    color: #3b82f6;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .bullet-content a:hover {
    color: #1d4ed8;
  }

  .bullet-content strong {
    font-weight: 600;
  }

  .bullet-content em {
    font-style: italic;
  }

  .bullet-content code {
    background: rgba(0, 0, 0, 0.06);
    border-radius: 3px;
    padding: 0.05em 0.3em;
    font-size: 0.9em;
    font-family: 'Fira Code', 'Cascadia Code', monospace;
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

  /* Desktop: all row actions live in the ⋯ menu — hide the standalone action buttons */
  @media (min-width: 601px) {
    .image-btn {
      display: none;
    }

    .indent-controls {
      display: none;
    }

    .delete-btn {
      display: none;
    }

    /* Kebab is always visible on desktop too */
    .bullet-kebab {
      opacity: 1;
    }
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

  .move-menu-divider {
    height: 1px;
    background: var(--color-border);
    margin: 0.25rem 0;
  }

  .move-menu-back {
    color: var(--color-text-muted);
    font-size: 0.85rem;
  }

  .move-menu-item.danger {
    color: var(--color-error);
  }

  .move-menu-item.danger:hover {
    background: rgba(239, 68, 68, 0.1);
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
    /* On mobile the ⋯ button is the only always-visible action; indent controls and delete are in the menu */
    .bullet-kebab {
      opacity: 1;
    }

    /* Larger ⋯ tap target on mobile */
    .bullet-kebab {
      font-size: 1.3rem;
      padding: 0.4rem 0.3rem;
      min-width: 2rem;
    }

    /* Hide indent controls on mobile — now in the ⋯ menu */
    .indent-controls {
      display: none;
    }

    /* Hide delete button on mobile — now in the ⋯ menu */
    .delete-btn {
      display: none;
    }

    .sidebar-backdrop {
      display: none;
    }

    .sidebar-backdrop.open {
      display: block;
      position: fixed;
      top: 4rem;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.3);
      z-index: 39;
    }

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
      flex-direction: column;
      align-items: flex-start;
      gap: 0;
      flex: 1;
    }

    .bp-heading-row {
      flex: 1;
      min-width: 0;
      width: 100%;
      align-items: flex-start;
      margin-left: 0;
    }

    .create-in-set-btn {
      flex-basis: 100%;
    }

    /* Reclaim horizontal space for bullets */
    .bp-main {
      padding-left: 0.5rem;
      padding-right: 0.5rem;
    }

    .bp-header {
      padding-top: 0.75rem;
      padding-left: 0.5rem;
      padding-right: 0.5rem;
    }

    /* Shrink the sidebar toggle button on mobile */
    .sidebar-toggle {
      padding: 0.15rem 0.35rem;
      font-size: 0.7rem;
    }

    /* Tighter indent on mobile so nested bullets don't overflow */
    .bullet-row {
      padding-left: calc(var(--indent, 0) * 1rem);
    }
  }

  /* Image attachments */
  .bullet-image-wrapper {
    position: relative;
    display: inline-block;
    flex-shrink: 0;
    margin: 0.25rem 0;
  }

  .bullet-thumbnail {
    display: block;
    width: 200px;
    height: 200px;
    object-fit: cover;
    border-radius: 8px;
    border: 1px solid var(--color-border);
    cursor: pointer;
    transition: opacity 0.15s;
  }

  .bullet-thumbnail:hover {
    opacity: 0.85;
  }

  .image-remove-btn {
    position: absolute;
    top: 4px;
    right: 4px;
    background: rgba(0, 0, 0, 0.55);
    border: none;
    border-radius: 50%;
    color: white;
    cursor: pointer;
    font-size: 0.65rem;
    width: 1.3rem;
    height: 1.3rem;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.15s;
    line-height: 1;
    padding: 0;
  }

  .bullet-image-wrapper:hover .image-remove-btn {
    opacity: 1;
  }

  .image-btn {
    background: none;
    border: 1px solid var(--color-border);
    cursor: pointer;
    color: #aaa;
    font-size: 0.9rem;
    padding: 0.25rem 0.3rem;
    line-height: 1;
    border-radius: 4px;
    transition: background 0.15s, color 0.15s;
    flex-shrink: 0;
    min-width: 1.5rem;
    text-align: center;
  }

  .bullet-row:hover .image-btn {
    opacity: 1;
  }

  .image-btn:hover {
    background: var(--color-border);
    color: #555;
  }

  @media (max-width: 600px) {
    .image-btn {
      opacity: 1;
      font-size: 1rem;
      padding: 0.3rem 0.4rem;
    }

    .bullet-thumbnail {
      width: 120px;
      height: 120px;
    }
  }
</style>

<ConfirmDialog
  open={deleteDialog.open}
  title="Delete set"
  message={'Deleting "' + deleteDialog.setName + '" will permanently remove all bullets in this set. This cannot be undone.'}
  confirmLabel="Delete set"
  cancelLabel="Cancel"
  danger={true}
  onconfirm={() => { deleteSet(deleteDialog.setId); deleteDialog.open = false; }}
  oncancel={() => deleteDialog.open = false}
/>

<ConfirmDialog
  open={deleteBulletDialog.open}
  title="Delete bullet"
  message={deleteBulletDialog.content ? 'Delete this bullet: "' + deleteBulletDialog.content + '"?' : 'Delete this bullet?'}
  confirmLabel="Delete bullet"
  cancelLabel="Cancel"
  danger={true}
  onconfirm={() => { deleteBullet(deleteBulletDialog.bulletId); deleteBulletDialog.open = false; }}
  oncancel={() => deleteBulletDialog.open = false}
/>
