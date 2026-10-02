import type { WorkDisciplineRead, WorkItemRead } from "@/lib/api/models";

import { WorkItemEditRow } from "./WorkItemEditRow";
import { WorkItemRow } from "./WorkItemRow";
import { resolveNewDraftDiscipline, type WorkItemDraft } from "./work-item-drafts";
import type { WorkItemFormState } from "./work-item-form";

export interface WorkItemTableProps {
  /** Süzgeçten GEÇEN kalemler (taslağı olsa da olmasa da). */
  items: readonly WorkItemRead[];
  /** Süzgeçten geçen YENİ satır taslakları (en üstte, KIK:247). */
  newDrafts: readonly WorkItemDraft[];
  /** Düzenleme taslakları kalem kimliğine göre; taslağı olan kalem düzenleme satırı olarak çizilir. */
  editDrafts: ReadonlyMap<string, WorkItemDraft>;
  disciplines: readonly WorkDisciplineRead[];
  now: Date;
  canWrite: boolean;
  catalogUnits: readonly string[];
  onEdit: (item: WorkItemRead) => void;
  onPatch: (key: string, change: Partial<WorkItemFormState>) => void;
  onCancel: (key: string) => void;
  onSave: (key: string) => void;
}

/** KIK:128-181 — 9 kolon, `min-width:960px`, yatay kaydırma; yeni satırlar en üstte (KIK:247). */
export function WorkItemTable({
  items,
  newDrafts,
  editDrafts,
  disciplines,
  now,
  canWrite,
  catalogUnits,
  onEdit,
  onPatch,
  onCancel,
  onSave,
}: WorkItemTableProps) {
  const rowHandlers = { catalogUnits, onPatch, onCancel, onSave };
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
          {newDrafts.map((draft) => (
            <WorkItemEditRow
              key={draft.key}
              draft={draft}
              pozNo={null}
              discipline={resolveNewDraftDiscipline(draft, disciplines)}
              testId={`wik-edit-${draft.key}`}
              {...rowHandlers}
            />
          ))}
          {items.map((item) => {
            const draft = editDrafts.get(item.id);
            return draft ? (
              <WorkItemEditRow
                key={item.id}
                draft={draft}
                pozNo={item.poz_no}
                discipline={item.discipline}
                lastPrice={item.last_price}
                savedRefPrice={item.ref_price}
                testId={`wik-edit-${item.id}`}
                {...rowHandlers}
              />
            ) : (
              <WorkItemRow key={item.id} item={item} now={now} canWrite={canWrite} onEdit={onEdit} />
            );
          })}
        </div>
      </div>
    </div>
  );
}
