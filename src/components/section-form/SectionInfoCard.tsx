import { Field, Input, Select, Textarea } from "@/components/ui";
import { SECTION_FIELD_MAX_LENGTH, SECTION_STATUS_OPTIONS } from "./constants";
import type { SectionFormValues } from "./form-state";
import { SectionTypePicker } from "./SectionTypePicker";
import type { SectionFormErrors } from "./validate";

export interface SectionInfoCardProps {
  values: SectionFormValues;
  onChange: <K extends keyof SectionFormValues>(field: K, value: SectionFormValues[K]) => void;
  /** Rotadan gelen sabit şantiye adı — salt okunur (F66). */
  siteName: string;
  errors?: SectionFormErrors;
}

/** 🏗 Bölüm Bilgileri kartı (mockup F63–77). */
export function SectionInfoCard({ values, onChange, siteName, errors }: SectionInfoCardProps) {
  return (
    <section className="pf-card">
      <h2 className="pf-card__title">🏗 Bölüm Bilgileri</h2>
      <div className="pf-grid pf-grid--3">
        {/* F66: şantiye rotadan sabittir, `SectionCreate`te ayrı alan olarak
            GİTMEZ (uç zaten /sites/{site_id}/sections) — SiteInfoCard'daki
            kilitli "Bağlı Proje" deseniyle aynı. */}
        <Field label="Şantiye" required>
          {(control) => (
            <Select {...control} disabled value={siteName} title="Bölüm, girildiği şantiyeye bağlıdır">
              <option value={siteName}>{siteName}</option>
            </Select>
          )}
        </Field>

        <Field label="Bölüm Adı" required error={errors?.name}>
          {(control) => (
            <Input
              {...control}
              maxLength={SECTION_FIELD_MAX_LENGTH.name}
              value={values.name}
              placeholder="Kat 11–14 Kaba İnşaat"
              status={errors?.name ? "error" : "default"}
              onChange={(e) => onChange("name", e.target.value)}
            />
          )}
        </Field>

        <Field label="Bölüm Kodu" hint="Boş bırakılırsa otomatik" error={errors?.code}>
          {(control) => (
            <Input
              {...control}
              maxLength={SECTION_FIELD_MAX_LENGTH.code}
              value={values.code}
              placeholder="BLM-06"
              status={errors?.code ? "error" : "default"}
              onChange={(e) => onChange("code", e.target.value)}
            />
          )}
        </Field>

        <Field label="Bölüm Sırası" required hint="Gantt sıralaması için" error={errors?.sortOrder}>
          {(control) => (
            <Input
              {...control}
              type="number"
              numeric
              value={values.sortOrder}
              status={errors?.sortOrder ? "error" : "default"}
              onChange={(e) => onChange("sortOrder", e.target.value)}
            />
          )}
        </Field>

        {/* BLF-F1.3: liste uçtan (şirket geneli) + "+ Yeni tip ekle". */}
        <SectionTypePicker
          value={values.sectionTypeId}
          onChange={(id) => onChange("sectionTypeId", id)}
          error={errors?.sectionTypeId}
        />

        <Field label="Durum">
          {(control) => (
            <Select
              {...control}
              value={values.status}
              onChange={(e) => onChange("status", e.target.value as SectionFormValues["status"])}
            >
              {SECTION_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      <div className="pf-grid sf-grid--follow-up">
        <Field label="Açıklama / Kapsam" className="pf-col-span-2">
          {(control) => (
            <Textarea
              {...control}
              rows={2}
              value={values.description}
              placeholder="Bu bölümde hangi işler yapılacak..."
              onChange={(e) => onChange("description", e.target.value)}
            />
          )}
        </Field>
      </div>
    </section>
  );
}
