"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import { Button, DateInput, Field, FileInput, Input, Select, Textarea } from "@/components/ui";
import { Modal } from "@/components/settings/Modal";
import { resolveWorkerSourceLabel } from "@/components/site-diary/diary-labels";
import { backendErrorMessage } from "@/lib/api/error-message";
import { useHrDocumentsSummary, usePersonnelDocuments } from "@/lib/api/hooks/useHrDocuments";
import { useUploadDocument } from "@/lib/api/hooks/useDocumentMutations";
import { useCreatePersonnelDocument } from "@/lib/api/hooks/usePersonnelDocumentMutations";
import type { PersonnelDetailResponse } from "@/lib/api/hooks/usePersonnelDetail";
import { initials } from "@/lib/shell/initials";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";

import { buildPersonnelDocumentBody } from "./build-body";
import {
  ARCHIVE_PICK_REASON,
  buildOrphanFileMessage,
  EMPTY_OPTION_VALUE,
  HR_DOCUMENTS_ROUTE,
  MAX_LENGTH,
  OTHER_TYPE_VALUE,
  PERSONNEL_DOCUMENT_TEXT as TEXT,
  TYPE_CATALOG_ERROR_MESSAGE,
} from "./constants";
import {
  validatePersonnelDocument,
  type PersonnelDocumentField,
  type PersonnelDocumentFormValues,
} from "./validate";
import "./personnel-document-form.css";

/**
 * PB · `Form - Personel Belgesi.dc.html` (F-BLG T2c).
 * Uç: `POST /personnel/{personnel_id}/documents` — **JSON, dosya ALMAZ**.
 *
 * Mockup'ın FORM gövdesi (75-175) birebir; üst şerit/breadcrumb/sol menü
 * (41-71) tasarım kütüphanesi harness'ıdır ve çizilmez (onaylı sapma S-FRM).
 * Giriş noktası Personel Detay'ın "Belgeler" kartındaki "+ Ekle" düğmesidir.
 *
 * 🔴 İKİ ADIMLI DOSYA AKIŞI (mockup tasarım notu 30-39 + kart 88-118):
 *   1) `POST /documents` (arşiv, multipart) → künye `id`
 *   2) o `id` `document_id` olarak `POST /personnel/{id}/documents` gövdesine
 * Birinci adım BAŞARILI ikinci adım BAŞARISIZ olursa arşivde ÖKSÜZ belge
 * kalır: künye durumda TUTULUR (tekrar denemede ikinci kopya doğmaz) ve
 * kullanıcıya GÖRÜNÜR uyarı basılır.
 *
 * 🔴 Belge tipi kataloğu: ayrı bir tip listesi ucu YOKTUR;
 * `GET /hr/documents/summary` → `by_type[]` TAM KATALOGDUR. Kanıt
 * (`HrDocumentTypeBreakdown` docstring'i): satır bir "**katalog** tipinin"
 * satırıdır, "opsiyonel tip de (is_mandatory=False) dağılımda GÖSTERİLİR" ve
 * `missing` = o tipte kaydı OLMAYAN personel sayısı — sıfır belgeli bir tip
 * listede olmasaydı `missing` hesaplanamazdı. Uç AMAÇ-DIŞI kullanılıyor ama
 * bugünkü TEK kaynak budur.
 */
export interface PersonnelDocumentFormModalProps {
  personnel: PersonnelDetailResponse;
  onClose: () => void;
}

const EMPTY_VALUES: PersonnelDocumentFormValues = {
  file: null,
  typeId: EMPTY_OPTION_VALUE,
  freeLabel: "",
  issuedAt: "",
  validUntil: "",
  note: "",
};

