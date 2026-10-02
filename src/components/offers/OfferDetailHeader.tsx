import Link from "next/link";
import type { ReactNode } from "react";

import { cx } from "@/lib/cx";

import type { OfferProjectLink } from "./offer-project-link";
import { OFFER_STATUS_LABEL, OFFER_STATUS_TONE } from "./offer-status";
import type { OfferStatus } from "./offer-types";
import "./offers.css";
import "./offer-detail.css";

interface OfferDetailHeaderProps {
  offerNo: string;
  title: string;
  /** Görüntülenen revizyonun durumu (eski revizyonda o revizyonun durumu — TD `st0`). */
  status: OfferStatus;
  /** Dönüştürülmüş teklif: "Proje: {ad} →" (ÜS-F5-4); yoksa basılmaz. */
  projectLink?: OfferProjectLink | null;
  /** Revizyon seçici + "Son kayıt" satırı. */
  children: ReactNode;
}

/** TD:88-104 — başlık + durum rozeti + revizyon satırı. */
export function OfferDetailHeader({ offerNo, title, status, projectLink = null, children }: OfferDetailHeaderProps) {
  return (
    <header className="offer-detail__head">
      <div className="offer-detail__titlerow">
        <h1 className="offer-detail__title">
          <span className="offer-detail__no">{offerNo}</span> · {title}
        </h1>
        <span className={cx("offers-pill", `offers-tone--${OFFER_STATUS_TONE[status]}`)}>{OFFER_STATUS_LABEL[status]}</span>
        {projectLink !== null && (
          <Link href={projectLink.href} className="offer-detail__project">
            {projectLink.label}
          </Link>
        )}
      </div>
      <div className="offer-detail__revrow">{children}</div>
    </header>
  );
}
