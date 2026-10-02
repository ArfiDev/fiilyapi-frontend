import Link from "next/link";

import type { OfferListItem } from "@/lib/api/hooks/useOffers";
import type { OfferTemplateListItem } from "@/lib/api/hooks/useOfferTemplates";
import { routes } from "@/lib/routes";

import { OfferStartCopy } from "./OfferStartCopy";
import { OfferStartTemplates } from "./OfferStartTemplates";
import type { OfferStartKind } from "./offer-start";
import "./offer-create.css";

interface StartOption {
  key: OfferStartKind;
  label: string;
  description: string;
}

const OPTIONS: readonly StartOption[] = [
  { key: "blank", label: "Boş teklif", description: "Kalemleri katalogdan tek tek ekleyin" },
  { key: "template", label: "Şablondan", description: "Hazır kalem setiyle başlayın, miktarları girin" },
  { key: "copy", label: "Mevcut tekliften kopyala", description: "Benzer bir işin kalem ve fiyatlarını alın" },
];

interface OfferStartChoiceProps {
  kind: OfferStartKind;
  onKindChange: (kind: OfferStartKind) => void;
  /** Seçili şablon (üstte tutulur; `null` = henüz yok → varsayılan önerilir). */
  templateId: string | null;
  onTemplateSelect: (template: OfferTemplateListItem | null) => void;
  /** Seçili kopya kaynağı teklifi (`null` = yok). */
  copyOfferId: string | null;
  onCopySelect: (offer: OfferListItem) => void;
}

/** TY:77-109 — "Nereden başlansın?". DENETİMLİ: seçim ve alt liste durumu üstte tutulur (gövde + özet + form doldurma). */
export function OfferStartChoice(props: OfferStartChoiceProps) {
  const { kind } = props;
  return (
    <section className="offer-create__card" aria-labelledby="offer-start-title">
      <div>
        <h2 className="offer-create__card-title" id="offer-start-title">
          Nereden başlansın?
        </h2>
        <span className="offer-create__card-sub">
          Kalemler başlangıca göre doldurulur; sonradan hepsi düzenlenebilir ·{" "}
          <Link href={routes.offers.templates()} className="offer-start__manage">
            Şablonları yönet →
          </Link>
        </span>
      </div>
      <div className="offer-start" role="radiogroup" aria-labelledby="offer-start-title">
        {OPTIONS.map((option) => {
          const isSelected = option.key === kind;
          return (
            <button
              key={option.key}
              type="button"
              role="radio"
              aria-checked={isSelected}
              className="offer-start__option"
              onClick={() => props.onKindChange(option.key)}
            >
              <span className="offer-start__top">
                <span className="offer-start__radio" aria-hidden="true">
                  {isSelected && <span className="offer-start__dot" />}
                </span>
                {option.label}
              </span>
              <span className="offer-start__desc">{option.description}</span>
            </button>
          );
        })}
      </div>
      {kind === "template" && <OfferStartTemplates selectedId={props.templateId} onSelect={props.onTemplateSelect} />}
      {kind === "copy" && <OfferStartCopy selectedOfferId={props.copyOfferId} onSelect={props.onCopySelect} />}
    </section>
  );
}
