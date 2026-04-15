import { useEffect, useRef, useState } from 'react';

const LS_KEY = 'ralph-kit.live-log.expanded';

interface Props {
  liveTail: string[];
  lastLine: string | null;
}

export function LogPanel({ liveTail, lastLine }: Props) {
  const [expanded, setExpanded] = useState<boolean>(() => localStorage.getItem(LS_KEY) === 'true');
  const [paused, setPaused] = useState(false);
  const [cleared, setCleared] = useState(false);
  const preRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    localStorage.setItem(LS_KEY, String(expanded));
  }, [expanded]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '`' || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName ?? '';
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return;
      setExpanded((x) => !x);
      e.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (cleared || paused) return;
    const el = preRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [liveTail, cleared, paused]);

  const displayText = cleared ? '' : liveTail.join('\n');

  return (
    <div id="log-panel" className={`log-panel${expanded ? '' : ' collapsed'}`}>
      <button className="log-bar" id="log-bar" type="button" onClick={() => setExpanded((x) => !x)}>
        <span className="chevron">▸</span>
        <span className="log-title">Ralph live log</span>
        <span className="log-preview" id="log-preview">
          {lastLine || '(no output yet)'}
        </span>
      </button>
      <div className="log-body" id="log-body">
        <div className="log-header">
          <span className="log-title">Ralph live log</span>
          <div className="log-actions">
            <button
              id="log-clear"
              title="Clear display (file not modified)"
              onClick={() => setCleared(true)}
            >
              Clear
            </button>
            <button
              id="log-pause"
              className={paused ? 'active' : undefined}
              title="Pause auto-scroll"
              onClick={() => setPaused((p) => !p)}
            >
              {paused ? 'Resume scroll' : 'Pause scroll'}
            </button>
            <button
              id="log-collapse"
              title="Collapse (or press `)"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(false);
              }}
            >
              ×
            </button>
          </div>
        </div>
        <pre id="live" ref={preRef}>
          {displayText}
        </pre>
      </div>
    </div>
  );
}
