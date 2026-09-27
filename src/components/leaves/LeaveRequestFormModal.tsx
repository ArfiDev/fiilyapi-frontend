"use client";

import { useState } from "react";

import { Button, DateInput, Field, FileInput, Input, Select, Textarea } from "@/components/ui";
import { Modal } from "@/components/settings/Modal";
import { WarningTriangleIcon } from "@/components/ui/icons";
import { backendErrorMessage } from "@/lib/api/error-message";
import { useUploadDocument } from "@/lib/api/hooks/useDocumentMutations";
import { useCreateLeaveRequest } from "@/lib/api/hooks/useLeaveMutations";
import { useHrLeavesSummary, useLeaveTypes } from "@/lib/api/hooks/useLeaves";
import { usePersonnel, PERSONNEL_MAX_LIMIT } from "@/lib/api/hooks/usePersonnel";
import { initials } from "@/lib/shell/initials";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";

import {
  buildBalanceIndex,
  carriedOverText,
  entitlementText,
  formatDateDots,
  formatDays,
  leaveOverrun,
  leaveRequestBlockReason,
  previewLeaveDays,
  remainingBalanceText,
  seniorityText,
} from "./leaves-derive";
import {
  buildOrphanFileMessage,
  CANCEL_LABEL,
  MAX_TEXT_LENGTH,
  OVERRUN_TITLE,
  PERSONNEL_LIST_ERROR,
  REQUEST_CARRIED_LABEL,
  REQUEST_DAYS_HINT,
  REQUEST_DAYS_LABEL,
  REQUEST_DOCUMENT_ACCEPT,
  REQUEST_DOCUMENT_DROP_HINT,
  REQUEST_DOCUMENT_DROP_TITLE,
  REQUEST_DOCUMENT_LABEL,
  REQUEST_DOCUMENT_OPTIONAL_HINT,
  REQUEST_DOCUMENT_REQUIRED_HINT,
  REQUEST_DOCUMENT_TWO_STEP_NOTE,
  REQUEST_END_LABEL,
  REQUEST_ENTITLEMENT_LABEL,
  REQUEST_ERROR_FALLBACK,
  REQUEST_FORM_SUBTITLE,
  REQUEST_FORM_TITLE,
  REQUEST_NO_BALANCE_NOTE,
  REQUEST_NO_PROJECT_UPLOAD_REASON,
  REQUEST_NOTE_HINT,
  REQUEST_NOTE_LABEL,
  REQUEST_NOTE_PLACEHOLDER,
  REQUEST_PERSONNEL_LABEL,
  REQUEST_PERSONNEL_PLACEHOLDER,
  REQUEST_REMAINING_LABEL,
  REQUEST_SENIORITY_PREFIX,
  REQUEST_START_LABEL,
  REQUEST_SUBMIT_LABEL,
  REQUEST_TYPE_LABEL,
  REQUEST_TYPE_PLACEHOLDER,
  REQUEST_USED_LABEL,
  TYPE_LIST_ERROR,
  UNIT_DAYS,
  UNKNOWN_VALUE,
  UPLOAD_ERROR_FALLBACK,
} from "./leaves-labels";
import "./leaves.css";

