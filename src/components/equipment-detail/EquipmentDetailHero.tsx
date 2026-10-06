"use client";

import { equipmentCategoryIcon } from "@/components/equipment/category-icon";
import { MaskedMark } from "@/components/ui/hidden-mark/HiddenMark";
import { CheckIcon, inlineSymbolProps } from "@/components/ui/icons";
import { COST_HIDDEN_CATEGORIES } from "@/lib/auth/finance-hidden";
import { HIDDEN_FIELD_HINT } from "@/lib/auth/hidden-fields";
import { useCategoryHidden } from "@/lib/auth/useCategoryHidden";
import {
  EQUIPMENT_EMPTY_VALUE,
  EQUIPMENT_OWNERSHIP_LABELS,
  EQUIPMENT_STATUS_BADGE_VARIANTS,
  EQUIPMENT_STATUS_LABELS,
} from "@/components/equipment/equipment-labels";
import { formatCurrencyTight, formatDecimal } from "@/lib/format";
import type { EquipmentResponse } from "@/lib/api/hooks/useEquipment";
import type { EquipmentMaintenanceBlock } from "@/lib/api/hooks/useEquipmentDetailScreen";
import type { WorkSummaryRow } from "@/lib/api/hooks/useEquipmentWorkSummary";

import { RATE_PERIOD_ROW_LABELS } from "./equipment-detail-labels";

/** MD:73-74 rozet zemini `ui/badge` varyantlarından TÜREMEZ (marka degradesi
 *  üstünde durur), ama SEÇİM aynı sözlükten okunur — iki ekran aynı durumu
 *  farklı renge boyamasın. */
const CHIP_TONE_CLASS: Record<string, string> = {
  success: "makine-det__hero-chip--status",
  warning: "makine-det__hero-chip--warning",
  danger: "makine-det__hero-chip--danger",
  neutral: "makine-det__hero-chip--neutral",
  primary: "makine-det__hero-chip--neutral",
};

export interface EquipmentDetailHeroProps {
  equipment: EquipmentResponse;
  maintenance: EquipmentMaintenanceBlock;
  /**
   * `GET /equipment/work-summary` içinden BU ekipmanın satırı.
   *
   * 🔴 ÜÇ DURUM ayrıdır ve tek bayrağa indirgenemez (MK-1 K16 deseni):
   * `undefined` ⇒ sorgu hâlâ pending · `null` ⇒ **yanıt geldi ama satır YOK** ·
   * satır ⇒ veri var. `null` hâli gerçektir: `repository.work_summary_rows`
   * kaynağı `equipment` tablosudur ve `HAVING` elemesi
   * `Equipment.is_active.is_(True) | (kayıt_sayısı > 0)`tır — yani
   * KULLANIMDAN KALDIRILMIŞ ve o ay hiç kaydı olmayan ekipman yanıtta HİÇ
   * BULUNMAZ. Satır yokluğunu "0 saat" diye basmak, ölçülmemiş bir ayı
   * "hiç çalışmadı" diye damgalamak olurdu.
   */
  workRow: WorkSummaryRow | null | undefined;
  siteLabel: string | null | undefined;
}

