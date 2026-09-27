import { formatPercent } from "@/lib/format";
import type { Percent } from "@/lib/api/scale";
import type { ProgressPaymentDetail } from "@/lib/api/hooks/useProgressPayments";

type ProgressBlock = ProgressPaymentDetail["progress"];
type ProgressKey = "financial_pct" | "physical_pct" | "duration_pct";

const ROWS: { key: ProgressKey; label: string; tone: "financial" | "physical" | "duration" }[] = [
  { key: "financial_pct", label: "Finansal", tone: "financial" },
  { key: "physical_pct", label: "Fiziksel", tone: "physical" },
  { key: "duration_pct", label: "Süre", tone: "duration" },
];

function clampPct(value: Percent): number {
  return Math.min(Math.max(Number(value), 0), 100);
}

// E15 176-191 "Sözleşme İlerlemesi" kartı (spec §8). Üç alan de nullable —
// null olan satır atlanır, sahte %0 basılmaz (brief §5). Üçü de null ise
// kart tamamen basılmaz (boş kart mockup'ta yok).
export function PaymentProgressCard({ progress }: { progress: ProgressBlock }) {
  const rows = ROWS.filter((row) => progress[row.key] !== null);
  if (rows.length === 0) return null;

  return (
    <section className="pp-progress-card">
      <h2 className="pp-progress-card__title">Sözleşme İlerlemesi</h2>
      {rows.map((row) => {
        // filtre yukarıda `!== null`ı elediği için değer burada GERÇEKTEN
        // dolu — tip sistemi indeksli erişimi satır bazında NARROW edemiyor.
        const raw = progress[row.key] as Percent;
        return (
          <div key={row.key} className="pp-progress-row">
            <div className="pp-progress-row__head">
              <span className="pp-progress-row__label">{row.label}</span>
              <span className={`pp-progress-row__pct pp-progress-row__pct--${row.tone}`}>
                {formatPercent(raw)}
              </span>
            </div>
            <div className="pp-progress-track">
              <div
                className={`pp-progress-track__fill pp-progress-track__fill--${row.tone}`}
                style={{ width: `${clampPct(raw)}%` }}
              />
            </div>
          </div>
        );
      })}
    </section>
  );
}
