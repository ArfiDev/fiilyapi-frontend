import { memo } from "react";

import { ContractorBadge, DisciplineSwatch } from "@/components/catalog-shared/CatalogBits";
import { Button } from "@/components/ui";
import { cx } from "@/lib/cx";
import type { WorkItemRead } from "@/lib/api/models";

import { sourceCodeLabel } from "@/components/catalog-shared/source-code";
import { LastPriceCell } from "./LastPriceCell";
import {
  formatPrice,
  formatPriceUpdated,
  formatStandardRate,
  isPriceStale,
  refPriceDateLabel,
} from "./work-item-model";

interface WorkItemRowProps {
  item: WorkItemRead;
  now: Date;
  canWrite: boolean;
  onEdit: (item: WorkItemRead) => void;
  /** Yalnız SANALLAŞTIRMADA: gerçek satır sırası (1 tabanlı, başlık = 1). Eşik altında verilmez → DOM değişmez. */
  ariaRowIndex?: number;
}

/** KIK:134-147 — görünüm satırı. `memo`: 1.700 satırlık listede arama/sekme yeniden çiziminde değişmeyen satır atlanır (prop'lar kararlı: `item` önbellekten, `onEdit` useCallback). */
export const WorkItemRow = memo(function WorkItemRow({ item, now, canWrite, onEdit, ariaRowIndex }: WorkItemRowProps) {
  const isStale = isPriceStale(item.price_updated_at, now);
  const sourceCode = sourceCodeLabel(item);
  const dateLabel = refPriceDateLabel(item);
  return (
    <div role="row" aria-rowindex={ariaRowIndex} className="wik-row wik-grid" data-testid={`wik-row-${item.id}`}>
      <div role="cell" className="wik-cell wik-cell--poz">
        <DisciplineSwatch color={item.discipline.color} />
        <span className="wik-pozbox">
          <span className="wik-poz" data-testid="wik-poz">
            {item.poz_no}
          </span>
          {sourceCode !== null && (
            <span className="wik-sub wik-sub--mono" data-testid="wik-source-code">
              {sourceCode}
            </span>
          )}
        </span>
      </div>
      <div role="cell" className="wik-cell wik-cell--name">
        <span className="wik-name" title={item.name}>
          {item.name}
        </span>
        <span className="wik-sub">{`${item.discipline.code} · ${item.discipline.name}`}</span>
      </div>
      <div role="cell" className="wik-cell wik-cell--unit">
        {item.uom}
      </div>
      <div role="cell" className="wik-cell wik-cell--num wik-cell--ref">
        <span className="wik-refbox">
          <span>{formatPrice(item.ref_price)}</span>
          {dateLabel !== null && (
            <span className="wik-sub wik-sub--mono" data-testid="wik-ref-date">
              {dateLabel}
            </span>
          )}
        </span>
      </div>
      <div role="cell" className="wik-cell wik-cell--last">
        <LastPriceCell lastPrice={item.last_price} refPrice={item.ref_price} />
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
});
