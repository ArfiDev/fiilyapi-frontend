import type { components } from "@/lib/api/schema";

export type SectionStatus = components["schemas"]["SectionStatus"];

// BLF-F1.3 — Bölüm TİPİ etiketleri BURADAN KALKTI: tip artık sabit enum değil,
// şirket geneli genişletilebilir liste (`GET /section-types`, ad sunucudan
// gelir — `useSectionTypes`). 7 tohum adı backend migration'ında yaşar.

// Bölüm durumu etiketleri — `Form - Bölüm Ekle.dc.html` satır 71 + P6 spec §4/§7 S1.
// TEK KAYNAK: Bölüm Detay hero rozeti (D59) VE T3 formu BUNU kullanır.
export const SECTION_STATUS_LABELS: Record<SectionStatus, string> = {
  planned: "Planlandı",
  active: "Aktif",
  on_hold: "Beklemede",
  completed: "Tamamlandı",
};

// Durum -> görsel kategori sınıf eki. `on_hold` P6'da eklendi; mockup'ta özel
// tasarımı YOK (bkz. task-2-report.md gerekçesi — tasarım sistemindeki uyarı/
// bekletme tonu, `--color-warning` ailesi, seçildi). TEK KAYNAK: SectionCard
// (Şantiye Detay listesi) ve SectionDetailView (Bölüm Detay hero) bunu
// paylaşır — "on_hold: planned" kopyası artık YOK.
export const SECTION_STATUS_CLASS_SUFFIX: Record<SectionStatus, string> = {
  completed: "completed",
  active: "active",
  planned: "planned",
  on_hold: "on-hold",
};
