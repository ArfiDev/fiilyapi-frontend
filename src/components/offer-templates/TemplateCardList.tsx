import { Input } from "@/components/ui";
import { SearchIcon } from "@/components/ui/icons";
import type { OfferTemplateListItem } from "@/lib/api/hooks/useOfferTemplates";
import { cx } from "@/lib/cx";

import { formatUpdatedDate } from "./template-model";
import "./offer-templates.css";

const SEARCH_MAX_LENGTH = 100;

interface TemplateCardListProps {
  /** Arama süzgecinden GEÇMİŞ kartlar. */
  items: readonly OfferTemplateListItem[];
  /** "N şablon" = listenin TOPLAMI (TS:315 `listN`; süzgeç sayıyı daraltmaz). */
  total: number;
  searchText: string;
  onSearchTextChange: (value: string) => void;
  selectedId: string | null;
  onSelect: (templateId: string) => void;
}

/** TS:89-106 — arama + "N şablon" + kart ızgarası (seçili kart mavi). */
export function TemplateCardList({ items, total, searchText, onSearchTextChange, selectedId, onSelect }: TemplateCardListProps) {
  return (
    <section className="otpl-list" aria-label="Şablon listesi">
      <div className="otpl-list__bar">
        <Input
          type="search"
          value={searchText}
          onChange={(event) => onSearchTextChange(event.target.value)}
          maxLength={SEARCH_MAX_LENGTH}
          placeholder="Şablon ara"
          aria-label="Şablon ara"
          leftIcon={<SearchIcon width={13} height={13} />}
          wrapperClassName="otpl-list__search"
        />
        <span className="otpl-list__count">
          <b>{total}</b> şablon
        </span>
      </div>
      <div className="otpl-grid">
        {items.map((item) => (
          <TemplateCard key={item.id} item={item} isSelected={item.id === selectedId} onSelect={onSelect} />
        ))}
      </div>
    </section>
  );
}

function TemplateCard({
  item,
  isSelected,
  onSelect,
}: {
  item: OfferTemplateListItem;
  isSelected: boolean;
  onSelect: (templateId: string) => void;
}) {
  return (
    <button
      type="button"
      className={cx("otpl-card", isSelected && "otpl-card--active")}
      aria-pressed={isSelected}
      onClick={() => onSelect(item.id)}
    >
      <span className="otpl-card__top">
        <span className="otpl-card__name">{item.name}</span>
        {item.is_default && <span className="otpl-card__badge">VARSAYILAN</span>}
      </span>
      <span className="otpl-card__meta">
        <span className="otpl-mono">{item.item_count}</span> kalem · <span className="otpl-mono">{item.group_count}</span> grup ·{" "}
        {item.usage_count} teklifte kullanıldı
      </span>
      <span className="otpl-card__date">Güncelleme {formatUpdatedDate(item.updated_at)}</span>
    </button>
  );
}
