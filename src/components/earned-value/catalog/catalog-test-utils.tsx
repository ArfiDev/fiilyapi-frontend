/**
 * PLN-F1.5 · Katalog ekran testlerinin ORTAK fikstürü ve istemci taklidi.
 * Veriler KAT:413-432 örnek verisinden (Kaba İnşaat · Duvar & Sıva · İnce İşler);
 * disiplin kullanım sayıları M6:408-412 (KAB 6/4 · DUV 4/4 · INC 0/0).
 * Yalnız testlerden içe alınır.
 */
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { backendClient } from "@/lib/api/client";
import type { EvCatalogItemRead, EvDisciplineRead } from "@/lib/api/models";

import { UnitRateCatalogScreen } from "./UnitRateCatalogScreen";

/**
 * `vi.mock` ile sahtelenmiş bir fonksiyonun bu yardımcının kullandığı yüzeyi.
 * 🔴 Bu dosya test-DIŞI adlıdır; `vitest` İMPORT EDEMEZ (bekçi:
 * `src/lib/api/` altındaki stub bekçisi). `vi.mocked` zaten yalnız bir
 * TİP dökümüdür — çalışma zamanında sahte fonksiyonun kendi metodu çağrılır.
 */
interface MockSurface {
  mockImplementation(impl: unknown): unknown;
  mockReturnValue(value: unknown): unknown;
  mock: { calls: unknown[][] };
}
const asMock = (fn: unknown): MockSurface => fn as MockSurface;

export const KAB: EvDisciplineRead = {
  id: "d-kab",
  code: "KAB",
  name: "Kaba İnşaat",
  color: "#2563eb",
  default_contractor_type: "own",
  sort_order: 1,
  used_by_item_count: 6,
  used_by_site_count: 4,
  user_count: 0,
};
export const DUV: EvDisciplineRead = {
  id: "d-duv",
  code: "DUV",
  name: "Duvar & Sıva",
  color: "#93c5fd",
  default_contractor_type: "subcon",
  sort_order: 2,
  used_by_item_count: 4,
  used_by_site_count: 4,
  user_count: 0,
};
export const INC: EvDisciplineRead = {
  id: "d-inc",
  code: "INC",
  name: "İnce İşler",
  color: "#e2e8f0",
  default_contractor_type: "subcon",
  sort_order: 3,
  used_by_item_count: 0,
  used_by_site_count: 0,
  user_count: 0,
};
/** İş tipi YOK ama bir şantiye bütçesinde eşlenmiş (B1-9: yine silinemez). */
export const ELK_SITE_ONLY: EvDisciplineRead = {
  id: "d-elk",
  code: "ELK",
  name: "Elektrik",
  color: "#cbd5e1",
  default_contractor_type: "own",
  sort_order: 4,
  used_by_item_count: 0,
  used_by_site_count: 2,
  user_count: 0,
};

const NO_ACTUAL = { avg: null, min: null, max: null, site_count: 0, sites: [] };

function ref(d: EvDisciplineRead) {
  return { id: d.id, code: d.code, name: d.name, color: d.color };
}

/** B1 gerçeği: `actual` BOŞ, `diff_pct` null. */
export const BETON: EvCatalogItemRead = {
  id: "i-bet",
  discipline: ref(KAB),
  name: "Beton döküm",
  uom: "m³",
  standard_unit_mhr: "1.8000",
  default_contractor_type: "own",
  description: "C30 pompa ile döküm + vibrasyon",
  standard_updated_at: "2026-03-14T09:00:00Z",
  used_by_site_count: 4,
  actual: NO_ACTUAL,
  diff_pct: null,
};
export const DEMIR: EvCatalogItemRead = {
  ...BETON,
  id: "i-dem",
  name: "Demir",
  uom: "ton",
  standard_unit_mhr: "11.5000",
  description: "Kesme, bükme, bağlama",
  used_by_site_count: 3,
};
export const SIVA: EvCatalogItemRead = {
  ...BETON,
  id: "i-siv",
  discipline: ref(DUV),
  name: "İç sıva",
  uom: "m²",
  standard_unit_mhr: "0.2500",
  default_contractor_type: "subcon",
  description: null,
  used_by_site_count: 0,
};

/** B3 sonrası şekil — gerçekleşeni DOLU satır (↺ ve büyük fark testleri için). */
export const KALIP_WITH_ACTUAL: EvCatalogItemRead = {
  ...BETON,
  id: "i-kal",
  name: "Kalıp",
  uom: "m²",
  standard_unit_mhr: "0.8000",
  description: null,
  actual: {
    avg: "0.9254",
    min: "0.89",
    max: "0.95",
    site_count: 2,
    sites: [
      { site_id: "s-1", site_name: "Güneşkent B-Blok", end_date: "2026-03-14", qty: "12400", rate: "0.95" },
      { site_id: "s-2", site_name: "Çelik OSB Fabrika", end_date: "2025-11-30", qty: "8600", rate: "0.89" },
    ],
  },
  diff_pct: "0.15675",
};

export interface ApiState {
  disciplines: EvDisciplineRead[];
  catalog: EvCatalogItemRead[];
}

export function ok(data: unknown, status = 200) {
  return { data, error: undefined, response: new Response(null, { status }) } as never;
}

export function fail(status: number, detail: string) {
  return { data: undefined, error: { detail }, response: new Response(null, { status }) } as never;
}

/** GET'leri yola göre yanıtlar; yazma uçlarını test kendisi kurar. */
export function mockGets(state: ApiState): void {
  asMock(backendClient.GET).mockImplementation((async (path: string) => {
    if (path === "/earned-value/disciplines") return ok(state.disciplines);
    if (path === "/earned-value/catalog") return ok(state.catalog);
    throw new Error(`beklenmeyen GET ${path}`);
  }) as never);
}

export function renderScreen() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <UnitRateCatalogScreen />
    </QueryClientProvider>,
  );
}
