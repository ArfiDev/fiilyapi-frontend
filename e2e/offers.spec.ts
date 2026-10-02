import { test, expect, type Page } from "@playwright/test";

import { login } from "./earned-value-helpers";
import { installFakeOffersServer, type FakeOffersServer } from "./offers-fake-server";

// TKL-F3.8 · Teklif Hazırlama fonksiyonel e2e.
//
// 🔴 MOCK'A YAZMAZ: `/offers*` TÜM istekleri `offers-fake-server.ts` ile sayfaya özel bir durumda
// yanıtlanır (paylaşılan mock `fullyParallel` altında oynamaz); gövde iddiaları sahte sunucunun kayıtlarından.
// Her test bağımsızdır, `getByRole("alert")` kullanılmaz, bekleme durum tabanlıdır (`expect`/`expect.poll`).

const LIST_URL = "/teklif-hazirlama";
const NEW_URL = "/teklif-hazirlama/yeni";
const NEW_TITLE = "E2E Konut Bloğu Kaba İnşaat";
const SECOND_COST = "2000";
const FIRST_COST = "1250";
const QUANTITY_A = "10";
const QUANTITY_B = "4";
const NOTE_TEXT = "E2E notu";
const LOSE_REASON = "Rakip daha ucuz";
const WINNING_AMOUNT = "1500000";

type Json = Record<string, unknown>;

async function setUp(page: Page): Promise<FakeOffersServer> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  return installFakeOffersServer(page);
}

async function readCatalogPozNos(page: Page): Promise<string[]> {
  const response = await page.request.get("/api/backend/catalog/items");
  expect(response.ok()).toBe(true);
  const items = ((await response.json()) as { items: Array<{ poz_no: string }> }).items;
  return items.map((item) => item.poz_no);
}

async function createOfferFromForm(page: Page): Promise<string> {
  await page.goto(NEW_URL);
  await expect(page.getByRole("heading", { level: 1, name: "Yeni Teklif" })).toBeVisible();
  await page.getByLabel("İşveren", { exact: true }).selectOption({ index: 1 });
  await page.getByLabel("İş adı").fill(NEW_TITLE);
  await page.getByRole("button", { name: "Teklifi oluştur ve kalemlere geç →" }).click();
  await expect(page).toHaveURL(/\/teklif-hazirlama\/[0-9a-f-]{36}$/);
  const offerId = new URL(page.url()).pathname.split("/").pop() ?? "";
  await expect(page.getByRole("heading", { level: 1 })).toContainText(NEW_TITLE);
  return offerId;
}

function lastOf<T>(list: readonly T[]): T {
  return list[list.length - 1] as T;
}

function pathEndsWith(call: { path: string }, tail: string): boolean {
  return call.path.endsWith(tail);
}

async function addTwoItemsViaPicker(page: Page, server: FakeOffersServer): Promise<readonly [string, string]> {
  const [pozA, pozB] = await readCatalogPozNos(page);
  if (pozA === undefined || pozB === undefined) throw new Error("katalogta en az iki kalem gerekir");
  await page.getByRole("button", { name: "+ Katalogdan Ekle" }).click();
  const picker = page.getByRole("dialog", { name: "Katalogdan Kalem Ekle" });
  await expect(picker).toBeVisible();
  // Grupsuz revizyon: seçici "yeni grup" adımını açar (grup adı zorunlu).
  await picker.getByLabel("Grup Adı").fill("A — Kaba İşler");
  await picker.getByLabel(`${pozA} miktar`).fill(QUANTITY_A);
  await picker.getByLabel(`${pozB} miktar`).fill(QUANTITY_B);
  await expect(picker.getByTestId("wip-selected")).toHaveText("2");
  await picker.getByRole("button", { name: "2 Kalemi Ekle" }).click();
  await expect(picker).toHaveCount(0);
  expect(server.bulkBodies).toHaveLength(1);
  return [pozA, pozB];
}

async function commitCell(page: Page, label: string, value: string): Promise<void> {
  const cell = page.getByLabel(label, { exact: true });
  await cell.fill(value);
  await cell.press("Tab");
}

