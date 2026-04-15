export type ColumnId = 'backlog' | 'todo' | 'inProgress' | 'blocked' | 'done';

export interface Card {
  text: string;
  source?: string;
  group?: string;
  priority?: string;
  done?: boolean;
  kind?: 'banner';
}

export interface BoardMeta {
  state?: 'initialized' | 'uninitialized' | 'missing' | string;
  reasons?: string[];
  blocked?: boolean;
  liveTail?: string[];
  loopCount?: number | null;
  loopStatus?: string | null;
  lastLiveLine?: string | null;
}

export interface Board {
  cwd?: string;
  title?: string | null;
  statusLine?: string | null;
  columns: Record<ColumnId, Card[]>;
  meta: BoardMeta;
}

export type Destination = 'backlog' | 'todo' | 'blocked';
