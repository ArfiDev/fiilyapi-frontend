"use client";

import { useState } from "react";

import { Button, Field, Textarea } from "@/components/ui";
import { Modal } from "@/components/settings/Modal";
import { WarningTriangleIcon } from "@/components/ui/icons";
import { backendErrorMessage } from "@/lib/api/error-message";
import { useRejectLeaveRequest } from "@/lib/api/hooks/useLeaveMutations";
import type { LeaveBalanceResponse, LeaveRequestResponse } from "@/lib/api/hooks/useLeaves";
import { initials } from "@/lib/shell/initials";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";

import {
  buildBalanceIndex,
  formatDateDots,
  formatDays,
  isRejectReasonReady,
  leaveOverrun,
} from "./leaves-derive";
import {
  CANCEL_LABEL,
  MAX_TEXT_LENGTH,
  REJECT_DAYS_LABEL,
  REJECT_END_LABEL,
  REJECT_ERROR_FALLBACK,
  REJECT_FORM_SUBTITLE,
  REJECT_FORM_TITLE,
  REJECT_PRESET_HINT,
  REJECT_PRESET_TITLE,
  REJECT_PRESETS,
  REJECT_REASON_HINT,
  REJECT_REASON_LABEL,
  REJECT_REASON_PLACEHOLDER,
  REJECT_REASON_REQUIRED,
  REJECT_START_LABEL,
  REJECT_SUBMIT_LABEL,
  REJECT_SUMMARY_TITLE,
  REJECT_SYSTEM_NOTE_PREFIX,
  UNIT_DAYS,
  UNKNOWN_VALUE,
} from "./leaves-labels";
import "./leaves.css";

/**
 * F-IZN T4 · RED DİYALOĞU — kanon `Form - Izin Reddi.dc.html` (parantez içi
 * sayılar o dosyanın SATIR numaralarıdır).
 * Uç: `POST /leave-requests/{id}/reject` — gövde `{ reason }`.
 *
 * ⚠️ K6: mockup'ın soluk arka planı (37-51) harness'tır, BASILMAZ.
 *
 * 🔴 `reason` SUNUCUDA ZORUNLUdur ve kural `strip()` sonrası boşluktur. Ekranın
 * kapısı da `trim()` üzerinden kurulur (`isRejectReasonReady`): `!== ""` ile
 * kurulmuş bir kapıyı TEK BOŞLUK geçer ve kullanıcı 422 yerdi.
 *
 * 🔴 Red HER ZAMAN serbesttir — hak aşımı/çakışma onayı engeller, reddi ASLA.
 * Bu yüzden burada eşik denetimi YOKTUR.
 *
 * 🔴 KARŞILANAMAYAN ALAN (77): mockup alt satırı "Elektrikçi · Çelik OSB
 * Şantiyesi" yazar; `LeaveRequestResponse`ta `personnel_trade` VAR ama ŞANTİYE
 * ADI YOKTUR. Şantiye UYDURULMAZ — yalnız meslek basılır (zarif düşüş, borç).
 */
export interface LeaveRejectModalProps {
  request: LeaveRequestResponse;
  /** İZ özetinin bakiye dizisi — sistem notunun (95-99) TEK kaynağı. */
  balances: readonly LeaveBalanceResponse[] | undefined;
  onClose: () => void;
}

type TypeBadgeStyle = React.CSSProperties & { "--iz-type-color"?: string };

