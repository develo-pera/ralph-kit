import { useEffect, useState } from 'react';
import type { Board } from '../types';

export interface BoardStream {
  board: Board | null;
  connected: boolean;
}

export function useBoardStream(): BoardStream {
  const [board, setBoard] = useState<Board | null>(null);
  const [connected, setConnected] = useState(true);

  useEffect(() => {
    const es = new EventSource('/api/stream');
    es.onmessage = (evt) => {
      try {
        setBoard(JSON.parse(evt.data));
        setConnected(true);
      } catch {
        /* ignore */
      }
    };
    es.onerror = () => setConnected(false);
    return () => es.close();
  }, []);

  return { board, connected };
}
