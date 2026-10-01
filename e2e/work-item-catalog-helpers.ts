import { expect, type Page, type Route } from "@playwright/test";

import { VISUAL_VIEWPORT, login } from "./earned-value-helpers";

// TKL-F1.5 · İş Kalemi Kataloğu (`/planlama/is-kalemi-katalogu`) e2e + görsel ORTAK yardımcıları.
//
// ⚠️ `*.spec.ts` DEĞİLDİR; `prepareFrame` BURADAN RE-EXPORT EDİLMEZ.
//
// 🔴 YAZMA MOCK'A GİTMEZ: mock backend TÜM spec dosyalarında paylaşılan tek sunucudur ve
// `fullyParallel` koşar. `POST /catalog/items` / `PATCH /catalog/items/{id}` mock'un
// `state.catalog`ını KALICI değiştirir (KAT kareleri 16 kalem sayar). Bu yardımcı yazma
// uçlarını `page.route` + `route.fulfill` ile YAKALAR; yanıt, mock'un OKUMA uçlarından
// (`GET /catalog/items`, `GET /catalog/disciplines`) ve istek gövdesinden TÜRETİLİR
// (`site-diary-fake-create.ts` emsali). Kayıt yalnız bu sayfanın belleğinde yaşar.

export { VISUAL_VIEWPORT };

export const WORK_ITEM_CATALOG_URL = "/planlama/is-kalemi-katalogu";
/** Mock tohumundaki kalem sayısı (`EV_CATALOG_ROWS`). */
export const SEED_ITEM_COUNT = 16;
/** "Bugün": sahte sunucunun `price_updated_at`ı — `earned-value-helpers` FIXED_NOW ile AYNI gün. */
export const FAKE_SERVER_NOW = "2026-09-24T09:00:00Z";
export const FAKE_SERVER_TODAY_TEXT = "24.09.2026";
/** Sunucunun verdiği poz no — tohumdaki sıradaki numaradan (KAB-0007) KASTEN farklı. */
export const FAKE_ISSUED_POZ_NO = "KAB-0107";

const API = "**/api/backend";

export type Json = Record<string, unknown>;

export interface FakeCatalogServer {
  /** Yakalanan `POST /catalog/items` gövdeleri (sırayla). */
  readonly postBodies: Json[];
  /** Yakalanan `PATCH /catalog/items/{id}` çağrıları (sırayla). */
  readonly patchCalls: { readonly id: string; readonly body: Json }[];
}

