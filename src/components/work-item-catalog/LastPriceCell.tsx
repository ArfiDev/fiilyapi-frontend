import { cx } from "@/lib/cx";
import { EMPTY_CELL } from "@/lib/format";

import {
  formatLastPrice,
  formatLastPriceSource,
  isLastPriceMasked,
  lastPriceDiff,
  NO_LAST_PRICE_SOURCE,
  type LastPrice,
} from "./last-price";

export interface LastPriceCellProps {
  /** `last_price`: null = kaynak yok, undefined = alan gelmedi, nesne = dolu. */
  lastPrice: LastPrice | null | undefined;
  /** Fark yüzdesinin tabanı; null/undefined = maskeli ya da girilmemiş. */
  refPrice: string | null | undefined;
  /**
   * Henüz kaydedilmemiş yeni satır: referans fiyat daha girilmediği için "maskeli" sayılmaz,
   * boş hâl "henüz kaynak yok" basar.
   */
  isNewItem?: boolean;
  /** Düzenleme satırı (KIK:158; soluklaştırmayı hücre yapar): alt satırın başına "salt okunur · ". */
  readOnly?: boolean;
}

const READ_ONLY_PREFIX = "salt okunur · ";

/**
 * KIK:138-141, 252-256 — "Son fiyat" hücresinin içeriği (dış `role="cell"` çağıranda).
 * Dışa bağımlılıksız: yalnız props; seçici (TKL-F2.3) aynı hücreyi yeniden kullanır.
 * Bağlantı BASILMAZ (ÜS-F2-16). Uzun kaynak satırı kırpılır, tam metin `title`da.
 */
export function LastPriceCell({ lastPrice, refPrice, isNewItem = false, readOnly = false }: LastPriceCellProps) {
  const prefix = readOnly ? READ_ONLY_PREFIX : "";
  if (lastPrice === null || lastPrice === undefined) {
    const isMasked = !isNewItem && isLastPriceMasked(lastPrice, refPrice);
    return (
      <div className="wik-lastbox">
        <span className="wik-last wik-last--empty">{EMPTY_CELL}</span>
        {!isMasked && <span className="wik-sub wik-sub--nowrap">{`${prefix}${NO_LAST_PRICE_SOURCE}`}</span>}
      </div>
    );
  }
  const diff = lastPriceDiff(lastPrice.price, refPrice);
  const source = formatLastPriceSource(lastPrice);
  return (
    <div className="wik-lastbox">
      <span className="wik-last">
        {formatLastPrice(lastPrice.price)}
        {diff && (
          <span className={cx("wik-last__diff", diff.isHigh && "wik-last__diff--high")}>{diff.text}</span>
        )}
      </span>
      <span className="wik-sub wik-sub--nowrap" title={`${prefix}${source}`}>
        {`${prefix}${source}`}
      </span>
    </div>
  );
}
