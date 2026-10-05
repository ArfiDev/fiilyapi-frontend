"use client";

import Link from "next/link";

import { consumptionTone, deviationReasonText } from "@/components/equipment-fuel/consumption";
import { EQUIPMENT_EMPTY_VALUE } from "@/components/equipment/equipment-labels";
import { MaskedMark } from "@/components/ui/hidden-mark/HiddenMark";
import { COST_HIDDEN_CATEGORIES } from "@/lib/auth/finance-hidden";
import { useCategoryHidden } from "@/lib/auth/useCategoryHidden";
import { formatCurrencyTight, formatDecimal, formatPercent } from "@/lib/format";
import type { EquipmentResponse } from "@/lib/api/hooks/useEquipment";
import type { FuelSummaryResponse } from "@/lib/api/hooks/useEquipmentFuelSummary";

import { NORM_UNIT_SUFFIX } from "./equipment-detail-labels";
import { routes } from "@/lib/routes";

export interface EquipmentFuelCardProps {
  equipment: EquipmentResponse;
  /** `undefined` ⇒ sorgu pending. */
  summary: FuelSummaryResponse | undefined;
}

/**
 * MD:232-252 · ⛽ Yakıt Takibi Özeti.
 *
 * 🔴 `GET /equipment/fuel-summary?equipment_id=…` NEYİN kümesidir — sorgu
 * gövdesinden (`repository.fuel_summary_rows`): **INNER JOIN**'dur, yani
 * YALNIZ o ay FİİLEN yakıt girilmiş ekipman döner. Çalışma özetinin aksine
 * (o `equipment` tablosundan OUTER JOIN ile filonun tamamını basar) burada
 * "satır yok" = "bu ay hiç yakıt alınmadı"dır ve ekran onu 0 diye BASMAZ.
 *
 * 🔴 Süzgeç SUNUCUDA uygulanır (`equipment_id` gerçek bir query parametresidir)
 * ve toplamlar SÜZÜLMÜŞ satırlardan üretilir — `total_liters`/`total_amount`
 * bu ekipmanın kendi toplamlarıdır, filonun değil (`fuel_summary.py:96-101`).
 * `lt_per_hour_avg`in paydası da o hâlde TEK makinenin saatidir.
 *
 * 🔴 `deviation_pct`/`consumption_status` SUNUCU DAMGASIDIR (K17): eşik
 * (`%10`) burada TEKRARLANMAZ, `consumption.ts` yalnız damgayı tona çevirir.
 */
export function EquipmentFuelCard({ equipment, summary }: EquipmentFuelCardProps) {
  const row = summary?.rows.find((item) => item.equipment_id === equipment.id) ?? null;
  const isPending = summary === undefined;
  const isCostHidden = useCategoryHidden(COST_HIDDEN_CATEGORIES);
  const normSuffix = equipment.norm_unit === null ? "" : NORM_UNIT_SUFFIX[equipment.norm_unit];

  return (
    <section className="makine-det__card" aria-label="Yakıt Takibi Özeti">
      <div className="makine-det__card-head">
        <h2 className="makine-det__card-title">⛽ Yakıt Takibi Özeti</h2>
        <Link href={routes.equipment.fuel()} className="makine-det__card-more">
          Tümü →
        </Link>
      </div>

      {/* MD:233-236 */}
      <div className="makine-det__tiles makine-det__tiles--2">
        <div className="makine-det__tile">
          <div className="makine-det__tile-value" data-testid="makine-det-fuel-liters">
            {summary ? `${formatDecimal(summary.total_liters, 2)} Lt` : EQUIPMENT_EMPTY_VALUE}
          </div>
          <div className="makine-det__tile-label">Bu Ay Tüketim</div>
        </div>
        <div className="makine-det__tile makine-det__tile--danger">
          <div className="makine-det__tile-value" data-testid="makine-det-fuel-amount">
            {summary ? formatCurrencyTight(summary.total_amount) : EQUIPMENT_EMPTY_VALUE}
            <MaskedMark isHidden={isCostHidden} values={[summary?.total_amount]} />
          </div>
          <div className="makine-det__tile-label">Yakıt Maliyeti</div>
        </div>
      </div>

      {/* MD:238-247 — Ortalama Tüketim + norm çizgisi. */}
      <div style={{ marginBottom: 12 }}>
        <div className="makine-det__bar-head">
          <span className="makine-det__bar-label">Ortalama Tüketim</span>
          <span className="makine-det__bar-value" data-testid="makine-det-fuel-actual">
            {row?.actual
              ? `${formatDecimal(row.actual, 2)} ${normSuffix}`.trim()
              : EQUIPMENT_EMPTY_VALUE}
          </span>
        </div>
        {/* MD:245 — sapma cümlesi. `deviation_pct` `null` ise UYDURMA bir
            "%0 normalde" BASILMAZ; sunucunun gerekçesi görünür olur (K16). */}
        <p
          className="makine-det__bar-note"
          data-testid="makine-det-fuel-deviation"
          data-tone={consumptionTone(row?.consumption_status ?? null)}
        >
          {isPending
            ? "Yükleniyor…"
            : row === null
              ? "Bu ay bu ekipman için yakıt kaydı girilmemiş."
              : row.deviation_pct === null
                ? deviationReasonText(row.deviation_reason)
                : `Norm ${row.norm === null ? EQUIPMENT_EMPTY_VALUE : formatDecimal(row.norm, 2)} ${normSuffix} — ${formatPercent(row.deviation_pct)} sapma`.trim()}
        </p>
      </div>

      {/* MD:248-251 — `Öneri` bandı. Mockup metni periyodik muayeneye
          ATIFTA BULUNUYOR (`25 gün kaldı`); o cümle BU KARTIN verisinden
          türemez, bu yüzden ATIF DÜŞÜRÜLDÜ (rapora yazıldı) ve öneri yalnız
          SUNUCUNUN rozeti uyarı/kritik iken basılır — mockup'ta koşulsuz
          duruyor ama normal tüketimde "tüketim normun üzerinde" demek
          yanlış olurdu. */}
      {row !== null &&
        (row.consumption_status === "warning" || row.consumption_status === "critical") && (
          <p className="makine-det__band makine-det__band--warning" data-testid="makine-det-fuel-advice">
            <strong>Öneri:</strong> Tüketim normun üzerinde. Periyodik bakım sırasında filtre ve
            enjektör kontrolü istenebilir.
          </p>
        )}
    </section>
  );
}
