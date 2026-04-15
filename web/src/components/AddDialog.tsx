import { useEffect, useRef } from 'react';
import type { Destination } from '../types';
import { addTask } from '../api';

interface Props {
  open: boolean;
  onClose: () => void;
  onError: (msg: string) => void;
}

export function AddDialog({ open, onClose, onError }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) dlg.showModal();
    if (!open && dlg.open) dlg.close();
  }, [open]);

  const handleClose = async () => {
    const dlg = ref.current;
    const form = formRef.current;
    if (!dlg || !form) {
      onClose();
      return;
    }
    const returnValue = dlg.returnValue;
    const text = (form.elements.namedItem('text') as HTMLInputElement).value.trim();
    const destination = (form.elements.namedItem('destination') as HTMLSelectElement).value as Destination;
    form.reset();
    dlg.returnValue = '';
    onClose();
    if (returnValue !== 'add' || !text) return;

    const r = await addTask(text, destination);
    if (r.status === 409) onError('Project is not defined yet. Run /ralph-kit:define first.');
    else if (!r.ok) onError(`Add failed (${r.status})`);
  };

  return (
    <dialog ref={ref} id="add-dialog" onClose={handleClose}>
      <form method="dialog" id="add-form" ref={formRef}>
        <h3>New task</h3>
        <label>
          Text
          <input name="text" required autoComplete="off" />
        </label>
        <label>
          Destination
          <select name="destination" defaultValue="backlog">
            <option value="backlog">Backlog (default)</option>
            <option value="todo">To Do (High Priority)</option>
            <option value="blocked">Blocked</option>
          </select>
        </label>
        <menu>
          <button value="cancel" formNoValidate>
            Cancel
          </button>
          <button id="add-submit" value="add">
            Add
          </button>
        </menu>
      </form>
    </dialog>
  );
}
