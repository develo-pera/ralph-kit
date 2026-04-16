import type { ColumnId } from './types';
import { useBoardStream } from './hooks/useBoardStream';
import { useToast } from './hooks/useToast';
import { Column } from './components/Column';
import { BlockingCard } from './components/BlockingCard';
import { AddDialog } from './components/AddDialog';
import { LogPanel } from './components/LogPanel';
import { Toast } from './components/Toast';
import { ThemeToggle } from './components/ThemeToggle';
import { useState } from 'react';

const COLUMNS: Array<{ id: ColumnId; title: string }> = [
  { id: 'backlog', title: 'Backlog' },
  { id: 'todo', title: 'To Do' },
  { id: 'inProgress', title: 'In Progress' },
  { id: 'blocked', title: 'Blocked' },
  { id: 'done', title: 'Done' },
];

function pillClass(status?: string | null): string {
  if (!status) return '';
  if (/complete|initialized|idle/i.test(status)) return 'ok';
  if (/halt|block|denied|uninitialized|missing/i.test(status)) return 'bad';
  return 'warn';
}

export function App() {
  const { board, connected } = useBoardStream();
  const toast = useToast();
  const [addOpen, setAddOpen] = useState(false);

  const currentTask = board?.columns.inProgress?.[0]?.text;
  const title = currentTask || board?.statusLine || 'Waiting for tasks';
  const loopCount = board?.meta?.loopCount ?? '—';
  const rawStatus = board?.meta?.loopStatus || board?.meta?.state || 'idle';
  const status = connected ? rawStatus : 'disconnected';
  const statusCls = connected ? pillClass(rawStatus) : 'bad';

  const state = board?.meta?.state;
  const isGated = !!board && state !== 'initialized';
  const showAddBtn = state === 'initialized';
  const blockingVariant: 'uninitialized' | 'missing' | null =
    state === 'uninitialized' ? 'uninitialized' : state === 'missing' ? 'missing' : null;

  return (
    <>
      <header>
        <div className="brand">
          <img src="/logo.png" alt="" className="brand-logo" />
          <h1>Ralph&nbsp;Kit</h1>
        </div>
        <div className="meta">
          <span id="title">{title}</span>
          <span id="loop">loop {loopCount}</span>
          <span id="status-pill" className={`pill ${statusCls}`}>
            {status}
          </span>
          {showAddBtn && (
            <button id="add-btn" onClick={() => setAddOpen(true)}>
              + Add task
            </button>
          )}
          <a
            className="header-link"
            href="https://github.com/develo-pera/ralph-kit"
            target="_blank"
            rel="noopener noreferrer"
            title="Open the ralph-kit repo on GitHub"
          >
            GitHub ↗
          </a>
          <ThemeToggle />
        </div>
      </header>

      <Toast message={toast.message} />

      <main id="board" className={isGated ? 'gated' : undefined}>
        {COLUMNS.map((c) => (
          <Column
            key={c.id}
            id={c.id}
            title={c.title}
            cards={board?.columns[c.id] ?? []}
            gated={isGated}
            onError={toast.show}
          />
        ))}

        {blockingVariant && (
          <BlockingCard
            variant={blockingVariant}
            reasons={board?.meta?.reasons ?? []}
            onError={toast.show}
          />
        )}
      </main>

      <LogPanel
        liveTail={board?.meta?.liveTail ?? []}
        lastLine={board?.meta?.lastLiveLine ?? null}
      />

      <AddDialog open={addOpen} onClose={() => setAddOpen(false)} onError={toast.show} />
    </>
  );
}
