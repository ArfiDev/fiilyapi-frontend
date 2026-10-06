import Link from "next/link";
import { useEffect } from "react";

import { AnchoredPopover } from "@/components/ui/popover";
import { cx } from "@/lib/cx";
import { downloadOfferExport } from "@/lib/api/offer-export-client";
import { routes } from "@/lib/routes";
import { useFileDownload } from "@/lib/use-file-download";

import { rowMenuRules } from "./offer-list-model";
import type { OfferListItem } from "./offer-types";
import { OFFERS_EDIT } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";

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
  // IZN-F2.x · taslak teklif silme = yalnız sistem yöneticisi (SIL-B1 `require_system_admin`; durum kuralı korunur).
  const canDeleteOffer =
    useButtonGate({ pages: OFFERS_EDIT, need: "sa" }) && rowMenuRules(item, true).canDelete;
  const download = useFileDownload();
  // Başarıda menü kapanır (dosya tarayıcıya indi); hata menüde kalır (aşağıda).
  useEffect(() => {
    if (download.notice !== null) onClose();
    // `onClose` her render'da yeni kimlik; yalnız başarı bildirimine tepki verilir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [download.notice]);
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
          {/* TKL-F4.3 · ÜS-F4-18: işveren görünümü, satırın son revizyonu. */}
          <button
            type="button"
            className="offers-menu__item"
            disabled={download.isBusy}
            onClick={() => void download.start(() => downloadOfferExport(item.id, item.rev_no, "employer"))}
          >
            Excel indir
          </button>
          {download.error !== null && <span className="offers-menu__reason">{download.error}</span>}
          {canDeleteOffer && (
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
