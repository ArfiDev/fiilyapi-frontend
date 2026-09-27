import { Field, Input } from "@/components/ui";
import { formatCurrency, formatPercent } from "@/lib/format";
import { toDecimalString } from "@/lib/decimal";
import { asPercent } from "@/lib/api/scale";
import { profitMargin, type BudgetLines } from "./derive";

export interface BudgetValues {
  material: string;
  labor: string;
  subcontractor: string;
  overhead: string;
}

type FieldErrors = Partial<Record<keyof BudgetValues, string>>;

interface BudgetCardProps {
  values: BudgetValues;
  onChange: (field: keyof BudgetValues, value: string) => void;
  /** Sözleşme bedeli (ContractCard'dan türev); yoksa null → marj hesaplanmaz. */
  contractAmount: number | null;
  errors?: FieldErrors;
}

/** Etiket + yer tutucu mockup satır 152–155'ten birebir. */
const LINE_FIELDS: readonly {
  key: keyof BudgetValues;
  label: string;
  placeholder: string;
}[] = [
  { key: "material", label: "Malzeme Bütçesi (₺)", placeholder: "12480000" },
  { key: "labor", label: "İşçilik Bütçesi (₺)", placeholder: "5840000" },
  { key: "subcontractor", label: "Taşeron Bütçesi (₺)", placeholder: "3120000" },
  { key: "overhead", label: "Genel Gider (₺)", placeholder: "420000" },
];

/** Boş/geçersiz giriş 0 sayılır; hesap katmanı (derive) sayı bekler. */
function toNumber(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Bütçe Planlaması kartı (mockup satır 148–161, spec §4.8). Kâr marjı türevi
 * F3 `derive.profitMargin`'den gelir; burada yeniden hesaplanmaz.
 */
export function BudgetCard({
  values,
  onChange,
  contractAmount,
  errors,
}: BudgetCardProps) {
  const lines: BudgetLines = {
    material: toNumber(values.material),
    labor: toNumber(values.labor),
    subcontractor: toNumber(values.subcontractor),
    overhead: toNumber(values.overhead),
  };
  const { profit, marginPct } = profitMargin(contractAmount, lines);
  const isLoss = marginPct !== null && profit < 0;

  return (
    <section className="pf-card">
      <h2 className="pf-card__title">💰 Bütçe Planlaması</h2>
      <div className="pf-grid pf-grid--4">
        {LINE_FIELDS.map(({ key, label, placeholder }) => (
          <Field key={key} label={label} error={errors?.[key]}>
            {(control) => (
              <Input
                {...control}
                numeric
                value={values[key]}
                placeholder={placeholder}
                status={errors?.[key] ? "error" : "default"}
                onChange={(e) => onChange(key, e.target.value)}
              />
            )}
          </Field>
        ))}
      </div>

      <div
        className={`pf-margin${isLoss ? " pf-margin--loss" : ""}`}
        data-testid="pf-margin"
      >
        <div className="pf-margin__label">
          <span className="pf-margin__title">
            {isLoss ? "Tahmini Zarar" : "Tahmini Kâr Marjı"}
          </span>
          <span className="pf-margin__sub">Sözleşme bedeli − toplam bütçe</span>
        </div>
        <div className="pf-margin__value">
          <span className="pf-margin__amount">
            {marginPct === null ? "—" : formatCurrency(profit)}
          </span>
          {marginPct !== null && (
            // KAÇIŞ: profitMargin() testte kesinlikle (toBeCloseTo) doğrulanan
            // number döndürür; formatPercent sınırında Decimal kanonuyla
            // stringe çevriliyor.
            <span className="pf-margin__pct">
              {formatPercent(asPercent(toDecimalString(marginPct) ?? "0"))}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
