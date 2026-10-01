import type { SectionCreateRequest } from "@/lib/api/hooks/useSectionMutations";
import type { components } from "@/lib/api/schema";
import type { SectionFormValues } from "./form-state";
import type { DeepScale } from "@/lib/api/scale";

export type SectionMilestone = DeepScale<components["schemas"]["SectionMilestoneResponse"]>;
type SectionMilestoneInput = DeepScale<components["schemas"]["SectionMilestoneInput"]>;

/** Boş/boşluk metin → `null` (site-form/build-body.ts deseniyle aynı). */
export function textOrNull(value: string): string | null {
  return value.trim() || null;
}

/** Boş → `null`; sayı olmayan → `null` (doğrulama ayrı katmandadır). `0` GEÇERLİDİR. */
export function numberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * `POST /sites/{site_id}/sections` VE `PATCH /sections/{section_id}` gövdesi
 * — saf fonksiyon (brief §Kanıt yükümlülüğü, `site-form/build-body.ts`
 * deseni). `SectionCreateRequest` dönse de yapısal olarak `SectionUpdateRequest`
 * ile uyumludur (tüm alanlar orada da vardır, yalnız `site_id` yoktur — o zaten
 * hiç üretilmez).
 *
 * Bilinçli olarak ÜRETİLMEYENLER (brief §Mockup'ta olup backend'i OLMAYAN
 * kartlar — hiçbiri buraya alan sızdırmaz):
 * - `manager_name` / `deputy_manager_name` — formda serbest metin karşılığı
 *   YOKTUR (yalnız kullanıcı seçici basılır, site-form/user-picker deseni).
 *   Düzenleme kipinde eski (yalnız-isim) kayıtları PATCH ile SESSİZCE
 *   silmemek için bu iki alan HİÇ gönderilmez — dokunulmayan alan PATCH'te
 *   olduğu gibi kalır.
 * - Görevli Taşeronlar / Kullanılacak Makineler (F88-98) — devre dışı kart,
 *   backend alanı yok.
 * - Gantt checkbox (F237) — devre dışı. ARTIK "modül yok" diye değil, SEÇENEK
 *   OLMADIĞI için: `/projects/timeline` HER bölümü döndürür, bir bölümü
 *   takvimden dışarıda tutan alan ne şemada ne üründe vardır.
 * - Bölüm Belgeleri (F214-233) — yükleme yok, gövde alanı yok.
 * - Bölüme Atanacak İş Kalemleri (F131-211) — kalıcı karar 1, veri katmanında
 *   kapalı.
 * - `duration_days` (F109) — türev, saklanmaz.
 * - `budget_amount` — BLF-F1.3 (F-a): Bölüm Bedeli yalnız HESAPLANIR (iş kalemi
 *   tahsislerinden türeyen `budget`); elle bedel gövdeye GİRMEZ.
 * - `site_id` — yol parametresidir, gövdeye ayrı alan olarak GİTMEZ.
 */
export interface BuildSectionBodyOptions {
  isDraft: boolean;
  /**
   * F-TKV T5 — düzenleme kipinde kayıtlı milestone'lar. `SectionUpdate.
   * milestones` İKİ GÖVDE SEMANTİĞİ taşır: `null`/anahtar yok = DOKUNMA,
   * `[]` = HEPSİNİ SİL. Mockup TEK bir "Milestone Ekle" satırı çizer, silme
   * yüzeyi ÇİZMEZ → bu form ASLA `[]` göndermez. Yeni satır doluysa gövde
   * mevcutları `id`leriyle birlikte taşır (`SectionMilestoneInput.id` satırın
   * KİMLİĞİNİ korur, `ShareholderInput` emsali) ve yenisini SONA ekler.
   * `sort_order` GÖVDEDEN GELMEZ — sunucu dizi sırasından atar.
   */
  existingMilestones?: readonly SectionMilestone[];
}

/** Yeni milestone satırı gövdeye girer mi — İKİ alan da dolu olmalı. */
function newMilestone(values: SectionFormValues): SectionMilestoneInput | null {
  const title = values.milestoneTitle.trim();
  const date = values.milestoneDate.trim();
  if (!title || !date) return null;
  return { title, milestone_date: date };
}

export function buildSectionBody(
  values: SectionFormValues,
  { isDraft, existingMilestones = [] }: BuildSectionBodyOptions,
): SectionCreateRequest {
  const code = values.code.trim();
  const added = newMilestone(values);
  const milestones: SectionMilestoneInput[] | null =
    added === null
      ? null
      : [
          ...existingMilestones.map((milestone) => ({
            id: milestone.id,
            title: milestone.title,
            milestone_date: milestone.milestone_date,
          })),
          added,
        ];

  return {
    depends_on_section_id: values.dependsOnSectionId || null,
    // Anahtar YALNIZ yeni satır varken girer; yoksa `null` semantiği (dokunma)
    // için hiç gönderilmez.
    ...(milestones === null ? {} : { milestones }),
    name: values.name.trim(),
    // Kod boşsa anahtar HİÇ gönderilmez: sunucu `BLM-NN` üretir (F68).
    ...(code ? { code } : {}),
    sort_order: numberOrNull(values.sortOrder) ?? 0,
    section_type_id: values.sectionTypeId || null,
    status: values.status,
    description: textOrNull(values.description),
    manager_user_id: values.managerUserId || null,
    deputy_manager_user_id: values.deputyManagerUserId || null,
    planned_worker_count: numberOrNull(values.plannedWorkerCount),
    start_date: textOrNull(values.startDate),
    end_date: textOrNull(values.endDate),
    is_draft: isDraft,
  };
}
