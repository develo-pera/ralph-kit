(() => {
  const COLS = ['backlog', 'todo', 'inProgress', 'blocked', 'done'];
  const LS_LOG_KEY = 'ralph-kit.live-log.expanded';

  const $ = (sel) => document.querySelector(sel);
  const titleEl = $('#title');
  const loopEl = $('#loop');
  const statusPill = $('#status-pill');
  const boardEl = $('#board');
  const blockingCard = $('#blocking-card');
  const blockReasonsEl = $('#block-reasons');
  const addBtn = $('#add-btn');
  const dialog = $('#add-dialog');
  const addForm = $('#add-form');
  const toast = $('#toast');
  const liveEl = $('#live');
  const logPanel = $('#log-panel');
  const logBar = $('#log-bar');
  const logPreview = $('#log-preview');
  const logClear = $('#log-clear');
  const logPause = $('#log-pause');
  const logCollapse = $('#log-collapse');
  const copyDefineBtn = $('#copy-define');

  let paused = false;
  let cleared = false;
  let toastTimer = null;

  function showToast(msg, durationMs = 3500) {
    toast.textContent = msg;
    toast.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add('hidden'), durationMs);
  }

  function setLogExpanded(expanded) {
    if (expanded) {
      logPanel.classList.remove('collapsed');
    } else {
      logPanel.classList.add('collapsed');
    }
    localStorage.setItem(LS_LOG_KEY, String(expanded));
  }

  const initialExpanded = localStorage.getItem(LS_LOG_KEY) === 'true';
  setLogExpanded(initialExpanded);

  logBar.addEventListener('click', () => {
    setLogExpanded(logPanel.classList.contains('collapsed'));
  });
  logCollapse.addEventListener('click', (e) => {
    e.stopPropagation();
    setLogExpanded(false);
  });
  logClear.addEventListener('click', () => {
    cleared = true;
    liveEl.textContent = '';
  });
  logPause.addEventListener('click', () => {
    paused = !paused;
    logPause.classList.toggle('active', paused);
    logPause.textContent = paused ? 'Resume scroll' : 'Pause scroll';
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === '`' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const inField = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '');
      if (inField) return;
      setLogExpanded(logPanel.classList.contains('collapsed'));
      e.preventDefault();
    }
  });

  function render(board) {
    titleEl.textContent = board.title || '(no fix_plan.md)';
    loopEl.textContent = `loop ${board.meta?.loopCount ?? '—'}`;
    const s = board.meta?.loopStatus || board.meta?.state || 'idle';
    statusPill.textContent = s;
    statusPill.className = 'pill ' + pillClass(s);

    const isGated = board.meta?.state !== 'initialized';
    boardEl.classList.toggle('gated', isGated);

    if (board.meta?.state === 'uninitialized') {
      blockingCard.classList.remove('hidden');
      addBtn.classList.add('hidden');
      blockReasonsEl.textContent = (board.meta.reasons || []).map((r) => '· ' + r).join('\n');
    } else if (board.meta?.state === 'missing') {
      blockingCard.classList.remove('hidden');
      blockingCard.querySelector('h2').textContent = 'No .ralph/ directory';
      blockingCard.querySelectorAll('p')[0].innerHTML =
        'This directory has no <code>.ralph/</code>. Run <code>ralph-kit init</code> in a terminal or use your Ralph implementation\'s setup command (e.g., <code>ralph enable</code>).';
      addBtn.classList.add('hidden');
    } else {
      blockingCard.classList.add('hidden');
      addBtn.classList.remove('hidden');
    }

    for (const col of COLS) {
      const ul = document.querySelector(`.col[data-col="${col}"] ul`);
      ul.innerHTML = '';
      for (const card of board.columns[col] || []) {
        ul.appendChild(renderCard(card, col));
      }
    }

    if (!cleared) {
      const tail = (board.meta?.liveTail || []).join('\n');
      liveEl.textContent = tail;
      if (!paused) liveEl.scrollTop = liveEl.scrollHeight;
    }
    const last = board.meta?.lastLiveLine;
    logPreview.textContent = last || '(no output yet)';
  }

  function pillClass(status) {
    if (!status) return '';
    if (/complete|initialized|idle/i.test(status)) return 'ok';
    if (/halt|block|denied|uninitialized|missing/i.test(status)) return 'bad';
    return 'warn';
  }

  function renderCard(card, col) {
    const li = document.createElement('li');
    li.className = 'card' + (card.done ? ' done' : '') + (card.kind === 'banner' ? ' banner' : '');
    li.draggable = card.kind !== 'banner';
    li.dataset.text = card.text;
    li.dataset.source = card.source || 'fix_plan';
    const sub = card.group || card.priority || '';
    li.innerHTML = `${escapeHtml(card.text)}${sub ? `<span class="prio">${escapeHtml(sub)}</span>` : ''}`;
    li.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('application/json', JSON.stringify({ text: card.text, source: li.dataset.source }));
      e.dataTransfer.effectAllowed = 'move';
    });
    return li;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  for (const colEl of document.querySelectorAll('.col')) {
    colEl.addEventListener('dragover', (e) => {
      if (boardEl.classList.contains('gated')) return;
      e.preventDefault();
      colEl.classList.add('drop-target');
    });
    colEl.addEventListener('dragleave', () => colEl.classList.remove('drop-target'));
    colEl.addEventListener('drop', async (e) => {
      e.preventDefault();
      colEl.classList.remove('drop-target');
      if (boardEl.classList.contains('gated')) return;
      let payload;
      try { payload = JSON.parse(e.dataTransfer.getData('application/json')); }
      catch { return; }
      const { text, source } = payload;
      const toColumn = colEl.dataset.col;
      const r = await fetch('/api/task/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, source, toColumn }),
      });
      if (r.status === 409) showToast('Project is not defined yet. Run /ralph-kit:define first.');
      else if (!r.ok) showToast(`Move failed (${r.status})`);
    });
  }

  addBtn.addEventListener('click', () => dialog.showModal());
  dialog.addEventListener('close', async () => {
    const returnValue = dialog.returnValue;
    const text = addForm.text.value.trim();
    const destination = addForm.destination.value;
    addForm.reset();
    dialog.returnValue = '';
    if (returnValue !== 'add') return;
    if (!text) return;
    const r = await fetch('/api/task', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, destination }),
    });
    if (r.status === 409) showToast('Project is not defined yet. Run /ralph-kit:define first.');
    else if (!r.ok) showToast(`Add failed (${r.status})`);
  });

  copyDefineBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText('/ralph-kit:define');
      copyDefineBtn.textContent = 'Copied!';
      setTimeout(() => { copyDefineBtn.innerHTML = 'Copy <code>/ralph-kit:define</code>'; }, 1400);
    } catch {
      showToast('Clipboard blocked — copy manually: /ralph-kit:define');
    }
  });

  const es = new EventSource('/api/stream');
  es.onmessage = (evt) => {
    try { render(JSON.parse(evt.data)); }
    catch { /* ignore */ }
  };
  es.onerror = () => {
    statusPill.textContent = 'disconnected';
    statusPill.className = 'pill bad';
  };
})();
