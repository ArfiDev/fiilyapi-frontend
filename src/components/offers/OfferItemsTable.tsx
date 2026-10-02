"use client";

import { Fragment } from "react";

import type { WorkItemRead } from "@/lib/api/models";
import type { OfferRevisionRead } from "@/lib/api/hooks/useOffers";

import { OfferGroupHeaderRow } from "./OfferGroupHeaderRow";
import { OfferItemRow } from "./OfferItemRow";
import { groupCode } from "./offer-items-model";
import { isQuantityMissing, type CellContext, type OfferItem, type QuantityBasis } from "./offer-item-cells";
import type { OfferItemEditor } from "./useOfferItemEditor";

const COLUMN_COUNT = 11;
/** TD:236 kolon başlıkları (son kolon silme düğmesi, başlıksız). */
const COLUMNS = [
  "Poz No",
  "Tarif",
  "Birim",
  "Miktar",
  "A-s / birim",
  "Maliyet B.F.",
  "Gider %",
  "Kâr %",
  "Teklif B.F.",
  "Tutar",
] as const;
const NUMERIC_COLUMNS: ReadonlySet<string> = new Set(COLUMNS.slice(3));
const EMPTY_GROUP_TEXT = 'Bu grupta henüz kalem yok · "+ Katalogdan Ekle" ile ekleyin';

export interface OfferItemsTableProps {
  groups: OfferRevisionRead["groups"];
  /** Revizyon geneli oranlar (kalemde null iken gösterilen). */
  overheadPct: string;
  profitPct: string;
  /** Revizyon düzeyi miktarsız ayrımı (sunucu sayacı + okunan null miktarlar; F4.2). */
  quantityBasis: QuantityBasis;
  catalogById: ReadonlyMap<string, WorkItemRead>;
  editor: OfferItemEditor;
  canEdit: boolean;
  onRenameGroup: (groupId: string, name: string) => void;
  onDeleteGroup: (groupId: string) => void;
}

/** TD:233-268 — gruplu kalem tablosu; dar ekranda yatay kayar (mockup min-width 1160). */
export function OfferItemsTable(props: OfferItemsTableProps) {
  const { groups, overheadPct, profitPct, quantityBasis, catalogById, editor, canEdit } = props;
  const contextOf = (item: OfferItem): CellContext => ({
    item,
    revisionOverheadPct: overheadPct,
    revisionProfitPct: profitPct,
    catalogUnitMhr: catalogById.get(item.catalog_item_id)?.standard_unit_mhr ?? null,
  });
  return (
    <div className="oit-scroll">
      <table className="oit-table">
        <caption className="sr-only">Teklif kalemleri</caption>
        <thead>
          <tr>
            {COLUMNS.map((column) => (
              <th key={column} scope="col" className={NUMERIC_COLUMNS.has(column) ? "oit-th oit-th--num" : "oit-th"}>
                {column}
              </th>
            ))}
            <th scope="col" className="oit-th">
              <span className="sr-only">Kalemi sil</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group, index) => (
            <Fragment key={group.id}>
              <OfferGroupHeaderRow
                code={groupCode(index)}
                groupId={group.id}
                name={group.name}
                items={group.items}
                quantityBasis={quantityBasis}
                canEdit={canEdit}
                onRename={props.onRenameGroup}
                onDelete={props.onDeleteGroup}
              />
              {group.items.map((item) => (
                <OfferItemRow
                  key={item.id}
                  ctx={contextOf(item)}
                  isQuantityMissing={isQuantityMissing(item, quantityBasis)}
                  catalogItem={catalogById.get(item.catalog_item_id)}
                  editor={editor}
                  canEdit={canEdit}
                />
              ))}
              {group.items.length === 0 && (
                <tr>
                  <td colSpan={COLUMN_COUNT} className="oit-empty">
                    {EMPTY_GROUP_TEXT}
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
