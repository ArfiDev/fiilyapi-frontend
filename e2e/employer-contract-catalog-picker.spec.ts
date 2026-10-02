import { test, expect, type Locator, type Page, type Route } from "@playwright/test";

import { login } from "./earned-value-helpers";
import { PICKER_DIALOG_NAME } from "./employer-catalog-picker-helpers";

// TKL-F2.6 · İşveren sözleşmesi "+ Poz Ekle" → KATALOG SEÇİCİSİ → TOPLU ekleme (fonksiyonel e2e).
//
// 🔴 YAZMA MOCK'A GİTMEZ: mock backend TÜM spec dosyalarında paylaşılan tek sunucudur ve
// `fullyParallel` koşar; `POST /projects/p-1/contract/items/bulk` mock'un `contractItems`ını KALICI
// büyütür (E14 / dağıtım / ödeme kareleri p-1'in 4 kalemini sayar). Bu dosya toplu ucu `page.route` +
// `route.fulfill` ile YAKALAR; yanıt, mock'un OKUMA ucundan (`GET /projects/p-1/contract/items`) ve istek
// gövdesinden TÜRETİLİR (`site-diary-fake-create.ts` / `work-item-catalog-helpers.ts` emsali). Eklenen
// kalemler yalnız bu sayfanın belleğinde yaşar; her test sonunda mock'un OKUMA ucu "mock'a yazmadı"
// diye de doğrulanır.
//
// ⚠️ `getByRole("alert")` KULLANILMAZ (Next route-announcer tuzağı) · zamana dayalı bekleme YOK.
// Mock tohumu (p-1): grup cg-1 (03.001-03.003) + cg-2 (03.010); 03.003 ↔ KAB-0003, 03.010 ↔ KAB-0001 katalog
// bağlı → "sözleşmede olan" katalog kalemleri KAB-0001 ve KAB-0003.

const CONTRACT_URL = "/sozlesmeler/isveren/p-1?tab=items";
const BULK_PATH = "/api/backend/projects/p-1/contract/items/bulk";
const ITEMS_PATH = "/api/backend/projects/p-1/contract/items";
const GROUPS_PATH = "/api/backend/projects/p-1/contract/groups";
const SEED_ITEM_COUNT = 4;
/** `defaultGroupId`: en büyük `sort_order`lu grup (cg-2, tek kalemli: sort_order 0 → yenileri 1, 2). */
const TARGET_GROUP_ID = "cg-2";
const IN_CONTRACT = ["KAB-0001", "KAB-0003"] as const;
const FIRST = { pozNo: "DUV-0001", name: "Tuğla duvar", uom: "m²" } as const;
const SECOND = { pozNo: "KAB-0004", name: "Beton döküm", uom: "m³" } as const;
const QUANTITY_TEXT = "1.500";
const PRICE_TEXT = "2.250,50";
const CONFLICT_DETAIL = "Bu poz numarası bu sözleşmede zaten kullanılıyor: DUV-0001";

type Json = Record<string, unknown>;
type BulkOutcome = "created" | "conflict";

interface FakeContractServer {
  /** Yakalanan `POST …/contract/items/bulk` gövdeleri (sırayla). */
  readonly bulkBodies: Json[];
  /** Yakalanan `POST …/contract/groups` gövdeleri (mevcut grupta HİÇ gelmemeli). */
  readonly groupBodies: Json[];
}

