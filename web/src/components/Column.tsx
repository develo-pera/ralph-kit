import { useState } from 'react';
import type { Card as CardType, ColumnId } from '../types';
import { Card } from './Card';
import { moveTask } from '../api';

interface Props {
  id: ColumnId;
  title: string;
  cards: CardType[];
  gated: boolean;
  onError: (msg: string) => void;
}

interface DragPayload {
  text: string;
  source: string;
}

export function Column({ id, title, cards, gated, onError }: Props) {
  const [dropping, setDropping] = useState(false);

  const onDragOver = (e: React.DragEvent<HTMLElement>) => {
    if (gated) return;
    e.preventDefault();
    setDropping(true);
  };

  const onDragLeave = () => setDropping(false);

  const onDrop = async (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    setDropping(false);
    if (gated) return;
    let payload: DragPayload;
    try {
      payload = JSON.parse(e.dataTransfer.getData('application/json')) as DragPayload;
    } catch {
      return;
    }
    const r = await moveTask(payload.text, payload.source, id);
    if (r.status === 409) onError('Project is not defined yet. Run /ralph-kit:define first.');
    else if (!r.ok) onError(`Move failed (${r.status})`);
  };

  return (
    <section
      className={`col${dropping ? ' drop-target' : ''}`}
      data-col={id}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <h2>
        {title}
        <span className="col-count" aria-label={`${cards.length} card${cards.length === 1 ? '' : 's'}`}>
          {cards.length}
        </span>
      </h2>
      <ul>
        {cards.map((card, i) => (
          <Card key={`${card.source ?? 'x'}:${card.text}:${i}`} card={card} />
        ))}
      </ul>
    </section>
  );
}
