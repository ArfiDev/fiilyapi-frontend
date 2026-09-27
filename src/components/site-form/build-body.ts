import type { components } from "@/lib/api/schema";
import { OUTSOURCED_SAFETY_OFFICER } from "./constants";
import { buildFacilities, type SiteFormValues } from "./form-state";
import { collectSectionInputs, type SectionRow } from "./sections-validate";
import type { DeepScale } from "@/lib/api/scale";

export type SiteCreateBody = DeepScale<components["schemas"]["SiteCreate"]>;

/** Boş/boşluk metin → `null` (spec §9.3). */
export function textOrNull(value: string): string | null {
  return value.trim() || null;
}

/** Boş → `null`; sayı olmayan → `null` (doğrulama ayrı katmandadır). */
export function numberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * İSG seçicisinin üç durumlu değeri → iki gövde alanı (spec §4.1.2, §9.3).
 * `"__outsourced__"` sabiti gövdeye **girmez**.
 */
function safetyOfficerFields(value: string): {
  safety_officer_user_id: string | null;
  safety_officer_is_outsourced: boolean;
} {
  if (value === OUTSOURCED_SAFETY_OFFICER) {
    return { safety_officer_user_id: null, safety_officer_is_outsourced: true };
  }
  return { safety_officer_user_id: value || null, safety_officer_is_outsourced: false };
}

/**
 * `POST /projects/{projectId}/sites` gövdesi (spec §9.3) — saf fonksiyon.
 *
 * Gönderim ATOMİKTİR (§3.4): bölümler aynı gövdededir, "önce şantiye sonra
 * bölümler" yedek yolu yoktur.
 *
 * Bilinçli olarak ÜRETİLMEYENLER:
 * - `site_manager_name` / `safety_officer_name` → sunucu FK'den yazar
 * - `sections[].sort_order` / `estimated_amount` / `manager_name` → §6.1
 * - `duration_days` → türev, saklanmaz (§8.2)
 * - `delivery_date` → mockup'ta yok (§11.4)
 * - `project_id` → yol parametresidir (§4.1.1)
 * - belge alanları → hiç yok (§4.6)
 *
 * `safety_officer_is_outsourced` ve `is_draft` HER ZAMAN gönderilir: sunucuda
 * varsayılanları olsa da sözleşmede zorunludur, eksik gönderim "kapattım" ile
 * "hiç dokunmadım"ı ayırt edilemez kılar.
 */
export function buildSiteCreateBody(
  values: SiteFormValues,
  sectionRows: readonly SectionRow[],
  { isDraft }: { isDraft: boolean },
): SiteCreateBody {
  const code = values.code.trim();

  return {
    name: values.name.trim(),
    // Kod boşsa anahtar HİÇ gönderilmez: sunucu `SNT-{YYYY}-{NNN}` üretir (§3.6).
    ...(code ? { code } : {}),
    status: values.status,
    site_manager_user_id: values.siteManagerUserId || null,
    ...safetyOfficerFields(values.safetyOfficer),
    city: textOrNull(values.city),
    neighborhood: textOrNull(values.neighborhood),
    parcel: textOrNull(values.parcel),
    address: textOrNull(values.address),
    // Serbest metin: ayrıştırma/normalleştirme YOK (§4.2.1).
    gps_coordinates: textOrNull(values.gpsCoordinates),
    land_area_m2: numberOrNull(values.landAreaM2),
    construction_area_m2: numberOrNull(values.constructionAreaM2),
    floor_info: textOrNull(values.floorInfo),
    start_date: textOrNull(values.startDate),
    end_date: textOrNull(values.endDate),
    budget: numberOrNull(values.budget),
    facilities: buildFacilities(values.facilities),
    electricity_subscription_no: textOrNull(values.electricitySubscriptionNo),
    water_subscription_no: textOrNull(values.waterSubscriptionNo),
    planned_worker_count: numberOrNull(values.plannedWorkerCount),
    sections: collectSectionInputs(sectionRows),
    is_draft: isDraft,
  };
}
