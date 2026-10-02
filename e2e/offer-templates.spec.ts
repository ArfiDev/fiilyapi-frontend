import { test, expect, type Locator, type Page } from "@playwright/test";

import { login } from "./earned-value-helpers";
import { installFakeOffersServer, type FakeOffersServer } from "./offers-fake-server";

// TKL-F4.8 · Teklif ŞABLONLARI fonksiyonel e2e (F4.5 ekran + F4.6 seçici + F4.7 başlangıçlar).
//
// 🔴 MOCK'A YAZMAZ: `/offers*` (şablon uçları dahil) `offers-fake-server.ts` ile sayfaya özel durumda yanıtlanır;
// iddialar EKRANDAN ve gönderilen isteklerden yapılır (sahte sunucu durumuna test yazılmaz). `getByRole("alert")`
// yok, sabit bekleme yok: her adım ekranda görünen sonuca `expect` ile beklenir.

const TEMPLATES_URL = "/teklif-hazirlama/sablonlar";
const DEFAULT_TEMPLATE = "Kaba İnşaat Standart";
const ELECTRIC_TEMPLATE = "Elektrik Tesisatı";
const PLASTER_TEMPLATE = "İnce İşler — Sıva";
const DEFAULT_TEMPLATE_ITEM_COUNT = 4;
const COPY_SOURCE_OFFER = "TKL-2026-0004";
const NEW_GROUP_LABEL = "Yeni grup";
const RENAMED_GROUP = "Özel İşler";
const SEED_QUANTITY = "12";

type Json = Record<string, unknown>;

async function setUp(page: Page): Promise<FakeOffersServer> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  return installFakeOffersServer(page);
}

async function openTemplates(page: Page): Promise<void> {
  await page.goto(TEMPLATES_URL);
  await expect(page.getByRole("heading", { level: 1, name: "Teklif Şablonları" })).toBeVisible();
  await expect(card(page, DEFAULT_TEMPLATE)).toBeVisible();
}

/** Şablon kartı (liste düğmesi); ad kartın içinde kısmi eşleşir ("VARSAYILAN" rozeti vb. de adın parçası olur).
 *  Liste bölgesine daraltılır: ayrıntı kartındaki ad düğmesi de aynı adı taşır. */
function card(page: Page, name: string): Locator {
  return page.getByRole("region", { name: "Şablon listesi" }).getByRole("button", { name: new RegExp(`^${name}`) });
}

function selectedCard(page: Page, name: string): Locator {
  return page.getByRole("region", { name: "Şablon listesi" }).getByRole("button", { name: new RegExp(`^${name}`), pressed: true });
}

function toast(page: Page): Locator {
  return page.locator(".offers-toast");
}

async function readJson<T>(page: Page, path: string): Promise<T> {
  const response = await page.request.get(`/api/backend${path}`);
  expect(response.ok(), `${path} okunamadı`).toBe(true);
  return (await response.json()) as T;
}

async function disciplineNames(page: Page): Promise<string[]> {
  return (await readJson<{ items: Array<{ name: string }> }>(page, "/catalog/disciplines")).items.map((item) => item.name);
}

async function catalogPozByName(page: Page): Promise<Map<string, string>> {
  const { items } = await readJson<{ items: Array<{ name: string; poz_no: string }> }>(page, "/catalog/items");
  return new Map(items.map((item) => [item.name, item.poz_no]));
}

function groupRow(page: Page, name: string): Locator {
  return page.locator("tr.otpl-group").filter({ has: page.getByText(name, { exact: true }) });
}

async function openCreateModal(page: Page, trigger: string) {
  await page.getByRole("button", { name: trigger, exact: true }).click();
  const modal = page.getByRole("dialog", { name: "Yeni Şablon" });
  await expect(modal).toBeVisible();
  return modal;
}

async function submitCreate(page: Page, modal: Locator): Promise<void> {
  await modal.getByRole("button", { name: "Şablonu Oluştur" }).click();
  await expect(modal).toHaveCount(0);
}