function json(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function readJson(page: Page, path: string): Promise<Json> {
  const response = await page.request.get(path);
  expect(response.ok(), `${path} okunamadı`).toBe(true);
  return (await response.json()) as Json;
}

function toContractItem(entry: Json, index: number): Json {
  return {
    id: `e2e-fake-ci-${index + 1}`,
    group_id: entry.group_id,
    code: entry.code,
    description: entry.description,
    unit: entry.unit,
    quantity: Number(entry.quantity).toFixed(3),
    unit_price: Number(entry.unit_price).toFixed(2),
    sort_order: entry.sort_order,
    catalog_item_id: entry.catalog_item_id ?? null,
    distributed_quantity: "0.000",
    remaining_quantity: Number(entry.quantity).toFixed(3),
  };
}

/**
 * Toplu ucu + kalem listesini yakalar. `outcomes` sırayla tüketilir (boşalınca "created"). Liste, mock'un
 * GERÇEK yanıtı + bu sayfanın bellek içi eklemeleridir; mock durumu DEĞİŞMEZ. Taban liste `page.request`
 * ile okunur (route'tan geçmez); `route.fetch()` yazmayı mock'a GÖNDERİRDİ.
 */
async function installFakeContractServer(page: Page, outcomes: readonly BulkOutcome[]): Promise<FakeContractServer> {
  const bulkBodies: Json[] = [];
  const groupBodies: Json[] = [];
  const created: Json[] = [];
  const queue = [...outcomes];

  await page.route(`**${BULK_PATH}`, async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const body = route.request().postDataJSON() as Json;
    bulkBodies.push(body);
    if (queue.shift() === "conflict") return json(route, 409, { detail: CONFLICT_DETAIL });
    const items = (body.items as Json[]).map((entry, index) => toContractItem(entry, created.length + index));
    created.push(...items);
    return json(route, 201, { items });
  });

  await page.route(`**${GROUPS_PATH}`, async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    groupBodies.push(route.request().postDataJSON() as Json);
    return json(route, 500, { detail: "e2e: mevcut grupta grup açılmamalıydı" });
  });

  await page.route(`**${ITEMS_PATH}`, async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const base = (await readJson(page, ITEMS_PATH)) as { groups: { id: string; items: Json[] }[] };
    const groups = base.groups.map((group) => ({
      ...group,
      items: [...group.items, ...created.filter((item) => item.group_id === group.id)],
    }));
    return json(route, 200, { groups });
  });

  return { bulkBodies, groupBodies };
}

/** "Mock'a yazmadı": mock'un OKUMA ucu hâlâ tohum 4 kalemi (ve yalnız onları) döner. */
async function expectMockUntouched(page: Page): Promise<void> {
  const base = (await readJson(page, ITEMS_PATH)) as { groups: { items: { code: string }[] }[] };
  const codes = base.groups.flatMap((group) => group.items.map((item) => item.code));
  expect(codes, "mock'a yazma sızdı").toHaveLength(SEED_ITEM_COUNT);
  expect(codes).not.toContain(FIRST.pozNo);
  expect(codes).not.toContain(SECOND.pozNo);
}

const picker = (page: Page): Locator => page.getByRole("dialog", { name: PICKER_DIALOG_NAME });
const quantityOf = (page: Page, pozNo: string): Locator => picker(page).getByLabel(`${pozNo} miktar`);
const priceOf = (page: Page, pozNo: string): Locator => picker(page).getByLabel(`${pozNo} birim fiyat`);

async function openPicker(page: Page): Promise<void> {
  await page.goto(CONTRACT_URL);
  // YÜKLENDİ: kalem tablosu (türev kolonlar + toplam satırı) basıldı.
  await expect(page.getByTestId("ecd-item-distributed").first()).toBeVisible();
  await expect(page.getByTestId("ecd-items-total")).toBeVisible();
  await page.getByTestId("ecd-add-item").click();
  await expect(picker(page)).toBeVisible();
  // YÜKLENDİ: katalog satırları indi.
  await expect(quantityOf(page, FIRST.pozNo)).toBeVisible();
  await expect(quantityOf(page, SECOND.pozNo)).toBeVisible();
}

