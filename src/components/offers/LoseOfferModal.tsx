import { useState } from "react";

import { Modal } from "@/components/settings/Modal";
import { Button, Field, Input, Textarea } from "@/components/ui";
import type { OfferLoseBody } from "@/lib/api/hooks/useOfferMutations";

import { OFFER_TERMS_MAX_LENGTH } from "./offer-detail-form";
import { buildLoseBody, type LoseFormErrors } from "./offer-lose-body";
import "@/components/settings/settings.css";

interface LoseOfferModalProps {
  offerNo: string;
  revNo: number;
  isPending: boolean;
  /** Sunucu hata metni (409 dahil) — AYNEN basılır. */
  errorText: string | null;
  /** `undefined` = gövdesiz çağrı (iki alan da boş). */
  onSubmit: (body: OfferLoseBody | undefined) => void;
  onClose: () => void;
}

/**
 * T37 · Kaybedildi modalı: kayıp nedeni + kazanan teklif tutarı (ikisi de isteğe bağlı, KDV hariç ₺).
 * Gövdeyi `buildLoseBody` kurar: boş alan GÖNDERİLMEZ, tutar T30 kuralıyla okunur.
 */
export function LoseOfferModal({ offerNo, revNo, isPending, errorText, onSubmit, onClose }: LoseOfferModalProps) {
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const [errors, setErrors] = useState<LoseFormErrors>({});

  function submit() {
    const result = buildLoseBody(reason, amount);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    onSubmit(result.body);
  }

  return (
    <Modal
      title="Kaybedildi olarak işaretle"
      onClose={onClose}
      isDirty={reason.trim() !== "" || amount.trim() !== ""}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            Vazgeç
          </Button>
          <Button variant="danger" onClick={submit} disabled={isPending}>
            {isPending ? "İşleniyor…" : "Kaybedildi İşaretle"}
          </Button>
        </>
      }
    >
      <div className="settings-form">
        <p className="settings-note">
          {offerNo} Rev.{revNo} kaybedildi olarak işaretlenecek. Aşağıdaki iki alan isteğe bağlıdır.
        </p>
        <Field label="Kayıp nedeni (isteğe bağlı)" error={errors.reason}>
          {(control) => (
            <Textarea
              {...control}
              rows={3}
              value={reason}
              maxLength={OFFER_TERMS_MAX_LENGTH}
              status={errors.reason ? "error" : "default"}
              onChange={(event) => setReason(event.target.value)}
            />
          )}
        </Field>
        <Field label="Kazanan teklif tutarı (isteğe bağlı, KDV hariç ₺)" error={errors.amount}>
          {(control) => (
            <Input
              {...control}
              numeric
              inputMode="decimal"
              value={amount}
              status={errors.amount ? "error" : "default"}
              onChange={(event) => setAmount(event.target.value)}
            />
          )}
        </Field>
        {errorText && <p className="settings-note settings-note--error">{errorText}</p>}
      </div>
    </Modal>
  );
}