export function LeaveRejectModal({ request, balances, onClose }: LeaveRejectModalProps) {
  const rejectRequest = useRejectLeaveRequest();
  const [reason, setReason] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const isReady = isRejectReasonReady(reason);
  const isDirty = isReady;
  // KURAL 7 · settings/Modal'a isDirty VERİLMEZ (arka plan tıklaması
  // window.confirm ekler — görünür davranış değişikliği). Doğrudan kayda
  // bağlanır.
  useUnsavedChanges(isDirty, "İzin reddi");
  const isPending = rejectRequest.isPending;

  /**
   * 95-99 · sistem notu — YALNIZ aşım GERÇEKTEN hesaplanabiliyorsa basılır
   * (`deducts_from_annual` + `remaining !== null`). Bilinmeyen kalan "aşıyor"
   * diye BASILMAZ; T3'ün türetmesi tek kaynaktır.
   */
  const overrun = leaveOverrun({
    days: request.days,
    remaining: buildBalanceIndex(balances).get(request.personnel_id)?.remaining,
    deductsFromAnnual: request.deducts_from_annual,
    startDate: request.start_date,
  });

  const typeStyle: TypeBadgeStyle = request.leave_type_color
    ? { "--iz-type-color": request.leave_type_color }
    : {};

  async function handleSubmit() {
    if (!isReady) return;
    setFormError(null);
    try {
      // Sunucuya da BUDANMIŞ metin gider: baştaki/sondaki boşluk gerekçenin
      // parçası değildir ve `strip()` sonrası boş kalan gövde zaten 422'dir.
      await rejectRequest.mutateAsync({ requestId: request.id, reason: reason.trim() });
    } catch (error) {
      setFormError(backendErrorMessage(error, REJECT_ERROR_FALLBACK));
      return;
    }
    onClose();
  }

  return (
    <Modal
      title={REJECT_FORM_TITLE}
      className="iz-modal"
      onClose={onClose}
      footer={
        <>
          {/* 124-126 · `⚠` yerine SVG üçgen (K7) */}
          {!isReady && (
            <span className="iz-form__footer-note" data-testid="iz-reject-required">
              <WarningTriangleIcon className="iz-form__footer-icon" />
              {REJECT_REASON_REQUIRED}
            </span>
          )}
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            {CANCEL_LABEL}
          </Button>
          <Button
            variant="danger"
            onClick={handleSubmit}
            disabled={!isReady || isPending}
            data-testid="iz-reject-submit"
          >
            {REJECT_SUBMIT_LABEL}
          </Button>
        </>
      }
    >
      <p className="iz-form__subtitle">{REJECT_FORM_SUBTITLE}</p>

      {/* 71-100 · reddedilen talep özeti */}
      <section className="iz-form-summary" data-testid="iz-reject-summary">
        <p className="iz-form-summary__title">{REJECT_SUMMARY_TITLE}</p>
        <div className="iz-form-summary__head">
          <span className="iz-person__avatar" aria-hidden="true">
            {initials(request.personnel_name)}
          </span>
          <span className="iz-form-summary__who">
            <span className="iz-person__name">{request.personnel_name}</span>
            {/* 🔴 77 · şantiye adı KARŞILIKSIZ — yalnız meslek basılır */}
            <span className="iz-person__trade">{request.personnel_trade ?? UNKNOWN_VALUE}</span>
          </span>
          <span className="iz-type-badge" style={typeStyle}>
            {request.leave_type_name}
          </span>
        </div>

        {/* 81-94 · üç kutu */}
        <div className="iz-form-summary__grid">
          <span className="iz-form-balance__box">
            <span className="iz-form-balance__label">{REJECT_START_LABEL}</span>
            <span className="iz-form-summary__value">{formatDateDots(request.start_date)}</span>
          </span>
          <span className="iz-form-balance__box">
            <span className="iz-form-balance__label">{REJECT_END_LABEL}</span>
            <span className="iz-form-summary__value">{formatDateDots(request.end_date)}</span>
          </span>
          <span className="iz-form-balance__box iz-form-balance__box--days">
            <span className="iz-form-balance__label">{REJECT_DAYS_LABEL}</span>
            <span className="iz-form-summary__value iz-form-summary__value--days">
              {formatDays(request.days)}
            </span>
          </span>
        </div>

        {/* 95-99 · sistem notu (yalnız hesaplanabilen aşımda) */}
        {overrun !== null && (
          <p className="iz-form-summary__note" data-testid="iz-reject-system-note">
            <strong>{REJECT_SYSTEM_NOTE_PREFIX}</strong> Kalan hak{" "}
            {formatDays(overrun.remainingDays)} {UNIT_DAYS} — talep{" "}
            {formatDays(overrun.overrunDays)} {UNIT_DAYS} aşıyor
          </p>
        )}
      </section>

      {/* 103-107 · gerekçe */}
      <Field label={REJECT_REASON_LABEL} required hint={REJECT_REASON_HINT}>
        {(control) => (
          <Textarea
            {...control}
            rows={4}
            maxLength={MAX_TEXT_LENGTH}
            value={reason}
            disabled={isPending}
            placeholder={REJECT_REASON_PLACEHOLDER}
            onChange={(event) => {
              setReason(event.target.value);
              setFormError(null);
            }}
            data-testid="iz-reject-reason"
          />
        )}
      </Field>

      {/* 110-120 · hazır gerekçeler — tıklanınca alana YAZAR, metin düzenlenebilir */}
      <div className="iz-form-presets">
        <p className="iz-form-presets__title">{REJECT_PRESET_TITLE}</p>
        <div className="iz-form-presets__row">
          {REJECT_PRESETS.map((preset) => (
            <Button
              key={preset}
              variant="secondary"
              size="sm"
              className="iz-form-preset"
              disabled={isPending}
              onClick={() => {
                setReason(preset);
                setFormError(null);
              }}
            >
              {preset}
            </Button>
          ))}
        </div>
        <p className="iz-form__hint">{REJECT_PRESET_HINT}</p>
      </div>

      {formError !== null && (
        <p className="iz-form__error" data-testid="iz-reject-error">
          {formError}
        </p>
      )}
    </Modal>
  );
}
