import Link from "next/link";

import { DisciplineSwatch } from "@/components/catalog-shared/CatalogBits";
import { cx } from "@/lib/cx";
import { routes } from "@/lib/routes";
import type { WorkDisciplineRead } from "@/lib/api/models";

interface WorkItemDisciplineChipsProps {
  disciplines: readonly WorkDisciplineRead[];
  counts: ReadonlyMap<string, number>;
  total: number;
  /** null = "Tüm disiplinler". */
  activeId: string | null;
  onChange: (id: string | null) => void;
  /** "+ Disiplin ekle" yalnız yazma yetkisinde (disiplin yönetimi KAT'tadır). */
  canWrite: boolean;
}

/** KIK:105-116, 277, 280 — disiplin çipleri; sayaçlar TÜM katalogdan istemcide. */
export function WorkItemDisciplineChips({
  disciplines,
  counts,
  total,
  activeId,
  onChange,
  canWrite,
}: WorkItemDisciplineChipsProps) {
  return (
    <div className="wik-chips" role="group" aria-label="Disiplin süzgeci">
      <span className="wik-chips__label">Disiplin</span>
      <button
        type="button"
        className={cx("wik-chip", activeId === null && "wik-chip--active")}
        aria-pressed={activeId === null}
        onClick={() => onChange(null)}
      >
        <span>Tüm disiplinler</span>
        <span className="wik-chip__count">{total}</span>
      </button>
      {disciplines.map((discipline) => (
        <button
          key={discipline.id}
          type="button"
          className={cx("wik-chip", activeId === discipline.id && "wik-chip--active")}
          aria-pressed={activeId === discipline.id}
          onClick={() => onChange(discipline.id)}
        >
          <DisciplineSwatch color={discipline.color} />
          <span className="wik-chip__code">{discipline.code}</span>
          <span>{discipline.name}</span>
          <span className="wik-chip__count">{counts.get(discipline.id) ?? 0}</span>
        </button>
      ))}
      {canWrite && (
        <Link href={routes.planning.catalog()} className="wik-chips__add">
          + Disiplin ekle
        </Link>
      )}
    </div>
  );
}
