import { test, expect, type Page, type Route } from "@playwright/test";

import { login } from "./earned-value-helpers";

// TKL-F2.4 · T13 ONAY KARELERİ (SABAH ONAYI) — BASELINE DEĞİL, `toHaveScreenshot` YOK.
//
// Katalogdan Poz Ekle seçicisinin 5 hâli, kullanıcıya PS mockup karesiyle yan yana göstermek için
// `page.screenshot({ path })` ile DİSKE yazılır. Hedef dizin ortam değişkeninden gelir:
//
//   PICKER_PREVIEW=/yol/picker-kareler pnpm exec playwright test e2e/work-item-picker-preview.spec.ts
//
// 🔴 CI'DA ATLANIR (`PICKER_PREVIEW` yok → skip): kareler macOS'ta üretilen İNCELEME çıktısıdır;
// snapshot dizinine yazmaz, görsel kapıya (Linux baseline) girmez. Onaydan sonra baseline turu F2.6'dır.
//
// 🔒 Salt-okur: yazma ucuna İSTEK GİTMEZ (hiçbir kare "Poz Ekle"ye basmaz). Katalog ve kalem listesi
// bu sayfaya özel `page.route` ile (mock'un GERÇEK okuma yanıtından türetilerek) yeniden yazılır;
// paylaşılan mock durumu `fullyParallel` altında oynamaz.
// 📅 Saat `login` içinde navigasyondan ÖNCE çakılır (24.09.2026).

const OUT_DIR = process.env.PICKER_PREVIEW ?? "";
test.skip(OUT_DIR === "", "PICKER_PREVIEW (çıktı dizini) verilmedi — onay kareleri yalnız elle üretilir");

const API = "**/api/backend";
const CONTRACT_URL = "/sozlesmeler/isveren/p-1?tab=items";
const WIDE = { width: 1440, height: 900 } as const;
const NARROW = { width: 768, height: 900 } as const;
const REF_ONLY_QUANTITY = "1.5";

type Json = Record<string, unknown>;
type CatalogItem = Json & { id: string; poz_no: string };

function fulfillJson(route: Route, body: unknown): Promise<void> {
  return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
}

async function readJson(page: Page, path: string): Promise<Json> {
  const response = await page.request.get(`/api/backend${path}`);
  expect(response.ok(), `${path} okunamadı`).toBe(true);
  return (await response.json()) as Json;
}

/** Mock'un gerçek kataloğu (karışık disiplin, dolu/boş son fiyat) — süzgeçsiz. */
async function realCatalog(page: Page): Promise<CatalogItem[]> {
  return ((await readJson(page, "/catalog/items")).items ?? []) as CatalogItem[];
}

async function serveCatalog(page: Page, items: readonly Json[]): Promise<void> {
  await page.route(`${API}/catalog/items`, (route) =>
    route.request().method() === "GET" ? fulfillJson(route, { items }) : route.fallback(),
  );
}

async function serveContractGroups(page: Page, groups: readonly Json[]): Promise<void> {
  await page.route(`${API}/projects/p-1/contract/items`, (route) =>
    route.request().method() === "GET" ? fulfillJson(route, { groups }) : route.fallback(),
  );
}

function contractItem(over: Json): Json {
  return {
    description: "Sözleşmede mevcut poz",
    unit: "m³",
    quantity: "100.000",
    unit_price: "1000.00",
    sort_order: 0,
    catalog_item_id: null,
    distributed_quantity: "0.000",
    remaining_quantity: "100.000",
    ...over,
  };
}

async function openPicker(page: Page): Promise<void> {
  await page.goto(CONTRACT_URL);
  await page.getByTestId("ecd-add-item").click();
  const dialog = page.getByRole("dialog", { name: "Katalogdan Poz Ekle" });
  await expect(dialog).toBeVisible();
  await page.mouse.move(0, 0);
}

async function snap(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${OUT_DIR}/${name}.png`, fullPage: false });
}

const picker = (page: Page) => page.getByRole("dialog", { name: "Katalogdan Poz Ekle" });

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(WIDE);
  await login(page);
});

test("secici-liste: karışık disiplin, seçim yok, 'sözleşmede var' satırı görünür (işaret kaldırılmış)", async ({ page }) => {
  const items = await realCatalog(page);
  const [linked, collision] = items;
  await serveCatalog(page, items);
  await serveContractGroups(page, [
    {
      id: "cg-1",
      name: "A — Betonarme İşleri",
      sort_order: 0,
      items: [
        contractItem({ id: "ci-1", group_id: "cg-1", code: "ÖZEL-1", catalog_item_id: linked?.id }),
        contractItem({ id: "ci-2", group_id: "cg-1", code: collision?.poz_no, sort_order: 1 }),
      ],
    },
  ]);
  await openPicker(page);
  await expect(picker(page).getByText(items[2]?.poz_no ?? "")).toBeVisible();
  await picker(page).getByLabel("Sözleşmede olanları gizle").uncheck();
  await expect(picker(page).getByText(/Sözleşmede var/).first()).toBeVisible();
  await snap(page, "secici-liste");
});

test("secici-secimli: 3 seçili, biri hatalı (virgül/nokta belirsizliği), kırmızı bant + Σ", async ({ page }) => {
  const items = await realCatalog(page);
  await serveCatalog(page, items);
  await openPicker(page);
  const [first, second, third] = items.slice(0, 3).map((item) => item.poz_no);
  const quantityOf = (pozNo: string | undefined) => picker(page).getByLabel(`${pozNo} miktar`);
  await expect(quantityOf(first)).toBeVisible();
  await quantityOf(first).fill("480");
  await quantityOf(second).fill("12,5");
  await quantityOf(third).fill(REF_ONLY_QUANTITY);
  await expect(page.getByTestId("wip-band")).toContainText("pozda eksik ya da hatalı değer var");
  await snap(page, "secici-secimli");
});

test("secici-yeni-grup: grupsuz sözleşme, '+ Yeni Grup' seçili, ad alanı açık", async ({ page }) => {
  await serveCatalog(page, await realCatalog(page));
  await serveContractGroups(page, []);
  await openPicker(page);
  await expect(picker(page).getByLabel("Grup Adı")).toBeVisible();
  await snap(page, "secici-yeni-grup");
});

test("secici-bos-katalog: katalog boş", async ({ page }) => {
  await serveCatalog(page, []);
  await openPicker(page);
  await expect(picker(page).getByText(/İş kalemi kataloğu boş/)).toBeVisible();
  await snap(page, "secici-bos-katalog");
});

test("secici-768: dar ekran (tablo yatay kaydırılır)", async ({ page }) => {
  const items = await realCatalog(page);
  await serveCatalog(page, items);
  await page.setViewportSize(NARROW);
  await openPicker(page);
  await expect(picker(page).getByText(items[0]?.poz_no ?? "").first()).toBeVisible();
  await picker(page).getByLabel(`${items[0]?.poz_no} miktar`).fill("25");
  await snap(page, "secici-768");
});
