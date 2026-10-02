import { LAST_PRICE_HIGH_PCT } from "./last-price";

/**
 * KIK:184-188 — dipnot. ÜS-F2-17: 1. madde bugünkü kaynakları söyler (işveren sözleşmeleri +
 * onaylı hakedişler); "ve kazanılan tekliflerden" TKL-B4'te eklenir. Eşik metni sabitten üretilir.
 */
export function WorkItemLegend() {
  return (
    <div className="wik-legend">
      <span>
        Referans fiyat elle girilir; son fiyat işveren sözleşmeleri ve onaylı hakedişlerden gelir
      </span>
      <span className="wik-legend__item">
        <span className="wik-legend__high">+%</span>
        <span>{`son fiyat referansın %${LAST_PRICE_HIGH_PCT} üstünde`}</span>
      </span>
      <span>
        <span className="wik-legend__stale">turuncu tarih</span>{" "}
        <span>6 aydan eski fiyat</span>
      </span>
    </div>
  );
}
