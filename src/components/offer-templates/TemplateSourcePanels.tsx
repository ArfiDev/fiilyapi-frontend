import { OFFER_STATUS_LABEL } from "@/components/offers/offer-status";
import { Input } from "@/components/ui";
import { CheckIcon, SearchIcon } from "@/components/ui/icons";
import type { OfferListItem } from "@/lib/api/hooks/useOffers";
import type { OfferTemplateListItem } from "@/lib/api/hooks/useOfferTemplates";
import { cx } from "@/lib/cx";

import type { SourceKind } from "./template-create-form";
import "./offer-templates.css";

/** TS:277 — kaynak kartları (Boş / Bir tekliften / Şablondan kopyala), metinler AYNEN. */
const SOURCES: readonly { kind: SourceKind; title: string; description: string }[] = [
  { kind: "blank", title: "Boş", description: "Grupları seçin, kalemleri sonra ekleyin" },
  { kind: "offer", title: "Bir tekliften", description: "Teklifin kalem ve gruplarını alın" },
  { kind: "template", title: "Şablondan kopyala", description: "Mevcut şablonu temel alın" },
];

export function SourceCards({ source, onChange }: { source: SourceKind; onChange: (kind: SourceKind) => void }) {
  return (
    <div className="otpl-sources" role="radiogroup" aria-label="Kalemler nereden gelsin?">
      {SOURCES.map(({ kind, title, description }) => (
        <button
          key={kind}
          type="button"
          role="radio"
          aria-checked={source === kind}
          className={cx("otpl-source", source === kind && "otpl-source--active")}
          onClick={() => onChange(kind)}
        >
          <span className="otpl-source__top">
            <span className="otpl-radio" aria-hidden="true" />
            <span className="otpl-source__title">{title}</span>
          </span>
          <span className="otpl-source__desc">{description}</span>
        </button>
      ))}
    </div>
  );
}

interface OfferPanelProps {
  offers: readonly OfferListItem[];
  selectedId: string | undefined;
  searchText: string;
  onSearchChange: (value: string) => void;
  onSelect: (offer: OfferListItem) => void;
  isLoading: boolean;
  error: string | undefined;
}

/** ÜS-F4-11: arama + son 8 teklif; satırda "Rev.n · durum" (liste ucunda kalem sayısı YOK); kaynak = son revizyon. */
export function OfferSourcePanel({ offers, selectedId, searchText, onSearchChange, onSelect, isLoading, error }: OfferPanelProps) {
  return (
    <div className="otpl-offers">
      <div className="otpl-offers__search">
        <Input
          type="search"
          size="row"
          value={searchText}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Teklif no, iş adı ya da işveren ara"
          aria-label="Teklif no, iş adı ya da işveren ara"
          leftIcon={<SearchIcon width={13} height={13} />}
        />
      </div>
      {isLoading && <p className="otpl-offers__empty">Teklifler yükleniyor</p>}
      {!isLoading && offers.length === 0 && <p className="otpl-offers__empty">Teklif bulunamadı</p>}
      {offers.map((offer) => {
        const isActive = offer.id === selectedId;
        return (
          <button
            key={offer.id}
            type="button"
            role="radio"
            aria-checked={isActive}
            className={cx("otpl-offer", isActive && "otpl-offer--active")}
            onClick={() => onSelect(offer)}
          >
            <span className="otpl-radio" aria-hidden="true" />
            <span className="otpl-offer__no">{offer.offer_no}</span>
            <span className="otpl-offer__job">{offer.title}</span>
            <span className="otpl-offer__meta">
              Rev.{offer.rev_no} · {OFFER_STATUS_LABEL[offer.status]}
            </span>
          </button>
        );
      })}
      {error && <p className="otpl-modal__error">{error}</p>}
    </div>
  );
}

/** TS:279 — "Şablondan kopyala" çipleri: "{ad} · {n} kalem". */
export function TemplateSourceChips({
  templates,
  selectedId,
  onSelect,
}: {
  templates: readonly OfferTemplateListItem[];
  selectedId: string | undefined;
  onSelect: (templateId: string) => void;
}) {
  return (
    <div className="otpl-chips" role="radiogroup" aria-label="Kopyalanacak şablon">
      {templates.map((template) => (
        <button
          key={template.id}
          type="button"
          role="radio"
          aria-checked={template.id === selectedId}
          className={cx("otpl-chip", template.id === selectedId && "otpl-chip--active")}
          onClick={() => onSelect(template.id)}
        >
          {template.name} · {template.item_count} kalem
        </button>
      ))}
    </div>
  );
}

/** TS:286-291 — "Başlangıç grupları" çipleri (ÜS-F4-8: katalog disiplin adları). */
export function GroupChips({
  disciplines,
  selectedIds,
  onToggle,
}: {
  disciplines: readonly { id: string; name: string }[];
  selectedIds: readonly string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div>
      <span className="otpl-modal__label">Başlangıç grupları</span>
      <div className="otpl-chips">
        {disciplines.map((discipline) => {
          const isOn = selectedIds.includes(discipline.id);
          return (
            <button
              key={discipline.id}
              type="button"
              aria-pressed={isOn}
              className={cx("otpl-chip", isOn && "otpl-chip--active")}
              onClick={() => onToggle(discipline.id)}
            >
              {isOn ? <CheckIcon width={11} height={11} /> : "+"} {discipline.name}
            </button>
          );
        })}
      </div>
      <p className="otpl-hint">Seçilen gruplar A, B, C… diye sıralanır; kalemleri sonra katalogdan eklersiniz</p>
    </div>
  );
}
