import { PrintSheet } from "@/components/print-sheet/PrintSheet";

import { PrintClosing, PrintHeader, PrintKunye, PrintRunningHead, PrintSpanRow } from "./OfferPrintParts";
import type { InternalPrintModel, InternalPrintRow } from "./print-model-internal";
import { useMeasuredPages } from "./use-measured-pages";
import "./offer-print.css";

/**
 * TKL-F3.7 · İÇ DÖKÜM — A4 yatay, 11 kolon: işveren alanları + A-s/birim · maliyet B.F. · maliyet ·
 * gider % · kâr % (TKL-F3-PLAN §5.1 "İç", ÜS-F3-26). Yalnız şirket içi: işverene GİTMEZ.
 */
const COLUMNS = 11;
/** Grup ara toplamı: ilk 5 kolon etiket (poz → A-s/birim), maliyet B.F. boş, maliyet, gider/kâr/teklif B.F. boş, tutar. */
const SUBTOTAL_LABEL_SPAN = 5;

function RowView({ row }: { row: InternalPrintRow }) {
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
        <td colSpan={SUBTOTAL_LABEL_SPAN}>
          {row.name} · {row.manHours} a-s
        </td>
        <td />
        <td className="offer-print__num">{row.cost}</td>
        <td />
        <td />
        <td />
        <td className="offer-print__num">{row.amount}</td>
      </tr>
    );
  }
  return (
    <tr className={row.isUnpriced ? "offer-print__row offer-print__row--unpriced" : "offer-print__row"} data-print-row={row.key}>
      <td>{row.poz}</td>
      <td>
        <span className="offer-print__description">{row.description}</span>
      </td>
      <td>{row.unit}</td>
      <td className="offer-print__num">{row.quantity}</td>
      <td className="offer-print__num">{row.unitMhr}</td>
      <td className="offer-print__num">{row.costUnitPrice}</td>
      <td className="offer-print__num">{row.cost}</td>
      <td className="offer-print__num">{row.overheadPct}</td>
      <td className="offer-print__num">{row.profitPct}</td>
      <td className="offer-print__num">{row.unitPrice}</td>
      <td className="offer-print__num">{row.amount}</td>
    </tr>
  );
}

const HEADERS: readonly { label: string; numeric: boolean; width?: string }[] = [
  { label: "Poz No", numeric: false, width: "8%" },
  { label: "Tarif", numeric: false },
  { label: "Birim", numeric: false, width: "4%" },
  { label: "Miktar", numeric: true, width: "7%" },
  { label: "A-s/birim", numeric: true, width: "6%" },
  { label: "Maliyet B.F. (₺)", numeric: true, width: "9%" },
  { label: "Maliyet (₺)", numeric: true, width: "10%" },
  { label: "Gider %", numeric: true, width: "6%" },
  { label: "Kâr %", numeric: true, width: "6%" },
  { label: "Teklif B.F. (₺)", numeric: true, width: "9%" },
  { label: "Tutar (₺)", numeric: true, width: "10%" },
];

function ItemsTable({ page }: { page: InternalPrintModel["pages"][number] }) {
  return (
    <table className="offer-print__table">
      <colgroup>
        {HEADERS.map((header) => (
          <col key={header.label} style={header.width === undefined ? undefined : { width: header.width }} />
        ))}
      </colgroup>
      <thead>
        <tr>
          {HEADERS.map((header) => (
            <th key={header.label} scope="col" className={header.numeric ? "offer-print__num" : undefined}>
              {header.label}
            </th>
          ))}
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

function PartRows({ part }: { part: InternalPrintModel["pages"][number]["parts"][number] }) {
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

export function OfferInternalPrint({ model }: { model: InternalPrintModel }) {
  const { frame } = model;
  const { pages, rootRef } = useMeasuredPages(model.pages);
  return (
    <div ref={rootRef} className="offer-print__pages">
      {pages.map((page, index) => {
        const isFirst = index === 0;
        return (
          <PrintSheet
            key={index}
            page={index + 1}
            pageCount={pages.length}
            orientation="landscape"
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
            <PrintClosing parts={page.closing} frame={frame} totals={model.totals} />
          </PrintSheet>
        );
      })}
    </div>
  );
}
