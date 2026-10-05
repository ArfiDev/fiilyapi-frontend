import { DateInput, Field, Input, Select } from "@/components/ui";

import {
  GENDER_OPTIONS,
  MARITAL_STATUS_OPTIONS,
  NAME_PART_MAX_LENGTH,
  NATIONAL_ID_MAX_LENGTH,
  PENDING_DOCUMENTS,
  PHOTO_HINT,
  PHOTO_LABEL,
  SELECT_PLACEHOLDER,
} from "./constants";
import type { PersonnelFormValues } from "./form-state";
import { MaskedField } from "./masked-fields";
import type { PersonnelFormErrors } from "./validate";

interface IdentityCardProps {
  values: PersonnelFormValues;
  onChange: <K extends keyof PersonnelFormValues>(
    field: K,
    value: PersonnelFormValues[K],
  ) => void;
  errors?: PersonnelFormErrors;
  /** IZN-F4c.2 — maskeli alanlar: salt okunur "—" + kilit, gövdeye girmez. */
  maskedFields?: ReadonlySet<keyof PersonnelFormValues>;
}

/** Fotoğraf yükleme yer tutucusu (mockup 54–61) — `<input type="file">` YOK. */
function PhotoPlaceholder() {
  return (
    <div className="pnf-photo-col">
      <div className="pnf-photo" aria-disabled="true" title={PENDING_DOCUMENTS}>
        {/* 57 — 28×28 kişi ikonu, çizgi rengi CSS'ten (çıplak hex yok) */}
        <svg
          className="pnf-photo__icon"
          width="28"
          height="28"
          viewBox="0 0 28 28"
          fill="none"
          aria-hidden="true"
        >
          <circle cx="14" cy="10" r="5" stroke="currentColor" strokeWidth="1.6" />
          <path d="M5 25c0-4.5 4-8 9-8s9 3.5 9 8" stroke="currentColor" strokeWidth="1.6" />
        </svg>
        {/* 58 */}
        <span className="pnf-photo__label">{PHOTO_LABEL}</span>
        <span className="pf-doc__badge">Yakında</span>
      </div>
      {/* 60 */}
      <p className="pnf-photo__hint">{PHOTO_HINT}</p>
    </div>
  );
}

/**
 * 👤 Kimlik Bilgileri (mockup satır 51–71).
 *
 * ETKİN: Ad (63) · Soyad (64) — ikisi tek `full_name` alanına birleşir —
 * ve F-İK T4'te açılan dörtlü: TC Kimlik No (65) · Doğum Tarihi (66) ·
 * Cinsiyet (67) · Medeni Durum (68).
 *
 * PENDING (tek kalan): fotoğraf (55–59) — BC form-slot mekanizması bekliyor.
 */
export function IdentityCard({ values, onChange, errors, maskedFields }: IdentityCardProps) {
  const isMasked = (field: keyof PersonnelFormValues) => maskedFields?.has(field) === true;
  return (
    <section className="pf-card">
      {/* 52 */}
      <h2 className="pf-card__title">👤 Kimlik Bilgileri</h2>

      <div className="pnf-identity">
        <PhotoPlaceholder />

        {/* 62 — iki sütunlu alan ızgarası */}
        <div className="pf-grid pf-grid--2">
          {/* 63 */}
          <Field label="Ad" required error={errors?.firstName}>
            {(control) => (
              <Input
                {...control}
                maxLength={NAME_PART_MAX_LENGTH}
                value={values.firstName}
                placeholder="Mehmet"
                status={errors?.firstName ? "error" : "default"}
                onChange={(event) => onChange("firstName", event.target.value)}
              />
            )}
          </Field>

          {/* 64 */}
          <Field label="Soyad" required error={errors?.lastName}>
            {(control) => (
              <Input
                {...control}
                maxLength={NAME_PART_MAX_LENGTH}
                value={values.lastName}
                placeholder="Yılmaz"
                status={errors?.lastName ? "error" : "default"}
                onChange={(event) => onChange("lastName", event.target.value)}
              />
            )}
          </Field>

          {/* PE 65 — mockup `maxlength="11"` + monospace + ipucu KORUNUR.
              Checksum İSTEMCİDE hesaplanmaz: geçerlilik sunucudadır. */}
          {isMasked("tcNo") ? (
            <MaskedField label="TC Kimlik No" />
          ) : (
            <Field
              label="TC Kimlik No"
              required
              hint="11 haneli · Kimlik doğrulama yapılır"
              error={errors?.tcNo}
            >
              {(control) => (
                <Input
                  {...control}
                  numeric
                  maxLength={NATIONAL_ID_MAX_LENGTH}
                  value={values.tcNo}
                  placeholder="12345678901"
                  status={errors?.tcNo ? "error" : "default"}
                  onChange={(event) => onChange("tcNo", event.target.value)}
                />
              )}
            </Field>
          )}

          {/* PE 66 */}
          {isMasked("birthDate") ? (
            <MaskedField label="Doğum Tarihi" />
          ) : (
            <Field label="Doğum Tarihi" required error={errors?.birthDate}>
              {(control) => (
                <DateInput
                  {...control}
                  value={values.birthDate}
                  status={errors?.birthDate ? "error" : "default"}
                  onValueChange={(iso) => onChange("birthDate", iso)}
                />
              )}
            </Field>
          )}

          {/* PE 67 */}
          <Field label="Cinsiyet">
            {(control) => (
              <Select
                {...control}
                value={values.gender}
                onChange={(event) =>
                  onChange("gender", event.target.value as PersonnelFormValues["gender"])
                }
              >
                <option value="">{SELECT_PLACEHOLDER}</option>
                {GENDER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          {/* PE 68 */}
          <Field label="Medeni Durum">
            {(control) => (
              <Select
                {...control}
                value={values.maritalStatus}
                onChange={(event) =>
                  onChange(
                    "maritalStatus",
                    event.target.value as PersonnelFormValues["maritalStatus"],
                  )
                }
              >
                <option value="">{SELECT_PLACEHOLDER}</option>
                {MARITAL_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
      </div>
    </section>
  );
}
