import { WarningTriangleIcon } from "@/components/ui/icons";
import { formatMoneyTl, formatWholeNumber } from "@/components/work-item-catalog/work-item-model";
import { divideDecimalStrings, multiplyDecimalStrings } from "@/lib/decimal";
import { EMPTY_CELL, formatDecimal } from "@/lib/format";
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
}

/** TD:422-429 `tl(v)` — kuruşlu, grup/kalem satırlarıyla aynı biçim; dize tabanlı, kayıpsız; maskeli → "—". */
const money = formatMoneyTl;

/**
 * Türev yüzde. MASKELİ (`null`) girdi → hesap YAPILAMAZ → "—" (sıfır sayılmaz, uydurulmaz — IZN-F4.2).
 * Bölen sıfır → yüzde basılmaz.
 */
function pctText(part: string | null, base: string | null): string {
  if (part === null || base === null) return EMPTY_CELL;
  const ratio = divideDecimalStrings(multiplyDecimalStrings(part, PERCENT), base, PCT_DISPLAY_DIGITS);
  return ratio === null ? "" : `%${formatDecimal(ratio, PCT_DISPLAY_DIGITS)}`;
}

interface Row {
  label: string;
  pct: string;
  value: string;
  tone?: "net" | "gross";
}

/** İÇ görünüm (Detay): maliyet/GG/kâr/adam-saat dahil. İşveren görünümü yazdırmada AYRI modelle kurulur (TKL-F3.6.1: ölü `customer` dalı silindi). */
export function OfferTotalsCard({ totals, vatPct }: OfferTotalsCardProps) {
  const { customer, internal } = totals;
  const costRows: Row[] = [
    { label: "Maliyet", pct: "", value: money(internal.cost) },
    { label: "Genel gider", pct: pctText(internal.overhead, internal.cost), value: money(internal.overhead) },
    {
      label: "Kâr",
      pct: internal.profit_pct === null ? EMPTY_CELL : `%${formatDecimal(internal.profit_pct, PCT_DISPLAY_DIGITS)}`,
      value: money(internal.profit),
    },
  ];
  const customerRows: Row[] = [
    { label: "Teklif tutarı (KDV hariç)", pct: "", value: money(customer.net), tone: "net" },
    { label: "KDV", pct: `%${formatDecimal(vatPct, PCT_DISPLAY_DIGITS)}`, value: money(customer.vat) },
    { label: "Genel toplam", pct: "", value: money(customer.gross), tone: "gross" },
  ];
  const rows = [...costRows, ...customerRows];

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
        <div className="offer-totals__row">
          <dt>{totals.unquantified_count > 0 ? "Toplam adam-saat (kısmi)" : "Toplam adam-saat"}</dt>
          <dd className="offer-totals__pct" />
          <dd className="offer-totals__value">{formatWholeNumber(internal.man_hours)} a-s</dd>
        </div>
      </dl>
      {totals.unpriced_count > 0 && (
        <p className="offer-totals__warn">
          <WarningTriangleIcon className="offer-totals__warn-icon" />
          <span>Fiyatı girilmemiş {totals.unpriced_count} kalem toplamlara dahil değil</span>
        </p>
      )}
      {totals.unquantified_count > 0 && (
        <p className="offer-totals__warn">
          <WarningTriangleIcon className="offer-totals__warn-icon" />
          <span>Miktarı girilmemiş {totals.unquantified_count} kalem toplamlara dahil değil</span>
        </p>
      )}
    </section>
  );
}