test("yeni teklif → seçiciyle 2 kalem → maliyet/B.F. → kaydet → gönder → yeni rev → kaybedildi", async ({ page }) => {
  const server = await setUp(page);
  const offerId = await createOfferFromForm(page);

  // POST /offers gövdesi: price_escalation AÇIK, payment_terms YOK.
  expect(server.createBodies).toHaveLength(1);
  const created = lastOf(server.createBodies) as Json;
  expect(created.price_escalation).toBe("fixed");
  expect(created).not.toHaveProperty("payment_terms");
  expect(created.title).toBe(NEW_TITLE);
  expect(typeof created.employer_id).toBe("string");

  const [pozA, pozB] = await addTwoItemsViaPicker(page, server);
  // Toplu ekleme gövdesi: 2 kalem, DOKUNULMAMIŞ maliyet gövdede YOK (sunucu öneriyi türetir).
  const bulk = lastOf(server.bulkBodies) as { items: Json[] };
  expect(bulk.items).toHaveLength(2);
  for (const entry of bulk.items) expect(entry).not.toHaveProperty("cost_unit_price");

  // Maliyet B.F. (ve ikinci kalemde elle teklif B.F.) — hücre blur'ünde PATCH.
  await commitCell(page, `${pozA} maliyet B.F.`, FIRST_COST);
  await commitCell(page, `${pozB} maliyet B.F.`, SECOND_COST);
  await expect.poll(() => server.patchCalls.filter((call) => call.path.includes("/items/")).length).toBe(2);
  const itemPatch = server.patchCalls.find((call) => call.path.includes("/items/")) as { body: Json | null };
  expect(Number(itemPatch.body?.cost_unit_price)).toBe(Number(FIRST_COST));
  await commitCell(page, `${pozB} teklif B.F.`, "2600");
  await expect.poll(() => server.patchCalls.filter((call) => call.path.includes("/items/")).length).toBe(3);
  const manual = lastOf(server.patchCalls) as { body: Json | null };
  expect(Number(manual.body?.offer_unit_price)).toBe(2600);

  // Taslak Kaydet: künye/koşul değişikliği → teklif + revizyon PATCH'i.
  await page.getByLabel("Notlar").fill(NOTE_TEXT);
  await page.getByRole("button", { name: "Taslak Kaydet" }).click();
  await expect.poll(() => server.patchCalls.some((call) => pathEndsWith(call, "/revisions/0"))).toBe(true);
  const revisionPatch = server.patchCalls.find((call) => pathEndsWith(call, "/revisions/0")) as { body: Json | null };
  expect(revisionPatch.body?.notes).toBe(NOTE_TEXT);

  // Gönder (fiyatsız kalem yok → onaysız) → Yeni Revizyon.
  await page.getByRole("button", { name: "Gönderildi İşaretle" }).click();
  await expect.poll(() => server.transitionCalls.map((call) => call.action)).toEqual(["send"]);
  await page.getByRole("button", { name: "Yeni Revizyon" }).click();
  await expect.poll(() => server.calls.some((call) => call.method === "POST" && pathEndsWith(call, `/${offerId}/revisions`))).toBe(true);

  // Rev.1 taslak → gönder → Kaybedildi (neden + kazanan tutar T30).
  await expect(page).toHaveURL(/rev=1/);
  await page.getByRole("button", { name: "Gönderildi İşaretle" }).click();
  await expect.poll(() => server.transitionCalls.map((call) => call.action)).toEqual(["send", "send"]);
  await page.getByRole("button", { name: "Kaybedildi" }).click();
  const modal = page.getByRole("dialog", { name: "Kaybedildi olarak işaretle" });
  await modal.getByLabel("Kayıp nedeni (isteğe bağlı)").fill(LOSE_REASON);
  await modal.getByLabel("Kazanan teklif tutarı (isteğe bağlı, KDV hariç ₺)").fill(WINNING_AMOUNT);
  await modal.getByRole("button", { name: "Kaybedildi İşaretle" }).click();
  await expect.poll(() => server.transitionCalls.map((call) => call.action)).toEqual(["send", "send", "lose"]);
  const lose = lastOf(server.transitionCalls).body as Json;
  expect(lose.lost_reason).toBe(LOSE_REASON);
  expect(Number(lose.winning_amount)).toBe(Number(WINNING_AMOUNT));
  expect(server.state().revisions.filter((rev) => rev.offerId === offerId).map((rev) => rev.status)).toEqual(["sent", "lost"]);
});

const DRAFT_OFFER_NO = "TKL-2026-0004";
const FIRST_DAY_OF_LAST_MONTH_TEXT = "01.10.2026";
const CATALOG_URL = "/planlama/is-kalemi-katalogu";