/** Seçilebilir iki kalemin miktar + B.F. alanlarını T30 biçimiyle doldurur ve seçimin 2 olduğunu doğrular. */
async function fillTwoItems(page: Page): Promise<void> {
  for (const { pozNo } of [FIRST, SECOND]) {
    await quantityOf(page, pozNo).fill(QUANTITY_TEXT);
    await priceOf(page, pozNo).fill(PRICE_TEXT);
  }
  await expect(page.getByTestId("wip-selected")).toHaveText("2");
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

test("seçici: 2 kalem seç, T30 miktar/B.F. gir → TEK bulk POST; tabloda kalemler + 'N poz eklendi'", async ({
  page,
}) => {
  const server = await installFakeContractServer(page, ["created"]);
  await openPicker(page);
  await fillTwoItems(page);

  await page.getByRole("button", { name: "2 Pozu Ekle" }).click();

  // 🔴 TEK toplu istek; gövde: kodlar = poz no, katalog bağı, SAYILAR nokta-ondalık dize (T30 → API), sıra ardışık.
  await expect.poll(() => server.bulkBodies.length).toBe(1);
  expect(server.bulkBodies[0]).toEqual({
    items: [FIRST, SECOND].map((entry, index) => ({
      group_id: TARGET_GROUP_ID,
      code: entry.pozNo,
      description: entry.name,
      unit: entry.uom,
      quantity: "1500",
      unit_price: "2250.50",
      sort_order: 1 + index,
      catalog_item_id: expect.stringMatching(/^e7ca7000-/),
    })),
  });
  expect(server.groupBodies).toEqual([]);

  // Başarı: bildirim + seçici kapandı + yeni kalemler tabloda (Türkçe biçimli hücreler).
  await expect(page.getByTestId("ecd-added-notice")).toHaveText("2 poz eklendi");
  await expect(picker(page)).toHaveCount(0);
  const main = page.locator("main");
  await expect(main.getByLabel(`${FIRST.pozNo} miktar`)).toHaveValue("1.500");
  await expect(main.getByLabel(`${SECOND.pozNo} miktar`)).toHaveValue("1.500");
  await expect(main.getByLabel(`${FIRST.pozNo} birim fiyatı`)).toHaveValue("2.250,50");
  await expect(main.getByLabel(`${FIRST.pozNo} poz adı`)).toHaveValue(FIRST.name);

  await expectMockUntouched(page);
});

test("seçici: 409 kod çakışması bantta AYNEN görünür, seçim ve girdiler korunur, tekrar denenince eklenir", async ({
  page,
}) => {
  const server = await installFakeContractServer(page, ["conflict", "created"]);
  await openPicker(page);
  await fillTwoItems(page);

  await page.getByRole("button", { name: "2 Pozu Ekle" }).click();

  await expect.poll(() => server.bulkBodies.length).toBe(1);
  await expect(page.getByTestId("wip-band")).toContainText(CONFLICT_DETAIL);
  // Seçici KAPANMADI; seçim ve girdiler yerinde; tabloya hiçbir kalem eklenmedi.
  await expect(picker(page)).toBeVisible();
  await expect(page.getByTestId("wip-selected")).toHaveText("2");
  await expect(quantityOf(page, FIRST.pozNo)).toHaveValue(QUANTITY_TEXT);
  await expect(priceOf(page, SECOND.pozNo)).toHaveValue(PRICE_TEXT);
  await expect(page.getByTestId("ecd-added-notice")).toHaveCount(0);

  // Aynı seçimle ikinci deneme: AYNI gövde, bu kez başarılı.
  await page.getByRole("button", { name: "2 Pozu Ekle" }).click();
  await expect.poll(() => server.bulkBodies.length).toBe(2);
  expect(server.bulkBodies[1]).toEqual(server.bulkBodies[0]);
  await expect(page.getByTestId("ecd-added-notice")).toHaveText("2 poz eklendi");
  await expect(picker(page)).toHaveCount(0);
  expect(server.groupBodies).toEqual([]);

  await expectMockUntouched(page);
});

test("seçici: 'sözleşmede olanları gizle' bağlı kalemleri saklar; kapatınca soluk + 'Sözleşmede var' görünür", async ({
  page,
}) => {
  const server = await installFakeContractServer(page, []);
  await openPicker(page);

  const hide = picker(page).getByLabel("Sözleşmede olanları gizle");
  await expect(hide).toBeChecked();
  for (const pozNo of IN_CONTRACT) await expect(picker(page).getByLabel(`${pozNo} seç`)).toHaveCount(0);

  await hide.uncheck();
  for (const pozNo of IN_CONTRACT) {
    const box = picker(page).getByLabel(`${pozNo} seç`);
    await expect(box).toBeVisible();
    await expect(box).toBeDisabled();
  }
  await expect(picker(page).getByText(/Sözleşmede var/).first()).toBeVisible();

  await hide.check();
  for (const pozNo of IN_CONTRACT) await expect(picker(page).getByLabel(`${pozNo} seç`)).toHaveCount(0);

  // Salt-okur akış: hiçbir yazma isteği uçmadı.
  expect(server.bulkBodies).toEqual([]);
  await expectMockUntouched(page);
});
