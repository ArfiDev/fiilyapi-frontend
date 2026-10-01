"use client";

import { ConfirmDialog } from "@/components/settings/ConfirmDialog";

/**
 * GKS-F1.4 · önizleme geçişlerinin onay diyaloğu (`ConfirmDialog` sarmalı;
 * yeni görünüm YOK). Üç soru: bölüm değişimi (Ü3), tarih değişimi (Ü3b),
 * kayıtlı taslakta bölüm değişimi sonrası eksik kalemler (Ü5).
 * `count`: "section"/"date" için girilmiş satır sayısı, "add-lines" için eksik kalem sayısı.
 */
export type DiaryPreviewPending =
  | { kind: "section" | "date"; count: number }
  | { kind: "add-lines"; sectionName: string; count: number };

export interface DiaryPreviewChangeDialogProps {
  pending: DiaryPreviewPending | null;
  onConfirm: () => void;
  onCancel: () => void;
}

interface DiaryPreviewDialogCopy {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
}

const CANCEL_LABEL = "Vazgeç";

function discardMessage(subject: "Bölüm" | "Tarih", count: number): string {
  return `${subject} değişince iş kalemi listesi yenilenir; bu güne girdiğiniz ${count} satırlık miktar ve gerekçe kaydedilmeden silinir.`;
}

export function diaryPreviewDialogCopy(pending: DiaryPreviewPending): DiaryPreviewDialogCopy {
  if (pending.kind === "add-lines") {
    return {
      title: `${pending.sectionName} bölümünün ${pending.count} kalemi bu kayda eklensin mi?`,
      message: "Mevcut satırlar korunur.",
      confirmLabel: "Ekle",
      cancelLabel: "Yalnız bölümü değiştir",
    };
  }
  return {
    title: "Girilen miktarlar silinecek",
    message: discardMessage(pending.kind === "section" ? "Bölüm" : "Tarih", pending.count),
    confirmLabel: "Değiştir",
    cancelLabel: CANCEL_LABEL,
  };
}

export function DiaryPreviewChangeDialog({ pending, onConfirm, onCancel }: DiaryPreviewChangeDialogProps) {
  if (pending === null) return null;
  const copy = diaryPreviewDialogCopy(pending);
  return (
    <ConfirmDialog
      title={copy.title}
      message={copy.message}
      confirmLabel={copy.confirmLabel}
      cancelLabel={copy.cancelLabel}
      onConfirm={onConfirm}
      onClose={onCancel}
    />
  );
}
