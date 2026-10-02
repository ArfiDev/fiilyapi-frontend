import { Field, Input } from "@/components/ui";

import { type OfferFormErrors, type OfferFormField, type OfferFormValues } from "./offer-form";
import "./offer-create.css";

/** Ekranda izin verilen karakterler: rakam, virgül ve nokta (noktalı girdi doğrulamada "belirsiz" diye reddedilir, sessizce silinmez). */
const NOT_PCT_CHAR = /[^\d.,]/g;

type RateField = Extract<OfferFormField, "overheadPct" | "profitPct" | "vatPct">;

const RATES: readonly { field: RateField; label: string }[] = [
  { field: "overheadPct", label: "Genel gider" },
  { field: "profitPct", label: "Kâr" },
  { field: "vatPct", label: "KDV" },
];

interface OfferRateFieldsProps {
  values: OfferFormValues;
  errors: OfferFormErrors;
  onChange: (field: OfferFormField, value: string) => void;
  /** Ayardaki varsayılanlar (ekran metni: "12", "18,5") — ipucu için. */
  defaults: Readonly<Record<RateField, string>>;
}

/** TY:158-169 — GG % · Kâr % · KDV %. KDV DÜZENLENEBİLİR (T32: mockup'ın "Sabit" kutusunu karar ezer). Detay ile ORTAK. */
export function OfferRateFields({ values, errors, onChange, defaults }: OfferRateFieldsProps) {
  return (
    <section className="offer-create__card" aria-labelledby="offer-rates-title">
      <div>
        <h2 className="offer-create__card-title" id="offer-rates-title">
          Teklif oranları
        </h2>
        <span className="offer-create__card-sub">
          Bütün kalemlere varsayılan olarak uygulanır; kalem bazında değiştirilebilir
        </span>
      </div>
      <div className="offer-create__grid3">
        {RATES.map(({ field, label }) => (
          <Field key={field} label={label} error={errors[field]} hint={`Teklif ayarı varsayılanı %${defaults[field]}`}>
            {(control) => (
              <Input
                {...control}
                numeric
                inputMode="decimal"
                value={values[field]}
                status={errors[field] ? "error" : "default"}
                rightIcon={<span aria-hidden="true">%</span>}
                onChange={(event) => onChange(field, event.target.value.replace(NOT_PCT_CHAR, ""))}
              />
            )}
          </Field>
        ))}
      </div>
    </section>
  );
}
