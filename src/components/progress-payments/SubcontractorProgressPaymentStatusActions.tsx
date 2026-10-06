"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { Alert, Button, Field, Textarea } from "@/components/ui";
import { ConfirmDialog } from "@/components/settings/ConfirmDialog";
import { Modal } from "@/components/settings/Modal";
import { backendErrorMessage } from "@/lib/api/error-message";
import {
  useApproveSubcontractorProgressPayment,
  useMarkSubcontractorProgressPaymentPaid,
  useRejectSubcontractorProgressPayment,
  useSubmitSubcontractorProgressPayment,
  useUnapproveSubcontractorProgressPayment,
} from "@/lib/api/hooks/useSubcontractorProgressPaymentMutations";
import {
  SUBCONTRACTOR_PROGRESS_PAYMENT_QUERY_KEY,
  type SubcontractorProgressPaymentDetail,
} from "@/lib/api/hooks/useSubcontractorProgressPayments";
import { BackendError } from "@/lib/api/unwrap";
import { SUBCONTRACTOR_PAYMENT_EDIT, SUBCONTRACTOR_PAYMENT_APPROVE } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";
import "@/components/settings/settings.css";
import "./progress-payment-detail.css";
import { PaymentActionButtons } from "./shared/PaymentActionButtons";
import { permittedPaymentActions } from "./shared/status-actions";

export interface SubcontractorProgressPaymentStatusActionsProps {
  detail: SubcontractorProgressPaymentDetail;
}

const REJECT_REASON_MAX_LENGTH = 500;

/**
 * F-TH T4 — Taşeron uyarlaması. `ProgressPaymentStatusActions` (P7 T4) ile
 * AYNI durum-makinesi/izin/hata deseni; buton JSX'i `shared/
 * PaymentActionButtons`ten PAYLAŞILIR (brief §Emsal). TEK davranış farkı —
 * reddetme gerekçesi: İşveren'de İSTEĞE BAĞLI, burada `SubcontractorReject
 * Body.reason` ZORUNLUDUR (backend 422 döner, ama boş gövdeyle isteği hiç
 * ATMAMAK daha iyi bir UX'tir) — bu yüzden "Reddet" onay butonu, gerekçe
 * kırpıldığında boşsa `disabled` kalır (brief §Durum-bazlı buton seti).
 */
