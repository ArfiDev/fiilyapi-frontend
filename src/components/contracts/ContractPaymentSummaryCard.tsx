import { formatCurrency, formatPercent } from "@/lib/format";
import type { Percent } from "@/lib/api/scale";
import type { ProgressPaymentSummary } from "@/lib/api/hooks/useProgressPayments";

import { isProvenZeroAmount } from "./contract-progress";
import "./employer-contract-detail.css";

/**
 * E14 126-148 · "Hakediş Özeti" kartı — `EmployerContractDetail.
 * progress_payment_summary` (`ProgressPaymentSummary`) alanına BİREBİR bağlı.
 *
 * Satır eşlemesi (mockup satırı → şema alanı):
 * - 129 "Sözleşme Bedeli"        → `contract_amount` (nullable → "—")
 * - 130 "Toplam Hakediş"         → `cumulative_gross` (MAVİ)
 * - 131 ilerleme çubuğu          → `progress_pct` (nullable → çubuk çizilmez)
 * - 132 "%75 hakkedildi"         → `progress_pct`
 * - 136-137 "Avans Kesintisi"    → `advance_deduction_total` (eksi, KIRMIZI)
 * - 140-141 "Teminat Kesintisi (%5)" → `retention_total`; parantezdeki oran
 *   mockup'ta SABİT %5'tir, burada sözleşmenin kendi `retainage_pct`inden
 *   gelir (sahte sabit basılmaz).
 * - 144-145 "Net Ödeme"          → `net_total` (YEŞİL)
 *
 * ⚠️ Şemanın `payment_count` / `pending_count` / `remaining` alanlarının
 * mockup'ta ÇİZİLİ BİR YERİ YOKTUR ve bu kart onları basmaz — "Hakedişler"
 * sekmesindeki liste aynı bilgiyi kendi yüzeyinde taşır. (Mockup kazanır:
 * karta mockup'ta olmayan satır EKLENMEZ.)
 *
 * Zarif düşüş: sözleşme bedeli girilmemişse backend `contract_amount`/
 * `progress_pct`/`remaining` alanlarını `None` döndürür (şema açıklaması) —
 * çubuk ve yüzde yerine görünür gerekçe basılır, kart SİLİNMEZ.
 */
export interface ContractPaymentSummaryCardProps {
  summary: ProgressPaymentSummary;
  /** 140 · parantez içindeki teminat oranı (`EmployerContractDetail.retainage_pct`). */
  retainagePct: Percent;
}

const DASH = "—";
/**
 * 131-132 · yüzde yerine basılan gerekçe.
 *
 * 🔴 ARTIK KOŞULLU. `ProgressPaymentSummary` KENDİ ucunda maskelenmez
 * (`progress_payments` kısıtlı bir modül değildir) AMA bu kart onu
 * `EmployerContractDetail.progress_payment_summary` GÖMÜSÜNDEN okur ve
 * `field_scope.maskele()` iç içe şemalara İNER — yani `finance` kapsamlı rolde
 * `progress_pct` burada da `null`dır (backend şema docstring'i bunu adıyla
 * yazar ve bekçisi `test_kapsam_capraz_sizinti.py`dir).
 *
 * O hâlde bu cümle YALAN olurdu: bedel hemen ÜSTTEKİ satırda görünüyor. Kural
 * kardeş yüzey `ContractsTable::ProgressCell` ile ORTAKTIR —
 * `isProvenZeroAmount` tek kaynaktır, gerekçesi `contract-progress.ts`tedir.
 */
const PCT_PENDING_REASON = "Sözleşme bedeli girilmeden hakediş yüzdesi hesaplanamaz";

export function ContractPaymentSummaryCard({
  summary,
  retainagePct,
}: ContractPaymentSummaryCardProps) {
  const pct = summary.progress_pct;

  return (
    <section className="ecd-card" aria-labelledby="ecd-pps-title">
      <h2 className="ecd-card__title" id="ecd-pps-title">
        Hakediş Özeti
      </h2>

      <div className="ecd-pps__top">
        <div className="ecd-pps__row">
          <span className="ecd-pps__row-label">Sözleşme Bedeli</span>
          <span className="ecd-pps__row-value" data-testid="ecd-pps-contract-amount">
            {summary.contract_amount === null ? DASH : formatCurrency(summary.contract_amount)}
          </span>
        </div>
        <div className="ecd-pps__row">
          <span className="ecd-pps__row-label">Toplam Hakediş</span>
          <span
            className="ecd-pps__row-value ecd-pps__row-value--accent"
            data-testid="ecd-pps-cumulative"
          >
            {formatCurrency(summary.cumulative_gross)}
          </span>
        </div>

        {pct === null ? (
          <p className="ecd-pps__caption" data-testid="ecd-pps-pct-pending">
            {isProvenZeroAmount(summary.contract_amount) ? PCT_PENDING_REASON : DASH}
          </p>
        ) : (
          <>
            <div className="ecd-pps__bar" data-testid="ecd-pps-bar">
              <div className="ecd-pps__bar-fill" style={{ width: barWidth(pct) }} />
            </div>
            <p className="ecd-pps__caption" data-testid="ecd-pps-caption">
              {formatPercent(pct)} hakkedildi
            </p>
          </>
        )}
      </div>

      <div className="ecd-pps__boxes">
        <DeductionBox
          label="Avans Kesintisi"
          value={summary.advance_deduction_total}
          testId="ecd-pps-advance"
        />
        <DeductionBox
          label={`Teminat Kesintisi (${formatPercent(retainagePct)})`}
          value={summary.retention_total}
          testId="ecd-pps-retention"
        />
        <div className="ecd-pps__box ecd-pps__box--net">
          <span className="ecd-pps__box-label">Net Ödeme</span>
          <span className="ecd-pps__box-value" data-testid="ecd-pps-net">
            {formatCurrency(summary.net_total)}
          </span>
        </div>
      </div>
    </section>
  );
}

function DeductionBox({
  label,
  value,
  testId,
}: {
  label: string;
  value: string | null;
  testId: string;
}) {
  // 🔴 KAPSAM MASKESİ (2026-09-19): `ProgressPaymentSummary`nin para alanları
  //    `limited` kapsamında `null` gelir. Eksi işareti bir KESİNTİ işaretidir;
  //    gizlenmiş bir sayının YÖNÜ YOKTUR — `- {formatCurrency(null)}` ekrana
  //    anlamsız bir **"- —"** basardı.
  const maskeli = value === null;
  return (
    <div className="ecd-pps__box">
      <span className="ecd-pps__box-label">{label}</span>
      {/* 137, 141: kesintiler eksi işaretiyle basılır. */}
      <span className="ecd-pps__box-value" data-testid={testId}>
        {maskeli ? formatCurrency(value) : `- ${formatCurrency(value)}`}
      </span>
    </div>
  );
}

/** 131 · çubuk genişliği; %100'ü aşan değerler kırpılır (ray taşmasın). */
export function barWidth(pct: string): string {
  const value = Number(pct);
  if (!Number.isFinite(value) || value <= 0) return "0%";
  return `${Math.min(value, 100)}%`;
}

export const CONTRACT_PAYMENT_PCT_PENDING_REASON = PCT_PENDING_REASON;
