"use client";

import { Button } from "@/components/ui";
import type { WorkDisciplineRead } from "@/lib/api/models";

import { ConvertGroupRow } from "./ConvertGroupRow";
import { ConvertItemRow } from "./ConvertItemRow";
import { ConvertSummaryCard } from "./ConvertSummaryCard";
import type { ConvertSummary } from "./convert-derive";
import { collidingRowKeys, mixedGroupKeys, sentGroupKeys } from "./convert-model";
import type { ConvertDraft, ConvertRow } from "./convert-types";
import type { VisibleStep2Errors } from "./convert-view-errors";
import "./offer-convert.css";

export interface ConvertItemsStepProps {
  draft: ConvertDraft;
  summary: ConvertSummary;
  revNo: number;
  vatPct: string;
  errors: VisibleStep2Errors;
  isSiteOpen: boolean;
  disciplines: readonly WorkDisciplineRead[];
  /** Uçuşta / başarı sonrası: "+ Katalogdan kalem ekle" pasif. */
  isLocked: boolean;
  onOpenCatalog: () => void;
  actions: {
    onToggle: (key: string) => void;
    onQty: (key: string, raw: string) => void;
    onBf: (key: string, raw: string) => void;
    onCode: (key: string, code: string) => void;
    onRename: (groupKey: string, name: string) => void;
    onDiscipline: (groupKey: string, disciplineId: string | null) => void;
  };
}

const rowsOf = (draft: ConvertDraft, groupKey: string): readonly ConvertRow[] => draft.rows.filter((row) => row.groupKey === groupKey);

/** TDN:69-141 — kalem tablosu (T15 grup başlıklı) + yapışkan özet. */
export function ConvertItemsStep(props: ConvertItemsStepProps) {
  const { summary, revNo, vatPct, errors } = props;
  return (
    <div className="convert-items" data-testid="convert-step-2">
      <section className="convert-items__card" aria-labelledby="convert-step-2-title">
        <div className="convert-items__bar">
          <h2 className="convert-items__title" id="convert-step-2-title">
            Kalemleri gözden geçir
          </h2>
          <span className="convert-items__count">
            {summary.includedCount} dahil · {summary.excludedCount} çıkarıldı · {summary.changedCount} değişti · {summary.newCount} yeni
          </span>
          <Button variant="secondary" size="sm" className="convert-items__add" disabled={props.isLocked} onClick={props.onOpenCatalog}>
            + Katalogdan kalem ekle
          </Button>
        </div>
        {Object.values(errors.general).map((message) => (
          <p key={message} className="convert-error-text convert-items__general">
            {message}
          </p>
        ))}
        <div className="convert-items__scroll">
          <ItemsTable {...props} />
        </div>
        <Legend />
      </section>
      <ConvertSummaryCard summary={summary} revNo={revNo} vatPct={vatPct} />
    </div>
  );
}

function ItemsTable({ draft, errors, isSiteOpen, disciplines, actions }: ConvertItemsStepProps) {
  const sent = new Set(sentGroupKeys(draft));
  const mixed = mixedGroupKeys(draft);
  const collidingCodes = collidingRowKeys(draft);
  return (
    <table className="convert-table">
      <colgroup>
        <col className="convert-col--check" />
        <col className="convert-col--code" />
        <col />
        <col className="convert-col--unit" />
        <col className="convert-col--qty" />
        <col className="convert-col--bf" />
        <col className="convert-col--amount" />
        <col className="convert-col--diff" />
      </colgroup>
      <thead>
        <tr>
          <th scope="col">Dahil</th>
          <th scope="col">Poz No</th>
          <th scope="col">Tarif</th>
          <th scope="col">Birim</th>
          <th scope="col" className="convert-num">Teklif → Sözleşme miktarı</th>
          <th scope="col" className="convert-num">Teklif → Sözleşme B.F.</th>
          <th scope="col" className="convert-num">Tutar</th>
          <th scope="col" className="convert-num">Fark</th>
        </tr>
      </thead>
      <tbody>
        {draft.groups.flatMap((group) => {
          const rows = rowsOf(draft, group.key);
          return [
            <ConvertGroupRow
              key={group.key}
              group={group}
              itemCount={rows.length}
              isSkipped={!sent.has(group.key)}
              isNameEditable={group.nameEdited || errors.groups[group.key] !== undefined}
              nameError={errors.groups[group.key]}
              isMixed={mixed.has(group.key)}
              isSiteOpen={isSiteOpen}
              disciplines={disciplines}
              onRename={actions.onRename}
              onDiscipline={actions.onDiscipline}
            />,
            ...rows.map((row) => (
              <ConvertItemRow
                key={row.key}
                row={row}
                errors={errors.rows[row.key]}
                isCodeEditable={row.codeEdited || collidingCodes.has(row.key) || errors.rows[row.key]?.code !== undefined}
                onToggle={actions.onToggle}
                onQty={actions.onQty}
                onBf={actions.onBf}
                onCode={actions.onCode}
              />
            )),
          ];
        })}
      </tbody>
    </table>
  );
}

/** TDN:116-120 — alt bilgi, üç parça AYNEN. */
function Legend() {
  return (
    <div className="convert-legend">
      <span>
        <span className="convert-legend__swatch" aria-hidden="true" />
        tekliften farklı
      </span>
      <span>Fark = sözleşme tutarı ÷ teklif tutarı − 1</span>
      <span>Çıkarılan kalem sözleşmeye kopyalanmaz, teklifte kalır</span>
    </div>
  );
}
