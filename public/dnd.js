/* Pointer-based drag and drop that works with mouse and touch.
   Items: elements with data-dnd="<list>" and data-id. Handle: .grip inside the item.
   Keyboard: focus a grip and press ArrowUp / ArrowDown. */
(function () {
  'use strict';
  function attach(root, onReorder) {
    const clear = () => root.querySelectorAll('.drop-before,.drop-after').forEach(el => el.classList.remove('drop-before', 'drop-after'));
    root.addEventListener('pointerdown', e => {
      const grip = e.target.closest('.grip'); if (!grip || e.button > 0) return;
      const item = grip.closest('[data-dnd]'); if (!item) return;
      e.preventDefault();
      const list = item.dataset.dnd; let target = null, after = false; let moved = false;
      try { grip.setPointerCapture(e.pointerId); } catch (_) {}
      const scroller = item.closest('.inputs') || document.scrollingElement;
      const move = ev => {
        moved = true; item.classList.add('dragging');
        const el = document.elementFromPoint(ev.clientX, ev.clientY);
        const t = el && el.closest(`[data-dnd="${CSS.escape(list)}"]`);
        clear();
        if (t && t !== item) { const r = t.getBoundingClientRect(); after = ev.clientY > r.top + r.height / 2; t.classList.add(after ? 'drop-after' : 'drop-before'); target = t; } else target = null;
        // auto-scroll near the edges of the scroll container
        const sr = scroller === document.scrollingElement ? { top: 0, bottom: innerHeight } : scroller.getBoundingClientRect();
        if (ev.clientY < sr.top + 48) scroller.scrollBy(0, -12); else if (ev.clientY > sr.bottom - 48) scroller.scrollBy(0, 12);
      };
      const up = () => {
        grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', up); grip.removeEventListener('pointercancel', up);
        item.classList.remove('dragging'); clear();
        if (moved && target) onReorder(list, item.dataset.id, target.dataset.id, after);
      };
      grip.addEventListener('pointermove', move); grip.addEventListener('pointerup', up); grip.addEventListener('pointercancel', up);
    });
    // ▲ ▼ buttons next to the grip
    root.addEventListener('click', e => {
      const b = e.target.closest('.mv'); if (!b) return;
      const item = b.closest('[data-dnd]'); if (!item) return;
      const list = item.dataset.dnd; const dir = +b.dataset.mv;
      const items = [...root.querySelectorAll(`[data-dnd="${CSS.escape(list)}"]`)];
      const i = items.indexOf(item); const j = i + dir;
      if (j < 0 || j >= items.length) return;
      e.preventDefault();
      onReorder(list, item.dataset.id, items[j].dataset.id, dir > 0);
      requestAnimationFrame(() => { const el = root.querySelector(`[data-dnd="${CSS.escape(list)}"][data-id="${CSS.escape(item.dataset.id)}"]`); if (!el) return; const nb = el.querySelector(`.mv[data-mv="${dir}"]`); if (nb) nb.focus(); if (el.classList.contains('card') || el.classList.contains('block') || el.classList.contains('dcard')) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); });
    });
    root.addEventListener('keydown', e => {
      if (!e.target.classList.contains('grip')) return;
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      const item = e.target.closest('[data-dnd]'); if (!item) return;
      const list = item.dataset.dnd;
      const items = [...root.querySelectorAll(`[data-dnd="${CSS.escape(list)}"]`)];
      const i = items.indexOf(item); const j = e.key === 'ArrowUp' ? i - 1 : i + 1;
      if (j < 0 || j >= items.length) return;
      e.preventDefault();
      onReorder(list, item.dataset.id, items[j].dataset.id, e.key === 'ArrowDown');
      // keep focus on the moved item's grip after re-render
      requestAnimationFrame(() => { const g = root.querySelector(`[data-dnd="${CSS.escape(list)}"][data-id="${CSS.escape(item.dataset.id)}"] .grip`); if (g) g.focus(); });
    });
  }
  /** Move id next to targetId inside arr (array of objects with id, or of strings). Returns a new array. */
  function move(arr, id, targetId, after) {
    const key = x => typeof x === 'string' ? x : x.id;
    const from = arr.findIndex(x => key(x) === id); if (from < 0) return arr;
    const item = arr[from]; const rest = arr.filter((_, i) => i !== from);
    let to = rest.findIndex(x => key(x) === targetId); if (to < 0) return arr;
    if (after) to++;
    rest.splice(to, 0, item); return rest;
  }
  /** Reorder handle. mode 'arrows' (big cards: up/down buttons) or 'grip' (table rows: drag dots). Never both. */
  const handle = (mode = 'arrows', label = 'Reorder') => mode === 'grip'
    ? `<span class="handle"><button class="grip" type="button" aria-label="${label}: drag to reorder" title="Drag to reorder">⋮⋮</button></span>`
    : `<span class="handle"><button class="mv" type="button" data-mv="-1" aria-label="${label}: move up" title="Move up">▲</button><button class="mv" type="button" data-mv="1" aria-label="${label}: move down" title="Move down">▼</button></span>`;
  window.DnD = { attach, move, handle };
})();
