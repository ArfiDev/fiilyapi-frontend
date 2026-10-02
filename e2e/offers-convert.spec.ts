import { test, expect, type Page } from "@playwright/test";

import { openManHourBudget, MAN_HOUR_BUDGET_VIEWPORT } from "./earned-value-helpers";
import { itemTotal } from "./mock-offer-convert";
import {
  ITEM_ROWS,
  STEP1_DEFAULT,
  WON_OFFER_NO,
  centsOf,
  centsOfDecimal,
  createProject,
  editItems,
  fillStep1,
  goToConfirm,
  goToItems,
  openConvertScreen,
  setUpConvert,
  walkToConfirm,
  type ConvertHarness,
} from "./offers-convert-helpers";
import type { FakeCall } from "./offers-fake-server";
import { OFFERS_URL } from "./offers-helpers";

// TKL-F5.6 · Teklif → Proje DÖNÜŞTÜRME fonksiyonel e2e (plan §8 F5.6).
//
// 🔴 MOCK'A YAZMAZ: `/offers*` ve dönüştürme yazımı sayfaya özel (`offers-convert-fake.ts`); dönüştürmeyle doğan projenin
// okumaları yalnız bu sayfa için yanıtlanır. Yazan akışlar görsel karelerden AYRI dosyadadır. `getByRole("alert")` yok;
// bekleme durum tabanlıdır. Saat `login` içinde çakılır (24.09.2026).

type Json = Record<string, unknown>;
type ConvertBody = {
  project: Json;
  contract: Json;
  groups: Array<{ name: string; items: Array<{ code: string; quantity: string; unit_price: string }> }>;
  open_site?: boolean;
  site_name?: string;
};

const PROJECT_NAME = STEP1_DEFAULT.projectName ?? "";
const CONTRACT_NO_UPPER = "SZL-2026-İ01";
const MUST_BE_ONE = 1;
const CONVERT_PATH = /\/offers\/[^/]+\/convert$/;
const ALREADY_CONVERTED = "Teklif zaten dönüştürüldü";
const PROJECT_CODE_TAKEN = "Bu proje kodu zaten kullanılıyor";
const INTEGRITY_ERROR = "Veri bütünlüğü hatası";

const convertCalls = (harness: ConvertHarness): FakeCall[] => harness.server.calls.filter((call) => CONVERT_PATH.test(call.path));
const lastConvertBody = (harness: ConvertHarness): ConvertBody => {
  const call = convertCalls(harness).at(-1);
  if (call?.body === null || call === undefined) throw new Error("dönüştürme isteği yok");
  return call.body as unknown as ConvertBody;
};

/** Gövdedeki kalemlerden backend ikizinin (`itemTotal`: satır başı ROUND_HALF_UP) Σ'sı → kuruş. */
function bodyTotalCents(body: ConvertBody): bigint {
  const groups = body.groups.map((group) => ({
    name: group.name,
    items: group.items.map((item) => ({
      catalogItemId: "",
      offerItemId: null,
      code: item.code,
      description: "",
      unit: "",
      quantity: item.quantity,
      unitPrice: item.unit_price,
    })),
  }));
  return centsOfDecimal(itemTotal(groups));
}

async function summaryTotal(page: Page): Promise<bigint> {
  const text = await page.getByTestId("convert-summary").locator(".convert-sum__value--main").innerText();
  return centsOf(text);
}

