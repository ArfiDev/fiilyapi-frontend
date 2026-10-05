import { cx } from "@/lib/cx";
import { formatCompactCurrency, formatPercent } from "@/lib/format";
import { HiddenMark } from "@/components/ui/hidden-mark/HiddenMark";
import { countCell, metricCell, type PlaceholderCell } from "@/lib/placeholder-cell";
import type { SiteListResponse } from "@/lib/api/hooks/useSites";

import "./project-detail.css";

export interface SiteTotalsStripProps {
  totals: SiteListResponse["totals"];
}

interface KpiCardDef extends PlaceholderCell {
  label: string;
  /** Dolu hâlde mockup'ın vurgulu sınıfı (178-191); boş hâlde `--pending` ezer. */
  valueClass?: string;
}

/**
 * Alt KPI şeridi (spec §4.4 · mockup `Proje Detay - Şantiyeler.dc.html:178-191`).
 *
 * ⚠️ ESKİ GEREKÇE BAYATLADI. Buradaki not "SiteListTotals'in TAMAMI bu dilimde
 * yer tutucu" diyordu ve o gün doğruydu; ILR-1'de `active_worker_count` BAĞLANDI
 * (backend `sites/service/presenters.py:457` `_worker_count(active_worker_count)`
 * gerçek sayı döndürür). Diğer üçü (455/456/458) hâlâ yer tutucudur. Bayat not
 * yüzünden şerit `available` bayrağına HİÇ bakmıyor, bağlı sayacı da koşulsuz
 * "—" basıyordu.
 *
 * 🔴 İKİ ZARF TİPİ KARIŞTIRILMAZ: `total_progress_payment`/`average_margin`
 * `MetricPlaceholder`dır (alan `value`), `subcontractor_count`/
 * `active_worker_count` `CountPlaceholder`dır (alan `count`, DOLU hâlde bile
 * `pending_module` taşır). Eski `cardsFrom` ikisini tek tipe eziyordu.
 *
 * "Hangi modül bekleniyor" bilgisi KODA GÖMÜLÜ DEĞİL, gelen yükten okunur:
 * backend modülü değiştirirse ipucu da değişir.
 */
function cardsFrom(totals: SiteTotalsStripProps["totals"]): KpiCardDef[] {
  return [
    {
      label: "Toplam Hakediş",
      // Mockup 179: `₺ 17,8M` — kompakt para + mono yüz.
      ...metricCell(totals.total_progress_payment, formatCompactCurrency),
      valueClass: "site-totals__value--mono",
    },
    {
      // Mockup 183: `18 firma` — sonek mockup'ta VARDIR, uydurulmadı.
      label: "Toplam Taşeron",
      ...countCell(totals.subcontractor_count, (count) => `${count} firma`),
    },
    {
      // Mockup 187: `48`, yeşil.
      label: "Aktif İşçi",
      ...countCell(totals.active_worker_count, (count) => String(count)),
      valueClass: "site-totals__value--success",
    },
    {
      // Mockup 191: `%14,5`, yeşil.
      label: "Ortalama Marj",
      ...metricCell(totals.average_margin, formatPercent),
      valueClass: "site-totals__value--success",
    },
  ];
}

export function SiteTotalsStrip({ totals }: SiteTotalsStripProps) {
  return (
    <div className="site-totals" data-testid="site-totals-strip">
      {cardsFrom(totals).map((card) => (
        <div key={card.label} className="site-totals__card">
          <div className="site-totals__label">{card.label}</div>
          <div
            className={cx(
              "site-totals__value",
              card.valueClass,
              // Soluk hâl YALNIZ boş zarfta; dolu zarfta mockup rengi geri gelir.
              card.text === null && "site-totals__value--pending",
            )}
            // 3. hâl (rolün izni yok, IZN-F4.2): `hint` = "Bu bilgi rolünüz için gizli" + kilit.
            title={card.hint}
          >
            {card.text ?? "—"}
            {card.isHidden && <HiddenMark />}
          </div>
        </div>
      ))}
    </div>
  );
}
