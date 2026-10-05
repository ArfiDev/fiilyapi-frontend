"use client";

import { Button } from "@/components/ui";
import { BankIcon, WalletIcon } from "@/components/ui/icons";
import { MaskedMark } from "@/components/ui/hidden-mark/HiddenMark";
import { PAYROLL_HIDDEN_CATEGORIES } from "@/lib/auth/finance-hidden";
import { useCategoryHidden } from "@/lib/auth/useCategoryHidden";
import type {
  PayrollSectionResponse,
  PayrollSummaryResponse,
} from "@/lib/api/hooks/usePayroll";
import { formatAmount } from "@/lib/format";

import { PayrollLineRow } from "./PayrollLineRow";
import {
  APPROVE_ALL_LABEL,
  COL_BANK,
  COL_CASH,
  COL_DAYS,
  COL_DEDUCTION,
  COL_GROSS,
  COL_NET,
  COL_PERSONNEL,
  COL_SOURCE,
  COL_STATUS,
  NO_LINES_MESSAGE,
  SOURCE_SECTION_REGIME,
  SOURCE_SECTION_UNIT,
  SOURCE_TAB_LABELS,
  TOTAL_ROW_LABEL,
} from "./payroll-labels";

/** Tablo dokuz sütunludur (BY:110-118); bölüm bandı hepsini kaplar (BY:125). */
const COLUMN_COUNT = 9;

interface PayrollTableProps {
  sections: readonly PayrollSectionResponse[];
  summary: PayrollSummaryResponse;
  canWrite: boolean;
  /** BY:303 — dönemi bir adım ilerletir (`/approve`). */
  onApproveAll: () => void;
  isApprovePending: boolean;
  isApproveDisabled: boolean;
  approveDisabledReason: string | undefined;
}

/**
 * BY:106-307 — gruplu bordro tablosu.
 *
 * 🔴 tfoot toplamları (BY:296-306) SUNUCUNUN `summary` alanlarından basılır;
 * satırlar YENİDEN TOPLANMAZ. İki gerekçe: (1) para alanları string'dir ve
 * float aritmetiği yasaktır, (2) sekme süzgeci açıkken görünen satırlar
 * dönemin tamamı değildir — süzülmüş satırları toplamak "TOPLAM"ı yalancı
 * yapardı.
 */
export function PayrollTable({
  sections,
  summary,
  canWrite,
  onApproveAll,
  isApprovePending,
  isApproveDisabled,
  approveDisabledReason,
}: PayrollTableProps) {
  // 🔴 IZN-F4c.2 — maskeli (`null`) sütunun başlığında TEK kilit; hücrelerde "—".
  const isHidden = useCategoryHidden(PAYROLL_HIDDEN_CATEGORIES);
  const lines = sections.flatMap((section) => section.lines);
  const markFor = (pick: (line: (typeof lines)[number]) => string | null, total?: string | null) => (
    <MaskedMark isHidden={isHidden} values={[...lines.map(pick), ...(total === undefined ? [] : [total])]} />
  );
  return (
    <div className="bor-table-card" data-testid="bordro-table">
      <table className="bor-table">
        <thead>
          {/* BY:109-119 */}
          <tr className="bor-table__head">
            <th scope="col" className="bor-th bor-th--lead">
              {COL_PERSONNEL}
            </th>
            <th scope="col" className="bor-th bor-th--center">
              {COL_SOURCE}
            </th>
            <th scope="col" className="bor-th bor-th--center">
              {COL_DAYS}
            </th>
            <th scope="col" className="bor-th bor-th--num">
              {COL_GROSS}
              {markFor((line) => line.gross_amount)}
            </th>
            <th scope="col" className="bor-th bor-th--num">
              {COL_DEDUCTION}
              {markFor((line) => line.deduction_amount)}
            </th>
            <th scope="col" className="bor-th bor-th--num">
              {COL_NET}
              {markFor((line) => line.net_amount, summary.net_total)}
            </th>
            {/* 🔴 K5 — BY:116/117'deki `🏦`/`💵` yazı tipinin `unicode-range`
                kapsamı DIŞINDADIR (`fonts.css`); yerine `ui/icons` SVG'si +
                düz sözcük basılır. */}
            <th scope="col" className="bor-th bor-th--num bor-th--bank">
              <BankIcon className="bor-th__icon" aria-hidden="true" />
              {COL_BANK}
              {markFor((line) => line.bank_amount, summary.bank_total)}
            </th>
            <th scope="col" className="bor-th bor-th--num bor-th--cash">
              <WalletIcon className="bor-th__icon" aria-hidden="true" />
              {COL_CASH}
              {markFor((line) => line.cash_amount, summary.cash_total)}
            </th>
            <th scope="col" className="bor-th bor-th--center">
              {COL_STATUS}
            </th>
          </tr>
        </thead>

        <tbody>
          {sections.length === 0 && (
            <tr>
              <td className="bor-cell bor-empty-row" colSpan={COLUMN_COUNT}>
                {NO_LINES_MESSAGE}
              </td>
            </tr>
          )}
          {sections.map((section) => (
            <PayrollSectionRows
              key={section.personnel_source}
              section={section}
              canWrite={canWrite}
            />
          ))}
        </tbody>

        {/* BY:296-306 */}
        <tfoot>
          <tr className="bor-total" data-testid="bordro-total">
            <td className="bor-total__label" colSpan={5}>
              {TOTAL_ROW_LABEL} ({summary.line_count})
            </td>
            <td className="bor-total__value" data-testid="bordro-total-net">
              {formatAmount(summary.net_total)}
            </td>
            <td
              className="bor-total__value bor-total__value--bank"
              data-testid="bordro-total-bank"
            >
              {formatAmount(summary.bank_total)}
            </td>
            <td
              className="bor-total__value bor-total__value--cash"
              data-testid="bordro-total-cash"
            >
              {formatAmount(summary.cash_total)}
            </td>
            <td className="bor-total__action">
              <Button
                variant="success"
                size="sm"
                onClick={onApproveAll}
                disabled={isApproveDisabled || isApprovePending}
                data-testid="bordro-approve-all"
              >
                {APPROVE_ALL_LABEL}
              </Button>
              {approveDisabledReason !== undefined && (
                <span className="bor-total__reason" data-testid="bordro-approve-all-reason">
                  {approveDisabledReason}
                </span>
              )}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** BY:124-128 (+172-176 · 240-244 · 268-272) — bölüm bandı ve satırları. */
function PayrollSectionRows({
  section,
  canWrite,
}: {
  section: PayrollSectionResponse;
  canWrite: boolean;
}) {
  const source = section.personnel_source;
  const testId = `bordro-section-${source}`;

  return (
    <>
      <tr className={`bor-band bor-band--${source}`} data-testid={`${testId}-band`}>
        <th scope="colgroup" colSpan={COLUMN_COUNT} className="bor-band__cell">
          <span className="bor-band__dot" aria-hidden="true" />
          {/* BY:127 — "ŞİRKET KADROSU — SGK 4a · 12 çalışan". Sayı sunucunun
              `line_count`udur; ekran `lines.length` SAYMAZ (sayfalanmış bir
              listede yanlış olurdu — şema açıklamasının kararı). */}
          {SOURCE_TAB_LABELS[source].toLocaleUpperCase("tr-TR")} —{" "}
          {SOURCE_SECTION_REGIME[source]} · {section.line_count}{" "}
          {SOURCE_SECTION_UNIT[source]}
        </th>
      </tr>
      {section.lines.map((line) => (
        <PayrollLineRow key={line.id} line={line} canWrite={canWrite} />
      ))}
    </>
  );
}
