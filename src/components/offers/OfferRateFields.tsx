import { Field, Input } from "@/components/ui";
import { HiddenMark } from "@/components/ui/hidden-mark/HiddenMark";
import { EMPTY_CELL } from "@/lib/format";

import { NO_MASKED_RATES, type MaskedRates, type OfferFormErrors, type OfferFormField, type OfferFormValues } from "./offer-form";
import "./offer-create.css";

/** Ekranda izin verilen karakterler: rakam, virgül ve nokta (noktalı girdi doğrulamada "belirsiz" diye reddedilir, sessizce silinmez). */
const NOT_PCT_CHAR = /[^\d.,]/g;

type RateField = Extract<OfferFormField, "overheadPct" | "profitPct" | "vatPct">;

const DEFAULT_TITLE = "Teklif oranları";
const DEFAULT_SUBTITLE = "Bütün kalemlere varsayılan olarak uygulanır; kalem bazında değiştirilebilir";

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
  defaults?: Readonly<Record<RateField, string>>;
  /** Kart başlığı/alt başlığı (Detay mockup'ı "Oranlar · Teklif geneli · kalemde değiştirilebilir" der). */
  title?: string;
  subtitle?: string;
  /** Kart altı açıklama (Detay: TD:184 formül notu). */
  note?: string;
  /** Detay: eski revizyon / taslak olmayan teklif → salt okunur (TKL-F3.5). */
  disabled?: boolean;
  /** IZN-F4.2 · sunucunun maskelediği oranlar: salt okunur "—" (doğrulanmaz, gövdeye girmez). */
  masked?: MaskedRates;
  /** IZN-F4.2 · oturumda `maliyet_kar` gizli → maskeli alanın altında kilit + "Bu bilgi rolünüz için gizli". */
  isHiddenHintShown?: boolean;
}

/** TY:158-169 — GG % · Kâr % · KDV %. KDV DÜZENLENEBİLİR (T32: mockup'ın "Sabit" kutusunu karar ezer). Detay ile ORTAK. */
export function OfferRateFields({
  values,
  errors,
  onChange,
  defaults,
  disabled = false,
  title = DEFAULT_TITLE,
  subtitle = DEFAULT_SUBTITLE,
  note,
  masked = NO_MASKED_RATES,
  isHiddenHintShown = false,
}: OfferRateFieldsProps) {
  return (
    <section className="offer-create__card" aria-labelledby="offer-rates-title">
      <div>
        <h2 className="offer-create__card-title" id="offer-rates-title">
          {title}
        </h2>
        <span className="offer-create__card-sub">{subtitle}</span>
      </div>
      <div className="offer-create__grid3">
        {RATES.map(({ field, label }) => {
          if ((masked as ReadonlySet<string>).has(field)) {
            return (
              <Field key={field} label={label} hint={isHiddenHintShown ? <HiddenMark withText /> : undefined}>
                {(control) => <Input {...control} numeric value={EMPTY_CELL} disabled readOnly />}
              </Field>
            );
          }
          return (
          <Field key={field} label={label} error={errors[field]} hint={defaults ? `Teklif ayarı varsayılanı %${defaults[field]}` : undefined}>
            {(control) => (
              <Input
                {...control}
                numeric
                inputMode="decimal"
                value={values[field]}
                disabled={disabled}
                status={errors[field] ? "error" : "default"}
                rightIcon={<span aria-hidden="true">%</span>}
                onChange={(event) => onChange(field, event.target.value.replace(NOT_PCT_CHAR, ""))}
              />
            )}
          </Field>
          );
        })}
      </div>
      {note && <p className="offer-create__card-sub">{note}</p>}
    </section>
  );
}
