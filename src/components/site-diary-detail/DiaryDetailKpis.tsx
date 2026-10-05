import type { CSSProperties, ReactNode } from "react";

import { formatCurrencyTight } from "@/lib/format";

import type { DetailWorkerSummary } from "./cards-derive";
import type { DiaryDetailKpi } from "./detail-extension";
import type { DetailLineGroups } from "./lines-derive";

/**
 * DET-1.3 · Başlık kartının KPI ızgarası — mockup 208-235 (D:69-95 deseni:
 * 10px büyük harf etiket + 18px değer + 11px alt metin).
 *
 * Çekirdek kutular: "Miktar satırı" (bu bölüm / günün tümü) · "Hakediş
 * katkısı" (bu bölüm; S10 gizlide YOK) · "İşçi" (kendi · taşeron). Planlama
 * kutuları ("Bugün kazanılmış" · "Bugün PF") uzantı yuvasından gelir ve
 * "Miktar satırı"nın HEMEN ARDINA girer (§2.7).
 */
export interface DiaryDetailKpisProps {
  groups: DetailLineGroups;
  workers: DetailWorkerSummary;
  isPaymentHidden: boolean;
  extensionKpis: readonly DiaryDetailKpi[];
}

function lineCountKpi(groups: DetailLineGroups): DiaryDetailKpi {
  if (groups.current === null) {
    return { key: "lines", label: "Miktar satırı", value: groups.totalCount, note: "günün tümü" };
  }
  return {
    key: "lines",
    label: "Miktar satırı",
    value: (
      <>
        {groups.current.rows.length}{" "}
        <span className="diary-detail__kpi-of">/ {groups.totalCount}</span>
      </>
    ),
    note: "bu bölüm / günün tümü",
  };
}

function paymentKpi(groups: DetailLineGroups): DiaryDetailKpi {
  // `??` DEĞİL: bölüm ara toplamı gizliyse (`null`) günün toplamına DÜŞMEZ (IZN-F4d.2).
  const section = groups.current !== null ? groups.current.amountTotal : groups.dayAmountTotal;
  return {
    key: "payment",
    label: "Hakediş katkısı",
    value: <span className="diary-detail__kpi-money">{formatCurrencyTight(section)}</span>,
    note: `günün tümü ${formatCurrencyTight(groups.dayAmountTotal)}`,
  };
}

function workerKpi(workers: DetailWorkerSummary): DiaryDetailKpi {
  return {
    key: "workers",
    label: "İşçi",
    value: workers.totalPeople,
    note: `${workers.ownPeople} kendi · ${workers.subcontractorPeople} taşeron`,
  };
}

function Kpi({ label, value, note }: { label: string; value: ReactNode; note: ReactNode }) {
  return (
    <div className="diary-detail__kpi">
      <dt className="diary-detail__kpi-label">{label}</dt>
      <dd className="diary-detail__kpi-value">{value}</dd>
      <dd className="diary-detail__kpi-note">{note}</dd>
    </div>
  );
}

export function DiaryDetailKpis({ groups, workers, isPaymentHidden, extensionKpis }: DiaryDetailKpisProps) {
  const kpis = [
    lineCountKpi(groups),
    ...extensionKpis,
    ...(isPaymentHidden ? [] : [paymentKpi(groups)]),
    workerKpi(workers),
  ];
  // D:69 — 5'li ızgara; planlamasız / maskeli hâlde kutu sayısı kadar kolon.
  const style = { "--diary-detail-kpi-count": kpis.length } as CSSProperties;
  return (
    <dl className="diary-detail__kpis" style={style} data-testid="diary-detail-kpis">
      {kpis.map((kpi) => (
        <Kpi key={kpi.key} label={kpi.label} value={kpi.value} note={kpi.note} />
      ))}
    </dl>
  );
}
