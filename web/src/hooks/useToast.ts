import { useCallback, useRef, useState } from 'react';

export interface ToastApi {
  message: string | null;
  show: (msg: string, durationMs?: number) => void;
}

export function useToast(): ToastApi {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((msg: string, durationMs = 3500) => {
    setMessage(msg);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), durationMs);
  }, []);

  return { message, show };
}
