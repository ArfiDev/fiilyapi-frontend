import { Fragment } from "react";

import { ChevronDownIcon } from "@/components/ui/icons";
import { cx } from "@/lib/cx";
import { formatUnitRate } from "@/lib/earned-value";
import { EMPTY_CELL, formatDateDots, toIstanbulDateOnly } from "@/lib/format";
import type { EvCatalogItemRead } from "@/lib/api/models";

import { AdoptActualControl } from "./AdoptActualControl";
import { ContractorBadge } from "@/components/catalog-shared/CatalogBits";
import { DiffBadge } from "./CatalogBits";
import { canAdoptActual } from "./catalog-model";
import { CatalogRowDetail } from "./CatalogRowDetail";

const COLUMN_COUNT = 10;

interface CatalogTableProps {
  items: readonly EvCatalogItemRead[];
  openIds: ReadonlySet<string>;
  canWrite: boolean;
  onToggle: (id: string) => void;
  onEdit: (item: EvCatalogItemRead) => void;
  onAdopted: (message: string) => void;
}

function historySubline(item: EvCatalogItemRead) {
  const { min, max, site_count: siteCount } = item.actual;
  const range = min !== null && max !== null ? `${formatUnitRate(min)}–${formatUnitRate(max)}` : EMPTY_CELL;
  return (
    <span className="ev-cat-hist__sub">
      <span className="ev-cat-mono">{range}</span>
      {` · ${siteCount > 0 ? `${siteCount} şantiye` : "veri yok"}`}
    </span>
  );
}

/** KAT:127-224 — iş tipi tablosu (10 kolon, min 1140px, yatay kaydırma). */
export function CatalogTable({ items, openIds, canWrite, onToggle, onEdit, onAdopted }: CatalogTableProps) {
  return (
    <div className="ev-cat-scroll">
      <table className="ev-cat-table">
        <colgroup>
          <col className="ev-cat-table__col-toggle" />
          <col />
          <col className="ev-cat-table__col-disc" />
          <col className="ev-cat-table__col-unit" />
          <col className="ev-cat-table__col-std" />
          <col className="ev-cat-table__col-own" />
          <col className="ev-cat-table__col-hist" />
          <col className="ev-cat-table__col-diff" />
          <col className="ev-cat-table__col-upd" />
          <col className="ev-cat-table__col-used" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">
              <span className="sr-only">Aç / kapat</span>
            </th>
            <th scope="col">İş tipi</th>
            <th scope="col">Disiplin</th>
            <th scope="col">Birim</th>
            <th scope="col" className="ev-cat-num">
              Standart oran a-s/birim
            </th>
            <th scope="col">Vars. Kendi/Taş.</th>
            <th scope="col" className="ev-cat-num">
              Geçmiş gerçekleşen ort. · min–max
            </th>
            <th scope="col">Fark</th>
            <th scope="col" className="ev-cat-num">
              Son güncelleme
            </th>
            <th scope="col" className="ev-cat-last">
              Kullanan şantiye
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const isOpen = openIds.has(item.id);
            const hasAverage = item.actual.avg !== null;
            return (
              <Fragment key={item.id}>
                <tr className={cx("ev-cat-row", isOpen && "ev-cat-row--open")}>
                  <td className="ev-cat-toggle-cell">
                    <button
                      type="button"
                      className="ev-cat-toggle"
                      aria-expanded={isOpen}
                      aria-label={`${item.name} ayrıntıları`}
                      onClick={() => onToggle(item.id)}
                    >
                      <ChevronDownIcon />
                    </button>
                  </td>
                  <td>
                    <div className="ev-cat-name">
                      {/* ÜS-12 — poz no adın üstünde (yeni kolon yok); mevcut mono/küçük-soluk sınıfları. */}
                      <span className="ev-cat-name__desc ev-cat-mono">{item.poz_no}</span>
                      <button type="button" className="ev-cat-name__btn" onClick={() => onEdit(item)}>
                        {item.name}
                      </button>
                      {item.description && <span className="ev-cat-name__desc">{item.description}</span>}
                    </div>
                  </td>
                  <td className="ev-cat-muted">{item.discipline.name}</td>
                  <td className="ev-cat-unit">{item.uom}</td>
                  <td className="ev-cat-num">
                    <span className="ev-cat-std">{formatUnitRate(item.standard_unit_mhr)}</span>
                  </td>
                  <td>
                    <ContractorBadge type={item.default_contractor_type} />
                  </td>
                  <td className="ev-cat-num">
                    <div className="ev-cat-hist">
                      <span className={cx("ev-cat-hist__avg", !hasAverage && "ev-cat-hist__avg--empty")}>
                        {formatUnitRate(item.actual.avg)}
                      </span>
                      {historySubline(item)}
                    </div>
                  </td>
                  <td>
                    <div className="ev-cat-diff-cell">
                      <DiffBadge ratio={item.diff_pct} />
                      {canWrite && canAdoptActual(item) && <AdoptActualControl item={item} onAdopted={onAdopted} />}
                    </div>
                  </td>
                  <td className="ev-cat-num ev-cat-upd">
                    {formatDateDots(toIstanbulDateOnly(item.standard_updated_at))}
                  </td>
                  <td className="ev-cat-last">{item.used_by_site_count}</td>
                </tr>
                {isOpen && (
                  <tr className="ev-cat-detail-row">
                    <td colSpan={COLUMN_COUNT}>
                      <CatalogRowDetail item={item} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
