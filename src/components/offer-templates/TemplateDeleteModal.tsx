"use client";

import { Modal } from "@/components/settings/Modal";
import { Button } from "@/components/ui";

import "./offer-templates.css";

interface TemplateDeleteModalProps {
  name: string;
  usageCount: number;
  isPending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/** TS:241-251 — "Şablonu sil" onayı; metin AYNEN. */
export function TemplateDeleteModal({ name, usageCount, isPending, onConfirm, onClose }: TemplateDeleteModalProps) {
  return (
    <Modal
      title="Şablonu sil"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            Vazgeç
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={isPending}>
            Şablonu sil
          </Button>
        </>
      }
    >
      <p className="otpl-delete__text">
        <b>{name}</b> silinecek. Bu şablonla oluşturulmuş {usageCount} teklif etkilenmez.
      </p>
    </Modal>
  );
}
