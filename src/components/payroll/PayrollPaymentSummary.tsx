import { Button } from "@/components/ui";
import { BankIcon, WalletIcon } from "@/components/ui/icons";
import { MaskedMark } from "@/components/ui/hidden-mark/HiddenMark";
import { PAYROLL_HIDDEN_CATEGORIES } from "@/lib/auth/finance-hidden";
import { useCategoryHidden } from "@/lib/auth/useCategoryHidden";
import type { PayrollSummaryResponse } from "@/lib/api/hooks/usePayroll";
import { formatCurrency } from "@/lib/format";

import {
  BANK_BOX_LABEL,
  CASH_BOX_LABEL,
  EFT_DISABLED_REASON,
  EFT_LABEL,
  KPI_PERSON_UNIT,
  RECEIPT_DISABLED_REASON,
  RECEIPT_LABEL,
} from "./payroll-labels";

interface PayrollPaymentSummaryProps {
  summary: PayrollSummaryResponse;
}

/**
 * BY:311-330 — iki ödeme özet kutusu.
 *
 * 🔴 K11: "EFT Talimatı Gönder" (BY:319) ve "Makbuz Oluştur" (BY:328)
 * UÇSUZDUR — bordro modülünde ne banka entegrasyonu ne makbuz üretimi vardır
 * (şema: "Dış entegrasyon YOKTUR … EFT talimatı gönderilmez"). Düğmeler
 * SİLİNMEZ; devre dışı basılır ve gerekçe KUTUNUN KENDİ `disabledReason`
 * alanından okunur — yanına sabitlenmiş bir cümle DEĞİL.
 *
 * 🔴 KARŞILANAMAYAN ALAN: BY:317 "Ziraat Bank EFT" ve BY:326 "13 çalışan +
 * kısmi nakit" gibi alt metinler mockup'ın örnek verisidir; banka ADI hiçbir
 * bordro şemasında yoktur ve UYDURULMAZ — kutular yalnız sunucunun sayı ve
 * tutarını basar.
 */
export function PayrollPaymentSummary({ summary }: PayrollPaymentSummaryProps) {
  const isHidden = useCategoryHidden(PAYROLL_HIDDEN_CATEGORIES);
  return (
    <div className="bor-payboxes" data-testid="bordro-payboxes">
      <PaymentBox
        tone="bank"
        icon={<BankIcon className="bor-paybox__icon" aria-hidden="true" />}
        label={BANK_BOX_LABEL}
        amount={formatCurrency(summary.bank_total)}
        mark={<MaskedMark isHidden={isHidden} values={[summary.bank_total]} />}
        hint={`${summary.bank_personnel_count} ${KPI_PERSON_UNIT}`}
        actionLabel={EFT_LABEL}
        disabledReason={EFT_DISABLED_REASON}
        testId="bordro-paybox-bank"
      />
      <PaymentBox
        tone="cash"
        icon={<WalletIcon className="bor-paybox__icon" aria-hidden="true" />}
        label={CASH_BOX_LABEL}
        amount={formatCurrency(summary.cash_total)}
        mark={<MaskedMark isHidden={isHidden} values={[summary.cash_total]} />}
        hint={`${summary.cash_personnel_count} ${KPI_PERSON_UNIT}`}
        actionLabel={RECEIPT_LABEL}
        disabledReason={RECEIPT_DISABLED_REASON}
        testId="bordro-paybox-cash"
      />
    </div>
  );
}

interface PaymentBoxProps {
  tone: "bank" | "cash";
  icon: React.ReactNode;
  label: string;
  amount: string;
  /** IZN-F4c.2 — tutarın yanına maske kilidi. */
  mark?: React.ReactNode;
  hint: string;
  actionLabel: string;
  /** 🔴 Gerekçe ÖĞENİN alanıdır; bileşen metni kendi yazmaz. */
  disabledReason: string;
  testId: string;
}

function PaymentBox({
  tone,
  icon,
  label,
  amount,
  mark,
  hint,
  actionLabel,
  disabledReason,
  testId,
}: PaymentBoxProps) {
  return (
    <section className={`bor-paybox bor-paybox--${tone}`} data-testid={testId}>
      {icon}
      <div className="bor-paybox__body">
        <h2 className="bor-paybox__label">{label}</h2>
        <p className="bor-paybox__value">
          {amount}
          {mark}
        </p>
        <p className="bor-paybox__hint">{hint}</p>
      </div>
      <div className="bor-paybox__action">
        <Button variant={tone === "bank" ? "primary" : "success"} disabled>
          {actionLabel}
        </Button>
        <p className="bor-paybox__reason" data-testid={`${testId}-reason`}>
          {disabledReason}
        </p>
      </div>
    </section>
  );
}
