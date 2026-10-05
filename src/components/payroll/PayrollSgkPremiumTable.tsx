import type { PayrollSgkSummaryResponse } from "@/lib/api/hooks/usePayrollSgk";
import { MaskedMark } from "@/components/ui/hidden-mark/HiddenMark";
import { PAYROLL_HIDDEN_CATEGORIES } from "@/lib/auth/finance-hidden";
import { useCategoryHidden } from "@/lib/auth/useCategoryHidden";
import { formatAmount, formatCurrency } from "@/lib/format";

import type { SgkAmountRow } from "./payroll-sgk-derive";
import { sgkEmployeeRows, sgkEmployerRows } from "./payroll-sgk-derive";
import {
  SGK_EMPLOYEE_COLUMN_TITLE,
  SGK_EMPLOYER_COLUMN_TITLE,
  SGK_PAYABLE_HINT,
  SGK_PAYABLE_LABEL,
  SGK_ROW_EMPLOYEE_TOTAL,
  SGK_ROW_EMPLOYER_TOTAL,
  sgkTableTitle,
} from "./payroll-sgk-labels";

interface PayrollSgkPremiumTableProps {
  summary: PayrollSgkSummaryResponse;
  /** Başlıktaki dönem metni ("Temmuz 2026") — biçimleme çağıranın işidir. */
  periodLabel: string;
}

/**
 * SGK:62-93 — iki sütunlu prim hesap kartı + SGK:86-91 ödenecek prim kutusu.
 *
 * 🔴🔴 K2 — SGK:81 `Kısa Çalışma Ödeneği (%1)` satırı ÇİZİLMEZ ve
 * `employer_burden_total` SUNUCUDAN GELDİĞİ GİBİ basılır (kısa çalışma payı o
 * toplamın içinde olsa bile istemci toplamı DÜZELTMEZ). Gerekçe ve doğru
 * düzeltme yeri `payroll-sgk-derive.ts/sgkEmployerRows` üstündedir.
 */
export function PayrollSgkPremiumTable({ summary, periodLabel }: PayrollSgkPremiumTableProps) {
  const isHidden = useCategoryHidden(PAYROLL_HIDDEN_CATEGORIES);
  return (
    <section className="bors-card" data-testid="bordro-sgk-premium">
      {/* SGK:64 */}
      <h2 className="bors-card__title">{sgkTableTitle(periodLabel)}</h2>

      <div className="bors-card__body">
        {/* SGK:66 — `1fr 1fr` */}
        <div className="bors-columns">
          {/* SGK:68-75 */}
          <PremiumColumn
            title={SGK_EMPLOYEE_COLUMN_TITLE}
            rows={sgkEmployeeRows(summary)}
            totalLabel={SGK_ROW_EMPLOYEE_TOTAL}
            totalAmount={summary.employee_deduction_total}
            tone="employee"
            isHidden={isHidden}
            testId="bordro-sgk-employee"
          />

          {/* SGK:77-84 — İKİ kalem (K2: üçüncüsü çizilmez). */}
          <PremiumColumn
            title={SGK_EMPLOYER_COLUMN_TITLE}
            rows={sgkEmployerRows(summary)}
            totalLabel={SGK_ROW_EMPLOYER_TOTAL}
            totalAmount={summary.employer_burden_total}
            tone="employer"
            isHidden={isHidden}
            testId="bordro-sgk-employer"
          />
        </div>

        {/* SGK:86-91 — yeşil ödenecek prim kutusu. */}
        <div className="bors-payable" data-testid="bordro-sgk-payable">
          <div>
            <p className="bors-payable__label">{SGK_PAYABLE_LABEL}</p>
            {/* SGK:89 vadesi BASILMAZ (veri yok); kapsam açıklaması kalır. */}
            <p className="bors-payable__hint">{SGK_PAYABLE_HINT}</p>
          </div>
          <p className="bors-payable__value" data-testid="bordro-sgk-payable-value">
            {formatCurrency(summary.sgk_payable_total)}
            <MaskedMark isHidden={isHidden} values={[summary.sgk_payable_total]} />
          </p>
        </div>
      </div>
    </section>
  );
}

interface PremiumColumnProps {
  title: string;
  rows: readonly SgkAmountRow[];
  totalLabel: string;
  /** 🔴 Sunucunun toplamı — ASLA satırlardan yeniden hesaplanmaz. */
  totalAmount: string | null;
  tone: "employee" | "employer";
  /** IZN-F4c.2 — maas_kisisel gizliyse sütun başlığında (maskeli değer varken) TEK kilit. */
  isHidden: boolean;
  testId: string;
}

/** SGK:68-75 · 77-84 — bir sütun: N kalem + vurgulu toplam satırı. */
function PremiumColumn({
  title,
  rows,
  totalLabel,
  totalAmount,
  tone,
  isHidden,
  testId,
}: PremiumColumnProps) {
  return (
    <div data-testid={testId}>
      <h3 className="bors-columns__title">
        {title}
        <MaskedMark isHidden={isHidden} values={[...rows.map((row) => row.amount), totalAmount]} />
      </h3>
      <div className="bors-rows">
        {rows.map((row) => (
          <div key={row.key} className="bors-row" data-testid={`${testId}-${row.key}`}>
            <span className="bors-row__label">{row.label}</span>
            <span className="bors-row__value">{formatAmount(row.amount)}</span>
          </div>
        ))}

        <div className={`bors-row bors-row--total bors-row--${tone}`}>
          <span className="bors-row__label bors-row__label--total">{totalLabel}</span>
          <span className="bors-row__value bors-row__value--total" data-testid={`${testId}-total`}>
            {formatAmount(totalAmount)}
          </span>
        </div>
      </div>
    </div>
  );
}
