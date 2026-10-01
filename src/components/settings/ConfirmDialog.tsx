"use client";

import { Button } from "@/components/ui";
import { Modal } from "./Modal";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  /** İptal düğmesinin etiketi (varsayılan "Vazgeç"). */
  cancelLabel?: string;
  danger?: boolean;
  isPending?: boolean;
  errorText?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Onayla",
  cancelLabel = "Vazgeç",
  danger,
  isPending,
  errorText,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} disabled={isPending}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="settings-note">{message}</p>
      {errorText && <p className="settings-note settings-note--error">{errorText}</p>}
    </Modal>
  );
}
