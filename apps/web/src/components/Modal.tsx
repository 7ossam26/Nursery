import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Button } from './controls.js';
import { Icon } from './Icon.js';

export function Modal({ open, title, children, closeLabel, onClose, footer }: Readonly<{
  open: boolean;
  title: string;
  children: ReactNode;
  closeLabel: string;
  onClose: () => void;
  footer?: ReactNode;
}>) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
      dialog.querySelector<HTMLElement>('[data-modal-initial-focus]')?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
      returnFocusRef.current?.focus();
    }
  }, [open]);

  return (
    <dialog
      className="modal"
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClose={() => returnFocusRef.current?.focus()}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="modal__surface">
        <header className="modal__header"><h2 id={titleId}>{title}</h2><Button data-modal-initial-focus variant="quiet" className="button--icon" aria-label={closeLabel} onClick={onClose}><Icon name="close" /></Button></header>
        <div className="modal__body">{children}</div>
        {footer && <footer className="modal__footer">{footer}</footer>}
      </div>
    </dialog>
  );
}
