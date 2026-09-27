import { formatDateDots, formatDecimal, formatPercent } from "@/lib/format";
import type { EquipmentMaintenanceBlock } from "@/lib/api/hooks/useEquipmentDetailScreen";

import { DetailKv } from "./DetailKv";
import { MAINTENANCE_PERIOD_LABELS } from "./equipment-detail-labels";

/**
 * MD:254-271 · 🔧 Bakım Bilgileri.
 *
 * 🔴 Bu kartın DOKUZ alanının hepsi `EquipmentMaintenanceBlock`tan gelir ve
 * **HER BİRİ AYRI AYRI `null` olabilir** (MK-4 şema notu, MK-1 K16 deseni):
 * periyodu `monthly` olan makinede saat cinsinden bir pencere YOKTUR ama son
 * bakım TARİHİ bilinir. Tek bir "bakım bilgisi yok" bayrağına indirgenselerdi
 * bilinen bir olgu, eksik bir ölçüt yüzünden ekrandan silinirdi.
 *
 * 🔴 `remaining_hours` NEGATİF olabilir (bakımı geçmiş makine gerçektir) —
 * ekran onu 0'a KIRPMAZ.
 *
 * 🔴 `usage_pct` SUNUCU DAMGASIDIR (F-P10 kanonu): payı paydaya istemci
 * bölseydi bu ekran ile bakım takvimi aynı çubuğu farklı doldururdu. Çubuğun
 * GENİŞLİĞİ o damgadan okunur; yalnız 0-100 aralığına KIRPILIR — kırpma bir
 * hesap değil, CSS'in taşmasını önleyen çizim sınırıdır.
 */
export function EquipmentMaintenanceCard({
  maintenance,
  asOf,
}: {
  maintenance: EquipmentMaintenanceBlock;
  asOf: string;
}) {
  const pct = maintenance.usage_pct === null ? null : Number(maintenance.usage_pct);
  const barWidth = pct === null ? 0 : Math.min(100, Math.max(0, pct));

  return (
    <section className="makine-det__card" aria-label="Bakım Bilgileri">
      <h2 className="makine-det__card-title">🔧 Bakım Bilgileri</h2>

      <DetailKv
        label="Bakım Periyodu"
        value={
          maintenance.period === null ? null : MAINTENANCE_PERIOD_LABELS[maintenance.period]
        }
        testId="makine-det-period"
      />
      <DetailKv
        label="Son Bakım Tarihi"
        value={
          maintenance.last_service_date === null
            ? null
            : formatDateDots(maintenance.last_service_date)
        }
        tones={["mono"]}
      />
      <DetailKv
        label="Son Bakım Saati"
        value={
          maintenance.last_service_hourmeter === null
            ? null
            : `${formatDecimal(maintenance.last_service_hourmeter, 2)} sa`
        }
        tones={["mono"]}
      />
      <DetailKv
        label="Sonraki Bakım Saati"
        value={
          maintenance.next_service_hourmeter === null
            ? null
            : `${formatDecimal(maintenance.next_service_hourmeter, 2)} sa`
        }
        tones={["mono", "warning"]}
      />
      <DetailKv
        label="Kalan Çalışma Saati"
        value={
          maintenance.remaining_hours === null
            ? null
            : `${formatDecimal(maintenance.remaining_hours, 2)} sa`
        }
        tones={["mono", "warning"]}
        testId="makine-det-remaining"
      />
      {/* MD:260 `~05.09.2026` — tilde SUNUCUNUN "tahmin" damgasıdır, ekranın
          süsü değil: değer son günlerin çalışma temposundan türer. */}
      <DetailKv
        label="Tahmini Bakım Tarihi"
        value={
          maintenance.estimated_service_date === null
            ? null
            : `~${formatDateDots(maintenance.estimated_service_date)}`
        }
        tones={["mono"]}
        testId="makine-det-estimated"
      />

      {/* MD:261-270 — çubuk. Yüzde YOKSA çubuk hiç çizilmez; boş bir kabuk
          "%0 kullanıldı" izlenimi verirdi. */}
      {pct === null ? (
        <p className="makine-det__band" data-testid="makine-det-usage-missing">
          Bakım periyodu kullanımı hesaplanamadı — bu ekipmanda saat cinsinden bir bakım
          penceresi tanımlı değil.
        </p>
      ) : (
        <div style={{ marginTop: 14 }}>
          <div className="makine-det__bar-head">
            <span className="makine-det__bar-label">Bakım Periyodu Kullanımı</span>
            <span className="makine-det__bar-value" data-testid="makine-det-usage-pct">
              {formatPercent(maintenance.usage_pct)}
            </span>
          </div>
          <div
            className="makine-det__bar-track"
            role="progressbar"
            aria-label="Bakım periyodu kullanımı"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={barWidth}
          >
            <div className="makine-det__bar-fill" style={{ width: `${barWidth}%` }} />
          </div>
          {/* MD:269 `286 / 500 saat çalışıldı` — payda `period_hours`tur ve
              `monthly` periyotta `null`dur; o hâlde yalnız pay basılır. */}
          <p className="makine-det__bar-note">
            {maintenance.used_hours === null
              ? "Kullanılan saat bilinmiyor"
              : maintenance.period_hours === null
                ? `${formatDecimal(maintenance.used_hours, 2)} saat çalışıldı`
                : `${formatDecimal(maintenance.used_hours, 2)} / ${maintenance.period_hours} saat çalışıldı`}
          </p>
        </div>
      )}

      {/* Tahminin DAYANAK GÜNÜ yanıtta açıkça duruyor; ekran onu SAKLAMAZ —
          "~05.09.2026" hangi güne göre hesaplandığı bilinmeden okunamaz. */}
      <p className="makine-det__band" data-testid="makine-det-as-of">
        Türev sayılar {formatDateDots(asOf)} gününe göre hesaplandı.
      </p>
    </section>
  );
}
