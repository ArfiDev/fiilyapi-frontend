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
}

/** TL:92-100 — durum kartları; tıklama = durum süzgeci aç/kapa. */
export function OfferStatusCards({ cards, activeStatus, onToggle }: OfferStatusCardsProps) {
  return (
    <div className="offers-cards" role="group" aria-label="Durum özeti">
      {cards.map((card) => {
        const isActive = activeStatus === card.status;
        return (
          <button
            key={card.status}
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
      })}
    </div>
  );
}
