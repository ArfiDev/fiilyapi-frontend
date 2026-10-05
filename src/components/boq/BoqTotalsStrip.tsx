import { cx } from "@/lib/cx";
import { formatCompactCurrency } from "@/lib/format";
import { HiddenMark } from "@/components/ui/hidden-mark/HiddenMark";
import { metricCell, type PlaceholderCell } from "@/lib/placeholder-cell";
import type { BoqTotals } from "@/lib/api/hooks/useBoq";

import "./boq.css";

export interface BoqTotalsStripProps {
  /** Yük gelmeden (yükleniyor/hata) de şerit basılır — spec §9 sonu. */
  totals?: BoqTotals;
}

interface KpiCardDef extends PlaceholderCell {
  label: string;
  /** Mockup'ın vurgulu rengi (74-87 · 79, 83, 87) — dolu zarfta GÖRÜNÜR. */
  valueClass?: string;
}

/**
 * Dört özet kartı (Ekran 13 · 74-87).
 *
 * ⚠️ ESKİ GEREKÇE BAYATLAMADI AMA EKSİKTİ. "DÖRDÜ DE bu dilimde yer tutucudur"
 * cümlesi BUGÜN HÂLÂ DOĞRU (backend `boq/service.py:206-209` dördünü de
 * `_metric(...)` yer tutucusu olarak kurar), dolayısıyla ekranın bugün bastığı
 * "—"ler doğrudur. Eksik olan şuydu: kod bu doğruluğu ÖLÇMÜYOR, VARSAYIYORDU —
 * `available` bayrağına hiç bakmadığı için backend alanı doldurduğu gün ekran
 * sessizce yalan söylemeye devam ederdi. Artık zarftan okunur.
 *
 * `grand_total` bu şeritte DEĞİL, GENEL TOPLAM satırında basılır (mockup'ta öyle
 * bir kart yok). "Hangi modül bekleniyor" bilgisi KODA GÖMÜLÜ DEĞİL, gelen
 * yükten okunur: backend modülü değiştirirse ipucu da değişir.
 */
function cardsFrom(totals?: BoqTotals): KpiCardDef[] {
  return [
    { label: "Toplam Sözleşme", ...metricCell(totals?.contract_total, formatCompactCurrency) },
    {
      label: "Gerçekleşen",
      ...metricCell(totals?.realized_total, formatCompactCurrency),
      valueClass: "boq-kpi__value--realized",
    },
    {
      label: "Kalan İş",
      ...metricCell(totals?.remaining_total, formatCompactCurrency),
      valueClass: "boq-kpi__value--remaining",
    },
    {
      label: "Revize / Ek İş",
      ...metricCell(totals?.revision_total, formatCompactCurrency),
      valueClass: "boq-kpi__value--revision",
    },
  ];
}

export function BoqTotalsStrip({ totals }: BoqTotalsStripProps) {
  return (
    <div className="boq-totals" data-testid="boq-totals-strip">
      {cardsFrom(totals).map((card) => {
        const isPending = card.text === null;
        return (
          <div key={card.label} className="boq-kpi" data-testid="boq-kpi">
            <div className="boq-kpi__label" data-testid="boq-kpi-label">
              {card.label}
            </div>
            {/* Yer tutucu değeri mockup'ın vurgulu rengiyle basmak sahte veri
                izlenimi yaratır (spec §4 dürüstlük kuralı) — `--pending` soluk
                rengi ezer. DOLU zarfta o sınıf KONMAZ ve mockup rengi geri
                gelir. `title` tek başına yeterli değil, sr-only metin de
                verilir (spec §10) — ama gerekçe bilinmiyorsa (3. hâl: rolün
                izni yok) ikisi de basılmaz, uydurma gerekçe yazılmaz. */}
            <div
              className={cx("boq-kpi__value", card.valueClass, isPending && "boq-kpi__value--pending")}
              data-testid="boq-kpi-value"
              title={card.hint}
            >
              {card.text ?? "—"}
              {card.isHidden ? (
                <HiddenMark />
              ) : (
                card.hint !== undefined && <span className="sr-only">{card.hint}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
