import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

/**
 * Şantiye yanıt sözleşmesinin T0'da (2026-07-30) eklenen 16 alanı için test
 * varsayılanları.
 *
 * `SiteCard` ve `SiteDetailResponse` bu alanların hepsini **zorunlu** döndürür;
 * her test dosyasında 16 satırı tekrar yazmak yerine tek yerden yayılır
 * (`{ ...SITE_CONTRACT_DEFAULTS, ...fixture }`). Yalnız testlerde kullanılır —
 * uygulama kodu bu modülü import etmez.
 */
export const EMPTY_SITE_FACILITIES: components["schemas"]["SiteFacilities"] = {
  closed_warehouse: false,
  open_storage: false,
  cold_storage: false,
  site_office: false,
  canteen: false,
  changing_room_wc: false,
  dormitory: false,
  infirmary: false,
};

export const SITE_CONTRACT_DEFAULTS = {
  is_draft: false,
  site_manager_user_id: null,
  safety_officer_user_id: null,
  safety_officer_name: null,
  safety_officer_is_outsourced: false,
  neighborhood: null,
  parcel: null,
  gps_coordinates: null,
  land_area_m2: null,
  construction_area_m2: null,
  floor_info: null,
  budget: null,
  facilities: EMPTY_SITE_FACILITIES,
  electricity_subscription_no: null,
  water_subscription_no: null,
  planned_worker_count: null,
} as const satisfies Pick<
  DeepScale<components["schemas"]["SiteCard"]>,
  | "is_draft"
  | "site_manager_user_id"
  | "safety_officer_user_id"
  | "safety_officer_name"
  | "safety_officer_is_outsourced"
  | "neighborhood"
  | "parcel"
  | "gps_coordinates"
  | "land_area_m2"
  | "construction_area_m2"
  | "floor_info"
  | "budget"
  | "facilities"
  | "electricity_subscription_no"
  | "water_subscription_no"
  | "planned_worker_count"
>;
