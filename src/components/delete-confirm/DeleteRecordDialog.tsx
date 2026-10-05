"use client";

import { showFlashNotice } from "@/components/shell/flash-notice";
import type { DeleteKind } from "@/lib/api/hooks/useAdminDelete";
import { DeleteConfirmDialog, type DeletedRecord } from "./DeleteConfirmDialog";

export interface DeleteRecordDialogProps {
  kind: DeleteKind;
  /** Kanonik kayıt UUID'si. */
  recordId: string;
  onClose: () => void;
}

/**
 * SIL-F2.2 · Silme penceresi, YÖNLENDİRMESİZ sürüm: listenin/panelin KENDİ
 * satır eyleminden açılır (ekran silinen kaydı zaten listeler). Başarıda
 * ortak bildirim bırakılır ve pencere kapanır; listeyi tazeleme
 * `useAdminDelete` onSuccess'indedir. Kapı (yalnız Sistem Yöneticisi) çağıran
 * satır düğmesindedir — tam sayfa detaylar `DeleteRecordButton` kullanır.
 */
export function DeleteRecordDialog({ kind, recordId, onClose }: DeleteRecordDialogProps) {
  function handleDeleted({ kindLabel, label }: DeletedRecord) {
    showFlashNotice(`${kindLabel} silindi: ${label}`);
    onClose();
  }
  return <DeleteConfirmDialog kind={kind} recordId={recordId} onClose={onClose} onDeleted={handleDeleted} />;
}
