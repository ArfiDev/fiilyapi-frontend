import Link from "next/link";

import { LockIcon } from "@/components/ui/icons";
import { formatDateDots, toIstanbulDateOnly } from "@/lib/format";
import type { OfferDetailRead } from "@/lib/api/hooks/useOffers";

import "./offers.css";

type RevisionSummary = OfferDetailRead["revisions"][number];

/** ÜS-F3-15: gönderildiyse gönderim günü, kaybedildiyse kayıp günü, değilse ilk teklif tarihi. */
export function readOnlyRevisionNote(revision: RevisionSummary): string {
  if (revision.sent_at) return `işverene ${formatDateDots(toIstanbulDateOnly(revision.sent_at))} tarihinde gönderildi`;
  if (revision.lost_at) return `kaybedildi · ${formatDateDots(toIstanbulDateOnly(revision.lost_at))}`;
  return `ilk teklif · ${formatDateDots(revision.offer_date)}`;
}

interface ReadOnlyRevisionBannerProps {
  revision: RevisionSummary;
  /** "Güncel revizyona dön →" hedefi. */
  currentHref: string;
}

/** TD:122-128, 403 — eski revizyon bandı. */
export function ReadOnlyRevisionBanner({ revision, currentHref }: ReadOnlyRevisionBannerProps) {
  return (
    <div role="note" className="offers-readonly offer-detail__banner">
      <LockIcon className="offers-readonly__icon" />
      <span>
        <b>Rev.{revision.rev_no}</b> salt okunur · {readOnlyRevisionNote(revision)}
      </span>
      <Link href={currentHref} className="offer-detail__banner-link">
        Güncel revizyona dön →
      </Link>
    </div>
  );
}