test("şablon oluştur ×3 kaynak: Boş + başlangıç grupları · Bir tekliften · Şablondan kopyala → yeni şablon seçili + toast", async ({ page }) => {
  await setUp(page);
  await openTemplates(page);
  const [firstGroup, secondGroup] = await disciplineNames(page);
  if (firstGroup === undefined || secondGroup === undefined) throw new Error("katalogta en az iki disiplin gerekir");

  // 1) Boş + başlangıç grupları (disiplin çipleri; seçim sırası = A, B).
  const blank = await openCreateModal(page, "+ Yeni Şablon");
  await blank.getByLabel("Şablon adı").fill("E2E Boş Şablon");
  await blank.getByRole("button", { name: `+ ${firstGroup}`, exact: true }).click();
  await blank.getByRole("button", { name: `+ ${secondGroup}`, exact: true }).click();
  await submitCreate(page, blank);
  await expect(toast(page)).toHaveText("E2E Boş Şablon şablonu oluşturuldu");
  await expect(selectedCard(page, "E2E Boş Şablon")).toBeVisible();
  await expect(page.locator("tr.otpl-group")).toHaveCount(2);
  await expect(groupRow(page, firstGroup)).toBeVisible();

  // 2) Bir tekliften (kalemler + gruplar alınır, miktar/fiyat alınmaz).
  const fromOffer = await openCreateModal(page, "Tekliften şablon oluştur");
  await fromOffer.getByLabel("Şablon adı").fill("E2E Tekliften Şablon");
  await fromOffer.getByRole("radio", { name: new RegExp(COPY_SOURCE_OFFER) }).click();
  await submitCreate(page, fromOffer);
  await expect(toast(page)).toHaveText(`${COPY_SOURCE_OFFER} kalemlerinden şablon oluşturuldu · miktarlar alınmadı`);
  await expect(selectedCard(page, "E2E Tekliften Şablon")).toBeVisible();
  await expect(page.locator("tr.otpl-group").first()).toBeVisible();

  // 3) Şablondan kopyala.
  const fromTemplate = await openCreateModal(page, "+ Yeni Şablon");
  await fromTemplate.getByLabel("Şablon adı").fill("E2E Kopya Şablon");
  await fromTemplate.getByRole("radio", { name: "Şablondan kopyala" }).click();
  await fromTemplate.getByRole("radio", { name: new RegExp(`^${ELECTRIC_TEMPLATE} · 3 kalem`) }).click();
  await submitCreate(page, fromTemplate);
  await expect(toast(page)).toHaveText("E2E Kopya Şablon şablonu oluşturuldu");
  await expect(selectedCard(page, "E2E Kopya Şablon")).toBeVisible();
  await expect(page.locator("tr.otpl-group")).toHaveCount(2);
  await expect(groupRow(page, "Elektrik")).toBeVisible();
});