async function openSeedOffer(page: Page, offerNo: string): Promise<void> {
  await page.goto(LIST_URL);
  await page.getByTestId(`offers-row-${offerNo}`).getByRole("link", { name: offerNo }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(offerNo);
}

test("ikinci teklif: gönder (fiyatsız onayı) → kazanıldı → katalog son fiyatında Teklif kaynağı", async ({ page }) => {
  const server = await setUp(page);
  await openSeedOffer(page, DRAFT_OFFER_NO);

  await page.getByRole("button", { name: "Gönderildi İşaretle" }).click();
  const sendDialog = page.getByRole("dialog", { name: "Gönderildi olarak işaretle" });
  await expect(sendDialog).toContainText("1 kalemde fiyat yok");
  await sendDialog.getByRole("button", { name: "Gönderildi İşaretle" }).click();
  await expect.poll(() => server.transitionCalls.map((call) => call.action)).toEqual(["send"]);

  await page.getByRole("button", { name: "Kazanıldı…" }).click();
  const winDialog = page.getByRole("dialog", { name: "Kazanıldı olarak işaretle" });
  await winDialog.getByRole("button", { name: "Kazanıldı", exact: true }).click();
  await expect.poll(() => server.transitionCalls.map((call) => call.action)).toEqual(["send", "win"]);
  const offer = server.state().offers.find((entry) => entry.offerNo === DRAFT_OFFER_NO);
  const wonRevision = server.state().revisions.find((rev) => rev.offerId === offer?.id);
  expect(wonRevision?.status).toBe("won");

  // Sağlayıcı (backend) kazanılan revizyonun maliyet B.F.'sini TKL kaynağı yapar: ekran "Teklif" etiketini basar.
  const wonItem = server.state().items.find((item) => item.revisionId === wonRevision?.id && item.costUnitPrice !== null);
  if (wonItem === undefined) throw new Error("kazanılan tekliste fiyatlı kalem yok");
  await page.route("**/api/backend/catalog/items", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const response = await route.fetch();
    const body = (await response.json()) as { items: Json[] };
    const patched = body.items.map((item) =>
      item.id === wonItem.catalogItemId
        ? { ...item, last_price: { price: wonItem.costUnitPrice, at: "2026-09-24T09:00:00Z", source: "TKL", doc_no: `${DRAFT_OFFER_NO} Rev.0`, doc_id: offer?.id ?? "offer" } }
        : item,
    );
    return route.fulfill({ response, json: { items: patched } });
  });
  await page.goto(CATALOG_URL);
  await expect(page.getByText(new RegExp(`Teklif · ${DRAFT_OFFER_NO}`)).first()).toBeVisible();
});

test("liste: tarih süzgeci satırları daraltır, PDF menüsü doğru yazdırma rotasını açar", async ({ page }) => {
  await setUp(page);
  await page.goto(LIST_URL);
  const count = page.getByTestId("offers-count");
  await expect(count).toContainText("7");
  await page.getByRole("textbox", { name: "Başlangıç tarihi" }).fill(FIRST_DAY_OF_LAST_MONTH_TEXT);
  await expect(count).toContainText("1");
  await expect(page.getByTestId("offers-row-TKL-2026-0007")).toBeVisible();
  await expect(page.getByTestId(`offers-row-${DRAFT_OFFER_NO}`)).toHaveCount(0);
  await page.getByRole("button", { name: "Filtreleri temizle" }).click();
  await expect(count).toContainText("7");

  await openSeedOffer(page, DRAFT_OFFER_NO);
  await page.getByRole("button", { name: "PDF", exact: true }).click();
  const menu = page.getByRole("dialog", { name: "PDF çıktısı" });
  await expect(menu.getByRole("link", { name: "İşveren teklifi" })).toHaveAttribute("href", /\/yazdir\?.*tur=isveren/);
  await expect(menu.getByRole("link", { name: "İç döküm (maliyet + kâr)" })).toHaveAttribute("href", /\/yazdir\?.*tur=ic/);
});

// ------------------------------------------------------------------------------------ TKL-F4.8

const COPY_SOURCE_NO = "TKL-2026-0002";
const COPY_SOURCE_SEARCH = "Duvar ve Sıva";
const COPY_TITLE = "E2E Kopya Teklif";

async function sourceItemPozNos(page: Page, offerNo: string): Promise<string[]> {
  const list = await page.request.get(`/api/backend/offers?q=${offerNo}`);
  const offerId = ((await list.json()) as { items: Array<{ id: string; offer_no: string }> }).items.find((item) => item.offer_no === offerNo)?.id;
  if (offerId === undefined) throw new Error(`tohum teklif yok: ${offerNo}`);
  const revision = await page.request.get(`/api/backend/offers/${offerId}/revisions/0`);
  const body = (await revision.json()) as { groups: Array<{ items: Array<{ poz_no: string }> }> };
  return body.groups.flatMap((group) => group.items.map((item) => item.poz_no));
}

