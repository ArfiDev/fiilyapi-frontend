"use client";

import { useRef, useState } from "react";

import { Button, DateInput, Field, FileInput, Input, Select, Textarea } from "@/components/ui";
import { Modal } from "@/components/settings/Modal";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";
import { backendErrorMessage } from "@/lib/api/error-message";
import { useEquipmentDocumentTypes, useEquipmentDocuments } from "@/lib/api/hooks/useEquipmentDocuments";
import { useUploadEquipmentDocument } from "@/lib/api/hooks/useEquipmentDocumentMutations";
import type { EquipmentResponse } from "@/lib/api/hooks/useEquipment";

import { buildEquipmentDocumentInput } from "./build-input";
import {
  EQUIPMENT_BADGE_LEGEND,
  EQUIPMENT_DOCUMENT_NO_REASON,
  EQUIPMENT_DOCUMENT_TEXT as TEXT,
  EQUIPMENT_ISSUE_DATE_REASON,
  EQUIPMENT_NOTE_REASON,
  EMPTY_OPTION_VALUE,
} from "./constants";
import {
  validateEquipmentDocument,
  type EquipmentDocumentFormValues,
  type EquipmentDocumentField,
} from "./validate";
import "./document-form.css";

/**
 * EKP · `Form - Ekipman Belgesi.dc.html` (F-BLG T2b).
 * Uç: `POST /equipment/{equipment_id}/documents` (multipart).
 *
 * Mockup'ın FORM gövdesi (71-156) birebir; üst şerit/breadcrumb/sol menü
 * (37-67) tasarım kütüphanesi harness'ıdır ve çizilmez (onaylı sapma S-FRM).
 *
 * 🔴 DÖRT karşılıksız öğe SİLİNMEZ, devre-dışı basılır ve gerekçe GÖRÜNÜR
 * durur (F-TH kanonu): "Belge No" (111-114) · "Düzenlenme Tarihi" (115-118) ·
 * "📝 Not" kartı (147-151). Rozet önizleme kutusu (126-143) zaten SALT-GÖRSEL
 * bir açıklamadır ve aynen basılır.
 */
export interface EquipmentDocumentFormModalProps {
  equipment: EquipmentResponse;
  /**
   * `site_id` → şantiye adı çözümü (bağlam bandı 79). `undefined` ⇒ hâlâ
   * yükleniyor, `null` ⇒ atama yok — boş dize DEĞİL (`EquipmentCard` deseni).
   */
  siteLabel?: string | null;
  /** Kategori emojisi (bağlam bandı 76) — çağıran ekranın haritasından gelir. */
  categoryIcon: string;
  /** Sahiplik etiketi (bağlam bandı 79) — çağıran ekranın sözlüğünden gelir. */
  ownershipLabel: string;
  onClose: () => void;
}

const EMPTY_VALUES: EquipmentDocumentFormValues = {
  file: null,
  typeId: EMPTY_OPTION_VALUE,
  validUntil: "",
};

/** Bağlam bandının "·" ile birleşen künye parçaları (79). */
function contextMeta(options: {
  brand: string | null;
  plateNo: string | null;
  ownershipLabel: string;
  siteLabel?: string | null;
}): string {
  const parts = [
    options.brand,
    options.plateNo ? `Plaka: ${options.plateNo}` : null,
    options.ownershipLabel,
    options.siteLabel === undefined ? "Yükleniyor…" : options.siteLabel,
  ].filter((part): part is string => Boolean(part));
  return parts.join(" · ");
}

