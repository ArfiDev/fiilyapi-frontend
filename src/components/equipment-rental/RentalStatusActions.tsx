"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { Alert, Button } from "@/components/ui";
import { ConfirmDialog } from "@/components/settings/ConfirmDialog";
import { backendErrorMessage } from "@/lib/api/error-message";
import { BackendError } from "@/lib/api/unwrap";
import { RENTAL_APPROVE } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";
import {
  EQUIPMENT_RENTAL_INVOICE_QUERY_KEY,
  type RentalInvoiceDetailResponse,
} from "@/lib/api/hooks/useEquipmentRentalInvoices";
import {
  useApproveRentalInvoice,
  usePayRentalInvoice,
  useRejectRentalInvoice,
} from "@/lib/api/hooks/useEquipmentRentalInvoiceMutations";

import {
  RENTAL_ACTION_LABEL,
  permittedRentalActions,
  rentalForwardActionLabel,
} from "./rental-actions";

export interface RentalStatusActionsProps {
  detail: RentalInvoiceDetailResponse;
}

/**
 * M5:25-28 — başlık çubuğunun eylem düğmeleri.
 *
 * 🔴 MOCKUP'IN İKİ DÜĞMESİ DURUM MAKİNESİNE GÖRE YENİDEN BAĞLANDI. Mockup tek
 * bir anın fotoğrafıdır (`pending_verification`) ve iki sabit düğme çizer;
 * eylem kümesi gerçekte DURUMA bağlıdır (`rental_transitions.py:34-42`):
 *
 *   draft                → [Doğrulamaya Gönder]
 *   pending_verification → [Onayla ve Ödemeye Gönder]   ← M5:27'nin karşılığı
 *   approved             → [Onayı Geri Al] [Ödendi İşaretle]
 *   paid                 → (uç durum, eylem yok)
 *
 * 🔴 M5:27 "Kiracıya Gönder" KULLANILMADI — ONAYLI SAPMA. Backend bu çelişkiyi
 * görmüş ve etiketi kendi ucunda adlandırmış: *"**'Onayla ve Ödemeye Gönder'**
 * (ONAYLI SAPMA — M5:27 'Kiracıya Gönder' diyor ama akış yönüyle çelişiyor:
 * gelen faturayı BİZ ödüyoruz)"* (`rental_router.py:210`, aynı metin
 * `openapi.json` description'ında ve `rental_transitions.py:46`da).
 *
 * 🔴 M5:26 "Taslak" düğmesinin BACKEND KARŞILIĞI YOKTUR: geçiş tablosunda
 * hedefi `draft` olan hiçbir çift yok, yani bir faturayı taslağa GERİ almak
 * mümkün değil. İşlevi (başlık düzenlemelerini kaydetmek) `PATCH …/{id}`tir ve
 * o düğme başlık kartında "Kaydet" adıyla yaşar — "Taslak" yazsaydı ekran
 * faturanın durumu hakkında YANLIŞ bir olgu iddia ederdi (F-BOR kanonu).
 *
 * İzin eşiği `full`tur (emsalden SAPMA — `rental_router.py:54-55`).
 */
export function RentalStatusActions({ detail }: RentalStatusActionsProps) {
  // IZN-F2.x · Onayla / Ödendi / Onayı Geri Al = saha.makine_kira ONAYLAR.
  const canAct = useButtonGate({
    pages: RENTAL_APPROVE,
    need: "approve",
  });
  const queryClient = useQueryClient();

  const approve = useApproveRentalInvoice();
  const pay = usePayRentalInvoice();
  const reject = useRejectRentalInvoice();

  const [error, setError] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);

  const anyPending = approve.isPending || pay.isPending || reject.isPending;
  const actions = permittedRentalActions(detail.status, canAct);
  const forwardLabel = rentalForwardActionLabel(detail.status);

  function handleError(err: unknown, fallback: string) {
    setError(backendErrorMessage(err, fallback));
    // 409 = durum altımızdan değişti; ekranı sunucunun gerçeğiyle tazele.
    if (err instanceof BackendError && err.status === 409) {
      queryClient.invalidateQueries({
        queryKey: [EQUIPMENT_RENTAL_INVOICE_QUERY_KEY, detail.id],
      });
    }
  }

  if (actions.length === 0) return null;

  return (
    <div className="makine-kira__actions" data-testid="makine-kira-actions">
      {actions.includes("reject") && (
        <Button
          variant="secondary"
          disabled={anyPending}
          onClick={() => {
            setError(null);
            setRejectOpen(true);
          }}
          data-testid="makine-kira-reject"
        >
          {RENTAL_ACTION_LABEL.reject}
        </Button>
      )}

      {actions.includes("approve") && forwardLabel !== null && (
        <Button
          variant="warning"
          disabled={anyPending}
          onClick={() => {
            setError(null);
            approve.mutate(detail.id, {
              onError: (err) => handleError(err, "Kira hakedişi ilerletilemedi."),
            });
          }}
          data-testid="makine-kira-approve"
        >
          {approve.isPending ? "Gönderiliyor…" : forwardLabel}
        </Button>
      )}

      {actions.includes("pay") && (
        <Button
          variant="primary"
          disabled={anyPending}
          onClick={() => {
            setError(null);
            setPayOpen(true);
          }}
          data-testid="makine-kira-pay"
        >
          {RENTAL_ACTION_LABEL.pay}
        </Button>
      )}

      {error !== null && (
        <Alert variant="danger" data-testid="makine-kira-action-error">
          {error}
        </Alert>
      )}

      {rejectOpen && (
        // 🔴 Kira `reject`i GÖVDE ALMAZ — taşeron hakedişinin ZORUNLU gerekçe
        // modalı buraya PORT EDİLMEZ; düz onay yeterlidir.
        <ConfirmDialog
          title="Onayı Geri Al"
          message='Hakedişin onayı geri alınacak ve durum yeniden "Doğrulama Bekliyor"a dönecek. Fatura yeniden düzenlenebilir hâle gelir. Devam edilsin mi?'
          confirmLabel={RENTAL_ACTION_LABEL.reject}
          danger
          isPending={reject.isPending}
          onConfirm={() =>
            reject.mutate(detail.id, {
              onSuccess: () => setRejectOpen(false),
              onError: (err) => handleError(err, "Onay geri alınamadı."),
            })
          }
          onClose={() => setRejectOpen(false)}
        />
      )}

      {payOpen && (
        // `paid` bir UÇ DURUMDUR (ikinci çağrı 409) — geri alınamaz bir para
        // hareketi işaretlendiği için onay istenir.
        <ConfirmDialog
          title="Ödendi İşaretle"
          message="Kira hakedişi ödendi olarak işaretlenecek. Bu işlem GERİ ALINAMAZ. Devam edilsin mi?"
          confirmLabel={RENTAL_ACTION_LABEL.pay}
          isPending={pay.isPending}
          onConfirm={() =>
            pay.mutate(detail.id, {
              onSuccess: () => setPayOpen(false),
              onError: (err) => handleError(err, "Ödendi olarak işaretlenemedi."),
            })
          }
          onClose={() => setPayOpen(false)}
        />
      )}
    </div>
  );
}
