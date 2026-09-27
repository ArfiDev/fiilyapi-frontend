"use client";

import { useState } from "react";

import { Button, Field, Textarea } from "@/components/ui";
import { Modal } from "@/components/settings/Modal";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";
import { WarningTriangleIcon } from "@/components/ui/icons";
import { backendErrorMessage } from "@/lib/api/error-message";
import {
  APPROVAL_REJECT_REASON_MAX_LENGTH,
  useRejectApprovalItem,
  type ApprovalInboxItem,
  type ApprovalRejectInput,
} from "@/lib/api/hooks/useApprovals";
import "@/components/settings/settings.css";

import {
  APPROVAL_REJECT_CANCEL_LABEL,
  APPROVAL_REJECT_ERROR_FALLBACK,
  APPROVAL_REJECT_REASON_HINT,
  APPROVAL_REJECT_REASON_LABEL,
  APPROVAL_REJECT_REASON_REQUIRED,
  APPROVAL_REJECT_SUBMIT_LABEL,
  APPROVAL_REJECT_TITLE,
  UNKNOWN_VALUE,
  isApprovalRejectReasonReady,
} from "./approval-labels";
import "./approvals.css";

export interface ApprovalRejectModalProps {
  item: ApprovalInboxItem;
  onClose: () => void;
}

/**
 * F-OK T5 · RET DİYALOĞU.
 *
 * 🔴 MOCKUP RET YÜZEYİ ÇİZMEMİŞTİR (`:144` yalnız düğmeyi çizer) ama backend
 * ÜÇ ailede de `reason`ı ZORUNLU kılar (boş/yalnız-boşluk ⇒ 422). Diyalog bu
 * yüzden `LeaveRejectModal`/`ProgressPaymentStatusActions` desenlerinden
 * TÜRETİLDİ — ONAYLI SAPMA adayıdır ve raporlanır.
 *
 * 🔴 KAPI TİPE BAĞLIDIR (emsal `b97eaa8`): gövde TEK yerde `ApprovalRejectInput
 * | null` olarak türetilir ve HEM düğmenin `disabled`ı HEM koruma cümlesi o TEK
 * türetmeden beslenir. Koruma cümlesi SİLİNEMEZ — `mutateAsync`
 * `ApprovalRejectInput` ister, `| null` KABUL ETMEZ; silinirse `pnpm typecheck`
 * kırmızı döner. `disabled` niteliği TEK BAŞINA bekçi DEĞİLDİR (klavye/
 * programatik çağrıyı garanti etmez).
 *
 * 🔴 `maxLength` TİPE GÖRE değişir: satınalma 2000, iki hakediş ailesi 500 —
 * tek sabit yazmak kullanıcıyı sunucunun reddedeceği bir metne bırakırdı.
 */
export function ApprovalRejectModal({ item, onClose }: ApprovalRejectModalProps) {
  const rejectItem = useRejectApprovalItem();
  const [reason, setReason] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const isPending = rejectItem.isPending;
  // Kayıt 50/ortak emir §7 — `Modal`a `isDirty` VERİLMEZ; doğrudan bağlanır.
  useUnsavedChanges(reason.trim() !== "", "Ret gerekçesi");

  // TEK TÜRETME — boş gerekçede `null`. Kapı `isApprovalRejectReasonReady`
  // (`trim()`) üzerinden kurulur, `!== ""` üzerinden DEĞİL: yalnız boşluktan
  // oluşan metni sunucu da budayıp 422 verir.
  const rejectInput: ApprovalRejectInput | null = isApprovalRejectReasonReady(reason)
    ? {
        documentType: item.document_type,
        documentId: item.document_id,
        // Sunucuya BUDANMIŞ metin gider: baştaki/sondaki boşluk gerekçenin
        // parçası değildir ve sunucu da aynı kırpmayı uygular.
        reason: reason.trim(),
      }
    : null;
  const isRejectDisabled = rejectInput === null;

  async function handleSubmit() {
    if (rejectInput === null) return;
    setFormError(null);
    try {
      await rejectItem.mutateAsync(rejectInput);
    } catch (error) {
      setFormError(backendErrorMessage(error, APPROVAL_REJECT_ERROR_FALLBACK));
      return;
    }
    // `onClose` YALNIZ başarıda çağrılır — hata hâlinde kullanıcı metnini
    // kaybetmeden düzeltebilmelidir.
    onClose();
  }

  return (
    <Modal
      title={APPROVAL_REJECT_TITLE}
      onClose={onClose}
      footer={
        <>
          {isRejectDisabled && (
            <span className="ok-reject__required" data-testid="ok-reject-required">
              {/* `⚠` glifi fontta KAPSANMIYOR → SVG üçgen. */}
              <WarningTriangleIcon width="1em" height="1em" />
              {APPROVAL_REJECT_REASON_REQUIRED}
            </span>
          )}
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            {APPROVAL_REJECT_CANCEL_LABEL}
          </Button>
          <Button
            variant="danger"
            onClick={handleSubmit}
            disabled={isRejectDisabled || isPending}
            data-testid="ok-reject-submit"
          >
            {APPROVAL_REJECT_SUBMIT_LABEL}
          </Button>
        </>
      }
    >
      <p className="ok-reject__target" data-testid="ok-reject-target">
        {item.title ?? UNKNOWN_VALUE}
      </p>

      <div className="settings-form">
        <Field
          label={APPROVAL_REJECT_REASON_LABEL}
          required
          hint={APPROVAL_REJECT_REASON_HINT}
        >
          {(control) => (
            <Textarea
              {...control}
              rows={4}
              maxLength={APPROVAL_REJECT_REASON_MAX_LENGTH[item.document_type]}
              value={reason}
              disabled={isPending}
              onChange={(event) => {
                setReason(event.target.value);
                setFormError(null);
              }}
              data-testid="ok-reject-reason"
            />
          )}
        </Field>
      </div>

      {formError !== null && (
        <p className="ok-reject__error" data-testid="ok-reject-error">
          {formError}
        </p>
      )}
    </Modal>
  );
}