export function EquipmentDocumentFormModal({
  equipment,
  siteLabel,
  categoryIcon,
  ownershipLabel,
  onClose,
}: EquipmentDocumentFormModalProps) {
  const typesQuery = useEquipmentDocumentTypes();
  const documentsQuery = useEquipmentDocuments(equipment.id);
  const uploadDocument = useUploadEquipmentDocument();

  const [values, setValues] = useState<EquipmentDocumentFormValues>(EMPTY_VALUES);
  const [formError, setFormError] = useState<string | null>(null);
  // SEKME-F1.3b — `File` `JSON.stringify` ile KIYASLANAMAZ, ayrı `!== null`.
  const isDirty =
    values.file !== null || values.typeId !== EMPTY_VALUES.typeId || values.validUntil !== EMPTY_VALUES.validUntil;
  // Kayıt 50/ortak emir §7 — `Modal`a `isDirty` VERİLMEZ; doğrudan bağlanır.
  useUnsavedChanges(isDirty, "Ekipman belgesi formu");

  const fileRef = useRef<HTMLInputElement>(null);
  const typeRef = useRef<HTMLSelectElement>(null);
  const validUntilRef = useRef<HTMLInputElement>(null);

  const isPending = uploadDocument.isPending;
  const types = typesQuery.data?.items ?? [];
  // 81 · mockup'ın "4"ü GÖSTERMELİKtir; gerçek sayaç sunucudan gelir.
  const documentCount = documentsQuery.data?.items.length;

  function set<K extends keyof EquipmentDocumentFormValues>(
    key: K,
    value: EquipmentDocumentFormValues[K],
  ) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function focusField(field: EquipmentDocumentField) {
    const map: Record<EquipmentDocumentField, { focus: () => void } | null> = {
      file: fileRef.current,
      typeId: typeRef.current,
      validUntil: validUntilRef.current,
    };
    map[field]?.focus();
  }

  async function handleSubmit() {
    const problem = validateEquipmentDocument(values);
    if (problem) {
      setFormError(problem.message);
      focusField(problem.field);
      return;
    }
    setFormError(null);

    // `validate` dosyayı zaten daraltır; tip düzeyinde de daraltılır ki
    // `as`/`!` kaçamağına gerek kalmasın.
    const file = values.file;
    if (!file) return;

    try {
      await uploadDocument.mutateAsync(buildEquipmentDocumentInput(equipment.id, values, file));
    } catch (error) {
      // 413/422 gövdesindeki Türkçe `detail` OLDUĞU GİBİ basılır.
      setFormError(backendErrorMessage(error, "Belge yüklenemedi."));
      return;
    }
    onClose();
  }

  return (
    <Modal
      title={TEXT.title}
      className="dcf-modal"
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
      <p className="dcf__subtitle">{TEXT.subtitle}</p>

      {/* 74-82 · ekipman bağlam bandı */}
      <div className="dcf-context" data-testid="edf-context">
        <span className="dcf-context__icon" aria-hidden="true">
          {categoryIcon}
        </span>
        <span className="dcf-context__body">
          <span className="dcf-context__name">{equipment.name}</span>
          <span className="dcf-context__meta">
            {contextMeta({
              brand: equipment.brand,
              plateNo: equipment.plate_no,
              ownershipLabel,
              siteLabel,
            })}
          </span>
        </span>
        {documentCount !== undefined && (
          <span className="dcf-context__count" data-testid="edf-document-count">
            {documentCount} {TEXT.documentCountSuffix}
          </span>
        )}
      </div>

      {/* 84-93 · Dosya */}
      <section className="dcf-card">
        <h3 className="dcf-card__title">
          {TEXT.fileCard}{" "}
          <span className="dcf-card__req" aria-hidden="true">
            *
          </span>
        </h3>
        <div className="dcf-drop">
          <span className="dcf-drop__title">{TEXT.dropTitle}</span>
          <span className="dcf-drop__hint">{TEXT.dropHint}</span>
          <Field label={TEXT.file} required className="dcf-drop__control">
            {(control) => (
              <FileInput
                {...control}
                ref={fileRef}
                accept={TEXT.fileAccept}
                disabled={isPending}
                status={formError && !values.file ? "error" : "default"}
                onChange={(event) => {
                  set("file", event.target.files?.[0] ?? null);
                  setFormError(null);
                }}
              />
            )}
          </Field>
        </div>
      </section>

      {/* 95-144 · Belge Bilgileri */}
      <section className="dcf-card">
        <h3 className="dcf-card__title">{TEXT.infoCard}</h3>
        <div className="dcf-grid">
          {/* 99-110 · Belge Türü — seçenekler `GET /equipment/document-types` */}
          <Field label={TEXT.type} required>
            {(control) => (
              <Select
                {...control}
                ref={typeRef}
                value={values.typeId}
                disabled={isPending}
                onChange={(event) => set("typeId", event.target.value)}
                data-testid="edf-type"
              >
                <option value={EMPTY_OPTION_VALUE}>{TEXT.typePlaceholderOption}</option>
                {types.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          {/* 🔴 111-114 · karşılığı YOK — devre-dışı + görünür gerekçe */}
          <Field label={TEXT.documentNo} hint={EQUIPMENT_DOCUMENT_NO_REASON}>
            {(control) => (
              <Input
                {...control}
                disabled
                readOnly
                value=""
                placeholder={TEXT.documentNoPlaceholder}
                data-testid="edf-document-no"
                onChange={() => undefined}
              />
            )}
          </Field>

          {/* 🔴 115-118 · karşılığı YOK — devre-dışı + görünür gerekçe */}
          <Field label={TEXT.issueDate} hint={EQUIPMENT_ISSUE_DATE_REASON}>
            {(control) => (
              <DateInput
                {...control}
                disabled
                readOnly
                value=""
                data-testid="edf-issue-date"
                onValueChange={() => undefined}
              />
            )}
          </Field>

          {/* 119-123 · Geçerlilik Bitiş Tarihi = `valid_until` */}
          <Field label={TEXT.validUntil} hint={TEXT.validUntilHint}>
            {(control) => (
              <DateInput
                {...control}
                ref={validUntilRef}
                value={values.validUntil}
                disabled={isPending}
                onValueChange={(iso) => set("validUntil", iso)}
                data-testid="edf-valid-until"
              />
            )}
          </Field>
        </div>

        {/* 126-143 · rozet önizlemesi — SALT-GÖRSEL, forma girmez */}
        <div className="dcf-legend" data-testid="edf-badge-legend">
          <p className="dcf-legend__title">{TEXT.badgePreviewTitle}</p>
          <div className="dcf-legend__list">
            {EQUIPMENT_BADGE_LEGEND.map((row) => (
              <div key={row.label} className="dcf-legend__row">
                <span className={`dcf-legend__badge dcf-legend__badge--${row.tone}`}>
                  {row.label}
                </span>
                <span className="dcf-legend__text">{row.description}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 🔴 146-151 · "📝 Not" kartı — şemada `note` YOK; kart silinmez,
          metin kutusu devre-dışı basılır, gerekçe GÖRÜNÜR durur. */}
      <section className="dcf-card dcf-card--flush">
        <h3 className="dcf-card__title">{TEXT.noteCard}</h3>
        <Field label={TEXT.note} hint={TEXT.noteHint}>
          {(control) => (
            <Textarea
              {...control}
              rows={3}
              disabled
              readOnly
              value=""
              placeholder={TEXT.notePlaceholder}
              data-testid="edf-note"
              onChange={() => undefined}
            />
          )}
        </Field>
        <p className="dcf-readonly-note" data-testid="edf-note-reason">
          {EQUIPMENT_NOTE_REASON}
        </p>
      </section>

      {typesQuery.isError && (
        <p className="dcf__error" data-testid="edf-types-error">
          {backendErrorMessage(typesQuery.error, "Belge türleri yüklenemedi.")}
        </p>
      )}
      {formError && (
        <p className="dcf__error" data-testid="edf-error">
          {formError}
        </p>
      )}
    </Modal>
  );
}
