import { BankIcon, WalletIcon } from "@/components/ui/icons";
import { MaskedMark } from "@/components/ui/hidden-mark/HiddenMark";
import { PAYROLL_HIDDEN_CATEGORIES } from "@/lib/auth/finance-hidden";
import { useCategoryHidden } from "@/lib/auth/useCategoryHidden";
import type { PayrollSummaryResponse } from "@/lib/api/hooks/usePayroll";
import { formatCurrency, formatPercent } from "@/lib/format";
import type { Percent } from "@/lib/api/scale";

import {
  EMPTY_VALUE,
  KPI_BANK_LABEL,
  KPI_CASH_LABEL,
  KPI_COST_HINT,
  KPI_COST_LABEL,
  KPI_NET_LABEL,
  KPI_PERSON_UNIT,
} from "./payroll-labels";

interface PayrollKpiStripProps {
  summary: PayrollSummaryResponse;
}

/**
 * BY:67-93 — DÖRT kartlık özet şeridi (`repeat(4,1fr)`, 14px boşluk).
 *
 * 🔴 İKİ TABAN AYRIDIR ve bu kartlar onu görünür kılar: ilk üç kart ÖDEME
 * tabanıdır (`excluded`/`uncomputed` hariç), dördüncü kart MALİYET tabanıdır
 * (`excluded` DAHİL) — şema açıklamasının kararı. Ekran bu ikisini
 * BİRBİRİNDEN TÜRETMEZ; dördü de sunucunun kendi alanıdır.
 *
 * 🔴 Yüzdeler (`bank_pct`/`cash_pct`) `null` OLABİLİR (net toplam sıfırken
 * bölme yoktur). O durumda yüzde HİÇ basılmaz — istemci `bank_total/net_total`
 * bölmesini KENDİ yapmaz (para alanları string'dir, float aritmetiği yasak).
 */
export function PayrollKpiStrip({ summary }: PayrollKpiStripProps) {
  const isHidden = useCategoryHidden(PAYROLL_HIDDEN_CATEGORIES);
  return (
    <div className="bor-kpis" data-testid="bordro-kpis">
      {/* BY:68-72 */}
      <KpiCard
        label={KPI_NET_LABEL}
        value={formatCurrency(summary.net_total)}
        mark={<MaskedMark isHidden={isHidden} values={[summary.net_total]} />}
        hint={`${summary.net_personnel_count} ${KPI_PERSON_UNIT}`}
        tone="plain"
        testId="bordro-kpi-net"
      />

      {/* BY:73-80 — 🔴 K5: BY'nin banka emojisi yerine `ui/icons` SVG'si. */}
      <KpiCard
        label={KPI_BANK_LABEL}
        value={formatCurrency(summary.bank_total)}
        mark={<MaskedMark isHidden={isHidden} values={[summary.bank_total]} />}
        hint={countWithPct(summary.bank_personnel_count, summary.bank_pct)}
        tone="bank"
        icon={<BankIcon className="bor-kpi__icon" aria-hidden="true" />}
        testId="bordro-kpi-bank"
      />

      {/* BY:81-88 */}
      <KpiCard
        label={KPI_CASH_LABEL}
        value={formatCurrency(summary.cash_total)}
        mark={<MaskedMark isHidden={isHidden} values={[summary.cash_total]} />}
        hint={countWithPct(summary.cash_personnel_count, summary.cash_pct)}
        tone="cash"
        icon={<WalletIcon className="bor-kpi__icon" aria-hidden="true" />}
        testId="bordro-kpi-cash"
      />

      {/* BY:89-93 — MALİYET tabanı; etiketin altındaki açıklama mockup metnidir. */}
      <KpiCard
        label={KPI_COST_LABEL}
        value={formatCurrency(summary.total_employer_cost)}
        mark={<MaskedMark isHidden={isHidden} values={[summary.total_employer_cost]} />}
        hint={KPI_COST_HINT}
        tone="cost"
        testId="bordro-kpi-cost"
      />
    </div>
  );
}

/** BY:79/87 — "35 çalışan · %71,5". Yüzde yoksa yalnız sayı basılır. */
function countWithPct(count: number, pct: Percent | null): string {
  const people = `${count} ${KPI_PERSON_UNIT}`;
  if (pct === null) return people;
  return `${people} · ${formatPercent(pct)}`;
}

type KpiTone = "plain" | "bank" | "cash" | "cost";

function KpiCard({
  label,
  value,
  hint,
  tone,
  icon,
  mark,
  testId,
}: {
  label: string;
  value: string;
  hint: string;
  /** IZN-F4c.2 — değerin yanına maske kilidi. */
  mark?: React.ReactNode;
  tone: KpiTone;
  icon?: React.ReactNode;
  testId: string;
}) {
  return (
    <article className={`bor-kpi bor-kpi--${tone}`} data-testid={testId}>
      <h2 className="bor-kpi__label">
        {icon}
        {label}
      </h2>
      <p className="bor-kpi__value" data-testid={`${testId}-value`}>
        {value === "" ? EMPTY_VALUE : value}
        {mark}
      </p>
      <p className="bor-kpi__hint">{hint}</p>
    </article>
  );
}
