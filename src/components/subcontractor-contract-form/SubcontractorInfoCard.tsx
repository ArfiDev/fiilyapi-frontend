import { Field, Select } from "@/components/ui";
import type { SubcontractorResponse } from "@/lib/api/hooks/useSubcontractorMutations";

import { FSO_TEXT, MAX_LENGTH, NEW_SUBCONTRACTOR_OPTION, WORK_CATEGORY_OPTIONS } from "./constants";
import type { SubcontractorContractFormErrors } from "./validate";

/**
 * FSO 71-84 · "🏗 Taşeron Bilgileri" kartı — 2fr/1fr/1fr ızgara (73):
 * Taşeron Firma* (76) · VKN (78) · Yetkili Kişi (79) · Telefon (80) ·
 * E-posta (81) · İş Kategorisi* (82).
 *
 * ⚠️ VKN/Yetkili/Telefon/E-posta mockup'ta `<input>`tur (78-81) ama SALT
 * OKUNUR basılır (görev emri kararı): bu dört alan TAŞERON KARTINA aittir
 * (`subcontractors` modülü), sözleşmeye değil — `SubcontractorContractCreate`
 * şemasında karşılıkları YOKTUR. Yazılabilir bırakmak, kaydedilmeyen alan
 * üretirdi (sessiz veri kaybı). Düzenleme "+ Yeni Taşeron Ekle" modalının ve
 * ileride taşeron kartının işidir.
 *
 * 🛑 `GET /subcontractors/{id}` ucu backend'de YOKTUR — seçili firmanın
 * bilgileri `useSubcontractors()` LİSTESİNDEN istemci süzmesiyle bulunur.
 */
export interface SubcontractorInfoCardProps {
  subcontractorId: string;
  workCategory: string;
  subcontractors: readonly SubcontractorResponse[];
  /** Seçili firma (listeden süzülmüş); seçilmemişse `null`. */
  selected: SubcontractorResponse | null;
  isLoading: boolean;
  errors: SubcontractorContractFormErrors;
  disabled?: boolean;
  onChangeSubcontractor: (subcontractorId: string) => void;
  onChangeWorkCategory: (workCategory: string) => void;
  /** 76 son seçeneği — paylaşılan `SubcontractorFormModal`'ı açar. */
  onRequestNewSubcontractor: () => void;
  /** POST /subcontractors kapısı; `false` ise "+ Yeni Taşeron Ekle" seçeneği basılmaz (varsayılan: açık). */
  canAddSubcontractor?: boolean;
}

const EMPTY = "—";

export function SubcontractorInfoCard({
  subcontractorId,
  workCategory,
  subcontractors,
  selected,
  isLoading,
  errors,
  disabled,
  onChangeSubcontractor,
  onChangeWorkCategory,
  onRequestNewSubcontractor,
  canAddSubcontractor = true,
}: SubcontractorInfoCardProps) {
  function handleSelect(value: string) {
    if (value === NEW_SUBCONTRACTOR_OPTION) {
      onRequestNewSubcontractor();
      return;
    }
    onChangeSubcontractor(value);
  }

  return (
    <section className="pf-card" aria-labelledby="fso-subcontractor-card">
      <h2 className="pf-card__title" id="fso-subcontractor-card">
        {FSO_TEXT.subcontractorCard}
      </h2>
      <div className="pf-grid pf-grid--2-1-1">
        <Field label="Taşeron Firma" required error={errors.subcontractorId}>
          {(control) => (
            <Select
              {...control}
              value={subcontractorId}
              disabled={disabled || isLoading}
              status={errors.subcontractorId ? "error" : "default"}
              onChange={(event) => handleSelect(event.target.value)}
            >
              {/* 76 — "Seçiniz veya yeni ekle..." */}
              <option value="">Seçiniz veya yeni ekle...</option>
              {subcontractors.map((subcontractor) => (
                <option key={subcontractor.id} value={subcontractor.id}>
                  {subcontractor.name}
                </option>
              ))}
              {canAddSubcontractor && <option value={NEW_SUBCONTRACTOR_OPTION}>+ Yeni Taşeron Ekle</option>}
            </Select>
          )}
        </Field>

        {/* 78-81 · seçilen firmadan SALT OKUNUR dolar. */}
        <ReadonlyField label="VKN" value={selected?.tax_number} isMono testId="fso-tax-number" />
        <ReadonlyField
          label="Yetkili Kişi"
          value={selected?.contact_person}
          testId="fso-contact-person"
        />
        <ReadonlyField label="Telefon" value={selected?.phone} testId="fso-phone" />
        <ReadonlyField label="E-posta" value={selected?.email} testId="fso-email" />

        <Field label="İş Kategorisi" required error={errors.workCategory}>
          {(control) => (
            <Select
              {...control}
              value={workCategory}
              disabled={disabled}
              status={errors.workCategory ? "error" : "default"}
              onChange={(event) => onChangeWorkCategory(event.target.value)}
            >
              <option value="">Seçiniz...</option>
              {WORK_CATEGORY_OPTIONS.map((option) => (
                <option key={option} value={option.slice(0, MAX_LENGTH.workCategory)}>
                  {option}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
    </section>
  );
}

function ReadonlyField({
  label,
  value,
  isMono,
  testId,
}: {
  label: string;
  value: string | null | undefined;
  isMono?: boolean;
  testId: string;
}) {
  return (
    <div className="field">
      <span className="field__label-row">
        <span className="field__label">{label}</span>
      </span>
      <p
        className={isMono ? "fso-readonly fso-readonly--mono" : "fso-readonly"}
        data-testid={testId}
      >
        {value?.trim() ? value : EMPTY}
      </p>
    </div>
  );
}
