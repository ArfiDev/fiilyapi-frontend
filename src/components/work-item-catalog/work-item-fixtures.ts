/**
 * TKL-F1.3 · İş Kalemi Kataloğu testlerinin ortak fikstürü (yalnız testlerden içe alınır).
 * Veri biçimi `WorkItemRead` (openapi); fiyatlı çekirdek uç.
 */
import type { WorkDisciplineRead, WorkItemRead } from "@/lib/api/models";

export const D_KAB: WorkDisciplineRead = {
  id: "d-kab",
  code: "KAB",
  name: "Kaba İnşaat",
  color: "#2563eb",
  default_contractor_type: "own",
  sort_order: 1,
};
export const D_DUV: WorkDisciplineRead = {
  id: "d-duv",
  code: "DUV",
  name: "Duvar & Sıva",
  color: "#93c5fd",
  default_contractor_type: "subcon",
  sort_order: 2,
};

function ref(d: WorkDisciplineRead) {
  return { id: d.id, code: d.code, name: d.name, color: d.color };
}

export const BETON: WorkItemRead = {
  id: "i-bet",
  poz_no: "KAB-0001",
  discipline: ref(D_KAB),
  name: "Beton döküm",
  uom: "m³",
  description: null,
  standard_unit_mhr: "1.8000",
  default_contractor_type: "own",
  ref_price: "1250.50",
  price_updated_at: "2026-09-01T09:00:00Z",
  standard_updated_at: "2026-03-14T09:00:00Z",
  created_at: "2026-03-14T09:00:00Z",
  updated_at: "2026-09-01T09:00:00Z",
};
export const DEMIR: WorkItemRead = {
  ...BETON,
  id: "i-dem",
  poz_no: "KAB-0002",
  name: "Demir bağlama",
  uom: "ton",
  standard_unit_mhr: "11.5000",
  ref_price: "28000.00",
  price_updated_at: "2026-01-02T09:00:00Z",
};
export const SIVA: WorkItemRead = {
  ...BETON,
  id: "i-siv",
  poz_no: "DUV-0001",
  discipline: ref(D_DUV),
  name: "İç sıva",
  uom: "m²",
  standard_unit_mhr: "0.2500",
  default_contractor_type: "subcon",
  ref_price: null,
  price_updated_at: null,
};

/** TKL-F2.5 · son fiyat örnekleri (ayrı kalemler: mevcut sıra/sayaç testlerini kaydırmaz). */
export const LAST_SZL: WorkItemRead = {
  ...BETON,
  id: "i-szl",
  poz_no: "KAB-0101",
  name: "Kalıp işçiliği",
  ref_price: "3350.00",
  last_price: { price: "3410.00", at: "2026-09-12T09:00:00Z", source: "SZL", doc_no: "GNK", doc_id: "p-gnk" },
};
export const LAST_HK_HIGH: WorkItemRead = {
  ...BETON,
  id: "i-hk",
  poz_no: "KAB-0102",
  name: "Hazır beton C30",
  ref_price: "520.00",
  last_price: { price: "555.00", at: "2026-09-20T21:30:00Z", source: "HK", doc_no: "HK-GNK-8", doc_id: "h-8" },
};
/** Fiyatı olan ama hiç kaynağı olmayan kalem (last_price null). */
export const LAST_EMPTY: WorkItemRead = {
  ...BETON,
  id: "i-bos",
  poz_no: "KAB-0103",
  name: "Kaynaksız kalem",
  ref_price: "100.00",
  last_price: null,
};
/** `limited` rol: son fiyat VE referans fiyat maskeli (ikisi de null). */
export const LAST_MASKED: WorkItemRead = {
  ...BETON,
  id: "i-msk",
  poz_no: "KAB-0104",
  name: "Maskeli kalem",
  ref_price: null,
  last_price: null,
};
/** Backend'in henüz bilmediği bir kaynak + uzun proje kodu (risk 10). */
export const LAST_UNKNOWN_SOURCE: WorkItemRead = {
  ...BETON,
  id: "i-unk",
  poz_no: "KAB-0105",
  name: "Bilinmeyen kaynak",
  ref_price: "100.00",
  last_price: {
    price: "96.80",
    at: "2026-03-05T09:00:00Z",
    source: "ZZ",
    doc_no: "COK-UZUN-PROJE-KODU-2026-A-BLOK",
    doc_id: null,
  },
};
