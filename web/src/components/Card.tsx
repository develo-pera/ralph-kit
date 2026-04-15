import type { Card as CardType } from '../types';

interface Props {
  card: CardType;
}

export function Card({ card }: Props) {
  const isBanner = card.kind === 'banner';
  const classes = ['card'];
  if (card.done) classes.push('done');
  if (isBanner) classes.push('banner');

  const sub = card.group || card.priority || '';
  const source = card.source || 'fix_plan';

  const onDragStart = (e: React.DragEvent<HTMLLIElement>) => {
    if (isBanner) return;
    e.dataTransfer.setData('application/json', JSON.stringify({ text: card.text, source }));
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <li
      className={classes.join(' ')}
      draggable={!isBanner}
      data-text={card.text}
      data-source={source}
      onDragStart={onDragStart}
    >
      {card.text}
      {sub && <span className="prio">{sub}</span>}
    </li>
  );
}
