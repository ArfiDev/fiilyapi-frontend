import { ContractorBadge, DisciplineSwatch } from "@/components/catalog-shared/CatalogBits";
import { Button } from "@/components/ui";
import { cx } from "@/lib/cx";
import { EMPTY_CELL } from "@/lib/format";
import type { WorkItemRead } from "@/lib/api/models";

import {
  formatPrice,
  formatPriceUpdated,
  formatStandardRate,
  isPriceStale,
} from "./work-item-model";

/** ÜS-8 — son fiyat kaynağı (B3) gelene dek her satırın boş hâli (KIK:254-256). */
export const NO_LAST_PRICE_SOURCE = "henüz kaynak yok";

interface WorkItemRowProps {
  item: WorkItemRead;
  now: Date;
  canWrite: boolean;
  onEdit: (item: WorkItemRead) => void;
}

/** KIK:134-147 — görünüm satırı. */
export function WorkItemRow({ item, now, canWrite, onEdit }: WorkItemRowProps) {
  const isStale = isPriceStale(item.price_updated_at, now);
  return (
    <div role="row" className="wik-row wik-grid" data-testid={`wik-row-${item.id}`}>
      <div role="cell" className="wik-cell wik-cell--poz">
        <DisciplineSwatch color={item.discipline.color} />
        <span className="wik-poz" data-testid="wik-poz">
          {item.poz_no}
        </span>
      </div>
      <div role="cell" className="wik-cell wik-cell--name">
        <span className="wik-name">{item.name}</span>
        <span className="wik-sub">{`${item.discipline.code} · ${item.discipline.name}`}</span>
      </div>
      <div role="cell" className="wik-cell wik-cell--unit">
        {item.uom}
      </div>
      <div role="cell" className="wik-cell wik-cell--num wik-cell--ref">
        {formatPrice(item.ref_price)}
      </div>
      <div role="cell" className="wik-cell wik-cell--last">
        <span className="wik-last wik-last--empty">{EMPTY_CELL}</span>
        <span className="wik-sub wik-sub--nowrap">{NO_LAST_PRICE_SOURCE}</span>
      </div>
      <div role="cell" className="wik-cell wik-cell--num">
        {formatStandardRate(item.standard_unit_mhr)}
      </div>
      <div role="cell" className="wik-cell wik-cell--own">
        <ContractorBadge type={item.default_contractor_type} />
      </div>
      <div role="cell" className={cx("wik-cell wik-cell--num wik-upd", isStale && "wik-upd--stale")}>
        {formatPriceUpdated(item.price_updated_at)}
      </div>
      <div role="cell" className="wik-cell wik-cell--action">
        {canWrite && (
          <Button
            variant="secondary"
            size="sm"
            aria-label={`${item.poz_no} · ${item.name} düzenle`}
            onClick={() => onEdit(item)}
          >
            Düzenle
          </Button>
        )}
      </div>
    </div>
  );
}
