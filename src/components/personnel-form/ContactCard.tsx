import { Field, Input, Textarea } from "@/components/ui";

import { PERSONNEL_FIELD_MAX_LENGTH } from "./constants";
import type { PersonnelFormValues } from "./form-state";
import { MaskedField } from "./masked-fields";
import type { PersonnelFormErrors } from "./validate";

interface ContactCardProps {
  values: PersonnelFormValues;
  onChange: <K extends keyof PersonnelFormValues>(
    field: K,
    value: PersonnelFormValues[K],
  ) => void;
  errors?: PersonnelFormErrors;
  /** IZN-F4c.2 — maskeli alanlar: salt okunur "—" + kilit, gövdeye girmez. */
  maskedFields?: ReadonlySet<keyof PersonnelFormValues>;
}

/**
 * 📞 İletişim Bilgileri (mockup satır 74–83) — F-İK T4'te kartın TAMAMI ETKİN.
 *
 * Beş alanın beşi de İK-1 sözleşmesinde karşılık buldu: `phone` · `email` ·
 * `address` · `emergency_contact_name` · `emergency_contact_phone`. Uzunluk
 * tavanları sözleşmenin AYNASIDIR (`field-limits.test.ts` iki yönlü kapı);
 * `address` sözleşmede sınırsızdır, bu yüzden `maxLength` TAŞIMAZ.
 */
export function ContactCard({ values, onChange, errors, maskedFields }: ContactCardProps) {
  const isMasked = (field: keyof PersonnelFormValues) => maskedFields?.has(field) === true;
  return (
    <section className="pf-card">
      {/* 75 */}
      <h2 className="pf-card__title">📞 İletişim Bilgileri</h2>

      {/* 76 */}
      <div className="pf-grid pf-grid--2">
        {/* 77 */}
        {isMasked("phone") ? (
          <MaskedField label="Cep Telefonu" />
        ) : (
          <Field label="Cep Telefonu" required error={errors?.phone}>
            {(control) => (
              <Input
                {...control}
                type="tel"
                maxLength={PERSONNEL_FIELD_MAX_LENGTH.phone}
                value={values.phone}
                placeholder="0532 123 45 67"
                status={errors?.phone ? "error" : "default"}
                onChange={(event) => onChange("phone", event.target.value)}
              />
            )}
          </Field>
        )}

        {/* 78 */}
        {isMasked("email") ? (
          <MaskedField label="E-posta" />
        ) : (
          <Field label="E-posta">
            {(control) => (
              <Input
                {...control}
                type="email"
                maxLength={PERSONNEL_FIELD_MAX_LENGTH.email}
                value={values.email}
                placeholder="mehmet@example.com"
                onChange={(event) => onChange("email", event.target.value)}
              />
            )}
          </Field>
        )}

        {/* 79 — iki sütun genişliğinde textarea (rows=2) */}
        {isMasked("address") ? (
          <MaskedField label="Adres" className="pf-col-span-2" />
        ) : (
          <Field label="Adres" required className="pf-col-span-2" error={errors?.address}>
            {(control) => (
              <Textarea
                {...control}
                rows={2}
                value={values.address}
                placeholder="Mahalle, Sokak, No, İlçe / İl"
                status={errors?.address ? "error" : "default"}
                onChange={(event) => onChange("address", event.target.value)}
              />
            )}
          </Field>
        )}

        {/* 80 */}
        <Field label="Acil Durum Kişisi" required error={errors?.emergencyContactName}>
          {(control) => (
            <Input
              {...control}
              maxLength={PERSONNEL_FIELD_MAX_LENGTH.emergency_contact_name}
              value={values.emergencyContactName}
              placeholder="Ayşe Yılmaz (Eş)"
              status={errors?.emergencyContactName ? "error" : "default"}
              onChange={(event) => onChange("emergencyContactName", event.target.value)}
            />
          )}
        </Field>

        {/* 81 */}
        {isMasked("emergencyContactPhone") ? (
          <MaskedField label="Acil Durum Telefonu" />
        ) : (
          <Field label="Acil Durum Telefonu" required error={errors?.emergencyContactPhone}>
            {(control) => (
              <Input
                {...control}
                type="tel"
                maxLength={PERSONNEL_FIELD_MAX_LENGTH.emergency_contact_phone}
                value={values.emergencyContactPhone}
                placeholder="0533 987 65 43"
                status={errors?.emergencyContactPhone ? "error" : "default"}
                onChange={(event) => onChange("emergencyContactPhone", event.target.value)}
              />
            )}
          </Field>
        )}
      </div>
    </section>
  );
}