test("kopyadan teklif: Mevcut tekliften kopyala → ara → seç → oluştur → detayda kaynağın kalemleri", async ({ page }) => {
  const server = await setUp(page);
  const pozNos = await sourceItemPozNos(page, COPY_SOURCE_NO);
  expect(pozNos.length).toBeGreaterThan(0);

  await page.goto(NEW_URL);
  await expect(page.getByRole("heading", { level: 1, name: "Yeni Teklif" })).toBeVisible();
  await page.getByRole("radio", { name: /^Mevcut tekliften kopyala/ }).click();
  await page.getByRole("searchbox", { name: "Teklif no, iş adı ya da işveren ara" }).fill(COPY_SOURCE_SEARCH);
  const source = page.getByRole("radio", { name: new RegExp(COPY_SOURCE_NO) });
  await expect(source).toHaveCount(1);
  await source.click();
  await expect(source).toBeChecked();
  await page.getByLabel("İşveren", { exact: true }).selectOption({ index: 1 });
  await page.getByLabel("İş adı").fill(COPY_TITLE);
  await page.getByRole("button", { name: "Teklifi oluştur ve kalemlere geç →" }).click();
  await expect(page).toHaveURL(/\/teklif-hazirlama\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(COPY_TITLE);

  expect(server.createBodies).toHaveLength(1);
  expect(typeof (server.createBodies[0] as Json).copy_from).toBe("object");
  for (const poz of pozNos) await expect(page.getByLabel(`${poz} kalemi sil`)).toBeVisible();
  await expect(page.getByLabel(/ kalemi sil$/)).toHaveCount(pozNos.length);
});

/** İndirmeyi + `view` parametreli isteği birlikte yakalar (istek `page.on("request")` ile; sahte sunucu durumuna bakılmaz). */
async function downloadWith(page: Page, trigger: () => Promise<void>): Promise<{ filename: string; url: URL }> {
  const requestPromise = page.waitForRequest((request) => /\/export(\?|$)/.test(request.url()));
  const downloadPromise = page.waitForEvent("download");
  await trigger();
  const [request, download] = await Promise.all([requestPromise, downloadPromise]);
  return { filename: download.suggestedFilename(), url: new URL(request.url()) };
}

test("Excel: detay Excel ▾ işveren/iç · liste satır menüsü · katalog 'Excel İndir' → dosya adı + view parametresi", async ({ page }) => {
  await setUp(page);
  await openSeedOffer(page, COPY_SOURCE_NO);

  // Detay: işveren teklifi / iç döküm.
  await page.getByRole("button", { name: "Excel", exact: true }).click();
  const employer = await downloadWith(page, () => page.getByRole("button", { name: "İşveren teklifi (.xlsx)" }).click());
  expect(employer.filename).toBe(`${COPY_SOURCE_NO}-Rev0-isveren.xlsx`);
  expect(employer.url.searchParams.get("view")).toBe("employer");

  await expect(page.getByRole("button", { name: "Excel", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Excel", exact: true }).click();
  const internal = await downloadWith(page, () => page.getByRole("button", { name: "İç döküm (maliyet + kâr)" }).click());
  expect(internal.filename).toBe(`${COPY_SOURCE_NO}-Rev0-ic.xlsx`);
  expect(internal.url.searchParams.get("view")).toBe("internal");

  // Liste satır menüsü: işveren görünümü.
  await page.goto(LIST_URL);
  await expect(page.getByTestId(`offers-row-${COPY_SOURCE_NO}`)).toBeVisible();
  await page.getByRole("button", { name: `${COPY_SOURCE_NO} işlemleri` }).click();
  const row = await downloadWith(page, () => page.getByRole("button", { name: "Excel indir" }).click());
  expect(row.filename).toBe(`${COPY_SOURCE_NO}-Rev0-isveren.xlsx`);
  expect(row.url.searchParams.get("view")).toBe("employer");

  // Katalog: "Excel İndir" (view parametresi YOK, katalog uç adı).
  await page.goto(CATALOG_URL);
  await expect(page.getByRole("heading", { level: 1, name: "İş Kalemi Kataloğu" })).toBeVisible();
  const catalog = await downloadWith(page, () => page.getByRole("button", { name: "Excel İndir" }).click());
  expect(catalog.url.pathname).toMatch(/\/catalog\/items\/export$/);
  expect(catalog.url.searchParams.has("view")).toBe(false);
  expect(catalog.filename).toMatch(/\.xlsx$/);
});
