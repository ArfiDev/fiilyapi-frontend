import { useState } from "react";

import { ChevronDownIcon } from "@/components/ui/icons";
import { AnchoredPopover } from "@/components/ui/popover";
import { cx } from "@/lib/cx";
import { formatDateDots } from "@/lib/format";
import type { OfferDetailRead } from "@/lib/api/hooks/useOffers";

import "./offers.css";

interface RevisionPickerProps {
  revisions: OfferDetailRead["revisions"];
  /** Görüntülenen revizyon. */
  currentRevNo: number;
  latestRevNo: number;
  onSelect: (revNo: number) => void;
}

function revLabel(revNo: number, latestRevNo: number): string {
  return revNo === latestRevNo ? `Rev.${revNo} (güncel)` : `Rev.${revNo}`;
}

/** TD:92-104, 393-401 — revizyon seçici; seçim URL'ye (`?rev=`) çağıran tarafından yazılır. */
export function RevisionPicker({ revisions, currentRevNo, latestRevNo, onSelect }: RevisionPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const ordered = [...revisions].sort((a, b) => b.rev_no - a.rev_no);
  return (
    <div className="offers-menu offer-revpicker">
      <button
        type="button"
        className="offer-revpicker__trigger"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span className="offer-revpicker__caption">Revizyon</span>
        <b>{revLabel(currentRevNo, latestRevNo)}</b>
        <ChevronDownIcon className="offer-revpicker__chevron" />
      </button>
      {isOpen && (
        <AnchoredPopover label="Revizyon seç" onClose={() => setIsOpen(false)} className="offers-menu__pop offer-revpicker__pop">
          {ordered.map((revision) => (
            <button
              key={revision.rev_no}
              type="button"
              className={cx("offers-menu__item", "offer-revpicker__item", revision.rev_no === currentRevNo && "offer-revpicker__item--on")}
              aria-current={revision.rev_no === currentRevNo ? "true" : undefined}
              onClick={() => {
                setIsOpen(false);
                if (revision.rev_no !== currentRevNo) onSelect(revision.rev_no);
              }}
            >
              <span>{revLabel(revision.rev_no, latestRevNo)}</span>
              <span className="offer-revpicker__date">{formatDateDots(revision.offer_date)}</span>
              {revision.rev_no !== latestRevNo && <span className="offer-revpicker__ro">salt okunur</span>}
            </button>
          ))}
        </AnchoredPopover>
      )}
    </div>
  );
}