export function SubcontractorProgressPaymentStatusActions({
  detail,
}: SubcontractorProgressPaymentStatusActionsProps) {
  // IZN-F3.2b · kapılar bu hakedişin projesindeki rolden okunur (yeni istek yok: `detail.project_id`).
  const projectId = detail.project_id;
  // IZN-F2.x · Gönder = hakediş sayfaları Düzenler; Onayla/Reddet/Ödendi = hakediş Onaylar; Onayı Geri Al = yalnız SA.
  const canSubmit = useButtonGate({ pages: SUBCONTRACTOR_PAYMENT_EDIT, need: "edit", projectId });
  const canApprove = useButtonGate({ pages: SUBCONTRACTOR_PAYMENT_APPROVE, need: "approve", projectId });
  const canUnapprove = useButtonGate({ pages: SUBCONTRACTOR_PAYMENT_APPROVE, need: "sa", projectId });
  const queryClient = useQueryClient();

  const submit = useSubmitSubcontractorProgressPayment();
  const approve = useApproveSubcontractorProgressPayment();
  const reject = useRejectSubcontractorProgressPayment();
  const markPaid = useMarkSubcontractorProgressPaymentPaid();
  const unapprove = useUnapproveSubcontractorProgressPayment();

  const [error, setError] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [unapproveOpen, setUnapproveOpen] = useState(false);

  const anyPending =
    submit.isPending ||
    approve.isPending ||
    reject.isPending ||
    markPaid.isPending ||
    unapprove.isPending;

  function handleError(err: unknown, fallback: string) {
    setError(backendErrorMessage(err, fallback));
    if (err instanceof BackendError && err.status === 409) {
      queryClient.invalidateQueries({
        queryKey: [SUBCONTRACTOR_PROGRESS_PAYMENT_QUERY_KEY, detail.id],
      });
    }
  }

  function handleSubmit() {
    setError(null);
    submit.mutate(detail.id, { onError: (err) => handleError(err, "Onaya gönderilemedi.") });
  }

  function handleApprove() {
    setError(null);
    approve.mutate(detail.id, { onError: (err) => handleError(err, "Onaylanamadı.") });
  }

  function handleMarkPaid() {
    setError(null);
    markPaid.mutate(detail.id, {
      onError: (err) => handleError(err, "Ödendi olarak işaretlenemedi."),
    });
  }

  function openReject() {
    setError(null);
    setRejectReason("");
    setRejectOpen(true);
  }

  const trimmedReason = rejectReason.trim();
  const rejectDisabled = trimmedReason.length === 0;
  // KURAL 7 · settings/Modal'a isDirty VERİLMEZ. Doğrudan kayda bağlanır;
  // yalnız Reddet diyaloğu AÇIKKEN anlamlıdır (`rejectOpen`).
  useUnsavedChanges(rejectOpen && !rejectDisabled, "Hakediş reddi (taşeron)");

  function confirmReject() {
    if (rejectDisabled) return;
    setError(null);
    // Gövde ZORUNLUDUR (İşveren'den FARKLI — brief §Durum-bazlı buton seti /
    // `SubcontractorRejectBody.reason` opsiyonel değil).
    reject.mutate(
      { paymentId: detail.id, body: { reason: trimmedReason } },
      {
        onSuccess: () => setRejectOpen(false),
        onError: (err) => handleError(err, "Reddedilemedi."),
      },
    );
  }

  function confirmUnapprove() {
    setError(null);
    unapprove.mutate(detail.id, {
      onSuccess: () => setUnapproveOpen(false),
      onError: (err) => handleError(err, "Onay geri alınamadı."),
    });
  }

  const actions = permittedPaymentActions(detail.status, { canSubmit, canApprove, canUnapprove });

  return (
    <div className="pp-detail__actions" data-testid="th-detail-actions">
      <PaymentActionButtons
        status={detail.status}
        actions={actions}
        anyPending={anyPending}
        isSubmitPending={submit.isPending}
        isApprovePending={approve.isPending}
        isMarkPaidPending={markPaid.isPending}
        onSubmit={handleSubmit}
        onOpenReject={openReject}
        onApprove={handleApprove}
        onOpenUnapprove={() => setUnapproveOpen(true)}
        onMarkPaid={handleMarkPaid}
      />

      {error && (
        <Alert variant="danger" className="pp-detail__action-error" data-testid="th-detail-action-error">
          {error}
        </Alert>
      )}

      {rejectOpen && (
        <Modal
          title="Hakedişi Reddet"
          onClose={() => setRejectOpen(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setRejectOpen(false)} disabled={reject.isPending}>
                Vazgeç
              </Button>
              <Button
                variant="danger"
                onClick={confirmReject}
                disabled={reject.isPending || rejectDisabled}
              >
                {reject.isPending ? "Reddediliyor…" : "Reddet"}
              </Button>
            </>
          }
        >
          <div className="settings-form">
            <Field
              label="Gerekçe (zorunlu)"
              hint="Gerekçe hakedişin 'Revize Gerekli' açıklaması olarak taşerona gösterilir."
            >
              {(control) => (
                <Textarea
                  {...control}
                  rows={3}
                  maxLength={REJECT_REASON_MAX_LENGTH}
                  value={rejectReason}
                  onChange={(event) => setRejectReason(event.target.value)}
                />
              )}
            </Field>
          </div>
        </Modal>
      )}

      {unapproveOpen && (
        <ConfirmDialog
          title="Onayı Geri Al"
          message='Hakedişin onayı geri alınacak, durum yeniden "Onay Bekliyor"a döner. Devam edilsin mi?'
          confirmLabel="Onayı Geri Al"
          danger
          isPending={unapprove.isPending}
          onConfirm={confirmUnapprove}
          onClose={() => setUnapproveOpen(false)}
        />
      )}
    </div>
  );
}