/**
 * F-IZN T4 · TALEP FORMU — kanon `Form - Izin Talebi.dc.html` (parantez içi
 * sayılar o dosyanın SATIR numaralarıdır). Uç: `POST /leave-requests`.
 *
 * ⚠️ K6: mockup'ın soluk üst şeridi/sol menüsü (41-62) tasarım kütüphanesi
 * harness'ıdır — BASILMAZ (S-FRM onaylı sapması). Gövde birebir kalır.
 *
 * 🔴 `days` ve `status` GÖVDEYE GİRMEZ (şema `extra="forbid"`): gün SUNUCU
 * hesabıdır, ekrandaki sayı yalnız ÖNİZLEMEdir (141-145 · KARAR 1).
 *
 * 🔴 İKİ ADIMLI DOSYA AKIŞI (F-BLG `PersonnelDocumentFormModal` emsali):
 * gövde `document_id` alır, dosya ALMAZ. Dosya önce `POST /documents`
 * (multipart, arşiv) ile yüklenir; dönen künye talebe bağlanır. Birinci adım
 * başarılı + ikinci adım başarısız olursa künye durumda TUTULUR (ikinci kopya
 * doğmaz) ve öksüz dosya kullanıcıya GÖRÜNÜR biçimde bildirilir.
 *
 * 🔴 KARŞILANAMAYAN ALAN (84-87): mockup personel seçeneğini
 * "Ad — Meslek · Şantiye" yazar; `PersonnelResponse`ta ŞANTİYE ADI YOKTUR
 * (`assigned_project_id`/`assigned_section_id` var, şantiye adı yok). Şantiye
 * UYDURULMAZ — seçenek "Ad — Meslek" basar (zarif düşüş, açık borç).
 */
export interface LeaveRequestFormModalProps {
  /** Bakiye kartının yılı — bakiye TABLOSUNUN yıl seçicisinden BAĞIMSIZDIR. */
  year: number;
  onClose: () => void;
}

const EMPTY_OPTION = "";

