import Link from "next/link";
import { useState } from "react";

import { formatDateDots } from "@/lib/format";
import { buildListTruncation, listTruncationMessage } from "@/lib/list-truncation";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";

import { OfferRowMenu } from "./OfferRowMenu";
import { OFFER_STATUS_LABEL, OFFER_STATUS_TONE, isOfferExpired } from "./offer-status";
import { formatLiraFixed, listedTotals } from "./offer-list-model";
import type { OfferListItem } from "./offer-types";

interface OffersTableProps {
  items: readonly OfferListItem[];
  /** Sunucunun bildirdiği süzülmüş toplam (`items`'tan büyükse liste kırpılmıştır). */
  total: number;
  canWrite: boolean;
  /** İstanbul takvim günü (`YYYY-MM-DD`). */
  today: string;
  /** İşlemi uçan satırın kimliği. */
  busyOfferId: string | null;
  onNewRevision: (item: OfferListItem) => void;
  onDelete: (item: OfferListItem) => void;
}

/** TL:137-168, 175-187 — liste tablosu. */
export function OffersTable({ items, total, canWrite, today, busyOfferId, onNewRevision, onDelete }: OffersTableProps) {
  const [menuId, setMenuId] = useState<string | null>(null);
  const totals = listedTotals(items, total);
  return (
    <div className="offers-scroll">
      <div className="offers-table" role="table" aria-label="Teklifler">
        <div className="offers-grid offers-head" role="row">
          <div className="offers-th offers-th--no" role="columnheader">Teklif No</div>
          <div className="offers-th offers-th--rev" role="columnheader">Rev</div>
          <div className="offers-th" role="columnheader">İş Adı</div>
          <div className="offers-th" role="columnheader">İşveren</div>
          <div className="offers-th offers-th--num" role="columnheader">Tarih</div>
          <div className="offers-th offers-th--num" role="columnheader">Geçerlilik</div>
          <div className="offers-th offers-th--num" role="columnheader">Teklif tutarı KDV hariç</div>
          <div className="offers-th offers-th--num" role="columnheader">KDV dahil</div>
          <div className="offers-th" role="columnheader">Durum</div>
          <div className="offers-th" role="columnheader" aria-label="İşlemler" />
        </div>
        {items.map((item) => {
          const expired = isOfferExpired(item.status, item.valid_until, today);
          return (
            <div
              key={item.id}
              className={cx("offers-grid", "offers-row", menuId === item.id && "offers-row--menu")}
              role="row"
              data-testid={`offers-row-${item.offer_no}`}
            >
              <div className="offers-cell offers-cell--no" role="cell">
                <Link href={routes.offers.detail({ offerId: item.id })} className="offers-no">
                  {item.offer_no}
                </Link>
              </div>
              <div className="offers-cell offers-cell--rev" role="cell">
                <span className="offers-rev">R{item.rev_no}</span>
              </div>
              <div className="offers-cell offers-cell--job" role="cell">
                <span className="offers-job">{item.title}</span>
                {item.scope_summary && <span className="offers-scope">{item.scope_summary}</span>}
              </div>
              <div className="offers-cell" role="cell">{item.employer_name}</div>
              <div className="offers-cell offers-cell--num offers-muted" role="cell">{formatDateDots(item.offer_date)}</div>
              <div className="offers-cell offers-cell--valid" role="cell">
                <span className={cx("offers-valid", expired && "offers-valid--expired")}>
                  {formatDateDots(item.valid_until)}
                </span>
                {expired && <span className="offers-expired">süresi geçti</span>}
              </div>
              <div className="offers-cell offers-cell--num offers-cell--strong" role="cell">{formatLiraFixed(item.net)}</div>
              <div className="offers-cell offers-cell--num offers-muted" role="cell">{formatLiraFixed(item.gross)}</div>
              <div className="offers-cell" role="cell">
                <span className={cx("offers-pill", `offers-tone--${OFFER_STATUS_TONE[item.status]}`)}>
                  {OFFER_STATUS_LABEL[item.status]}
                </span>
              </div>
              <div className="offers-cell offers-cell--menu" role="cell">
                <OfferRowMenu
                  item={item}
                  canWrite={canWrite}
                  isOpen={menuId === item.id}
                  isBusy={busyOfferId !== null}
                  onToggle={() => setMenuId((current) => (current === item.id ? null : item.id))}
                  onClose={() => setMenuId(null)}
                  onNewRevision={() => onNewRevision(item)}
                  onDelete={() => onDelete(item)}
                />
              </div>
            </div>
          );
        })}
        <div className="offers-grid offers-foot" role="row">
          <div className="offers-foot__label" role="cell">Listelenen toplam · {items.length} teklif</div>
          {totals.kind === "sum" ? (
            <>
              <div className="offers-cell offers-cell--num" role="cell" data-testid="offers-total-net">{formatLiraFixed(totals.net)}</div>
              <div className="offers-cell offers-cell--num offers-muted" role="cell" data-testid="offers-total-gross">{formatLiraFixed(totals.gross)}</div>
            </>
          ) : (
            <div className="offers-foot__truncated" role="cell" data-testid="offers-truncation">
              {listTruncationMessage(buildListTruncation(items.length, total))} Toplam basılmadı.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
