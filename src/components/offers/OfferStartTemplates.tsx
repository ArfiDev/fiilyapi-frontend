import Link from "next/link";
import { useEffect } from "react";

import { Button } from "@/components/ui";
import { useOfferTemplates, type OfferTemplateListItem } from "@/lib/api/hooks/useOfferTemplates";
import { routes } from "@/lib/routes";

import { pickTemplate } from "./offer-start";
import "./offer-create.css";

interface OfferStartTemplatesProps {
  /** Üstte tutulan seçim (yok = henüz seçilmedi → varsayılan şablon ÖNERİLİR, SO-22). */
  selectedId: string | null;
  onSelect: (template: OfferTemplateListItem | null) => void;
}

/** TY:86-95 — şablon kart ızgarası (ad + "x kalem · y grup"). Liste YALNIZ bu bileşen açılınca istenir. */
export function OfferStartTemplates({ selectedId, onSelect }: OfferStartTemplatesProps) {
  const query = useOfferTemplates();
  const items = query.data?.items;

  // Önseçim: seçili yok ya da silinmiş (liste tazelenince) → varsayılan şablon; liste boşaldıysa seçim temizlenir.
  useEffect(() => {
    if (items === undefined) return;
    if (selectedId !== null && items.some((entry) => entry.id === selectedId)) return;
    const next = pickTemplate(items, null);
    if (next === null && selectedId === null) return;
    onSelect(next);
  }, [items, selectedId, onSelect]);

  if (query.isError) {
    return (
      <div className="offer-start__state">
        <span>Şablonlar yüklenemedi</span>
        <Button variant="secondary" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}>
          Tekrar dene
        </Button>
      </div>
    );
  }
  if (items === undefined) return <p className="offer-start__state">Şablonlar yükleniyor</p>;
  if (items.length === 0) {
    return (
      <p className="offer-start__state">
        Henüz şablon yok ·{" "}
        <Link href={routes.offers.templates()} className="offer-start__manage">
          Şablonları yönet →
        </Link>
      </p>
    );
  }
  return (
    <div className="offer-start__templates" role="radiogroup" aria-label="Şablon">
      {items.map((template) => {
        const isSelected = template.id === selectedId;
        return (
          <button
            key={template.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            className="offer-start__tpl"
            onClick={() => onSelect(template)}
          >
            <span className="offer-start__tpl-name">{template.name}</span>
            <span className="offer-start__tpl-sub">
              {template.item_count} kalem · {template.group_count} grup
            </span>
          </button>
        );
      })}
    </div>
  );
}
