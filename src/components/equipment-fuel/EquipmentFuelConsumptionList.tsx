"use client";

import { MaskedMark } from "@/components/ui/hidden-mark/HiddenMark";
import { COST_HIDDEN_CATEGORIES } from "@/lib/auth/finance-hidden";
import { useCategoryHidden } from "@/lib/auth/useCategoryHidden";
import { CheckIcon, WarningTriangleIcon, inlineSymbolProps } from "@/components/ui/icons";
import { formatCurrencyPrecise, formatDecimal, formatPercent } from "@/lib/format";
import type { EquipmentNormUnit } from "@/lib/api/hooks/useEquipment";
import type { FuelSummaryRow } from "@/lib/api/hooks/useEquipmentFuelSummary";

import { EMPTY_VALUE, consumptionTone, deviationReasonText, normUnitLabel } from "./consumption";
import "./equipment-fuel.css";

export interface EquipmentFuelConsumptionListProps {
  rows: FuelSummaryRow[] | undefined;
  /** Toplam litre — bar genişliği ORAN İÇİN (§0: veri sunucudan, oran görsel). */
  totalLiters: string | undefined;
  /** `FuelSummaryRow` `norm_unit` taşımaz; ekipman kaydından AYRI çözülür. */
  resolveNormUnit: (equipmentId: string) => EquipmentNormUnit | null | undefined;
  isLoading: boolean;
}

/**
 * Satır çubuğunun genişliği (0-100 TAM SAYI); toplam bilinmiyorsa/sıfırsa
 * çubuk yok.
 *
 * 🔴 `Math.round` ZORUNLU (WORKFLOW §4 · GÖRSEL SPEC KURALI 4. parça, F-P8
 * kanonu): `liters / total_liters` uzun kesirli bir oran üretir (ör.
 * 1.240 / 2.840 = %43,661971…). Bu değer doğrudan `width`e yazılırsa çubuğun
 * sağ kenarı YARIM piksele oturur ve tarayıcı onu turdan tura FARKLI
 * yuvarlayabilir. Dört yeni kare içinde kesirli geometrisi olan TEK ekran budur.
 *
 * ⚠️ DÜRÜST KAYIT: bu yuvarlama, `makine-yakit` karesinin CI'da 244 piksel
 * oynadığı olay (run 31788449253) sırasında eklendi ve o olayın nedeni
 * OLDUĞU KANITLANMADI — sonraki bir turda (aynı run, ikinci deneme) `next
 * build` Google Fonts'tan `JetBrains Mono`yu ÇEKEMEDİ; yazı tipi yedeğe
 * düşerse bu sayı-yoğun ekranda birkaç yüz piksel farkı tek başına açıklar.
 * Yuvarlama yine de KALIR: kanona uygundur ve gerçek bir gizli riski kapatır.
 */
function barWidth(liters: string, total: string | undefined): number | null {
  if (total === undefined) return null;
  const totalValue = Number(total);
  if (!Number.isFinite(totalValue) || totalValue <= 0) return null;
  const value = Number(liters);
  if (!Number.isFinite(value)) return null;
  return Math.round(Math.min(100, Math.max(0, (value / totalValue) * 100)));
}

/**
 * M4 44-70 · "Ekipman Bazlı Tüketim" listesi.
 *
 * 🔴 K3/K2'nin EN KRİTİK yeri: `deviation_pct === null` satırda sapma "—"
 * basar — `lt_km` normlu ekipmanda (mockup'taki Damperli Kamyon) mockup
 * "%16 yüksek" çiziyor ama sunucu `deviation_reason: "no_distance_data"`
 * döner, SUNUCU KAZANIR (spec §0). Rozet tonu `consumption_status`
 * damgasından gelir, istemci eşik HESAPLAMAZ.
 */