async function openWonDetail(page: Page, offerId: string): Promise<void> {
  await page.goto(`${OFFERS_URL}/${offerId}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(WON_OFFER_NO);
}

test("kazanılmış teklif → Dönüştür → 3 adım → proje + sözleşme: ekran Σ = istek gövdesi Σ = sözleşme tutarı", async ({ page }) => {
  const harness = await setUpConvert(page);
  await openWonDetail(page, harness.offerId);
  await page.getByRole("link", { name: "Projeye Dönüştür →" }).click();
  await expect(page).toHaveURL(new RegExp(`/teklif-hazirlama/${harness.offerId}/donustur$`));
  await expect(page.getByTestId("convert-step-1")).toBeVisible();
  // Tarih: İstanbul bugünü (saat çakılı) başlangıç ve sözleşme tarihi tohumudur.
  await expect(page.getByTestId("convert-step-1").getByLabel("Başlangıç tarihi")).toHaveValue("24.09.2026");

  // Adım 1 — küçük harf yazılır, blur'da tr-TR büyük harf ("i" → "İ"; toUpperCase "I" üretirdi).
  await fillStep1(page);
  await page.getByTestId("convert-step-1").getByLabel("Sözleşme no").blur();
  await expect(page.getByTestId("convert-step-1").getByLabel("Sözleşme no")).toHaveValue(CONTRACT_NO_UPPER);
  await goToItems(page);

  // Adım 2 — çıkar · miktar · B.F. · katalogdan yeni kalem.
  await editItems(page);
  await expect(page.getByTestId("convert-step-2")).toContainText("3 dahil · 1 çıkarıldı · 2 değişti · 1 yeni");
  await expect(page.getByRole("row", { name: ITEM_ROWS.concrete })).toContainText("Çıkarıldı");
  const screenTotal = await summaryTotal(page);
  await goToConfirm(page);
  await expect(page.getByTestId("convert-summary-step3")).toContainText("Sözleşme tutarı");
  await createProject(page);

  // İstek gövdesi: çıkarılan kalem YOK, düzenlemeler var, `amount` GÖNDERİLMEZ (sunucu Σ'sı yazılır).
  expect(convertCalls(harness)).toHaveLength(MUST_BE_ONE);
  const body = lastConvertBody(harness);
  expect(body.project.name).toBe(PROJECT_NAME);
  expect(body.contract.contract_no).toBe(CONTRACT_NO_UPPER);
  expect(body.contract).not.toHaveProperty("amount");
  expect(body.open_site).toBe(true);
  const items = body.groups.flatMap((group) => group.items);
  expect(items.map((item) => item.code).sort()).toEqual(["KAB-0001", "KAB-0002", "KAB-0003"]);
  // Σ eşitliği: ekran özeti = backend ikizinin satır başı yuvarlamalı Σ'sı = sahte sunucunun yazdığı bedel.
  expect(bodyTotalCents(body)).toBe(screenTotal);
  const written = harness.local.created[0];
  expect(written).toBeDefined();
  expect(centsOfDecimal(written?.spec.contract.amount ?? "0")).toBe(screenTotal);

  // Başarı bandı + sözleşme: kalemler gruplu, tutar = ekran Σ.
  const done = page.getByTestId("convert-done");
  await expect(done).toContainText(`${written?.result.projectCode} · ${PROJECT_NAME}`);
  await expect(done).toContainText(CONTRACT_NO_UPPER);
  await done.getByRole("link", { name: "Sözleşmeyi aç →" }).click();
  await expect(page).toHaveURL(new RegExp(`/sozlesmeler/isveren/${written?.result.projectId}$`));
  await page.getByRole("link", { name: "İş Kalemleri" }).click();
  await expect(page.getByText("Kaba İnşaat", { exact: true }).first()).toBeVisible();
  for (const code of ["KAB-0001", "KAB-0002", "KAB-0003"]) await expect(page.getByLabel(`${code} poz no`)).toHaveValue(code);
  await expect(page.getByLabel("KAB-0004 poz no")).toHaveCount(0);
  expect(centsOf(await page.getByTestId("ecd-items-total").innerText())).toBe(screenTotal);

  // Teklif listesi: "Proje: {ad} →" bağlantısı; kazanılmış-dönüştürülmemiş sayacı düştü.
  await page.goto(OFFERS_URL);
  const row = page.getByTestId(`offers-row-${WON_OFFER_NO}`);
  await expect(row.getByRole("link", { name: `Proje: ${PROJECT_NAME} →` })).toBeVisible();
  await expect(row).not.toContainText("Kazanıldı · dönüştürülmedi");
  await expect(page.getByTestId("offers-card-convert")).toHaveCount(0);
});

test("dönüştürülmüş teklif: Dönüştür adresi 'Teklif zaten dönüştürüldü' kartı + 'Projeyi aç →'; detayda düğme yok", async ({ page }) => {
  const harness = await setUpConvert(page);
  await walkToConfirm(page, harness.offerId);
  await createProject(page);
  const written = harness.local.created[0];

  await page.goto(`${OFFERS_URL}/${harness.offerId}/donustur`);
  await expect(page.getByText(ALREADY_CONVERTED, { exact: true })).toBeVisible();
  await expect(page.getByText(`${written?.result.projectCode} · ${PROJECT_NAME}`)).toBeVisible();
  await expect(page.getByRole("link", { name: "Projeyi aç →" })).toHaveAttribute("href", new RegExp(`/projeler/${written?.result.projectSlug}$`));

  await openWonDetail(page, harness.offerId);
  await expect(page.getByRole("link", { name: "Projeye Dönüştür →" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Projeye Dönüştür →" })).toHaveCount(0);
});

test("başkası aynı teklifi dönüştürmüş (409 zaten dönüştürüldü) → ekran dönüştürülmüş duruma geçer", async ({ page }) => {
  const harness = await setUpConvert(page);
  await walkToConfirm(page, harness.offerId);
  // Başka yönetici dönüştürdü: sahte sunucunun (sayfaya özel) durumunda teklif proje bağlı hâle gelir.
  const state = harness.server.state();
  state.offers = state.offers.map((offer) =>
    offer.id === harness.offerId
      ? {
          ...offer,
          projectId: "p-other",
          convertedAt: "2026-09-24T05:00:00.000Z",
          convertedByUserId: offer.preparedByUserId,
          project: { id: "p-other", code: "PRJ-2026-901", name: "Başka Yönetici Projesi", slug: "baska-yonetici-projesi" },
        }
      : offer,
  );
  await page.getByRole("button", { name: "Projeyi ve Sözleşmeyi Oluştur" }).click();
  await expect(page.getByText(ALREADY_CONVERTED, { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Projeyi aç →" })).toHaveAttribute("href", /\/projeler\/baska-yonetici-projesi$/);
  expect(harness.local.created).toHaveLength(0);
});

test("yetkisiz (projects: full) → detayda pasif 'Projeye Dönüştür' + gerekçe; Dönüştür adresi erişim reddi", async ({ page }) => {
  const harness = await setUpConvert(page);
  await page.route("**/api/auth/me", async (route) => {
    const response = await route.fetch();
    const me = (await response.json()) as { permissions?: Record<string, string> };
    await route.fulfill({ response, json: { ...me, permissions: { ...me.permissions, projects: "full" } } });
  });
  await openWonDetail(page, harness.offerId);
  const button = page.getByRole("button", { name: "Projeye Dönüştür →" });
  await expect(button).toBeDisabled();
  await expect(page.getByText("Projeye dönüştürme Projeler yönetici yetkisi ister (bugün yalnız sistem yöneticisi)")).toBeVisible();
  await expect(page.getByRole("link", { name: "Projeye Dönüştür →" })).toHaveCount(0);

  await page.goto(`${OFFERS_URL}/${harness.offerId}/donustur`);
  await expect(page.getByTestId("convert-step-1")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1, name: "Proje ve Sözleşmeye Dönüştür" })).toHaveCount(0);
  expect(convertCalls(harness)).toHaveLength(0);
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

// TKL-F5.6 bulgusu (düzeltildi): kapı uçuşta da açık kalmalı — `useConvertOffer.onSuccess` tazelemeyi beklerken detay
// "converted" okununca ekran karta düşüp başarıda Adım 1'e sıfırlanıyordu. Bu test o yarışın bekçisidir.
test("başarıdan sonra ekran Adım 3'te kalır: '✓ Oluşturuldu' kalıcı pasif, adım çubuğu kilitli, form sıfırlanmaz", async ({ page }) => {
  const harness = await setUpConvert(page);
  await walkToConfirm(page, harness.offerId);
  await createProject(page);
  // Mutasyonun `onSuccess` önbellek tazelemesi sürerken detay "converted" okunur; ekran bu arada SÖKÜLÜP sıfırdan
  // kurulmamalı (başarı bandı formun üstünde kalır, form/adım korunur).
  await expect(page.getByTestId("convert-step-3")).toBeVisible();
  await expect(page.getByTestId("convert-step-1")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Oluşturuldu" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "← Geri" })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Dönüştürme adımları" }).getByRole("button").first()).toBeDisabled();
  await expect(page.getByTestId("convert-step-3")).toContainText(`${CONTRACT_NO_UPPER}`);
});

test("proje kodu çakışması (409) → Adım 1 'Proje kodu' alan hatası; hiçbir şey yazılmaz", async ({ page }) => {
  const harness = await setUpConvert(page);
  const listed = await (await page.request.get("/api/backend/projects")).json();
  const existing = ((Array.isArray(listed) ? listed : listed.items) as Array<{ code: string }>)[0]?.code;
  expect(existing).toBeDefined();
  await openConvertScreen(page, harness.offerId);
  await fillStep1(page, { ...STEP1_DEFAULT, projectCode: existing?.toLowerCase() });
  await goToItems(page);
  await page.getByRole("row", { name: ITEM_ROWS.concrete }).getByLabel("Sözleşmeye dahil et").uncheck();
  await goToConfirm(page);
  await page.getByRole("button", { name: "Projeyi ve Sözleşmeyi Oluştur" }).click();

  const step1 = page.getByTestId("convert-step-1");
  await expect(step1).toBeVisible();
  await expect(step1).toContainText(PROJECT_CODE_TAKEN);
  expect(lastConvertBody(harness).project.code).toBe(existing);
  expect(harness.local.created).toHaveLength(0);
  // Kod düzeltilince (boş = otomatik) yeniden denenir ve oluşur.
  await step1.getByLabel("Proje kodu").fill("");
  await goToItems(page);
  await goToConfirm(page);
  await createProject(page);
  expect(harness.local.created).toHaveLength(MUST_BE_ONE);
});

test("tek uçuş: oluştur düğmesine çift tık TEK istek atar; uçuşta düğme kilitli", async ({ page }) => {
  const harness = await setUpConvert(page);
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let arrived = 0;
  await page.route(CONVERT_PATH, async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    arrived += 1;
    await gate;
    return route.fallback();
  });
  await walkToConfirm(page, harness.offerId);
  await page.getByRole("button", { name: "Projeyi ve Sözleşmeyi Oluştur" }).dblclick();
  await expect.poll(() => arrived).toBe(MUST_BE_ONE);
  await expect(page.getByRole("button", { name: "Oluşturuluyor…" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "← Geri" })).toBeDisabled();
  release();
  await expect(page.getByTestId("convert-done")).toBeVisible();
  expect(arrived).toBe(MUST_BE_ONE);
  expect(convertCalls(harness)).toHaveLength(MUST_BE_ONE);
  expect(harness.local.created).toHaveLength(MUST_BE_ONE);
});

test("veri bütünlüğü 409 (eşzamanlı proje kodu yarışı) → 'Tekrar dene' güncel formdan yeniden kurar ve oluşur", async ({ page }) => {
  const harness = await setUpConvert(page);
  let failuresLeft = 1;
  await page.route(CONVERT_PATH, async (route) => {
    if (route.request().method() !== "POST" || failuresLeft === 0) return route.fallback();
    failuresLeft -= 1;
    return route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ detail: INTEGRITY_ERROR }) });
  });
  await walkToConfirm(page, harness.offerId);
  await page.getByRole("button", { name: "Projeyi ve Sözleşmeyi Oluştur" }).click();
  const band = page.getByTestId("convert-error");
  await expect(band).toContainText(INTEGRITY_ERROR);
  expect(harness.local.created).toHaveLength(0);
  await band.getByRole("button", { name: "Tekrar dene" }).click();
  await expect(page.getByTestId("convert-done")).toBeVisible();
  expect(harness.local.created).toHaveLength(MUST_BE_ONE);
});

test("şantiyesiz dönüştürme → bantta 'Sözleşmeden doldur' ipucu (Adam-saat bütçesi bağlantısı yok); bütçede doldurma sonucu + 409 metni", async ({ page }) => {
  const harness = await setUpConvert(page);
  await openConvertScreen(page, harness.offerId);
  await fillStep1(page);
  await page.getByTestId("convert-step-1").getByLabel("Tek şantiye aç", { exact: false }).uncheck();
  await goToItems(page);
  await page.getByRole("row", { name: ITEM_ROWS.concrete }).getByLabel("Sözleşmeye dahil et").uncheck();
  await goToConfirm(page);
  await expect(page.getByTestId("convert-step-3")).toContainText("Şantiye açılmayacak");
  await createProject(page);
  expect(lastConvertBody(harness).open_site).not.toBe(true);
  const done = page.getByTestId("convert-done");
  await expect(done).toContainText("'Sözleşmeden doldur'");
  await expect(done.getByRole("link", { name: "Adam-saat bütçesi →" })).toHaveCount(0);
  expect(harness.local.created[0]?.result.siteId).toBeNull();

  // Dönüşümle doğan şantiyede EV tohumu yok → "Sözleşmeden doldur" tohumlu s-1 üzerinden sınanır (yanıt sayfaya özel;
  // paylaşılan EV durumuna YAZILMAZ).
  const fills: Array<{ status: number; body: Json }> = [
    { status: 200, body: { filled_item_count: 3, filled_leaf_count: 5, linked_item_count: 0, mapped_group_count: 0, unrated_item_count: 0, warnings: [] } },
    { status: 409, body: { detail: "Açık taslak revizyon yok" } },
  ];
  await page.route(/\/earned-value\/budget\/fill-from-contract$/, async (route) => {
    const next = fills.shift();
    if (next === undefined) return route.fallback();
    return route.fulfill({ status: next.status, contentType: "application/json", body: JSON.stringify(next.body) });
  });
  await page.setViewportSize({ ...MAN_HOUR_BUDGET_VIEWPORT });
  await openManHourBudget(page);
  const fillButton = page.getByRole("button", { name: "Sözleşmeden doldur" });
  await fillButton.click();
  await expect(page.getByText("5 satır sözleşmeden dolduruldu")).toBeVisible();
  await fillButton.click();
  await expect(page.getByText("Açık taslak revizyon yok")).toBeVisible();
});
