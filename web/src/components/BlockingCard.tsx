import { useState } from 'react';

interface Props {
  variant: 'uninitialized' | 'missing';
  reasons: string[];
  onError: (msg: string) => void;
}

export function BlockingCard({ variant, reasons, onError }: Props) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText('/ralph-kit:define');
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      onError('Clipboard blocked — copy manually: /ralph-kit:define');
    }
  };

  if (variant === 'missing') {
    return (
      <div className="blocking-card">
        <h2>No .ralph/ directory</h2>
        <p>
          This directory has no <code>.ralph/</code>. Run <code>ralph-kit init</code> in a terminal or use
          your Ralph implementation's setup command (e.g., <code>ralph enable</code>).
        </p>
        <div className="actions">
          <a
            className="btn-secondary"
            href="https://github.com/develo-pera/ralph-kit#usage"
            target="_blank"
            rel="noopener"
          >
            Open docs
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="blocking-card">
      <h2>Project not defined yet</h2>
      <p>
        Run <code>/ralph-kit:define</code> in Claude Code to create <code>PROMPT.md</code>, specs, and the
        initial backlog.
      </p>
      {reasons.length > 0 && (
        <p className="reasons">{reasons.map((r) => '· ' + r).join('\n')}</p>
      )}
      <div className="actions">
        <button onClick={onCopy}>
          {copied ? 'Copied!' : <>Copy <code>/ralph-kit:define</code></>}
        </button>
        <a
          className="btn-secondary"
          href="https://github.com/develo-pera/ralph-kit#usage"
          target="_blank"
          rel="noopener"
        >
          Open docs
        </a>
      </div>
    </div>
  );
}
