import { WarningTriangleIcon } from "@/components/ui/icons";
import { divideDecimalStrings, multiplyDecimalStrings } from "@/lib/decimal";
import { formatCurrencyPrecise, formatDecimal } from "@/lib/format";
import type { OfferRevisionRead } from "@/lib/api/hooks/useOffers";

import "./offer-detail.css";

type OfferTotals = OfferRevisionRead["totals"];

/** Yüzde gösterim hanesi (mockup `nf(a/b*100, 1)`). */
const PCT_DISPLAY_DIGITS = 1;
const PERCENT = "100";

export interface OfferTotalsCardProps {
  /** Sunucu toplamları (`calc.py`); istemci HESAPLAMAZ, yalnız kayıpsız gösterir (ÜS-F3-1). */
  totals: OfferTotals;
  vatPct: string;
  /**
   * `internal` (varsayılan, Detay): maliyet/GG/kâr/adam-saat dahil. `customer`: YALNIZ işverenin gördüğü
   * KDV hariç / KDV / genel toplam — iç toplamlar bu görünümde ASLA basılmaz.
   */
  view?: "internal" | "customer";
}

/** `null`/boş bölen → yüzde basılmaz. */
function pctText(part: string | null, base: string | null): string {
  if (part === null || base === null) return "";
  const ratio = divideDecimalStrings(multiplyDecimalStrings(part, PERCENT), base, PCT_DISPLAY_DIGITS);
  return ratio === null ? "" : `%${formatDecimal(ratio, PCT_DISPLAY_DIGITS)}`;
}

interface Row {
  label: string;
  pct: string;
  value: string;
  tone?: "net" | "gross";
}

export function OfferTotalsCard({ totals, vatPct, view = "internal" }: OfferTotalsCardProps) {
  const { customer, internal } = totals;
  const costRows: Row[] = [
    { label: "Maliyet", pct: "", value: formatCurrencyPrecise(internal.cost) },
    { label: "Genel gider", pct: pctText(internal.overhead, internal.cost), value: formatCurrencyPrecise(internal.overhead) },
    {
      label: "Kâr",
      pct: internal.profit_pct === null ? "" : `%${formatDecimal(internal.profit_pct, PCT_DISPLAY_DIGITS)}`,
      value: formatCurrencyPrecise(internal.profit),
    },
  ];
  const customerRows: Row[] = [
    { label: "Teklif tutarı (KDV hariç)", pct: "", value: formatCurrencyPrecise(customer.net), tone: "net" },
    { label: "KDV", pct: `%${formatDecimal(vatPct, PCT_DISPLAY_DIGITS)}`, value: formatCurrencyPrecise(customer.vat) },
    { label: "Genel toplam", pct: "", value: formatCurrencyPrecise(customer.gross), tone: "gross" },
  ];
  const rows = view === "internal" ? [...costRows, ...customerRows] : customerRows;

  return (
    <section className="offer-detail__card offer-totals" aria-labelledby="offer-totals-title">
      <h2 className="offer-detail__card-title" id="offer-totals-title">
        Toplam
      </h2>
      <dl className="offer-totals__list">
        {rows.map((row) => (
          <div key={row.label} className={`offer-totals__row${row.tone ? ` offer-totals__row--${row.tone}` : ""}`}>
            <dt>{row.label}</dt>
            <dd className="offer-totals__pct">{row.pct}</dd>
            <dd className="offer-totals__value">{row.value}</dd>
          </div>
        ))}
        {view === "internal" && (
          <div className="offer-totals__row">
            <dt>Toplam adam-saat</dt>
            <dd className="offer-totals__pct" />
            <dd className="offer-totals__value">{formatDecimal(internal.man_hours, 1)} a-s</dd>
          </div>
        )}
      </dl>
      {totals.unpriced_count > 0 && (
        <p className="offer-totals__warn">
          <WarningTriangleIcon className="offer-totals__warn-icon" />
          <span>Fiyatı girilmemiş {totals.unpriced_count} kalem toplamlara dahil değil</span>
        </p>
      )}
    </section>
  );
}
