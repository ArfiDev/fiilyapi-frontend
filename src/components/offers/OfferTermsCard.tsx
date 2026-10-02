import { Field, Input, Segmented, Select, Textarea, type SegmentedOption } from "@/components/ui";
import { PRICE_INDEX_OPTIONS } from "@/lib/contract-labels";

import {
  OFFER_TERMS_MAX_LENGTH,
  type OfferDetailFormErrors,
  type OfferDetailFormField,
  type OfferDetailFormValues,
  type PriceEscalation,
  type PriceIndexChoice,
} from "./offer-detail-form";
import "./offer-detail.css";

const DELIVERY_MAX_DIGITS = 5;
const NOT_DIGIT = /\D/g;

const ESCALATION_OPTIONS: ReadonlyArray<SegmentedOption<PriceEscalation>> = [
  { value: "tuik", label: "TÜİK endeksli" },
  { value: "fixed", label: "Sabit fiyat" },
];

interface OfferTermsCardProps {
  values: OfferDetailFormValues;
  errors: OfferDetailFormErrors;
  onChange: (field: OfferDetailFormField, value: string) => void;
  disabled: boolean;
}

/** TÜİK endeksi değil (`fixed_coefficient`) seçilemez (ÜS-F3-17); mevcut değer o ise görünür kalır. */
function indexOptions(current: PriceIndexChoice) {
  return PRICE_INDEX_OPTIONS.filter((option) => option.value !== "fixed_coefficient" || option.value === current);
}

/** TD:277-301 — Koşullar: ödeme · teslim süresi · fiyat farkı (+ endeks türü) · notlar. */
export function OfferTermsCard({ values, errors, onChange, disabled }: OfferTermsCardProps) {
  return (
    <section className="offer-detail__card" aria-labelledby="offer-terms-title">
      <h2 className="offer-detail__card-title" id="offer-terms-title">
        Koşullar
      </h2>
      <Field label="Ödeme koşulları" error={errors.paymentTerms}>
        {(control) => (
          <Textarea
            {...control}
            rows={3}
            value={values.paymentTerms}
            disabled={disabled}
            maxLength={OFFER_TERMS_MAX_LENGTH}
            status={errors.paymentTerms ? "error" : "default"}
            onChange={(event) => onChange("paymentTerms", event.target.value)}
          />
        )}
      </Field>
      <div className="offer-detail__terms-row">
        <Field label="Teslim süresi" error={errors.deliveryDays}>
          {(control) => (
            <Input
              {...control}
              numeric
              inputMode="numeric"
              value={values.deliveryDays}
              disabled={disabled}
              status={errors.deliveryDays ? "error" : "default"}
              rightIcon={<span aria-hidden="true">takvim günü</span>}
              onChange={(event) =>
                onChange("deliveryDays", event.target.value.replace(NOT_DIGIT, "").slice(0, DELIVERY_MAX_DIGITS))
              }
            />
          )}
        </Field>
        <div className="field">
          <span className="field__label-row">
            <span className="field__label">Fiyat farkı</span>
          </span>
          <Segmented
            aria-label="Fiyat farkı"
            options={ESCALATION_OPTIONS}
            value={values.priceEscalation}
            disabled={disabled}
            onChange={(next) => onChange("priceEscalation", next)}
          />
        </div>
      </div>
      {values.priceEscalation === "tuik" && (
        <Field label="Endeks türü" required error={errors.priceIndexType}>
          {(control) => (
            <Select
              {...control}
              value={values.priceIndexType}
              disabled={disabled}
              status={errors.priceIndexType ? "error" : "default"}
              onChange={(event) => onChange("priceIndexType", event.target.value)}
            >
              <option value="">Endeks seçin</option>
              {indexOptions(values.priceIndexType).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}
      <Field label="Notlar" error={errors.notes}>
        {(control) => (
          <Textarea
            {...control}
            rows={3}
            value={values.notes}
            disabled={disabled}
            maxLength={OFFER_TERMS_MAX_LENGTH}
            status={errors.notes ? "error" : "default"}
            onChange={(event) => onChange("notes", event.target.value)}
          />
        )}
      </Field>
    </section>
  );
}
