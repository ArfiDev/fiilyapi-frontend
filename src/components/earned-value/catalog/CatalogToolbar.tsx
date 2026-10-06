"use client";

import { useState } from "react";

import { AnchoredPopover, Button, Input } from "@/components/ui";
import { CheckIcon, ChevronDownIcon, SearchIcon } from "@/components/ui/icons";
import type { EvDisciplineRead } from "@/lib/api/models";

import { DisciplineSwatch } from "@/components/catalog-shared/CatalogBits";

/** M6:118 — "Disiplinleri yönet" düğmesindeki renk karesi sayısı. */
const MANAGE_SWATCH_COUNT = 3;
const ALL_LABEL = "Tüm disiplinler";

interface CatalogToolbarProps {
  query: string;
  onQueryChange: (query: string) => void;
  disciplines: readonly EvDisciplineRead[];
  /** Disiplin başına iş tipi sayısı (KAT:525). */
  counts: ReadonlyMap<string, number>;
  total: number;
  disciplineId: string | null;
  onDisciplineChange: (id: string | null) => void;
  onlyBig: boolean;
  onOnlyBigChange: (value: boolean) => void;
  canWrite: boolean;
  /** Disiplin modalının yazma kapısı (ayrı uç/sayfa) — etiketi belirler. */
  canWriteDisciplines: boolean;
  onManageDisciplines: () => void;
  onNewItem: () => void;
}

/** KAT:100-122 + M6:115-119 — arama · disiplin · disiplin yönetimi · büyük fark · ekle. */
export function CatalogToolbar({
  query,
  onQueryChange,
  disciplines,
  counts,
  total,
  disciplineId,
  onDisciplineChange,
  onlyBig,
  onOnlyBigChange,
  canWrite,
  canWriteDisciplines,
  onManageDisciplines,
  onNewItem,
}: CatalogToolbarProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const selected = disciplines.find((d) => d.id === disciplineId);
  const selectedLabel = selected?.name ?? ALL_LABEL;
  const options = [
    { id: null, label: ALL_LABEL, count: total },
    ...disciplines.map((d) => ({ id: d.id, label: d.name, count: counts.get(d.id) ?? 0 })),
  ];

  function choose(id: string | null) {
    onDisciplineChange(id);
    setIsMenuOpen(false);
  }

  return (
    <div className="ev-cat-toolbar">
      <Input
        type="search"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder="İş tipi ara"
        aria-label="İş tipi ara"
        leftIcon={<SearchIcon width={13} height={13} />}
        wrapperClassName="ev-cat-toolbar__search"
      />

      <div className="ev-cat-filter">
        <button
          type="button"
          className="ev-cat-toolbar__btn"
          aria-label={`Disiplin süzgeci: ${selectedLabel}`}
          aria-expanded={isMenuOpen}
          onClick={() => setIsMenuOpen((open) => !open)}
        >
          <span className="ev-cat-toolbar__btn-label">Disiplin</span>
          <span className="ev-cat-toolbar__btn-value">{selectedLabel}</span>
          <ChevronDownIcon className="ev-cat-toolbar__chevron" />
        </button>
        {isMenuOpen && (
          <AnchoredPopover label="Disiplin seç" onClose={() => setIsMenuOpen(false)} className="ev-cat-menu">
            {options.map((option) => (
              <button
                key={option.id ?? "all"}
                type="button"
                className="ev-cat-menu__item"
                aria-pressed={option.id === disciplineId}
                onClick={() => choose(option.id)}
              >
                <span className="ev-cat-menu__label">{option.label}</span>
                <span className="ev-cat-menu__count">{option.count}</span>
              </button>
            ))}
          </AnchoredPopover>
        )}
      </div>

      <button type="button" className="ev-cat-toolbar__btn ev-cat-toolbar__manage" onClick={onManageDisciplines}>
        <span className="ev-cat-toolbar__swatches">
          {disciplines.slice(0, MANAGE_SWATCH_COUNT).map((d) => (
            <DisciplineSwatch key={d.id} color={d.color} />
          ))}
        </span>
        {canWriteDisciplines ? "Disiplinleri yönet" : "Disiplinler"}
      </button>

      <button
        type="button"
        className="ev-cat-toolbar__btn ev-cat-toolbar__big"
        aria-pressed={onlyBig}
        onClick={() => onOnlyBigChange(!onlyBig)}
      >
        <span className="ev-cat-toolbar__box" aria-hidden="true">
          {onlyBig && <CheckIcon />}
        </span>
        Yalnız farkı büyük olanlar
      </button>

      {canWrite && (
        <Button className="ev-cat-toolbar__new" onClick={onNewItem}>
          + Yeni iş tipi
        </Button>
      )}
    </div>
  );
}
