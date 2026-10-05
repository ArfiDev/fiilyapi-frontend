import type { UpcomingPaymentsResponse } from "@/lib/api/hooks/useUpcomingPayments";
import { MaskedMark } from "@/components/ui/hidden-mark/HiddenMark";
import { TREASURY_HIDDEN_CATEGORIES } from "@/lib/auth/finance-hidden";
import { useCategoryHidden } from "@/lib/auth/useCategoryHidden";
import { formatCurrencyTight, formatDayMonth } from "@/lib/format";

import {
  UPCOMING_COUNTERPARTY_HINT,
  isUpcomingCounterpartyMissing,
  upcomingDaysText,
  upcomingPaymentTitle,
  upcomingPaymentTone,
} from "./treasury-labels";
import "./treasury.css";

export interface UpcomingPaymentsPanelProps {
  /** `undefined` ⇒ hâlâ yükleniyor. */
  upcoming: UpcomingPaymentsResponse | undefined;
  isLoading: boolean;
  errorMessage: string | undefined;
}

/**
 * E9:109-125 · Yaklaşan Ödemeler kartı.
 *
 * 🔴 Başlıktaki gün sayısı SUNUCUNUN ECHO ETTİĞİ `days`tir (E9:110 "Yaklaşan
 * Ödemeler (7 Gün)"), sabit yazılmaz.
 * 🔴 `days_remaining` SUNUCUDAN gelir, istemcide YENİDEN HESAPLANMAZ.
 * 🔴 `due_date` düz takvim tarihidir; `formatDayMonth` string'ten ayrıştırır —
 * `new Date("2026-07-19")` UTC gece yarısı olurdu ve TR'de BİR GÜN GERİ kayardı
 * (TB5 sınıfı kusur).
 * 🔴 "Karşı taraf boş mu" kararı panelde KURULMAZ: `counterparty === null`
 * okumak bordroyu (dış karşı tarafı TANIM GEREĞİ yok) yanlış alarma sokardı —
 * karar `isUpcomingCounterpartyMissing`tedir, sayım ve tooltip aynı kaynaktan
 * geçer.
 */
export function UpcomingPaymentsPanel({
  upcoming,
  isLoading,
  errorMessage,
}: UpcomingPaymentsPanelProps) {
  const isHidden = useCategoryHidden(TREASURY_HIDDEN_CATEGORIES);
  const items = upcoming?.items ?? [];
  const missingCounterpartyCount = items.filter(isUpcomingCounterpartyMissing).length;

  return (
    <section className="hazine-panel" data-testid="hazine-upcoming-panel">
      {/* 110 */}
      <h2 className="hazine-panel__title hazine-panel__title--upcoming">
        {upcoming === undefined
          ? "Yaklaşan Ödemeler"
          : `Yaklaşan Ödemeler (${upcoming.days} Gün)`}
        {/* IZN-F4b.2 — gizli tutarlar için başlıkta TEK kilit; satır tutarları `—`. */}
        <MaskedMark isHidden={isHidden} values={items.map((item) => item.amount)} />
      </h2>

      {isLoading && <p className="hazine-notice">Yükleniyor…</p>}
      {errorMessage !== undefined && (
        <p className="hazine-notice hazine-notice--danger" role="alert">
          {errorMessage}
        </p>
      )}

      {upcoming !== undefined && items.length === 0 && (
        <p className="hazine-notice" data-testid="hazine-upcoming-empty">
          Bu pencerede vadesi yaklaşan ödeme yok.
        </p>
      )}

      {/* Zarif düşüş GÖRÜNÜR kılınır — sessiz atlama yok. */}
      {missingCounterpartyCount > 0 && (
        <p className="hazine-notice" data-testid="hazine-upcoming-counterparty-notice">
          {missingCounterpartyCount} ödemenin karşı taraf adı kaynak evrakta boş.
        </p>
      )}

      {items.length > 0 && (
        // 111
        <div className="hazine-rows">
          {items.map((item) => {
            const tone = upcomingPaymentTone(item.days_remaining);
            return (
              <div
                key={`${item.source_type}:${item.source_id}`}
                className={`hazine-row hazine-row--${tone}`}
                data-testid="hazine-upcoming-row"
                data-source-id={item.source_id}
                data-tone={tone}
              >
                <div>
                  {/* 113 */}
                  <div
                    className="hazine-row__title"
                    {...(isUpcomingCounterpartyMissing(item)
                      ? { title: UPCOMING_COUNTERPARTY_HINT }
                      : {})}
                  >
                    {upcomingPaymentTitle(item)}
                  </div>
                  {/* 113 alt satırı */}
                  <div className="hazine-row__meta">
                    {formatDayMonth(item.due_date)} · {upcomingDaysText(item.days_remaining)}
                  </div>
                </div>
                {/* 114 */}
                <span className="hazine-row__amount">{formatCurrencyTight(item.amount)}</span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
