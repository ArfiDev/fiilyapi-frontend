import { formatCurrencyPrecise, formatDateTimeDots } from "@/lib/format";
import type { OfferDetailRead } from "@/lib/api/hooks/useOffers";

import "./offer-detail.css";

type HistoryEvent = OfferDetailRead["history"][number];
type HistoryKind = HistoryEvent["kind"];

/** T32: yalnız revizyon açılışı + durum değişimleri (mockup'taki "Taslak kaydedildi" ve serbest not basılmaz). */
export const HISTORY_KIND_LABEL: Readonly<Record<HistoryKind, string>> = {
  opened: "açıldı",
  sent: "gönderildi",
  won: "kazanıldı",
  lost: "kaybedildi",
  withdrawn: "vazgeçildi",
};

/** Aynı anda olan olaylarda doğal sıra (en yenisi üstte: tersi uygulanır). */
const KIND_RANK: Readonly<Record<HistoryKind, number>> = { opened: 0, sent: 1, won: 2, lost: 2, withdrawn: 2 };

/** Tutarı revizyon içeriği kesinleşmiş (gönderildi/kazanıldı/kaybedildi) olaylarda basılır (ÜS-F3-24: KDV hariç). */
const AMOUNT_KINDS: ReadonlySet<HistoryKind> = new Set(["sent", "won", "lost"]);

/** En yeni üstte: zaman azalan; eşitlikte yüksek revizyon, sonra daha ileri olay (gönderim açılışın üstünde). */
export function sortHistoryNewestFirst(history: readonly HistoryEvent[]): HistoryEvent[] {
  return [...history].sort((a, b) => {
    const byTime = Date.parse(b.at) - Date.parse(a.at);
    if (byTime !== 0) return byTime;
    if (a.rev_no !== b.rev_no) return b.rev_no - a.rev_no;
    return KIND_RANK[b.kind] - KIND_RANK[a.kind];
  });
}

export interface RevisionHistoryProps {
  history: OfferDetailRead["history"];
  revisions: OfferDetailRead["revisions"];
}

export function RevisionHistory({ history, revisions }: RevisionHistoryProps) {
  const rows = sortHistoryNewestFirst(history);
  return (
    <section className="offer-detail__card" aria-labelledby="offer-history-title">
      <h2 className="offer-detail__card-title" id="offer-history-title">
        Revizyon geçmişi
      </h2>
      <ol className="offer-history">
        {rows.map((event) => {
          const revision = revisions.find((candidate) => candidate.rev_no === event.rev_no);
          return (
            <li key={`${event.rev_no}-${event.kind}-${event.at}`} className="offer-history__item">
              <span className="offer-history__title">Rev.{event.rev_no}</span>
              <span className="offer-history__tag">{HISTORY_KIND_LABEL[event.kind]}</span>
              <span className="offer-history__meta">
                {formatDateTimeDots(event.at)}
                {event.user_name ? ` · ${event.user_name}` : ""}
              </span>
              {AMOUNT_KINDS.has(event.kind) && revision && (
                <span className="offer-history__amount">{formatCurrencyPrecise(revision.net)}</span>
              )}
              {event.kind === "lost" && revision?.lost_reason && (
                <span className="offer-history__note">Kayıp nedeni: {revision.lost_reason}</span>
              )}
              {event.kind === "lost" && revision?.winning_amount != null && (
                <span className="offer-history__note">
                  Kazanan teklif tutarı: {formatCurrencyPrecise(revision.winning_amount)}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
