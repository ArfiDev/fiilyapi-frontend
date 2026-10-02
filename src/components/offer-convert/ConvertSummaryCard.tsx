"use client";

import { formatMoneyTl } from "@/lib/format";
import { cx } from "@/lib/cx";

import type { ConvertSummary } from "./convert-derive";
import { diffPctText, signedMoney } from "./convert-format";
import { trQuantityInputValue } from "@/components/contracts/employer-item-inline";
import "./offer-convert.css";

interface ConvertSummaryCardProps {
  summary: ConvertSummary;
  revNo: number;
  /** Revizyon KDV'si ("20.00"; ÜS-F5-26 — mockup sabit %20 yazar). */
  vatPct: string;
}

const isNegative = (value: string): boolean => value.trim().startsWith("-");
const MINUS = "−";
const PLUS = "+";

/** TDN:123-139 — sağ, yapışkan "Özet · KDV hariç". Her sayı `summarize` (F5.2) çıktısıdır; burada HESAP YOK. */
export function ConvertSummaryCard({ summary, revNo, vatPct }: ConvertSummaryCardProps) {
  return (
    <aside className="convert-sum" data-testid="convert-summary" aria-label="Özet">
      <h3 className="convert-sum__title">Özet · KDV hariç</h3>
      <div className="convert-sum__field">
        <span className="convert-sum__label">Teklif tutarı · Rev.{revNo}</span>
        <span className="convert-sum__value">{formatMoneyTl(summary.offerTotal)}</span>
      </div>
      <div className="convert-sum__arrow" aria-hidden="true">
        ↓
      </div>
      <div className="convert-sum__field">
        <span className="convert-sum__label">Sözleşme tutarı</span>
        <span className="convert-sum__value convert-sum__value--main">{formatMoneyTl(summary.contractTotal)}</span>
      </div>
      <div className={cx("convert-sum__diff", isNegative(summary.difference) && "convert-sum__diff--neg")}>
        <span className="convert-sum__diff-label">Fark</span>
        <span>{signedMoney(summary.difference)}</span>
        <span>{diffPctText(summary.diffPct)}</span>
      </div>
      <div className="convert-sum__lines">
        <Line label={`Çıkarılan kalem · ${summary.excludedCount}`} value={`${MINUS}${formatMoneyTl(summary.excludedOfferTotal)}`} />
        <Line label={`Fiyat / miktar değişen · ${summary.changedCount}`} value={signedMoney(summary.changedDelta)} />
        <Line label={`Yeni kalem · ${summary.newCount}`} value={`${PLUS}${formatMoneyTl(summary.newTotal)}`} />
        <Line label="Sözleşmeye geçen kalem" value={String(summary.includedCount)} />
      </div>
      <div className="convert-sum__gross">
        <span>KDV %{trQuantityInputValue(vatPct)} dahil</span>
        <span>{formatMoneyTl(summary.contractGross)}</span>
      </div>
    </aside>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="convert-sum__line">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
