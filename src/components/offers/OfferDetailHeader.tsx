import type { ReactNode } from "react";

import { cx } from "@/lib/cx";

import { OFFER_STATUS_LABEL, OFFER_STATUS_TONE } from "./offer-status";
import type { OfferStatus } from "./offer-types";
import "./offers.css";
import "./offer-detail.css";

interface OfferDetailHeaderProps {
  offerNo: string;
  title: string;
  /** Görüntülenen revizyonun durumu (eski revizyonda o revizyonun durumu — TD `st0`). */
  status: OfferStatus;
  /** Revizyon seçici + "Son kayıt" satırı. */
  children: ReactNode;
}

/** TD:88-104 — başlık + durum rozeti + revizyon satırı. */
export function OfferDetailHeader({ offerNo, title, status, children }: OfferDetailHeaderProps) {
  return (
    <header className="offer-detail__head">
      <div className="offer-detail__titlerow">
        <h1 className="offer-detail__title">
          <span className="offer-detail__no">{offerNo}</span> · {title}
        </h1>
        <span className={cx("offers-pill", `offers-tone--${OFFER_STATUS_TONE[status]}`)}>{OFFER_STATUS_LABEL[status]}</span>
      </div>
      <div className="offer-detail__revrow">{children}</div>
    </header>
  );
}
