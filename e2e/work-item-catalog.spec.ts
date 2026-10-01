import { test, expect, type Locator, type Page } from "@playwright/test";

import {
  FAKE_ISSUED_POZ_NO,
  FAKE_SERVER_TODAY_TEXT,
  installFakeCatalogServer,
  loginForCatalog,
  openWorkItemCatalog,
  SEED_ITEM_COUNT,
  withContractsLevel,
  type Json,
} from "./work-item-catalog-helpers";

// TKL-F1.5 · `Planlama - İş Kalemi Kataloğu` fonksiyonel e2e.
//
// 🔴 YAZMA MOCK'A GİTMEZ: oluşturma/düzenleme `installFakeCatalogServer` ile `page.route`
// üzerinden yakalanır (bkz. `work-item-catalog-helpers.ts`). Her test, sonunda mock'un OKUMA
// ucundan kaydın mock'a YAZILMADIĞINI da doğrular. Testler birbirinden bağımsızdır; bekleme
// durum tabanlıdır (zamana dayalı bekleme YOK).
//
// Mock tohumu (`EV_CATALOG_ROWS` + `EV_CATALOG_PRICES`): 16 kalem · poz no sırası DUV, ELK, KAB,
// MEK · KAB-0003 Demir 28.500,00 ₺ (10.12.2025 = 182 günden eski) · KAB-0001 Kalıp 185,00 ₺.

test.beforeEach(async ({ page }) => {
  await loginForCatalog(page);
});

function rows(page: Page): Locator {
  return page.locator("main").getByTestId(/^wik-row-/);
}

function rowOf(page: Page, pozNo: string): Locator {
  return rows(page).filter({ has: page.getByTestId("wik-poz").getByText(pozNo, { exact: true }) });
}

function editRow(page: Page): Locator {
  return page.locator('main [data-testid^="wik-edit-"]');
}

async function backendItems(page: Page): Promise<Json[]> {
  const response = await page.request.get("/api/backend/catalog/items");
  expect(response.ok()).toBe(true);
  return ((await response.json()) as { items: Json[] }).items;
}

async function disciplineIdOf(page: Page, code: string): Promise<string> {
  const response = await page.request.get("/api/backend/catalog/disciplines");
  const items = ((await response.json()) as { items: { id: string; code: string }[] }).items;
  const found = items.find((discipline) => discipline.code === code);
  expect(found, `${code} disiplini mock'ta yok`).toBeDefined();
  return found?.id ?? "";
}