export function EquipmentFuelConsumptionList({
  rows,
  totalLiters,
  resolveNormUnit,
  isLoading,
}: EquipmentFuelConsumptionListProps) {
  const isCostHidden = useCategoryHidden(COST_HIDDEN_CATEGORIES);
  return (
    <section className="makine-yakit-panel" data-testid="makine-yakit-consumption">
      {/* 47 */}
      <h2 className="makine-yakit-panel__title">
        Ekipman Bazlı Tüketim
        <MaskedMark isHidden={isCostHidden} values={(rows ?? []).map((row) => row.amount)} />
      </h2>

      {isLoading && <p className="makine-yakit-panel__note">Yükleniyor…</p>}
      {!isLoading && rows?.length === 0 && (
        <p className="makine-yakit-panel__note" data-testid="makine-yakit-consumption-empty">
          Bu dönemde yakıt kaydı yok.
        </p>
      )}

      {rows !== undefined && rows.length > 0 && (
        <ul className="makine-yakit-consumption" data-testid="makine-yakit-consumption-list">
          {rows.map((row) => {
            const tone = consumptionTone(row.consumption_status);
            const width = barWidth(row.liters, totalLiters);
            const unitLabel = normUnitLabel(resolveNormUnit(row.equipment_id));

            return (
              <li
                key={row.equipment_id}
                className="makine-yakit-consumption__row"
                data-testid="makine-yakit-consumption-row"
              >
                {/* 50 */}
                <div className="makine-yakit-consumption__head">
                  <span className="makine-yakit-consumption__name">{row.equipment_name}</span>
                  <span className="makine-yakit-consumption__amount">
                    {formatDecimal(row.liters, 2)} Lt · {formatCurrencyPrecise(row.amount)}
                  </span>
                </div>
                {/* 51 */}
                <div className="makine-yakit-bar">
                  {width !== null && (
                    <div
                      className={`makine-yakit-bar__fill makine-yakit-bar__fill--${tone}`}
                      style={{ width: `${width}%` }}
                    />
                  )}
                </div>
                {/* 52 */}
                <div className="makine-yakit-consumption__meta">
                  {row.actual === null ? (
                    <span title="Fiili tüketim hesaplanamıyor.">{EMPTY_VALUE}</span>
                  ) : (
                    `${formatDecimal(row.actual, 1)} ${unitLabel}`
                  )}
                  {" · Norm: "}
                  {row.norm === null ? (
                    <span title="Norm tüketim tanımlı değil.">{EMPTY_VALUE}</span>
                  ) : (
                    `${formatDecimal(row.norm, 1)} ${unitLabel}`
                  )}
                  {/* Ayırıcı BİLEREK sert boşluk (U+00A0), sıradan boşluk DEĞİL.
                      Ölçüldü (CI run 31886457731): sıradan `{" "}` metin düğümü
                      hemen ardından YERİ DOLDURULAN bir öğe (inline `<svg>`)
                      gelince turdan tura kâh 3px basıyor kâh hiç basmıyordu —
                      kare 242px oynadı. Sapma `—` basan (SVG'siz) satır AYNI
                      turda hiç kaymadı; fark tam da SVG'li iki satırdaydı.
                      U+00A0 daraltılamaz (CSS onu boşluk sayıp yutmaz), Inter
                      alt-kümesinde kapsanır (`u+00??`) ve sıradan boşlukla aynı
                      genişliktedir → görünüm korunur, genişlik sabitlenir. */}
                  {"\u00A0"}
                  {row.deviation_pct === null ? (
                    <span
                      className="makine-yakit-consumption__deviation makine-yakit-consumption__deviation--neutral"
                      title={deviationReasonText(row.deviation_reason)}
                      data-testid="makine-yakit-deviation-empty"
                    >
                      {EMPTY_VALUE}
                    </span>
                  ) : row.consumption_status === "normal" ? (
                    <span
                      className="makine-yakit-consumption__deviation makine-yakit-consumption__deviation--success"
                      data-testid="makine-yakit-deviation-normal"
                    >
                      <CheckIcon {...inlineSymbolProps} />{"\u00A0"}Normal
                    </span>
                  ) : (
                    <span
                      className={`makine-yakit-consumption__deviation makine-yakit-consumption__deviation--${tone}`}
                      data-testid="makine-yakit-deviation-abnormal"
                    >
                      <WarningTriangleIcon {...inlineSymbolProps} />{"\u00A0"}
                      {formatPercent(row.deviation_pct)}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
