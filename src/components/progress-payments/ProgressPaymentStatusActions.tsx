"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { Alert, Button, Field, Textarea } from "@/components/ui";
import { ConfirmDialog } from "@/components/settings/ConfirmDialog";
import { Modal } from "@/components/settings/Modal";
import { backendErrorMessage } from "@/lib/api/error-message";
import {
  useApproveProgressPayment,
  useMarkProgressPaymentPaid,
  useRejectProgressPayment,
  useSubmitProgressPayment,
  useUnapproveProgressPayment,
  type RejectBody,
} from "@/lib/api/hooks/useProgressPaymentMutations";
import { PROGRESS_PAYMENT_QUERY_KEY, type ProgressPaymentDetail } from "@/lib/api/hooks/useProgressPayments";
import { BackendError } from "@/lib/api/unwrap";
import { useModulePermission } from "@/lib/auth/useModulePermission";
import { EMPLOYER_PAYMENT_APPROVE, EMPLOYER_PAYMENT_EDIT } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";
// Ayarlar modal/form kanonu birebir izlenir (SectionFormModal/BoqItemFormModal
// deseniyle ayni): settings-form sinifi settings.css'ten, ConfirmDialog yikici
// aksiyonlar icin paylasilan onay diyalogu.
import "@/components/settings/settings.css";
import "./progress-payment-detail.css";
import { PaymentActionButtons } from "./shared/PaymentActionButtons";
import { permittedPaymentActions } from "./shared/status-actions";

export interface ProgressPaymentStatusActionsProps {
  detail: ProgressPaymentDetail;
}

/** Sözleşme tavanı: `RejectBody.reason` `max_length=500` (taşeron ucuyla aynı). */
const REJECT_REASON_MAX_LENGTH = 500;

/**
 * Ekran 15 başlık aksiyon alanı (P7 T4). Buton kümesi backend
 * `transitions.py` §7 tablosundan türetilir — bu aksiyonların hiçbiri
 * mockup'ta YOK (kullanıcı kararı S1, brief §Bağlam): buton stili/yerleşimi
 * mockup'ın diğer butonlarını taklit eder, küme durum makinesinden gelir.
 *
 * Görünürlük = (durum eşleşmesi) VE (izin seviyesi). Güvenlik sınırı HER
 * ZAMAN backend'dedir; buradaki kapı yalnız çalışmayacak buton göstermemek
 * içindir — tabloda olmayan her geçiş 409'dur.
 */
