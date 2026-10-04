"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { useSession } from "@/components/shell/SessionProvider";
import { showFlashNotice } from "@/components/shell/flash-notice";
import type { DeleteKind } from "@/lib/api/hooks/useAdminDelete";
import { DeleteConfirmDialog, type DeletedRecord } from "./DeleteConfirmDialog";

export interface DeleteRecordButtonProps {
  kind: DeleteKind;
  /** Kanonik kayıt UUID'si (slug DEĞİL — silme ucu UUID bekler). */
  recordId: string;
  /** Silme sonrası gidilecek üst liste (`routes` üreticisinden). */
  redirectTo: string;
  /** Çağıran ekranın kendi düğme sınıfları (görünüm ekrana uyar). */
  className?: string;
}

function DeleteRecordControl({ kind, recordId, redirectTo, className }: DeleteRecordButtonProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  function handleDeleted({ kindLabel, label }: DeletedRecord) {
    setIsOpen(false);
    showFlashNotice(`${kindLabel} silindi: ${label}`);
    router.push(redirectTo);
  }

  return (
    <>
      <button type="button" className={className} onClick={() => setIsOpen(true)}>
        Sil
      </button>
      {isOpen && (
        <DeleteConfirmDialog
          kind={kind}
          recordId={recordId}
          onClose={() => setIsOpen(false)}
          onDeleted={handleDeleted}
        />
      )}
    </>
  );
}

/**
 * SIL-F1.2 · "Sil" düğmesi — YALNIZ Sistem Yöneticisi görür.
 *
 * Kapı FAIL-CLOSED: oturum henüz yüklenmediyse (`me === null`) ya da bayrak
 * `true`dan başka her şeyse düğme YOKTUR. (`useModulePermission().canDelete`
 * KULLANILMAZ: oturum bilinmezken `true` döner.) Router yalnız yönetici için
 * çağrılan iç bileşendedir; yöneticisiz ekranlar router'sız da çizilir.
 */
export function DeleteRecordButton(props: DeleteRecordButtonProps) {
  const { me } = useSession();
  if (me?.is_system_admin !== true) return null;
  return <DeleteRecordControl {...props} />;
}
