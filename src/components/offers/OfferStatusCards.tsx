import { Fragment } from "react";

import { formatCompactCurrency } from "@/lib/format";
import { cx } from "@/lib/cx";

import { OFFER_STATUS_LABEL, OFFER_STATUS_TONE } from "./offer-status";
import type { StatusCardModel } from "./offer-list-model";
import type { OfferStatus } from "./offer-types";

interface OfferStatusCardsProps {
  cards: readonly StatusCardModel[];
  /** Etkin durum süzgeci; karta TEKRAR tıklamak süzgeci kapatır (TL:233-234). */
  activeStatus: OfferStatus | null;
  onToggle: (status: OfferStatus) => void;
  /** TKL-F5.5 · ÜS-F5-6: kazanılmış ama projeye dönüştürülmemiş teklif sayısı (`summary.won_not_converted_count`). */
  wonNotConvertedCount?: number;
  /** `conversion=won_not_converted` süzgeci açık mı? */
  isConversionActive?: boolean;
  onToggleConversion?: () => void;
}

/** TL:92-100 — durum kartları; tıklama = durum süzgeci aç/kapa. */
export function OfferStatusCards({
  cards,
  activeStatus,
  onToggle,
  wonNotConvertedCount = 0,
  isConversionActive = false,
  onToggleConversion,
}: OfferStatusCardsProps) {
  return (
    <div className="offers-cards" role="group" aria-label="Durum özeti">
      {cards.map((card) => {
        const isActive = activeStatus === card.status;
        const hasConversionEntry = card.status === "won" && wonNotConvertedCount > 0 && onToggleConversion !== undefined;
        const button = (
          <button
            type="button"
            className={cx("offers-card", isActive && "offers-card--active")}
            aria-pressed={isActive}
            onClick={() => onToggle(card.status)}
            data-testid={`offers-card-${card.status}`}
          >
            <span className="offers-card__top">
              <span className={cx("offers-card__dot", `offers-tone--${OFFER_STATUS_TONE[card.status]}`)} />
              <span className="offers-card__label">{OFFER_STATUS_LABEL[card.status]}</span>
              <span className="offers-card__sub">{card.sub}</span>
            </span>
            <span className="offers-card__figures">
              <span className="offers-card__count">{card.count}</span>
              <span className="offers-card__unit">adet</span>
              {card.showsAmount && (
                <span className={cx("offers-card__amount", `offers-tone--${OFFER_STATUS_TONE[card.status]}`)}>
                  {formatCompactCurrency(card.net)}
                </span>
              )}
            </span>
            <span className="offers-card__foot">{card.foot}</span>
          </button>
        );
        if (!hasConversionEntry) return <Fragment key={card.status}>{button}</Fragment>;
        return (
          <div key={card.status} className="offers-card-slot">
            {button}
            <button
              type="button"
              className={cx("offers-card__convert", isConversionActive && "offers-card__convert--active")}
              aria-pressed={isConversionActive}
              onClick={onToggleConversion}
              data-testid="offers-card-convert"
            >
              {wonNotConvertedCount} dönüştürülmedi
            </button>
          </div>
        );
      })}
    </div>
  );
}
