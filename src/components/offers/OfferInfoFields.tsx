import type { ReactNode } from "react";

import { DateInput, Field, Input, Select } from "@/components/ui";
import { formatDateDots } from "@/lib/format";
import { initials } from "@/lib/shell/initials";

import {
  OFFER_SCOPE_MAX_LENGTH,
  OFFER_TITLE_MAX_LENGTH,
  type OfferFormErrors,
  type OfferFormField,
  type OfferFormValues,
} from "./offer-form";
import "./offer-create.css";

const VALIDITY_MAX_DIGITS = 3;
const NOT_DIGIT = /\D/g;
const DAYS_SUFFIX = "gün";
const EMPLOYER_HINT = "İşveren listesinden seçin";
const UNTIL_HINT = "Bitiş tarihi otomatik hesaplanır";

export interface EmployerChoice {
  id: string;
  name: string;
}

interface OfferInfoFieldsProps {
  values: OfferFormValues;
  errors: OfferFormErrors;
  onChange: (field: OfferFormField, value: string) => void;
  employers: readonly EmployerChoice[];
  /** İşveren etiketinin sağındaki eylem ("+ Yeni işveren"); yetki/gerekçe çağıranda. */
  employerAction: ReactNode;
  /** Oturum kullanıcısının tam adı; bilinmiyorsa boş. */
  preparerName: string;
  /** Hesaplanan bitiş (ISO) ya da `null`. */
  validUntil: string | null;
  /** Detay: eski revizyon / taslak olmayan teklif → tüm girdiler salt okunur (TKL-F3.5). */
  disabled?: boolean;
}

/** TY:111-156 — Teklif bilgileri alanları (Detay künyesi ile ORTAK). */
export function OfferInfoFields(props: OfferInfoFieldsProps) {
  const { values, errors, onChange, employers, employerAction, preparerName, validUntil, disabled = false } = props;
  return (
    <div className="offer-create__grid2">
      <Field label="İşveren" required labelAside={employerAction} error={errors.employerId} hint={errors.employerId ? undefined : EMPLOYER_HINT}>
        {(control) => (
          <Select
            {...control}
            value={values.employerId}
            disabled={disabled}
            status={errors.employerId ? "error" : "default"}
            onChange={(event) => onChange("employerId", event.target.value)}
          >
            <option value="">İşveren seçin</option>
            {employers.map((employer) => (
              <option key={employer.id} value={employer.id}>
                {employer.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="İş adı" required error={errors.title}>
        {(control) => (
          <Input
            {...control}
            value={values.title}
            disabled={disabled}
            maxLength={OFFER_TITLE_MAX_LENGTH}
            placeholder="Örn. Ataköy Rezidans C Blok"
            status={errors.title ? "error" : "default"}
            onChange={(event) => onChange("title", event.target.value)}
          />
        )}
      </Field>
      <Field label="Kapsam özeti (isteğe bağlı)" className="offer-create__span2">
        {(control) => (
          <Input
            {...control}
            value={values.scopeSummary}
            disabled={disabled}
            maxLength={OFFER_SCOPE_MAX_LENGTH}
            placeholder="Örn. Kaba inşaat · 4 blok, 96 daire"
            onChange={(event) => onChange("scopeSummary", event.target.value)}
          />
        )}
      </Field>
      <Field label="Teklif tarihi">
        {(control) => (
          <DateInput {...control} value={values.offerDate} disabled={disabled} onValueChange={(iso) => onChange("offerDate", iso)} />
        )}
      </Field>
      <Field label="Geçerlilik" error={errors.validityDays} hint={errors.validityDays ? undefined : UNTIL_HINT}>
        {(control) => (
          <div className="offer-create__validity">
            <Input
              {...control}
              numeric
              inputMode="numeric"
              value={values.validityDays}
              disabled={disabled}
              status={errors.validityDays ? "error" : "default"}
              rightIcon={<span aria-hidden="true">{DAYS_SUFFIX}</span>}
              suffixChars={DAYS_SUFFIX.length}
              onChange={(event) =>
                onChange("validityDays", event.target.value.replace(NOT_DIGIT, "").slice(0, VALIDITY_MAX_DIGITS))
              }
            />
            <span aria-hidden="true">→</span>
            <span className="offer-create__until" data-testid="offer-valid-until">
              {validUntil === null ? "–" : formatDateDots(validUntil)}
            </span>
          </div>
        )}
      </Field>
      <div className="field">
        <span className="field__label-row">
          <span className="field__label">Hazırlayan</span>
        </span>
        <div className="offer-create__static">
          {preparerName !== "" && (
            <span className="offer-create__avatar" aria-hidden="true">
              {initials(preparerName)}
            </span>
          )}
          {preparerName === "" ? "—" : preparerName}
        </div>
      </div>
      <div className="field">
        <span className="field__label-row">
          <span className="field__label">Para birimi</span>
        </span>
        <div className="offer-create__static">₺ Türk lirası</div>
      </div>
    </div>
  );
}
