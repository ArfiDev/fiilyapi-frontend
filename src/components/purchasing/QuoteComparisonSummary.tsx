"use client";

import { MaskedMark } from "@/components/ui/hidden-mark/HiddenMark";
import { COST_HIDDEN_CATEGORIES } from "@/lib/auth/finance-hidden";
import { useCategoryHidden } from "@/lib/auth/useCategoryHidden";
import { formatCurrency, formatQuantity } from "@/lib/format";
import type { PurchaseQuoteCard } from "@/lib/api/hooks/useQuotes";

import { buildQuoteComparison } from "./quote-comparison";
import "./purchasing.css";

export interface QuoteComparisonSummaryProps {
  items: readonly PurchaseQuoteCard[];
  /** 124 "Tahmini Bütçe · Orijinal talep" — talebin `estimated_total`ı. */
  estimatedTotal: string | null;
  /**
   * `total_cost`un ÇARPANI (`request_quantity_total`). Şema: "ekran tutari
   * kendi hesaplamak isterse tabani gormeli" — taban GÖRÜNÜR kalır ki
   * "toplam neden bu" sorusu ekranda cevaplansın.
   */
  quantityTotal: string | null;
  quantityUnit: string | null;
}

const EMPTY_VALUE = "—";

/**
 * TEK 119-127 · "Karşılaştırma Özeti" — DÖRT kutu:
 * En Düşük Teklif (122) · En Yüksek Teklif (123) · Tahmini Bütçe (124) ·
 * En İyi Teklif Farkı (125).
 *
 * ⚠️ YALNIZ ELDEKİ verilerden türer (`quote-comparison.ts`): kartların
 * `total_cost`u ve talebin `estimated_total`ı. Uydurma metrik YOKTUR ve
 * "En Düşük" SUNUCUNUN rozetlediği karttır — istemci fiyat sıralaması
 * yapmaz.
 */
export function QuoteComparisonSummary({
  items,
  estimatedTotal,
  quantityTotal,
  quantityUnit,
}: QuoteComparisonSummaryProps) {
  const isCostHidden = useCategoryHidden(COST_HIDDEN_CATEGORIES);
  const comparison = buildQuoteComparison(items, estimatedTotal);
  const difference = comparison.differenceToBudget;
  // 125 · negatif fark YEŞİL ("Bütçenin altında"), pozitif fark KIRMIZI.
  const isUnderBudget = difference !== null && difference <= 0;

  return (
    <section className="tek-summary" aria-labelledby="tek-summary-title">
      {/* 120 */}
      <h2 className="tek-summary__title" id="tek-summary-title">
        Karşılaştırma Özeti
      </h2>

      <div className="tek-summary__grid">
        {/* 122 */}
        <div className="tek-summary__cell">
          <div className="tek-summary__label">
            En Düşük Teklif
            <MaskedMark isHidden={isCostHidden} values={[comparison.lowest?.total_cost]} />
          </div>
          <div
            className="tek-summary__value tek-summary__value--success"
            data-testid="tek-summary-lowest"
          >
            {comparison.lowest ? formatCurrency(comparison.lowest.total_cost) : EMPTY_VALUE}
          </div>
          <div className="tek-summary__note">
            {comparison.lowest === null
              ? "Henüz teklif yok"
              : comparison.isBestPriceTied
                ? "Birden çok tedarikçi aynı toplamda"
                : comparison.lowest.supplier_name}
          </div>
        </div>

        {/* 123 */}
        <div className="tek-summary__cell">
          <div className="tek-summary__label">
            En Yüksek Teklif
            <MaskedMark isHidden={isCostHidden} values={items.map((item) => item.total_cost)} />
          </div>
          <div
            className="tek-summary__value tek-summary__value--danger"
            data-testid="tek-summary-highest"
          >
            {comparison.highest ? formatCurrency(comparison.highest.total_cost) : EMPTY_VALUE}
          </div>
          <div className="tek-summary__note">
            {/* Maskeli toplamlarda "en yüksek" belirlenemez ama teklif VARDIR — "Henüz teklif yok" yalan olurdu. */}
            {comparison.highest?.supplier_name ?? (items.length === 0 ? "Henüz teklif yok" : EMPTY_VALUE)}
          </div>
        </div>

        {/* 124 */}
        <div className="tek-summary__cell">
          <div className="tek-summary__label">
            Tahmini Bütçe
            <MaskedMark isHidden={isCostHidden} values={[estimatedTotal]} />
          </div>
          <div className="tek-summary__value" data-testid="tek-summary-budget">
            {estimatedTotal === null ? EMPTY_VALUE : formatCurrency(estimatedTotal)}
          </div>
          <div className="tek-summary__note">
            Orijinal talep
            {quantityTotal !== null && (
              <>
                {" · "}
                <span data-testid="tek-summary-quantity">
                  {formatQuantity(quantityTotal)}
                  {quantityUnit ? ` ${quantityUnit}` : ""}
                </span>
              </>
            )}
          </div>
        </div>

        {/* 125 */}
        <div className="tek-summary__cell">
          <div className="tek-summary__label">
            En İyi Teklif Farkı
            <MaskedMark isHidden={isCostHidden} values={[comparison.lowest?.total_cost, estimatedTotal]} />
          </div>
          <div
            className={
              difference === null
                ? "tek-summary__value"
                : isUnderBudget
                  ? "tek-summary__value tek-summary__value--success"
                  : "tek-summary__value tek-summary__value--danger"
            }
            data-testid="tek-summary-difference"
          >
            {difference === null
              ? EMPTY_VALUE
              : `${difference <= 0 ? "-" : "+"}${formatCurrency(Math.abs(difference))}`}
          </div>
          <div
            className={
              difference !== null && isUnderBudget
                ? "tek-summary__note tek-summary__note--success"
                : "tek-summary__note"
            }
          >
            {difference === null
              ? comparison.isTotalMasked
                ? EMPTY_VALUE
                : "Teklif ya da bütçe yok"
              : isUnderBudget
                ? "Bütçenin altında"
                : "Bütçenin üzerinde"}
          </div>
        </div>
      </div>
    </section>
  );
}
