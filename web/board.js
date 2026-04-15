(() => {
  const COLS = ['upNext', 'inProgress', 'backlog', 'done'];
  const COL_TO_PRIORITY = {
    upNext: 'High Priority',
    inProgress: 'High Priority',
    backlog: 'Medium Priority',
    done: 'Completed',
  };

  const $ = (sel) => document.querySelector(sel);
  const titleEl = $('#title');
  const loopEl = $('#loop');
  const statusPill = $('#status-pill');
  const banner = $('#blocked-banner');
  const liveEl = $('#live');
  const addBtn = $('#add-btn');
  const dialog = $('#add-dialog');

  function render(board) {
    titleEl.textContent = board.title || '(no fix_plan.md)';
    loopEl.textContent = `loop ${board.meta?.loopCount ?? '—'}`;
    statusPill.textContent = board.meta?.status || 'idle';
    statusPill.className = 'pill ' + pillClass(board.meta?.status);

    if (board.meta?.blocked) {
      banner.classList.remove('hidden');
      banner.textContent = board.columns.blocked.map((c) => c.text).join(' · ');
    } else {
      banner.classList.add('hidden');
    }

    for (const col of COLS) {
      const ul = document.querySelector(`.col[data-col="${col}"] ul`);
      ul.innerHTML = '';
      for (const card of board.columns[col] || []) {
        ul.appendChild(renderCard(card, col));
      }
    }

    liveEl.textContent = (board.meta?.liveTail || []).join('\n');
    liveEl.scrollTop = liveEl.scrollHeight;
  }

  function pillClass(status) {
    if (!status) return '';
    if (/complete|idle/i.test(status)) return 'ok';
    if (/halt|block|denied/i.test(status)) return 'bad';
    return 'warn';
  }

  function renderCard(card, col) {
    const li = document.createElement('li');
    li.className = 'card' + (card.done ? ' done' : '');
    li.draggable = true;
    li.dataset.text = card.text;
    li.innerHTML = `${escapeHtml(card.text)}<span class="prio">${card.priority}</span>`;
    li.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', card.text);
      e.dataTransfer.effectAllowed = 'move';
    });
    return li;
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  for (const colEl of document.querySelectorAll('.col')) {
    colEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      colEl.classList.add('drop-target');
    });
    colEl.addEventListener('dragleave', () => colEl.classList.remove('drop-target'));
    colEl.addEventListener('drop', async (e) => {
      e.preventDefault();
      colEl.classList.remove('drop-target');
      const text = e.dataTransfer.getData('text/plain');
      const toCol = colEl.dataset.col;
      if (toCol === 'done') {
        await fetch('/api/task/toggle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
      } else {
        await fetch('/api/task/move', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, toPriority: COL_TO_PRIORITY[toCol] }),
        });
      }
    });
  }

  addBtn.addEventListener('click', () => dialog.showModal());
  dialog.addEventListener('close', async () => {
    if (dialog.returnValue !== 'add') return;
    const form = dialog.querySelector('form');
    const text = form.text.value.trim();
    const priority = form.priority.value;
    if (!text) return;
    await fetch('/api/task', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, priority }),
    });
    form.reset();
  });

  const es = new EventSource('/api/stream');
  es.onmessage = (evt) => {
    try {
      render(JSON.parse(evt.data));
    } catch {
      /* ignore */
    }
  };
  es.onerror = () => {
    statusPill.textContent = 'disconnected';
    statusPill.className = 'pill bad';
  };
})();