export function LeaveRequestFormModal({ year, onClose }: LeaveRequestFormModalProps) {
  const personnelQuery = usePersonnel({ isActive: true, limit: PERSONNEL_MAX_LIMIT });
  const typesQuery = useLeaveTypes();
  const summaryQuery = useHrLeavesSummary(year);
  const uploadDocument = useUploadDocument();
  const createRequest = useCreateLeaveRequest();

  const [personnelId, setPersonnelId] = useState(EMPTY_OPTION);
  const [leaveTypeId, setLeaveTypeId] = useState(EMPTY_OPTION);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  /** Birinci adımın çıktısı — dolu olması "dosya arşivde DURUYOR" demektir. */
  const [uploadedDocumentId, setUploadedDocumentId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const isPending = uploadDocument.isPending || createRequest.isPending;
  const personnelList = personnelQuery.data?.items ?? [];
  const types = typesQuery.data ?? [];

  const selectedPersonnel = personnelList.find((person) => person.id === personnelId);
  const selectedType = types.find((type) => type.id === leaveTypeId);
  // 🔴 K4 · bakiye JOIN'i T3'ün indeksiyle kurulur; ikinci formül YAZILMAZ.
  const balance = buildBalanceIndex(summaryQuery.data?.balances).get(personnelId);

  const days = previewLeaveDays(startDate, endDate);
  const overrun = leaveOverrun({
    days,
    remaining: balance?.remaining,
    // Tip seçilmemişken aşım İDDİA EDİLMEZ: düşüp düşmediği bilinmiyor.
    deductsFromAnnual: selectedType?.deducts_from_annual ?? false,
    startDate,
  });

  // SEKME-F1.3b · dirty = herhangi bir alanın başlangıçtan (boş form) sapması
  // (tercih 1) — dosya/yükleme durumu da dahildir (envanter notu).
  const isDirty =
    personnelId !== EMPTY_OPTION ||
    leaveTypeId !== EMPTY_OPTION ||
    startDate !== "" ||
    endDate !== "" ||
    note !== "" ||
    file !== null ||
    uploadedDocumentId !== null;
  // KURAL 7 · settings/Modal'a isDirty VERİLMEZ. Doğrudan kayda bağlanır.
  useUnsavedChanges(isDirty, "İzin talebi");

  const hasDocument = uploadedDocumentId !== null || file !== null;
  // Arşiv yüklemesi proje ZORUNLU tutar; projesiz personelde birinci adım koşamaz.
  const isUploadBlocked =
    file !== null && uploadedDocumentId === null && !selectedPersonnel?.assigned_project_id;

  const blockReason =
    leaveRequestBlockReason({
      personnelId,
      leaveTypeId,
      startDate,
      endDate,
      requiresDocument: selectedType?.requires_document ?? false,
      hasDocument,
      isOverrun: overrun !== null,
    }) ?? (isUploadBlocked ? REQUEST_NO_PROJECT_UPLOAD_REASON : null);

  async function handleSubmit() {
    if (blockReason !== null) return;
    setFormError(null);

    let documentId = uploadedDocumentId;
    if (file !== null && documentId === null) {
      const projectId = selectedPersonnel?.assigned_project_id;
      // `blockReason` projesizliği zaten eler; tip düzeyinde de daraltılır.
      if (!projectId) return;
      try {
        const created = await uploadDocument.mutateAsync({ file, projectId });
        documentId = created.id;
        setUploadedDocumentId(created.id);
      } catch (error) {
        setFormError(backendErrorMessage(error, UPLOAD_ERROR_FALLBACK));
        return;
      }
    }

    try {
      await createRequest.mutateAsync({
        personnel_id: personnelId,
        leave_type_id: leaveTypeId,
        start_date: startDate,
        end_date: endDate,
        // Boş bırakılan alanlar gövdeye HİÇ eklenmez (EmployerFormModal deseni).
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(documentId !== null ? { document_id: documentId } : {}),
      });
    } catch (error) {
      const detail = backendErrorMessage(error, REQUEST_ERROR_FALLBACK);
      setFormError(
        documentId !== null && file !== null
          ? buildOrphanFileMessage(file.name, detail)
          : detail,
      );
      return;
    }
    onClose();
  }

  return (
    <Modal
      title={REQUEST_FORM_TITLE}
      className="iz-modal iz-modal--request"
      onClose={onClose}
      footer={
        <>
          {/* 185 — pasif düğmenin gerekçesi footer'da OKUNUR (`⚠` yerine SVG) */}
          {blockReason !== null && (
            <span className="iz-form__footer-note" data-testid="iz-request-block-reason">
              <WarningTriangleIcon className="iz-form__footer-icon" />
              {blockReason}
            </span>
          )}
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            {CANCEL_LABEL}
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={blockReason !== null || isPending}
            data-testid="iz-request-submit"
          >
            {REQUEST_SUBMIT_LABEL}
          </Button>
        </>
      }
    >
      <p className="iz-form__subtitle">{REQUEST_FORM_SUBTITLE}</p>

      {/* 80-88 · Personel */}
      <Field label={REQUEST_PERSONNEL_LABEL} required>
        {(control) => (
          <Select
            {...control}
            value={personnelId}
            disabled={isPending}
            onChange={(event) => {
              setPersonnelId(event.target.value);
              // Personel değişti ⇒ önceki personel için seçilmiş/yüklenmiş
              // dosya bu forma miras kalmamalı (kalan-7 · #220).
              setFile(null);
              setUploadedDocumentId(null);
              setFormError(null);
            }}
            data-testid="iz-request-personnel"
          >
            <option value={EMPTY_OPTION}>{REQUEST_PERSONNEL_PLACEHOLDER}</option>
            {personnelList.map((person) => (
              <option key={person.id} value={person.id}>
                {/* 🔴 84-87'nin "· Şantiye" parçası KARŞILIKSIZ — uydurulmaz. */}
                {person.trade ? `${person.full_name} — ${person.trade}` : person.full_name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {personnelQuery.isError && (
        <p className="iz-form__error" data-testid="iz-request-personnel-error">
          {PERSONNEL_LIST_ERROR}
        </p>
      )}

      {/* 92-106 · Personel hak özeti — personel seçilmeden BASILMAZ */}
      {personnelId !== EMPTY_OPTION && (
        <section className="iz-form-balance" data-testid="iz-request-balance">
          <div className="iz-form-balance__head">
            <span className="iz-person__avatar" aria-hidden="true">
              {initials(selectedPersonnel?.full_name ?? balance?.personnel_name ?? "")}
            </span>
            <span>
              <span className="iz-person__name">
                {selectedPersonnel?.full_name ?? balance?.personnel_name ?? UNKNOWN_VALUE}
              </span>
              <span className="iz-person__trade">
                {/* 97 — kıdem bakiyeden gelir; `hire_date` yoksa "—" */}
                {REQUEST_SENIORITY_PREFIX}{" "}
                {balance === undefined
                  ? UNKNOWN_VALUE
                  : seniorityText(balance.seniority_years, balance.seniority_months)}
              </span>
            </span>
          </div>
          {balance === undefined ? (
            <p className="iz-form__hint" data-testid="iz-request-no-balance">
              {REQUEST_NO_BALANCE_NOTE}
            </p>
          ) : (
            /* 100-105 · dört kutu */
            <div className="iz-form-balance__grid">
              <span className="iz-form-balance__box">
                <span className="iz-form-balance__value">
                  {entitlementText(balance.annual_entitlement)}
                </span>
                <span className="iz-form-balance__label">{REQUEST_ENTITLEMENT_LABEL}</span>
              </span>
              <span className="iz-form-balance__box">
                <span className="iz-form-balance__value iz-form-balance__value--carried">
                  {carriedOverText(balance)}
                </span>
                <span className="iz-form-balance__label">{REQUEST_CARRIED_LABEL}</span>
              </span>
              <span className="iz-form-balance__box">
                <span className="iz-form-balance__value iz-form-balance__value--used">
                  {formatDays(balance.used)}
                </span>
                <span className="iz-form-balance__label">{REQUEST_USED_LABEL}</span>
              </span>
              <span
                className="iz-form-balance__box iz-form-balance__box--remaining"
                data-testid="iz-request-remaining"
              >
                <span className="iz-form-balance__value iz-form-balance__value--remaining">
                  {remainingBalanceText(balance.remaining)}
                </span>
                <span className="iz-form-balance__label">{REQUEST_REMAINING_LABEL}</span>
              </span>
            </div>
          )}
        </section>
      )}

      {/* 109-129 · İzin tipi + rozet önizlemesi */}
      <Field
        label={REQUEST_TYPE_LABEL}
        required
        hint={
          selectedType === undefined
            ? undefined
            : selectedType.requires_document
              ? REQUEST_DOCUMENT_REQUIRED_HINT
              : REQUEST_DOCUMENT_OPTIONAL_HINT
        }
      >
        {(control) => (
          <Select
            {...control}
            value={leaveTypeId}
            disabled={isPending}
            onChange={(event) => {
              setLeaveTypeId(event.target.value);
              setFormError(null);
            }}
            data-testid="iz-request-type"
          >
            <option value={EMPTY_OPTION}>{REQUEST_TYPE_PLACEHOLDER}</option>
            {types.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {typesQuery.isError && (
        <p className="iz-form__error" data-testid="iz-request-type-error">
          {TYPE_LIST_ERROR}
        </p>
      )}
      {/* 120-127 · rozet şeridi; renk SUNUCUdan gelir, `✓` yerine vurgu sınıfı */}
      {types.length > 0 && (
        <div className="iz-form-badges" data-testid="iz-request-type-badges">
          {types.map((type) => (
            <span
              key={type.id}
              className={
                type.id === leaveTypeId ? "iz-type-badge iz-type-badge--active" : "iz-type-badge"
              }
              style={
                type.color
                  ? ({ "--iz-type-color": type.color } as React.CSSProperties)
                  : undefined
              }
            >
              {type.name}
            </span>
          ))}
        </div>
      )}

      {/* 132-146 · tarihler + TÜRETİLEN gün */}
      <div className="iz-form-dates">
        <Field label={REQUEST_START_LABEL} required>
          {(control) => (
            <DateInput
              {...control}
              value={startDate}
              disabled={isPending}
              onValueChange={(iso) => setStartDate(iso)}
              data-testid="iz-request-start"
            />
          )}
        </Field>
        <Field label={REQUEST_END_LABEL} required>
          {(control) => (
            <DateInput
              {...control}
              value={endDate}
              disabled={isPending}
              onValueChange={(iso) => setEndDate(iso)}
              data-testid="iz-request-end"
            />
          )}
        </Field>
        {/* 141-145 · KARAR 1: salt-okunur, kullanıcı yazamaz */}
        <Field label={REQUEST_DAYS_LABEL} hint={REQUEST_DAYS_HINT}>
          {(control) => (
            <Input
              {...control}
              readOnly
              numeric
              className="iz-form-days"
              value={days === null ? UNKNOWN_VALUE : String(days)}
              data-testid="iz-request-days"
            />
          )}
        </Field>
      </div>

      {/* 149-158 · KARAR 4: hak aşımı bandı (üçgen SVG, glif değil) */}
      {overrun !== null && (
        <div className="iz-form-overrun" data-testid="iz-request-overrun">
          <WarningTriangleIcon className="iz-form-overrun__icon" />
          <div>
            <p className="iz-form-overrun__title">{OVERRUN_TITLE}</p>
            <p className="iz-form-overrun__body">
              Talep edilen <strong>{formatDays(overrun.requestedDays)} gün</strong>, kalan izin
              hakkı olan{" "}
              <strong>
                {formatDays(overrun.remainingDays)} günü {formatDays(overrun.overrunDays)}{" "}
                {UNIT_DAYS} aşıyor
              </strong>
              .
              {overrun.suggestedEndDate !== null && (
                <>
                  {" "}
                  Bitiş tarihini <strong>{formatDateDots(overrun.suggestedEndDate)}</strong>{" "}
                  yaparsanız talep {formatDays(Math.floor(overrun.remainingDays))} güne düşer ve
                  onaya gönderilebilir.
                </>
              )}
            </p>
          </div>
        </div>
      )}

      {/* 161-174 · KARAR 3: koşullu zorunlu belge (📎 yerine ikonsuz kart) */}
      <section
        className={
          selectedType?.requires_document ? "iz-form-file iz-form-file--required" : "iz-form-file"
        }
        data-testid="iz-request-file-card"
      >
        <p className="iz-form__hint">{REQUEST_DOCUMENT_TWO_STEP_NOTE}</p>
        <Field
          label={REQUEST_DOCUMENT_LABEL}
          required={selectedType?.requires_document ?? false}
          hint={`${REQUEST_DOCUMENT_DROP_TITLE} · ${REQUEST_DOCUMENT_DROP_HINT}`}
        >
          {(control) => (
            <FileInput
              {...control}
              accept={REQUEST_DOCUMENT_ACCEPT}
              disabled={isPending}
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                // Dosya DEĞİŞTİ ⇒ önceki yükleme bu form için geçersiz.
                setUploadedDocumentId(null);
                setFormError(null);
              }}
              data-testid="iz-request-file"
            />
          )}
        </Field>
        {isUploadBlocked && (
          <p className="iz-form__error" data-testid="iz-request-no-project">
            {REQUEST_NO_PROJECT_UPLOAD_REASON}
          </p>
        )}
      </section>

      {/* 177-181 · Açıklama */}
      <Field label={REQUEST_NOTE_LABEL} hint={REQUEST_NOTE_HINT}>
        {(control) => (
          <Textarea
            {...control}
            rows={2}
            maxLength={MAX_TEXT_LENGTH}
            value={note}
            disabled={isPending}
            placeholder={REQUEST_NOTE_PLACEHOLDER}
            onChange={(event) => setNote(event.target.value)}
            data-testid="iz-request-note"
          />
        )}
      </Field>

      {formError !== null && (
        <p className="iz-form__error" data-testid="iz-request-error">
          {formError}
        </p>
      )}
    </Modal>
  );
}
