import Link from "next/link";

import { LockIcon } from "@/components/ui/icons";
import { formatDateDots, toIstanbulDateOnly } from "@/lib/format";
import type { OfferDetailRead } from "@/lib/api/hooks/useOffers";

import "./offers.css";

type RevisionSummary = OfferDetailRead["revisions"][number];

/**
 * ÜS-F3-15: gönderim günü. Eski (salt okunur) revizyon YALNIZ gönderilmiş (`sent`) ya da gönderilip kaybedilmiş
 * (`lost`) olabilir — ikisinde de `sent_at` dolu; "kaybedildi · tarih" / "ilk teklif" dalları gerçek veride
 * oluşmaz (TKL-F3.6.1: ölü dallar kaldırıldı). `sent_at` yoksa not basılmaz.
 */
export function readOnlyRevisionNote(revision: RevisionSummary): string | null {
  return revision.sent_at ? `işverene ${formatDateDots(toIstanbulDateOnly(revision.sent_at))} tarihinde gönderildi` : null;
}

interface ReadOnlyRevisionBannerProps {
  revision: RevisionSummary;
  /** "Güncel revizyona dön →" hedefi. */
  currentHref: string;
}

/** TD:122-128, 403 — eski revizyon bandı. */
export function ReadOnlyRevisionBanner({ revision, currentHref }: ReadOnlyRevisionBannerProps) {
  const note = readOnlyRevisionNote(revision);
  return (
    <div role="note" className="offers-readonly offer-detail__banner">
      <LockIcon className="offers-readonly__icon" />
      <span>
        <b>Rev.{revision.rev_no}</b> salt okunur{note !== null && ` · ${note}`}
      </span>
      <Link href={currentHref} className="offer-detail__banner-link">
        Güncel revizyona dön →
      </Link>
    </div>
  );
}
