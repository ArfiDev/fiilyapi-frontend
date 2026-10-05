import { isRestrictedEnvelope } from "@/lib/placeholder-cell";
import { formatCurrency } from "@/lib/format";
import type { ProjectCostBreakdown } from "@/lib/api/hooks/useProjectCosts";

import { barWidthPct } from "./bar-ratio";
import { PendingCell, EMPTY_VALUE } from "./PendingCell";

/**
 * KY 113-161 "Maliyet Kırılımı" kartı — şema açıklamasının kendi adresi.
 *
 * 🔴 MOCKUP'IN BASTIĞI HER SATIR VAR AMA HEPSİ GERÇEK DEĞİL. Üç zarf
 * (`permits` · `financing` · `marketing`) `available:false` döner ve HAM
 * BASILMAZ: satır SİLİNMEZ, yerinde gerekçesiyle durur (F-TH kanonu).
 * Gerekçeleri backend'in anahtarlarından gelir (`accounting` / `treasury`),
 * bu dilimde `pending-modules`a eklendi.
 *
 * 🔴 BASILMAYAN İKİ METİN, gerekçesiyle:
 *   · KY 94 "%68 harcandı" — sunucu bir harcama YÜZDESİ döndürmez ve onu
 *     istemcide türetip METİN olarak basmak K4'ün yasakladığı şeydir.
 *     Yerine İKİ TUTAR da (harcanan + bütçe) gerçek değeriyle basılır;
 *     görsel çubuk `barWidthPct` ile çizilir (bkz. `bar-ratio.ts`).
 *   · KY 95/99 "✓ Ödendi · Mar 2025", "₺6M kredi · Kalan faiz: ₺890K" gibi
 *     alt satırlar — kalem başına ödeme durumu/tarihi taşıyan bir alan
 *     yanıtta YOKTUR.
 */
export interface CostBreakdownCardProps {
  breakdown: ProjectCostBreakdown;
}

function Row({
  label,
  value,
  note,
  width,
  tone,
}: {
  label: string;
  value: string | null;
  note?: string;
  width?: string | null;
  tone?: "land" | "construction" | "danger";
}) {
  return (
    <div className="psum-cost__row">
      <div className="psum-cost__head">
        <span className="psum-cost__label">{label}</span>
        <span className="psum-cost__value">
          {value === null ? EMPTY_VALUE : formatCurrency(value)}
        </span>
      </div>
      {/* Çubuk YALNIZ oran hesaplanabildiğinde çizilir; `null` bir yer
          tutucu çubuk değil, hiç çubuk demektir. */}
      {width !== null && width !== undefined ? (
        <div className="psum-cost__bar">
          <div
            className={`psum-cost__fill psum-cost__fill--${tone ?? "construction"}`}
            style={{ width: `${width}%` }}
          />
        </div>
      ) : null}
      {note ? <p className="psum-cost__note">{note}</p> : null}
    </div>
  );
}

export function CostBreakdownCard({ breakdown }: CostBreakdownCardProps) {
  return (
    <section className="psum-card" aria-labelledby="psum-cost-title">
      <h2 className="psum-card__title" id="psum-cost-title">
        Maliyet Kırılımı
      </h2>

      <div className="psum-cost">
        {/* KY 88-96 · arsa bedeli. Kat karşılığında sunucu `0` döner ve bu
            GERÇEK bir sıfırdır ("arsa parası ödemezsin"), yer tutucu DEĞİL —
            `null` ise alanın hiç girilmediğini söyler. İkisi ayrı basılır. */}
        <Row
          label="Arsa Bedeli"
          value={breakdown.land_cost}
          note={breakdown.land_cost === null ? "Arsa bedeli girilmedi" : undefined}
          tone="land"
        />

        <Row
          label="İnşaat Maliyeti"
          value={breakdown.construction_spent}
          note={`Bütçe: ${formatCurrency(breakdown.construction_budget)}`}
          width={barWidthPct(breakdown.construction_spent, breakdown.construction_budget)}
        />

        {/* Üç zarf: `available` BAYRAĞINA bakılır, alan tipine değil (P10
            sözleşmesi). Bugün üçü de boştur; dolduklarında bu dal
            kendiliğinden gerçek değere geçer. */}
        {breakdown.permits.available && breakdown.permits.value !== null ? (
          <Row label="Ruhsat ve Harçlar" value={breakdown.permits.value ?? null} />
        ) : (
          <PendingCell
            label="Ruhsat ve Harçlar"
            moduleKey={breakdown.permits.pending_module ?? "accounting"}
            isHidden={isRestrictedEnvelope(breakdown.permits)}
            className="psum-cost__pending"
          />
        )}

        {breakdown.financing.available && breakdown.financing.value !== null ? (
          <Row
            label="Finansman (Kredi Faizi)"
            value={breakdown.financing.value ?? null}
            tone="danger"
          />
        ) : (
          <PendingCell
            label="Finansman (Kredi Faizi)"
            moduleKey={breakdown.financing.pending_module ?? "treasury"}
            isHidden={isRestrictedEnvelope(breakdown.financing)}
            className="psum-cost__pending"
          />
        )}

        {breakdown.marketing.available && breakdown.marketing.value !== null ? (
          <Row label="Pazarlama ve Satış" value={breakdown.marketing.value ?? null} />
        ) : (
          <PendingCell
            label="Pazarlama ve Satış"
            moduleKey={breakdown.marketing.pending_module ?? "accounting"}
            isHidden={isRestrictedEnvelope(breakdown.marketing)}
            className="psum-cost__pending"
          />
        )}

        {/* KY 158-160 · toplam SUNUCUDAN gelir (`costs.total_spent`), üstteki
            satırların istemcide toplanmasıyla DEĞİL: iki toplama yolu zamanla
            ayrışırdı ve boş zarflar zaten toplama girmiyor. */}
        <div className="psum-cost__total">
          <span className="psum-cost__total-label">Toplam Harcanan</span>
          <span className="psum-cost__total-value">{formatCurrency(breakdown.total_spent)}</span>
        </div>
      </div>
    </section>
  );
}
