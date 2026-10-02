import { PrintSheet } from "@/components/print-sheet/PrintSheet";

import { PrintHeader, PrintKunye, PrintRunningHead, PrintSignatures, PrintSpanRow, PrintTerms, PrintTotals } from "./OfferPrintParts";
import type { CustomerPrintModel, CustomerPrintRow } from "./print-model-customer";
import { useMeasuredPages } from "./use-measured-pages";
import "./offer-print.css";

/**
 * TKL-F3.7 · İŞVEREN teklifi — A4 dikey, 6 kolon (TKL-F3-PLAN §5.1, ÜS-F3-26).
 *
 * 🔴 SIZINTI SINIRI: bileşen YALNIZ `CustomerPrintModel` alır (kaynak: yalnız `customer` nesneleri +
 * koşullar). İç bileşen/model ithal EDİLMEZ, iç alan adı ANILMAZ — `offer-print-leak-guard.test.ts`
 * (kaynak) + `offer-print-leak-dom-guard.test.tsx` (DOM) kilitler.
 */
const COLUMNS = 6;

function RowView({ row }: { row: CustomerPrintRow }) {
  if (row.kind === "group") {
    return (
      <PrintSpanRow columns={COLUMNS} className="offer-print__row offer-print__row--group" rowKey={row.key}>
        {row.name}
      </PrintSpanRow>
    );
  }
  if (row.kind === "subtotal") {
    return (
      <tr className="offer-print__row offer-print__row--subtotal" data-print-row={row.key}>
        <td colSpan={COLUMNS - 1}>{row.name}</td>
        <td className="offer-print__num">{row.amount}</td>
      </tr>
    );
  }
  return (
    <tr className={row.isUnpriced ? "offer-print__row offer-print__row--unpriced" : "offer-print__row"} data-print-row={row.key}>
      <td>{row.poz}</td>
      <td>
        <span className="offer-print__description">
          {row.description}
          {row.isUnpriced && " *"}
        </span>
      </td>
      <td>{row.unit}</td>
      <td className="offer-print__num">{row.quantity}</td>
      <td className="offer-print__num">{row.unitPrice}</td>
      <td className="offer-print__num">{row.amount}</td>
    </tr>
  );
}

function ItemsTable({ page }: { page: CustomerPrintModel["pages"][number] }) {
  return (
    <table className="offer-print__table">
      <colgroup>
        <col style={{ width: "13%" }} />
        <col />
        <col style={{ width: "7%" }} />
        <col style={{ width: "12%" }} />
        <col style={{ width: "14%" }} />
        <col style={{ width: "15%" }} />
      </colgroup>
      <thead>
        <tr>
          <th scope="col">Poz No</th>
          <th scope="col">Tarif</th>
          <th scope="col">Birim</th>
          <th scope="col" className="offer-print__num">Miktar</th>
          <th scope="col" className="offer-print__num">Teklif B.F. (₺)</th>
          <th scope="col" className="offer-print__num">Tutar (₺)</th>
        </tr>
      </thead>
      <tbody>
        {page.parts.map((part) => (
          <PartRows key={part.rows[0]?.key ?? "empty"} part={part} />
        ))}
      </tbody>
    </table>
  );
}

function PartRows({ part }: { part: CustomerPrintModel["pages"][number]["parts"][number] }) {
  const first = part.rows[0];
  return (
    <>
      {part.continued && first !== undefined && (
        <PrintSpanRow columns={COLUMNS} className="offer-print__row offer-print__row--group" isContinuation>
          {first.groupName} (devam)
        </PrintSpanRow>
      )}
      {part.rows.map((row) => (
        <RowView key={row.key} row={row} />
      ))}
    </>
  );
}

export function OfferCustomerPrint({ model }: { model: CustomerPrintModel }) {
  const { frame } = model;
  const { pages, rootRef } = useMeasuredPages(model.pages);
  return (
    <div ref={rootRef} className="offer-print__pages">
      {pages.map((page, index) => {
        const isFirst = index === 0;
        const isLast = index === pages.length - 1;
        return (
          <PrintSheet
            key={index}
            page={index + 1}
            pageCount={pages.length}
            orientation="portrait"
            footer={<span>{frame.footerLabel}</span>}
          >
            {isFirst ? (
              <>
                <PrintHeader frame={frame} />
                <PrintKunye rows={frame.kunye} />
              </>
            ) : (
              <PrintRunningHead frame={frame} />
            )}
            <ItemsTable page={page} />
            {isLast && (
              <div className="offer-print__closing" data-print-closing="">
                <PrintTotals rows={model.totals} />
                {model.footnote !== null && <p className="offer-print__footnote">{model.footnote}</p>}
                <PrintTerms rows={frame.terms} />
                <PrintSignatures signatures={frame.signatures} />
              </div>
            )}
          </PrintSheet>
        );
      })}
    </div>
  );
}