export function EquipmentDetailHero({
  equipment,
  maintenance,
  workRow,
  siteLabel,
}: EquipmentDetailHeroProps) {
  // MD:76 — `Liebherr · 132 EC-H8 · Plaka 06 TC 4800 · Seri No LB-2019-48812`.
  // Yokluğu olan parça BASILMAZ (boş "Plaka —" zinciri mockup'ta yok).
  const subParts = [
    equipment.brand,
    equipment.model,
    equipment.plate_no ? `Plaka ${equipment.plate_no}` : null,
    equipment.serial_no ? `Seri No ${equipment.serial_no}` : null,
  ].filter((part): part is string => Boolean(part));

  const statusVariant = EQUIPMENT_STATUS_BADGE_VARIANTS[equipment.status];
  const isCostHidden = useCategoryHidden(COST_HIDDEN_CATEGORIES);

  // MD:79-81 — mockup `Bu Ay Kira Bedeli` yazıyor; ekran `Bu Ay Maliyeti`
  // basar. SAPMA ve gerekçesi rapordadır: bu sayı `WorkSummaryRow.cost`tur
  // (`cost.compute_cost` = saat × saatlik bedel) ve KENDİ MALIMIZ ekipmanda da
  // üretilir — "kira bedeli" demek o makineler için yanlış olurdu.
  // 🔴 `cost` `null` olabilir (K16: bedeli/dönemi bilinmeyen makine) ve bu
  // UYDURMA bir ₺0 ile DOLDURULMAZ.
  const cost = workRow?.cost ?? null;

  // MD:81 `186 saat × ₺320`. 🔴 `× ₺320` SAATLİK bedeldir ve istemcide
  // TÜRETİLMEZ: `hourly_rate` dönemi `DAILY_HOURS = 10` ile böler (K18) ve o
  // formülün ikinci bir kopyası burada yaşasaydı gün tanımı değiştiğinde iki
  // ekran iki bedel gösterirdi. Bunun yerine SAKLANAN bedel dönemiyle basılır.
  const rateNote =
    equipment.rate_amount !== null && equipment.rate_period !== null
      ? `${formatCurrencyTight(equipment.rate_amount)} · ${RATE_PERIOD_ROW_LABELS[equipment.rate_period]}`
      : null;

  return (
    <section className="makine-det__hero" aria-label="Ekipman künyesi">
      <div className="makine-det__hero-top">
        <div className="makine-det__hero-id">
          <div className="makine-det__hero-icon" aria-hidden="true">
            {equipmentCategoryIcon(equipment.category)}
          </div>
          <div>
            <div className="makine-det__hero-badges">
              {/* MD:73 — sahiplik çipi (mockup `KİRALIK`). */}
              <span className="makine-det__hero-chip">
                {EQUIPMENT_OWNERSHIP_LABELS[equipment.ownership].toLocaleUpperCase("tr")}
              </span>
              {/* MD:74 — durum çipi. */}
              <span
                className={`makine-det__hero-chip ${CHIP_TONE_CLASS[statusVariant]}`}
                data-testid="makine-det-status-chip"
              >
                {EQUIPMENT_STATUS_LABELS[equipment.status].toLocaleUpperCase("tr")}
              </span>
              {/* K21 — mockup'ta yok ama sunucuda var: kullanımdan kaldırılmış
                  ekipmanın detayı da açılır ve bu SESSİZ KALMAZ. */}
              {!equipment.is_active && (
                <span className="makine-det__hero-chip makine-det__hero-chip--neutral">
                  KULLANIM DIŞI
                </span>
              )}
            </div>
            <h1 className="makine-det__hero-title">{equipment.name}</h1>
            {subParts.length > 0 && (
              <p className="makine-det__hero-sub">{subParts.join(" · ")}</p>
            )}
          </div>
        </div>

        <div className="makine-det__hero-money">
          <div className="makine-det__hero-money-label">Bu Ay Maliyeti</div>
          <div className="makine-det__hero-money-value" data-testid="makine-det-monthly-cost">
            {cost === null ? EQUIPMENT_EMPTY_VALUE : formatCurrencyTight(cost)}
            <MaskedMark isHidden={isCostHidden} values={[cost]} />
          </div>
          <div className="makine-det__hero-money-note">
            {workRow === undefined
              ? "Yükleniyor…"
              : workRow === null
                ? "Bu ay için çalışma özeti satırı yok"
                : cost === null
                  ? // IZN-F4d · maskeli null "bedel tanımsız" demek değildir; gerekçe uydurulmaz.
                    isCostHidden
                    ? HIDDEN_FIELD_HINT
                    : "Kira bedeli tanımlı olmadığı için hesaplanamadı"
                  : [`${formatDecimal(workRow.hours, 2)} saat`, rateNote]
                      .filter(Boolean)
                      .join(" · ")}
          </div>
        </div>
      </div>

      <div className="makine-det__hero-kpis">
        {/* MD:85-89 */}
        <HeroKpi
          label="Bağlı Şantiye"
          value={siteLabel === undefined ? "…" : (siteLabel ?? "Depoda (Atanmadı)")}
          valueModifier="text"
        />
        {/* MD:90-94 */}
        <HeroKpi
          label="Çalışma Saati"
          value={workRow ? formatDecimal(workRow.hours, 2) : EQUIPMENT_EMPTY_VALUE}
          note="Bu ay"
          valueModifier="mono"
        />
        {/* MD:95-99 */}
        <HeroKpi
          label="Arıza Saati"
          value={workRow ? formatDecimal(workRow.breakdown_hours, 2) : EQUIPMENT_EMPTY_VALUE}
          // 🔴 Çıplak `✓` (U+2713) YASAK (`symbol-subset-guard`): kapsam dışı
          // ve emoji sunumu olmadığı için ubuntu-latest'te fontconfig
          // ikamesine düşer. MD:98'in onay işareti inline SVG'dir.
          note={
            workRow && Number(workRow.breakdown_hours) === 0 ? (
              <>
                Sorunsuz <CheckIcon {...inlineSymbolProps} />
              </>
            ) : undefined
          }
          noteTone={workRow && Number(workRow.breakdown_hours) === 0 ? "good" : undefined}
          valueModifier="mono"
        />
        {/* MD:100-104 — hourmeter SAKLANAN alandır, türev değil. */}
        <HeroKpi
          label="Hourmeter"
          value={
            equipment.hourmeter_hours === null
              ? EQUIPMENT_EMPTY_VALUE
              : formatDecimal(equipment.hourmeter_hours, 2)
          }
          note="Toplam saat"
          valueModifier="mono"
        />
        {/* MD:105-109 — `214 sa` + `14.500'de`. İKİSİ AYRI AYRI null olabilir
            (MK-4 şema notu): `monthly` periyotta saat penceresi YOKTUR. */}
        <HeroKpi
          accent
          label="Sonraki Bakım"
          value={
            maintenance.remaining_hours === null
              ? EQUIPMENT_EMPTY_VALUE
              : `${formatDecimal(maintenance.remaining_hours, 2)} sa`
          }
          note={
            maintenance.next_service_hourmeter === null
              ? undefined
              : `${formatDecimal(maintenance.next_service_hourmeter, 2)}'de`
          }
          noteTone="accent"
          valueModifier="mono"
        />
      </div>
    </section>
  );
}

interface HeroKpiProps {
  label: string;
  value: string;
  note?: React.ReactNode;
  noteTone?: "good" | "accent";
  valueModifier: "mono" | "text";
  accent?: boolean;
}

function HeroKpi({ label, value, note, noteTone, valueModifier, accent }: HeroKpiProps) {
  return (
    <div className={`makine-det__hero-kpi${accent ? " makine-det__hero-kpi--accent" : ""}`}>
      <div className="makine-det__hero-kpi-label">{label}</div>
      <div className={`makine-det__hero-kpi-value makine-det__hero-kpi-value--${valueModifier}`}>
        {value}
      </div>
      {note !== undefined && (
        <div
          className={
            "makine-det__hero-kpi-note" +
            (noteTone ? ` makine-det__hero-kpi-note--${noteTone}` : "")
          }
        >
          {note}
        </div>
      )}
    </div>
  );
}