test("içerik düzenle: + Grup → yeniden adlandır → katalogdan BELİRLİ gruba ekle → kalem × → boş grup ×", async ({ page }) => {
  const server = await setUp(page);
  await openTemplates(page);
  const blank = await openCreateModal(page, "+ Yeni Şablon");
  await blank.getByLabel("Şablon adı").fill("E2E İçerik Şablonu");
  await submitCreate(page, blank);
  await expect(selectedCard(page, "E2E İçerik Şablonu")).toBeVisible();
  const pozByName = await catalogPozByName(page);
  const poz = pozByName.get("Kalıp");
  if (poz === undefined) throw new Error("katalogta 'Kalıp' yok");

  // + Grup ("Yeni grup") → yeniden adlandır.
  await page.getByRole("button", { name: "+ Grup", exact: true }).click();
  await expect(groupRow(page, NEW_GROUP_LABEL)).toBeVisible();
  await groupRow(page, NEW_GROUP_LABEL).getByRole("button", { name: NEW_GROUP_LABEL }).click();
  await page.getByLabel("Grup adı").fill(RENAMED_GROUP);
  await page.getByLabel("Grup adı").press("Enter");
  await expect(groupRow(page, RENAMED_GROUP)).toBeVisible();

  // İkinci grup: seçici hedefi SON gruptan farklı seçilebilmeli.
  await page.getByRole("button", { name: "+ Grup", exact: true }).click();
  await expect(groupRow(page, NEW_GROUP_LABEL)).toBeVisible();

  await page.getByRole("button", { name: "+ Katalogdan Ekle" }).click();
  const picker = page.getByRole("dialog", { name: "Katalogdan Kalem Ekle" });
  await expect(picker).toBeVisible();
  await picker.getByLabel("Grup", { exact: true }).selectOption({ label: RENAMED_GROUP });
  await picker.getByLabel(`${poz} seç`).check();
  await expect(picker.getByTestId("wip-selected")).toHaveText("1");
  await picker.getByRole("button", { name: "1 Kalemi Ekle" }).click();
  await expect(picker).toHaveCount(0);

  // Kalem SEÇİLEN grupta (yeniden adlandırılan ilk grup), son grup boş kaldı.
  const renamed = groupRow(page, RENAMED_GROUP);
  await expect(renamed).toContainText("1 kalem");
  await expect(renamed.locator("xpath=following-sibling::tr[1]")).toContainText(poz);
  await expect(groupRow(page, NEW_GROUP_LABEL)).toContainText("0 kalem");

  // Tek PUT (tam değiştirme) gövdesi: seçilen grup kalemi taşır.
  const puts = server.calls.filter((call) => call.method === "PUT" && call.path.endsWith("/content"));
  const lastBody = puts[puts.length - 1]?.body as { groups: Array<{ name: string; items: Json[] }> } | null | undefined;
  expect(lastBody?.groups.find((group) => group.name === RENAMED_GROUP)?.items).toHaveLength(1);
  expect(lastBody?.groups.find((group) => group.name === NEW_GROUP_LABEL)?.items).toHaveLength(0);

  // Kalem × → grup boşalır; boş grup × ile silinir.
  await page.getByRole("button", { name: `Kalemi çıkar: ${poz}` }).click();
  await expect(renamed).toContainText("0 kalem");
  await groupRow(page, NEW_GROUP_LABEL).getByRole("button", { name: "Grubu sil" }).click();
  await expect(page.locator("tr.otpl-group")).toHaveCount(1);
});

test("varsayılan yap: VARSAYILAN rozeti taşınır · Sil → ilk şablona geçilir", async ({ page }) => {
  await setUp(page);
  await openTemplates(page);
  const badge = (name: string) => card(page, name).getByText("VARSAYILAN");
  await expect(badge(DEFAULT_TEMPLATE)).toBeVisible();
  await expect(badge(ELECTRIC_TEMPLATE)).toHaveCount(0);

  await card(page, ELECTRIC_TEMPLATE).click();
  await expect(selectedCard(page, ELECTRIC_TEMPLATE)).toBeVisible();
  await page.getByRole("button", { name: "Varsayılan yap" }).click();
  await expect(toast(page)).toHaveText(`${ELECTRIC_TEMPLATE} varsayılan şablon yapıldı`);
  await expect(badge(ELECTRIC_TEMPLATE)).toBeVisible();
  await expect(badge(DEFAULT_TEMPLATE)).toHaveCount(0);

  // Sil: seçili şablon (Sıva) silinir → listenin ilk şablonu (yeni varsayılan) seçilir.
  await card(page, PLASTER_TEMPLATE).click();
  await expect(selectedCard(page, PLASTER_TEMPLATE)).toBeVisible();
  await page.getByRole("button", { name: "Sil", exact: true }).click();
  const confirm = page.getByRole("dialog", { name: "Şablonu sil" });
  await expect(confirm).toContainText(PLASTER_TEMPLATE);
  await confirm.getByRole("button", { name: "Şablonu sil" }).click();
  await expect(toast(page)).toHaveText(`${PLASTER_TEMPLATE} silindi`);
  await expect(card(page, PLASTER_TEMPLATE)).toHaveCount(0);
  await expect(selectedCard(page, ELECTRIC_TEMPLATE)).toBeVisible();
});

