"use client";

import { MaskedMark } from "@/components/ui/hidden-mark/HiddenMark";
import { COST_HIDDEN_CATEGORIES } from "@/lib/auth/finance-hidden";
import { useCategoryHidden } from "@/lib/auth/useCategoryHidden";
import { formatAmount, formatDecimal } from "@/lib/format";
import type { RentalSiteDistributionEntry } from "@/lib/api/hooks/useEquipmentRentalInvoices";

import { rentalDistributionUnknownWarning, rentalSiteLabel } from "./rental-derive";

export interface RentalSiteDistributionCardProps {
  entries: readonly RentalSiteDistributionEntry[];
}

/**
 * M5:177-193 — "Proje Bazlı Maliyet Dağılımı".
 *
 * Kovaya YALNIZ `rented` satırlar girer (şema gerekçesi: dağılım ödenecek
 * toplamın kaynağını gösterir); `owned`/`breakdown` satırları burada YOKTUR.
 *
 * 🔴 M5:189-190'daki "İşveren Hakedişi Oluştur" bağlantısı BASILMADI: mockup
 * onu bir sonraki adıma köprü olarak çiziyor ama hangi hakedişe gidileceği
 * verilerden ÇÖZÜLEMEZ (dağılım kovası şantiye taşır, hakediş kimliği değil).
 * Uydurma bir hedefe bağlanmak ölü/yanlış bir bağlantı üretirdi; açıklama
 * cümlesi metin olarak korundu.
 */
export function RentalSiteDistributionCard({ entries }: RentalSiteDistributionCardProps) {
  const isCostHidden = useCategoryHidden(COST_HIDDEN_CATEGORIES);
  return (
    <section className="makine-kira__card" aria-labelledby="makine-kira-dist-title">
      <div className="makine-kira__card-body">
        <h2 id="makine-kira-dist-title" className="makine-kira__card-title">
          Proje Bazlı Maliyet Dağılımı
          <MaskedMark isHidden={isCostHidden} values={entries.map((entry) => entry.amount)} />
        </h2>

        <div className="makine-kira__dist" data-testid="makine-kira-distribution">
          {entries.length === 0 && (
            <p className="makine-kira__muted">
              Bu hakedişte projeye dağıtılacak kiralık ekipman maliyeti yok.
            </p>
          )}

          {entries.map((entry) => {
            // Maskeli kovada (`amount` null) "hesaplanamadı" uyarısı yalan olurdu.
            const unknownWarning = entry.amount === null ? null : rentalDistributionUnknownWarning(entry);
            return (
              <div
                key={entry.site_id ?? "unassigned"}
                className="makine-kira__dist-row"
                data-site-id={entry.site_id ?? ""}
              >
                <div>
                  <div className="makine-kira__dist-name">{rentalSiteLabel(entry.site_name)}</div>
                  {/* M5:181 — "Tower Crane TC-48 · 186 saat" */}
                  <div className="makine-kira__dist-meta">
                    {entry.equipments.map((equipment) => equipment.name).join(", ")}
                    {entry.equipments.length > 0 ? " · " : ""}
                    {formatDecimal(entry.hours, 2)} saat
                  </div>
                  {/* 🔴 DÖRDÜNCÜ fail-closed sayaç — kova düzeyinde sessiz kalmaz. */}
                  {unknownWarning !== null && (
                    <div className="makine-kira__warning" data-testid="makine-kira-dist-warning">
                      {unknownWarning}
                    </div>
                  )}
                </div>
                <span className="makine-kira__dist-amount makine-kira__mono">
                  {entry.amount === null ? "—" : `₺${formatAmount(entry.amount)}`}
                </span>
              </div>
            );
          })}

          {/* M5:188-191 — açıklama satırı (bağlantısız, yukarıdaki nota bak). */}
          <p className="makine-kira__dist-note">
            Bu maliyetler her projenin ilgili hakediş dönemine bölüm maliyeti olarak yansıtılır.
          </p>
        </div>
      </div>
    </section>
  );
}
