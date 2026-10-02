import Link from "next/link";

import { AnchoredPopover } from "@/components/ui/popover";
import { cx } from "@/lib/cx";
import { routes } from "@/lib/routes";

import { rowMenuRules } from "./offer-list-model";
import type { OfferListItem } from "./offer-types";

const EXCEL_SOON_TITLE = "Yakında · Excel desteği sonraki sürümde açılacak";

interface OfferRowMenuProps {
  item: OfferListItem;
  canWrite: boolean;
  isOpen: boolean;
  /** Bu satırda bir işlem uçuyor — menü kilitli. */
  isBusy: boolean;
  onToggle: () => void;
  onClose: () => void;
  onNewRevision: () => void;
  onDelete: () => void;
}

/** TL:158-165, 251 — ⋯ menüsü: Aç · Kopyala (yeni rev) · PDF indir · Excel indir (+ Taslağı sil, ÜS-F3-12). */
export function OfferRowMenu({ item, canWrite, isOpen, isBusy, onToggle, onClose, onNewRevision, onDelete }: OfferRowMenuProps) {
  const rules = rowMenuRules(item, canWrite);
  return (
    <div className="offers-menu">
      <button
        type="button"
        className={cx("offers-menu__trigger", isOpen && "offers-menu__trigger--open")}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={`${item.offer_no} işlemleri`}
        onClick={onToggle}
      >
        ⋯
      </button>
      {isOpen && (
        <AnchoredPopover label={`${item.offer_no} işlemleri`} onClose={onClose} className="offers-menu__pop" escapeOverflow>
          <Link href={routes.offers.detail({ offerId: item.id })} className="offers-menu__item" onClick={onClose}>
            Aç
          </Link>
          <button
            type="button"
            className="offers-menu__item"
            disabled={!rules.newRevision.enabled || isBusy}
            title={rules.newRevision.reason ?? undefined}
            onClick={() => {
              onClose();
              onNewRevision();
            }}
          >
            Kopyala (yeni rev)
          </button>
          {rules.newRevision.reason !== null && (
            <span className="offers-menu__reason">{rules.newRevision.reason}</span>
          )}
          {/* ÜS-F3-20: PDF = yazdırma sayfası (F3.7); işveren türü varsayılan. */}
          <Link
            href={routes.offers.print({ offerId: item.id, rev: item.rev_no, kind: "isveren" })}
            className="offers-menu__item"
            onClick={onClose}
          >
            PDF indir
          </Link>
          <button type="button" className="offers-menu__item" disabled title={EXCEL_SOON_TITLE}>
            Excel indir
          </button>
          {rules.canDelete && (
            <button
              type="button"
              className="offers-menu__item offers-menu__item--danger"
              disabled={isBusy}
              onClick={() => {
                onClose();
                onDelete();
              }}
            >
              Taslağı sil
            </button>
          )}
        </AnchoredPopover>
      )}
    </div>
  );
}