export function ProgressPaymentStatusActions({ detail }: ProgressPaymentStatusActionsProps) {
  const { level } = useModulePermission("progress_payments");
  // IZN-F3.2b · kapılar bu hakedişin projesindeki rolden okunur (yeni istek yok: `detail.project_id`).
  const projectId = detail.project_id;
  // IZN-F2.x · Gönder = hakediş sayfaları Düzenler; Onayla/Reddet/Ödendi = hakediş Onaylar; Onayı Geri Al = yalnız SA.
  // Grant yoksa bugünkü seviye eşikleri (`permittedPaymentActions` varsayılanı).
  const canSubmit = useButtonGate({ pages: EMPLOYER_PAYMENT_EDIT, need: "edit", projectId });
  const canApprove = useButtonGate({ pages: EMPLOYER_PAYMENT_APPROVE, need: "approve", projectId });
  const canUnapprove = useButtonGate({ pages: EMPLOYER_PAYMENT_APPROVE, need: "sa", projectId });
  const queryClient = useQueryClient();

  const submit = useSubmitProgressPayment();
  const approve = useApproveProgressPayment();
  const reject = useRejectProgressPayment();
  const markPaid = useMarkProgressPaymentPaid();
  const unapprove = useUnapproveProgressPayment();

  const [error, setError] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [unapproveOpen, setUnapproveOpen] = useState(false);

  // Ayni anda tek istek: herhangi bir aksiyon uçarken TÜM butonlar kilitlenir
  // (brief §Aksiyon davranışları — çift tıkla iki istek gitmemeli; çakışan
  // durum geçişlerinin ayni anda tetiklenmesini de engeller).
  const anyPending =
    submit.isPending ||
    approve.isPending ||
    reject.isPending ||
    markPaid.isPending ||
    unapprove.isPending;

  // 409 — geçersiz durum geçişi (ör. başkası aynı anda onaylamış): Türkçe
  // mesaj basılır VE detay sorgusu tazelenir ki ekran gerçek duruma otursun
  // (brief §Hata gösterimi). Diğer statüler (403/422/vs.) yalnız mesaj basar.
  function handleError(err: unknown, fallback: string) {
    setError(backendErrorMessage(err, fallback));
    if (err instanceof BackendError && err.status === 409) {
      queryClient.invalidateQueries({ queryKey: [PROGRESS_PAYMENT_QUERY_KEY, detail.id] });
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

  // 🔴 GEREKÇE ZORUNLUDUR (backend `d888591` / OK-1A K2 — `RejectBody` artık
  // `| None` değil). Kapı `trim()` üzerinden kurulur, `!== ""` üzerinden DEĞİL:
  // yalnız boşluktan oluşan metin sunucuda `clean_reject_reason` ile budanır ve
  // 422 olur, kullanıcı da yalnız "Reddedilemedi." görürdü.
  //
  // Gövde TEK yerde türetilir ve boş gerekçede `null`dur. Bu, ekranın iki
  // kapısını TİPE bağlar:
  //   1. `rejectDisabled` — buton `disabled` kalır (görünür kapı),
  //   2. `confirmReject`teki koruma cümlesi — `null`ı daraltır (davranış kapısı).
  // Koruma cümlesi SİLİNEMEZ: `useRejectProgressPayment` `body: RejectBody`
  // ister, `RejectBody | null` KABUL ETMEZ — silinirse `pnpm typecheck` kırmızı
  // döner. `disabled` tek başına yeterli DEĞİLDİR (klavye/programatik çağrıyı
  // garanti etmez), ama tek başına da bekçilenemez; asıl bekçi burada tiptir.
  const trimmedReason = rejectReason.trim();
  const rejectBody: RejectBody | null =
    trimmedReason.length === 0 ? null : { reason: trimmedReason };
  const rejectDisabled = rejectBody === null;
  // KURAL 7 · settings/Modal'a isDirty VERİLMEZ. Doğrudan kayda bağlanır;
  // yalnız Reddet diyaloğu AÇIKKEN anlamlıdır (`rejectOpen`).
  useUnsavedChanges(rejectOpen && rejectBody !== null, "Hakediş reddi");

  function confirmReject() {
    if (rejectBody === null) return;
    setError(null);
    // Sunucuya BUDANMIŞ metin gider: baştaki/sondaki boşluk gerekçenin parçası
    // değildir ve sunucu da aynı kırpmayı uygular.
    reject.mutate(
      { paymentId: detail.id, body: rejectBody },
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

  // Görünürlük kapısı `shared/status-actions.ts`ten (F-TH T1 paylaşım kararı —
  // taşeron tarafı AYNI durum→aksiyon eşlemesini kullanır). Güvenlik sınırı
  // HER ZAMAN backend'dedir; bu yalnız çalışmayacak butonu göstermemek içindir.
  const actions = permittedPaymentActions(detail.status, level, { canSubmit, canApprove, canUnapprove });

  return (
    <div className="pp-detail__actions" data-testid="pp-detail-actions">
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
        <Alert variant="danger" className="pp-detail__action-error" data-testid="pp-detail-action-error">
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
            {/* Etiket "(zorunlu)"yu METİNDE taşır ve `required` yıldızı
                KULLANILMAZ — taşeron kardeşiyle (`Subcontractor
                ProgressPaymentStatusActions`) birebir aynı olsun diye: iki
                ekran aynı ailenin iki yüzü, yan yana açıldığında ret
                diyaloğunun farklı görünmesi kullanıcıya açıklanamaz.
                Aynı gerekçeyle İZ'in (`LeaveRejectModal`) disabled butonun
                YANINDAKİ "Gerekçe zorunlu" uyarı notu da BURAYA ALINMADI:
                ödeme ailesinde emsal kardeş ekrandır, İZ değil.
                `hint`in yarısı hâlâ DOĞRUdur — K2 gerekçenin zorunluluğunu
                bağladı, depolandığı yeri değil; bu ailede `rejection_reason`
                kolonu yoktur, tek kalıcı iz denetim günlüğüdür. */}
            <Field
              label="Gerekçe (zorunlu)"
              hint="Gerekçe hakedişin hiçbir alanına kaydedilmez, yalnız denetim günlüğüne yazılır."
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
