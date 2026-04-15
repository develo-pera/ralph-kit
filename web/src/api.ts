import type { ColumnId, Destination } from './types';

export async function addTask(text: string, destination: Destination): Promise<Response> {
  return fetch('/api/task', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, destination }),
  });
}

export async function moveTask(text: string, source: string, toColumn: ColumnId): Promise<Response> {
  return fetch('/api/task/move', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, source, toColumn }),
  });
}