function json(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function getJson(page: Page, path: string): Promise<Json> {
  const response = await page.request.get(`/api/backend${path}`);
  expect(response.ok(), `${path} okunamadı`).toBe(true);
  return (await response.json()) as Json;
}

function normalizeLabel(value: unknown): string {
  return String(value ?? "").trim().toLocaleLowerCase("tr-TR");
}

/** Backend `guards.CATALOG_ITEM_TAKEN_AS` — mock ile BİREBİR. */
function takenMessage(existing: Json): string {
  return (
    `Ad: bu disiplinde aynı ad ve birimle bir iş tipi zaten var — «${String(existing.name)}» (${String(existing.uom)}). ` +
    "Büyük/küçük harf, İ/I ve boşluk farkı ayrı iş tipi sayılmaz"
  );
}

function scale2(value: unknown): string | null {
  return value === null || value === undefined ? null : Number(value).toFixed(2);
}

function scale4(value: unknown): string {
  return Number(value).toFixed(4);
}

/**
 * `GET/POST /catalog/items` + `PATCH /catalog/items/{id}` yakalar. Liste, mock'un GERÇEK
 * yanıtı + bu sayfanın bellek içi eklemeleri/değişiklikleridir; mock durumu DEĞİŞMEZ.
 */
export async function installFakeCatalogServer(page: Page): Promise<FakeCatalogServer> {
  const postBodies: Json[] = [];
  const patchCalls: { id: string; body: Json }[] = [];
  const created: Json[] = [];
  const patched = new Map<string, Json>();

  /** Taban liste `page.request` ile okunur (route'tan geçmez); `route.fetch()` POST/PATCH'i mock'a GÖNDERİRDİ. */
  async function currentItems(): Promise<Json[]> {
    const base = (await getJson(page, "/catalog/items")).items as Json[];
    return [...base.map((item) => ({ ...item, ...patched.get(String(item.id)) })), ...created];
  }

  await page.route(`${API}/catalog/items`, async (route) => {
    const method = route.request().method();
    if (method === "GET") {
      return json(route, 200, { items: await currentItems() });
    }
    if (method !== "POST") return route.fallback();
    const body = route.request().postDataJSON() as Json;
    postBodies.push(body);
    const disciplines = ((await getJson(page, "/catalog/disciplines")).items as Json[]) ?? [];
    const discipline = disciplines.find((d) => d.id === body.discipline_id);
    if (discipline === undefined) return json(route, 404, { detail: "Disiplin bulunamadı" });
    const existing = (await currentItems()).find(
      (item) =>
        (item.discipline as Json).id === body.discipline_id &&
        normalizeLabel(item.name) === normalizeLabel(body.name) &&
        normalizeLabel(item.uom) === normalizeLabel(body.uom),
    );
    if (existing !== undefined) return json(route, 409, { detail: takenMessage(existing) });
    const refPrice = scale2(body.ref_price);
    const item: Json = {
      id: `e2e-fake-item-${created.length + 1}`,
      poz_no: FAKE_ISSUED_POZ_NO,
      discipline: { id: discipline.id, code: discipline.code, name: discipline.name, color: discipline.color },
      name: String(body.name).trim(),
      uom: String(body.uom).trim(),
      description: null,
      standard_unit_mhr: scale4(body.standard_unit_mhr),
      default_contractor_type: body.default_contractor_type,
      ref_price: refPrice,
      price_updated_at: refPrice === null ? null : FAKE_SERVER_NOW,
      standard_updated_at: FAKE_SERVER_NOW,
      created_at: FAKE_SERVER_NOW,
      updated_at: FAKE_SERVER_NOW,
    };
    created.push(item);
    return json(route, 201, item);
  });

  await page.route(`${API}/catalog/items/*`, async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    const id = decodeURIComponent(new URL(route.request().url()).pathname.split("/").pop() ?? "");
    const body = route.request().postDataJSON() as Json;
    patchCalls.push({ id, body });
    const current = (await currentItems()).find((item) => item.id === id);
    if (current === undefined) return json(route, 404, { detail: "Katalog iş tipi bulunamadı" });
    // Sunucu kuralı: `price_updated_at` YALNIZ `ref_price` DEĞİŞİNCE şimdi olur.
    const priceChanged = "ref_price" in body && scale2(body.ref_price) !== current.ref_price;
    const next: Json = {
      ...current,
      ...("name" in body ? { name: String(body.name).trim() } : {}),
      ...("uom" in body ? { uom: String(body.uom).trim() } : {}),
      ...("ref_price" in body ? { ref_price: scale2(body.ref_price) } : {}),
      ...("standard_unit_mhr" in body ? { standard_unit_mhr: scale4(body.standard_unit_mhr) } : {}),
      ...("default_contractor_type" in body ? { default_contractor_type: body.default_contractor_type } : {}),
      ...(priceChanged ? { price_updated_at: FAKE_SERVER_NOW } : {}),
    };
    patched.set(id, next);
    return json(route, 200, next);
  });

  return { postBodies, patchCalls };
}

/**
 * `contracts` seviyesini YALNIZ bu sayfa için değiştirir (`withEarnedValueLevel` deseni): mock'ta
 * rol/izin taklidi yok, `/auth/me` yanıtı sayfaya özel yeniden yazılır; paylaşılan durum oynamaz.
 * Navigasyondan ÖNCE çağrılmalıdır.
 */
export async function withContractsLevel(page: Page, level: "none" | "view" | "draft" | "full" | "admin") {
  await page.route("**/api/auth/me", async (route) => {
    const response = await route.fetch();
    const me = (await response.json()) as { permissions?: Record<string, string> };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...me, permissions: { ...me.permissions, contracts: level } }),
    });
  });
}

/** Saat çakılı (`login`) + görsel pencere; navigasyondan ÖNCE saat, SONRA oturum. */
export async function loginForCatalog(page: Page) {
  await page.setViewportSize({ ...VISUAL_VIEWPORT });
  await login(page);
}

/**
 * Ekranı açar; İKİ bağımsız kaynağın da indiğini doğrular: kalemler ("N kalem" sayacı) ve
 * disiplinler (çip sayaçları). Yükleme durumu kareye/iddiaya sızmaz.
 */
export async function openWorkItemCatalog(page: Page, expectedCount: number = SEED_ITEM_COUNT) {
  await page.goto(WORK_ITEM_CATALOG_URL);
  await expect(page.getByRole("heading", { level: 1, name: "İş Kalemi Kataloğu" })).toBeVisible();
  await expect(page.getByTestId("wik-count")).toContainText(`${expectedCount} kalem`);
  await expect(page.getByRole("button", { name: /Elektrik/ })).toBeVisible();
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
}
