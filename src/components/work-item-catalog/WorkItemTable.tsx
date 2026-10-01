import type { WorkDisciplineRead, WorkItemRead } from "@/lib/api/models";

import { WorkItemEditRow } from "./WorkItemEditRow";
import { WorkItemRow } from "./WorkItemRow";

/** Yeni (henüz kaydedilmemiş) satır: sıra anahtarı + açıldığı andaki disiplin. */
export interface NewWorkItemRow {
  key: number;
  discipline: WorkDisciplineRead | null;
}

interface WorkItemTableProps {
  items: readonly WorkItemRead[];
  newRows: readonly NewWorkItemRow[];
  editingIds: ReadonlySet<string>;
  now: Date;
  canWrite: boolean;
  catalogUnits: readonly string[];
  onEdit: (item: WorkItemRead) => void;
  onCloseEdit: (id: string) => void;
  onCloseNew: (key: number) => void;
  onSaved: (saved: WorkItemRead) => void;
}

/** KIK:128-181 — 9 kolon, `min-width:960px`, yatay kaydırma; yeni satırlar en üstte (KIK:247). */
export function WorkItemTable({
  items,
  newRows,
  editingIds,
  now,
  canWrite,
  catalogUnits,
  onEdit,
  onCloseEdit,
  onCloseNew,
  onSaved,
}: WorkItemTableProps) {
  return (
    <div className="wik-scroll">
      <div role="table" aria-label="İş kalemleri" className="wik-table">
        <div role="rowgroup">
          <div role="row" className="wik-grid wik-head">
            <div role="columnheader" className="wik-th wik-th--poz">Poz No</div>
            <div role="columnheader" className="wik-th">Tarif</div>
            <div role="columnheader" className="wik-th wik-th--unit">Birim</div>
            <div role="columnheader" className="wik-th wik-th--num">Referans fiyat ₺</div>
            <div role="columnheader" className="wik-th wik-th--num">Son fiyat</div>
            <div role="columnheader" className="wik-th wik-th--num">A-s / birim</div>
            <div role="columnheader" className="wik-th">Vars. yüklenici</div>
            <div role="columnheader" className="wik-th wik-th--num">Fiyat güncelleme</div>
            <div role="columnheader" className="wik-th" />
          </div>
        </div>
        <div role="rowgroup">
          {newRows.map((row) => (
            <WorkItemEditRow
              key={`new-${row.key}`}
              mode={{ kind: "new", discipline: row.discipline }}
              testId={`wik-edit-new-${row.key}`}
              catalogUnits={catalogUnits}
              onCancel={() => onCloseNew(row.key)}
              onSaved={(saved) => {
                onCloseNew(row.key);
                onSaved(saved);
              }}
            />
          ))}
          {items.map((item) =>
            editingIds.has(item.id) ? (
              <WorkItemEditRow
                key={item.id}
                mode={{ kind: "edit", item }}
                testId={`wik-edit-${item.id}`}
                catalogUnits={catalogUnits}
                onCancel={() => onCloseEdit(item.id)}
                onSaved={(saved) => {
                  onCloseEdit(item.id);
                  onSaved(saved);
                }}
              />
            ) : (
              <WorkItemRow key={item.id} item={item} now={now} canWrite={canWrite} onEdit={onEdit} />
            ),
          )}
        </div>
      </div>
    </div>
  );
}