test("şablondan teklif: oranlar şablondan → miktarsız uyarı + Gönder KAPALI (gerekçe) → miktarları gir → Gönder açık → gönder", async ({ page }) => {
  const server = await setUp(page);
  await openTemplates(page);
  await expect(selectedCard(page, DEFAULT_TEMPLATE)).toBeVisible();
  await page.getByRole("link", { name: "Bu şablonla teklif başlat →" }).click();

  // Yeni Teklif: "Şablondan" seçili, şablon önseçili, GG/Kâr şablondan (KDV ayardan).
  await expect(page).toHaveURL(/\/teklif-hazirlama\/yeni\?sablon=/);
  await expect(page.getByRole("heading", { level: 1, name: "Yeni Teklif" })).toBeVisible();
  await expect(page.getByRole("radio", { name: /^Şablondan/ })).toBeChecked();
  await expect(page.getByRole("radio", { name: new RegExp(`^${DEFAULT_TEMPLATE}`) })).toBeChecked();
  await expect(page.getByLabel("Genel gider", { exact: true })).toHaveValue("10");
  await expect(page.getByLabel("Kâr", { exact: true })).toHaveValue("18");
  await page.getByLabel("İşveren", { exact: true }).selectOption({ index: 1 });
  await page.getByLabel("İş adı").fill("E2E Şablondan Teklif");
  await page.getByRole("button", { name: "Teklifi oluştur ve kalemlere geç →" }).click();
  await expect(page).toHaveURL(/\/teklif-hazirlama\/[0-9a-f-]{36}$/);
  expect(server.createBodies).toHaveLength(1);
  expect(typeof (server.createBodies[0] as Json).template_id).toBe("string");

  // Detay: kalemler şablondan, miktarsız uyarı; Gönder kapalı + gerekçe.
  await expect(page.getByText(`${DEFAULT_TEMPLATE_ITEM_COUNT} kalemde miktar girilmedi`).first()).toBeVisible();
  const send = page.getByRole("button", { name: "Gönderildi İşaretle" });
  await expect(send).toBeDisabled();
  await expect(page.getByRole("list", { name: "Kapalı eylemlerin gerekçesi" })).toContainText("Miktarı girilmemiş kalem var");

  // Miktarları gir (hücre blur'ünde PATCH) → uyarı kalkar, Gönder açılır.
  const quantityCells = page.getByLabel(/ miktar$/);
  await expect(quantityCells).toHaveCount(DEFAULT_TEMPLATE_ITEM_COUNT);
  for (let index = 0; index < DEFAULT_TEMPLATE_ITEM_COUNT; index += 1) {
    const cell = quantityCells.nth(index);
    await cell.fill(SEED_QUANTITY);
    await cell.press("Tab");
  }
  await expect(page.getByText(/kalemde miktar girilmedi/)).toHaveCount(0);
  await expect(send).toBeEnabled();
  await send.click();
  await expect.poll(() => server.transitionCalls.map((call) => call.action)).toEqual(["send"]);
});

test("izin: yazamayan kullanıcı Şablonlar'ı düğmesiz görür", async ({ page }) => {
  await setUp(page);
  await page.route("**/api/auth/me", async (route) => {
    const response = await route.fetch();
    const me = (await response.json()) as Record<string, unknown>;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...me, permissions: { contracts: "view" } }) });
  });
  await openTemplates(page);
  await expect(page.getByText("Görüntüleyici · yalnız okuma")).toBeVisible();
  for (const name of ["+ Yeni Şablon", "Tekliften şablon oluştur", "Varsayılan yap", "Kopyala", "Sil", "+ Grup", "+ Katalogdan Ekle"]) {
    await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
  }
  await expect(page.getByRole("link", { name: "Bu şablonla teklif başlat →" })).toHaveCount(0);
});