test("liste yuklenir: poz no sirasi ve fiyat kolonlari", async ({ page }) => {
  await openWorkItemCatalog(page);

  const pozNos = await page.locator("main").getByTestId("wik-poz").allTextContents();
  expect(pozNos).toHaveLength(SEED_ITEM_COUNT);
  expect(pozNos[0]).toBe("DUV-0001");
  expect(pozNos[pozNos.length - 1]).toBe("MEK-0003");
  // Disiplin kodu, sonra sıra numarası (sayısal) — tohumdaki numaralar boşluksuz 0001'den.
  expect(pozNos).toEqual([...pozNos].sort((a, b) => a.localeCompare(b, "tr-TR")));

  await expect(page.getByRole("columnheader", { name: "Referans fiyat ₺" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Fiyat güncelleme" })).toBeVisible();
  const kalip = rowOf(page, "KAB-0001");
  await expect(kalip).toContainText("Kalıp");
  await expect(kalip).toContainText("185,00");
  await expect(kalip).toContainText("10.09.2026");
  const demir = rowOf(page, "KAB-0003");
  await expect(demir).toContainText("28.500,00");
  await expect(demir.locator(".wik-upd--stale")).toHaveText("10.12.2025");
  // Fiyatı olmayan kalem: referans fiyat ve güncelleme tarihi boş hücre.
  await expect(rowOf(page, "KAB-0002").locator(".wik-upd--stale")).toHaveCount(0);
  await expect(rowOf(page, "KAB-0001").locator(".wik-upd--stale")).toHaveCount(0);
});

test("arama poz no ve tarif uzerinde calisir", async ({ page }) => {
  await openWorkItemCatalog(page);
  const search = page.getByRole("searchbox", { name: "Poz no ya da tarif ara" });

  await search.fill("kab-0003");
  await expect(page.getByTestId("wik-count")).toContainText("1 kalem");
  await expect(rows(page)).toHaveCount(1);
  await expect(rowOf(page, "KAB-0003")).toContainText("Demir");

  await search.fill("TUĞLA");
  await expect(page.getByTestId("wik-count")).toContainText("1 kalem");
  await expect(rowOf(page, "DUV-0001")).toContainText("Tuğla duvar");

  await search.fill("mek-");
  await expect(page.getByTestId("wik-count")).toContainText("3 kalem");
  await expect(rows(page)).toHaveCount(3);

  await search.fill("yok-boyle-bir-kalem");
  await expect(page.getByText("Filtreye uyan kalem yok.")).toBeVisible();
});

test("disiplin cipi listeyi suzer ve tekrar tiklaninca tum disiplinlere doner", async ({ page }) => {
  await openWorkItemCatalog(page);
  const chip = page.getByRole("button", { name: /Mekanik Tesisat/ });

  await chip.click();
  await expect(chip).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("wik-count")).toContainText("3 kalem");
  await expect(rows(page)).toHaveCount(3);
  const pozNos = await page.locator("main").getByTestId("wik-poz").allTextContents();
  expect(pozNos.every((pozNo) => pozNo.startsWith("MEK-"))).toBe(true);

  await page.getByRole("button", { name: /Tüm disiplinler/ }).click();
  await expect(page.getByTestId("wik-count")).toContainText(`${SEED_ITEM_COUNT} kalem`);
});

test("yeni kalem: Otomatik poz, govdede poz_no YOK, toast sunucu poz no'sunu basar", async ({ page }) => {
  const fake = await installFakeCatalogServer(page);
  const kabId = await disciplineIdOf(page, "KAB");
  await openWorkItemCatalog(page);

  await page.getByRole("button", { name: "+ Kalem Ekle" }).click();
  const row = editRow(page);
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("Otomatik");
  await row.getByLabel("Tarif").fill("Perde kalıbı");
  await row.getByLabel("Referans fiyat").fill("1.250,50");
  await row.getByLabel("A-s / birim").fill("0,9");
  await row.getByRole("button", { name: "Kaydet" }).click();

  await expect(page.locator(".wik-toast")).toHaveText(`${FAKE_ISSUED_POZ_NO} · Perde kalıbı kaydedildi`);
  expect(fake.postBodies).toHaveLength(1);
  expect(fake.postBodies[0]).toEqual({
    discipline_id: kabId,
    name: "Perde kalıbı",
    uom: "m³",
    ref_price: "1250.50",
    standard_unit_mhr: "0.9",
    default_contractor_type: "own",
  });
  expect(fake.postBodies[0]).not.toHaveProperty("poz_no");
  // Liste sunucu yanıtıyla tazelendi: yeni satır sunucunun numarasıyla, fiyat güncelleme "bugün".
  await expect(page.getByTestId("wik-count")).toContainText(`${SEED_ITEM_COUNT + 1} kalem`);
  const created = rowOf(page, FAKE_ISSUED_POZ_NO);
  await expect(created).toContainText("1.250,50");
  await expect(created).toContainText(FAKE_SERVER_TODAY_TEXT);

  // Mock'a YAZILMADI.
  const stored = await backendItems(page);
  expect(stored.some((item) => item.name === "Perde kalıbı" || item.poz_no === FAKE_ISSUED_POZ_NO)).toBe(false);
});

test("duzenle: referans fiyat degisince Fiyat guncelleme bugune doner, PATCH yalniz degisen alani tasir", async ({
  page,
}) => {
  const fake = await installFakeCatalogServer(page);
  await openWorkItemCatalog(page);
  const demir = rowOf(page, "KAB-0003");
  await expect(demir.locator(".wik-upd--stale")).toHaveText("10.12.2025");

  await page.getByRole("button", { name: "KAB-0003 · Demir düzenle" }).click();
  const row = editRow(page);
  await expect(row).toHaveCount(1);
  await expect(row.getByTestId("wik-poz")).toHaveText("KAB-0003");
  await row.getByLabel("Referans fiyat").fill("29.000,00");
  await row.getByRole("button", { name: "Kaydet" }).click();

  await expect(page.locator(".wik-toast")).toHaveText("KAB-0003 · Demir kaydedildi");
  expect(fake.patchCalls).toEqual([{ id: expect.any(String), body: { ref_price: "29000.00" } }]);
  expect(fake.patchCalls[0]?.body).not.toHaveProperty("poz_no");
  await expect(editRow(page)).toHaveCount(0);
  const updated = rowOf(page, "KAB-0003");
  await expect(updated).toContainText("29.000,00");
  await expect(updated).toContainText(FAKE_SERVER_TODAY_TEXT);
  await expect(updated.locator(".wik-upd--stale")).toHaveCount(0);

  // Mock'a YAZILMADI: referans fiyat ve eski tarih yerinde.
  const stored = (await backendItems(page)).find((item) => item.poz_no === "KAB-0003");
  expect(stored?.ref_price).toBe("28500.00");
  expect(String(stored?.price_updated_at)).toContain("2025-12-10");
});

test("duzenle: yalniz tarif degisirse fiyat guncelleme tarihi KORUNUR", async ({ page }) => {
  const fake = await installFakeCatalogServer(page);
  await openWorkItemCatalog(page);

  await page.getByRole("button", { name: "KAB-0003 · Demir düzenle" }).click();
  await editRow(page).getByLabel("Tarif").fill("Nervürlü demir");
  await editRow(page).getByRole("button", { name: "Kaydet" }).click();

  await expect(page.locator(".wik-toast")).toHaveText("KAB-0003 · Nervürlü demir kaydedildi");
  expect(fake.patchCalls.map((call) => call.body)).toEqual([{ name: "Nervürlü demir" }]);
  const updated = rowOf(page, "KAB-0003");
  await expect(updated).toContainText("Nervürlü demir");
  await expect(updated.locator(".wik-upd--stale")).toHaveText("10.12.2025");
  expect((await backendItems(page)).some((item) => item.name === "Nervürlü demir")).toBe(false);
});

test("409 ad+birim cakismasi sunucu metniyle satirda kalir, satir acik, yazma yok", async ({ page }) => {
  const fake = await installFakeCatalogServer(page);
  await openWorkItemCatalog(page);

  // Varsayılan disiplin = ilk disiplin (KAB); "Kalıp" m² zaten var.
  await page.getByRole("button", { name: "+ Kalem Ekle" }).click();
  const row = editRow(page);
  await row.getByLabel("Tarif").fill("Kalıp");
  await row.getByLabel("Birim", { exact: true }).selectOption("m²");
  await row.getByLabel("Referans fiyat").fill("190,00");
  await row.getByLabel("A-s / birim").fill("0,85");
  await row.getByRole("button", { name: "Kaydet" }).click();

  await expect(row).toContainText("bu disiplinde aynı ad ve birimle bir iş tipi zaten var");
  await expect(row).toContainText("«Kalıp» (m²)");
  await expect(editRow(page)).toHaveCount(1);
  await expect(page.locator(".wik-toast")).toHaveCount(0);
  expect(fake.postBodies).toHaveLength(1);
  // Açık yeni satır listenin parçasıdır ve "N kalem"e girer (mockup KIK:277-279, TKL-F1.3.1
  // madde 12); 409 sonrası satır açık kaldığı için sayı tohum + 1 — sunucuya kayıt EKLENMEDİ.
  await expect(page.getByTestId("wik-count")).toContainText(`${SEED_ITEM_COUNT + 1} kalem`);
});

test("istemci dogrulamasi: bos tarif istek GONDERMEDEN satir hatasi verir", async ({ page }) => {
  const fake = await installFakeCatalogServer(page);
  await openWorkItemCatalog(page);

  await page.getByRole("button", { name: "+ Kalem Ekle" }).click();
  await editRow(page).getByRole("button", { name: "Kaydet" }).click();

  await expect(editRow(page)).toContainText("Tarif zorunlu");
  expect(fake.postBodies).toHaveLength(0);
});

test("view rolunde yazma yuzeyi YOK: Kalem Ekle ve Duzenle gizli, salt okunur serit", async ({ page }) => {
  const fake = await installFakeCatalogServer(page);
  await withContractsLevel(page, "view");
  await openWorkItemCatalog(page);

  await expect(page.getByRole("note")).toContainText("Görüntüleyici · yalnız okuma");
  await expect(page.getByRole("button", { name: "+ Kalem Ekle" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /düzenle$/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "+ Disiplin ekle" })).toHaveCount(0);
  expect(fake.postBodies).toHaveLength(0);
  expect(fake.patchCalls).toHaveLength(0);
});