/** 83 · "Kalıpçı Usta · Şirket Kadrosu · SGK: 123-456-789-00" künyesi. */
export function buildPersonnelMeta(personnel: PersonnelDetailResponse): string {
  return [
    personnel.trade,
    resolveWorkerSourceLabel(personnel.source),
    personnel.sgk_no ? `SGK: ${personnel.sgk_no}` : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
}

export function PersonnelDocumentFormModal({
  personnel,
  onClose,
}: PersonnelDocumentFormModalProps) {
  const summaryQuery = useHrDocumentsSummary();
  const documentsQuery = usePersonnelDocuments(personnel.id);
  const uploadDocument = useUploadDocument();
  const createDocument = useCreatePersonnelDocument(personnel.id);

  const [values, setValues] = useState<PersonnelDocumentFormValues>(EMPTY_VALUES);
  const [formError, setFormError] = useState<string | null>(null);
  /**
   * Birinci adımın çıktısı. Dolu olması "dosya arşivde DURUYOR" demektir —
   * ikinci adım düşse bile ikinci bir yükleme yapılmaz (öksüz kopya üretmez).
   */
  const [uploadedDocumentId, setUploadedDocumentId] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const typeRef = useRef<HTMLSelectElement>(null);
  const freeLabelRef = useRef<HTMLInputElement>(null);
  const issuedAtRef = useRef<HTMLInputElement>(null);
  const validUntilRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  // SEKME-F1.3b · dirty = `values` `EMPTY_VALUES`den farklı mı (tercih 2);
  // ayrıca yüklenmiş-ama-künyesi-daha-kaydedilmemiş dosya da (öksüz dosya
  // koruması) kirli sayılır.
  const isDirty =
    values.file !== null ||
    values.typeId !== EMPTY_OPTION_VALUE ||
    values.freeLabel !== "" ||
    values.issuedAt !== "" ||
    values.validUntil !== "" ||
    values.note !== "" ||
    uploadedDocumentId !== null;
  // KURAL 7 · settings/Modal'a isDirty VERİLMEZ. Doğrudan kayda bağlanır.
  useUnsavedChanges(isDirty, "Personel belgesi");
  const isPending = uploadDocument.isPending || createDocument.isPending;
  const types = summaryQuery.data?.by_type ?? [];
  // 85 · mockup'ın "4"ü GÖSTERMELİKtir; gerçek sayaç sunucudan gelir.
  const documentCount = documentsQuery.data?.length;
  const isOther = values.typeId === OTHER_TYPE_VALUE;

  function set<K extends keyof PersonnelDocumentFormValues>(
    key: K,
    value: PersonnelDocumentFormValues[K],
  ) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function focusField(field: PersonnelDocumentField) {
    const map: Record<PersonnelDocumentField, { focus: () => void } | null> = {
      file: fileRef.current,
      typeId: typeRef.current,
      freeLabel: freeLabelRef.current,
      issuedAt: issuedAtRef.current,
      validUntil: validUntilRef.current,
      note: noteRef.current,
    };
    map[field]?.focus();
  }

  /** Birinci adım. `null` ⇒ yükleme düştü, hata zaten basıldı. */
  async function uploadFileToArchive(file: File, projectId: string): Promise<string | null> {
    try {
      const created = await uploadDocument.mutateAsync({ file, projectId });
      setUploadedDocumentId(created.id);
      return created.id;
    } catch (error) {
      // 413/422 gövdesindeki Türkçe `detail` OLDUĞU GİBİ basılır.
      setFormError(backendErrorMessage(error, "Dosya arşive yüklenemedi."));
      return null;
    }
  }

  async function handleSubmit() {
    const problem = validatePersonnelDocument(values, {
      projectId: personnel.assigned_project_id,
      isFileUploaded: uploadedDocumentId !== null,
    });
    if (problem) {
      setFormError(problem.message);
      focusField(problem.field);
      return;
    }
    setFormError(null);

    let documentId = uploadedDocumentId;
    if (values.file && documentId === null) {
      // `validate` projesizliği zaten eler; tip düzeyinde de daraltılır.
      const projectId = personnel.assigned_project_id;
      if (!projectId) return;
      documentId = await uploadFileToArchive(values.file, projectId);
      if (documentId === null) return;
    }

    try {
      await createDocument.mutateAsync(buildPersonnelDocumentBody(values, documentId));
    } catch (error) {
      const detail = backendErrorMessage(error, "Belge kaydı oluşturulamadı.");
      // 🔴 İkinci adım düştü ve dosya arşivde KALDI — sessizce yutulmaz.
      setFormError(
        documentId !== null && values.file
          ? buildOrphanFileMessage(values.file.name, detail)
          : detail,
      );
      return;
    }
    onClose();
  }

  return (
    <Modal
      title={TEXT.title}
      className="pdf-modal"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            {TEXT.cancel}
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={isPending}>
            {TEXT.submit}
          </Button>
        </>
      }
    >
      <p className="pdf__subtitle">{TEXT.subtitle}</p>

      {/* 78-86 · personel bağlam bandı */}
      <div className="pdf-context" data-testid="pdf-context">
        <span className="pdf-context__avatar" aria-hidden="true">
          {initials(personnel.full_name)}
        </span>
        <span className="pdf-context__body">
          <span className="pdf-context__name">{personnel.full_name}</span>
          <span className="pdf-context__meta">{buildPersonnelMeta(personnel)}</span>
        </span>
        {documentCount !== undefined && (
          <span className="pdf-context__count" data-testid="pdf-document-count">
            {documentCount} {TEXT.documentCountSuffix}
          </span>
        )}
      </div>

      {/* 88-118 · Dosya — iki adımlı akış */}
      <section className="pdf-card">
        <h3 className="pdf-card__title">{TEXT.fileCard}</h3>
        {/* 91-96 · akışın kullanıcıya anlatımı */}
        <p className="pdf-two-step" data-testid="pdf-two-step-note">
          {TEXT.twoStepNote}
        </p>
        <div className="pdf-drop">
          <span className="pdf-drop__title">{TEXT.dropTitle}</span>
          <span className="pdf-drop__hint">{TEXT.dropHint}</span>
          <Field label={TEXT.file} className="pdf-drop__control">
            {(control) => (
              <FileInput
                {...control}
                ref={fileRef}
                accept={TEXT.fileAccept}
                disabled={isPending}
                status={formError && values.file === null ? "error" : "default"}
                onChange={(event) => {
                  // 🔴 Öksüz dosya uyarısı (1. adım başarılı + 2. adım düştü)
                  // varken dosya değiştirilirse uyarı KORUNUR — yoksa ilk
                  // dosya kullanıcıya hiç iz bırakmadan arşivde öksüz kalır.
                  const hadOrphanWarning = uploadedDocumentId !== null;
                  set("file", event.target.files?.[0] ?? null);
                  // Dosya DEĞİŞTİ ⇒ önceki yükleme bu form için geçersiz.
                  setUploadedDocumentId(null);
                  if (!hadOrphanWarning) {
                    setFormError(null);
                  }
                }}
              />
            )}
          </Field>
        </div>

        {/* 103-107 · "veya" ayracı */}
        <div className="pdf-or" aria-hidden="true">
          <span className="pdf-or__text">{TEXT.orSeparator}</span>
        </div>

        {/* 🔴 108-117 · karşılanamaz — SİLİNMEZ, devre-dışı + görünür gerekçe */}
        <Field label={TEXT.archivePick} hint={TEXT.archivePickHint}>
          {(control) => (
            <Select {...control} disabled value="" data-testid="pdf-archive-pick" onChange={() => undefined}>
              <option value={EMPTY_OPTION_VALUE}>{TEXT.archivePickEmptyOption}</option>
            </Select>
          )}
        </Field>
        <p className="pdf-readonly-note" data-testid="pdf-archive-pick-reason">
          {ARCHIVE_PICK_REASON}
        </p>
      </section>

      {/* 120-163 · Belge Bilgileri */}
      <section className="pdf-card">
        <h3 className="pdf-card__title">{TEXT.infoCard}</h3>
        <div className="pdf-grid">
          {/* 124-138 · Belge Türü — son seçenek "Diğer…" (135) */}
          <Field label={TEXT.type} required hint={TEXT.typeHint}>
            {(control) => (
              <Select
                {...control}
                ref={typeRef}
                value={values.typeId}
                disabled={isPending}
                onChange={(event) => set("typeId", event.target.value)}
                data-testid="pdf-type"
              >
                <option value={EMPTY_OPTION_VALUE}>{TEXT.typePlaceholderOption}</option>
                {types.map((type) => (
                  <option key={type.type_id} value={type.type_id}>
                    {type.type_name}
                  </option>
                ))}
                <option value={OTHER_TYPE_VALUE}>{TEXT.otherTypeOption}</option>
              </Select>
            )}
          </Field>

          {/* 139-143 · Serbest Etiket — YALNIZ "Diğer…" seçilince aktif (142) */}
          <Field label={TEXT.freeLabel} required={isOther} hint={TEXT.freeLabelHint}>
            {(control) => (
              <Input
                {...control}
                ref={freeLabelRef}
                value={values.freeLabel}
                disabled={!isOther || isPending}
                maxLength={MAX_LENGTH.freeLabel}
                placeholder={TEXT.freeLabelPlaceholder}
                onChange={(event) => set("freeLabel", event.target.value)}
                data-testid="pdf-free-label"
              />
            )}
          </Field>

          {/* 144-147 · Düzenlenme Tarihi = `issued_at` */}
          <Field label={TEXT.issuedAt}>
            {(control) => (
              <DateInput
                {...control}
                ref={issuedAtRef}
                value={values.issuedAt}
                disabled={isPending}
                onValueChange={(iso) => set("issuedAt", iso)}
                data-testid="pdf-issued-at"
              />
            )}
          </Field>

          {/* 148-152 · Geçerlilik Bitiş Tarihi = `valid_until` */}
          <Field label={TEXT.validUntil} hint={TEXT.validUntilHint}>
            {(control) => (
              <DateInput
                {...control}
                ref={validUntilRef}
                value={values.validUntil}
                disabled={isPending}
                onValueChange={(iso) => set("validUntil", iso)}
                data-testid="pdf-valid-until"
              />
            )}
          </Field>
        </div>

        {/* 155-162 · İSG uyarısı; "Belge Takibi →" rotası GERÇEK (F-İK T5) */}
        <div className="pdf-ohs" data-testid="pdf-ohs-notice">
          <strong>{TEXT.ohsWarningTitle}</strong> {TEXT.ohsWarningBody}{" "}
          <Link className="pdf-ohs__link" href={HR_DOCUMENTS_ROUTE}>
            {TEXT.ohsWarningLink}
          </Link>
        </div>
      </section>

      {/* 165-170 · Not */}
      <section className="pdf-card pdf-card--flush">
        <h3 className="pdf-card__title">{TEXT.noteCard}</h3>
        <Field label={TEXT.note} hint={TEXT.noteHint}>
          {(control) => (
            <Textarea
              {...control}
              ref={noteRef}
              rows={3}
              maxLength={MAX_LENGTH.note}
              value={values.note}
              disabled={isPending}
              placeholder={TEXT.notePlaceholder}
              onChange={(event) => set("note", event.target.value)}
              data-testid="pdf-note"
            />
          )}
        </Field>
      </section>

      {summaryQuery.isError && (
        <p className="pdf__error" data-testid="pdf-types-error">
          {TYPE_CATALOG_ERROR_MESSAGE}
        </p>
      )}
      {formError && (
        <p className="pdf__error" data-testid="pdf-error">
          {formError}
        </p>
      )}
    </Modal>
  );
}
