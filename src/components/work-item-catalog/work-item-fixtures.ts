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
