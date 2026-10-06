import { test, expect, type Page } from "@playwright/test";

import type { components } from "@/lib/api/schema";

import { OFFERS_URL, SEED_NO, loginForOffers, openItemPicker, openOfferDetail, openOfferPrint } from "./offers-helpers";
import {
  editItems,
  fillStep1,
  goToItems,
  openConvertScreen,
  settleFocus,
  setUpConvert,
  walkToConfirm,
  createProject,
} from "./offers-convert-helpers";
import { withPageLevels } from "./mock-role-pages";
import { prepareFrame } from "./visual-scroll";

type PageGrant = components["schemas"]["PageGrant"];

// TKL-F3.8 · Teklif Hazırlama görsel kadrajları (plan §1: TL/TY/TD mockup'ları + PDF onay kareleri).
//
// 🔴 BAŞLIK KURALI: her testin adında "gorsel" GEÇER (5. kapı `--grep-invert` ile BAŞLIĞA göre süzer).
// 🔒 SALT-OKUR: `/offers*` TÜMÜ `offers-fake-server.ts` ile sayfaya özel durumdan yanıtlanır; hiçbir kadraj
//    paylaşılan mock'a yazmaz. "Teklifi oluştur" yalnız BOŞ formla (istemci doğrulaması, istek gitmez) basılır.
// 📅 Saat `loginForOffers` → `login` içinde NAVİGASYONDAN ÖNCE çakılır (24.09.2026): "süresi geçti" ve
//    geçerlilik bitişi `new Date()`e bağlıdır.
// 🖨️ PDF kareleri `print` medyasında; sayfa kutusu sabit A4 olduğundan kadraj deterministiktir.
//
// Baseline `.png` YALNIZ Linux CI'da üretilir; macOS'ta commit edilmez.

test("teklif liste gorsel", async ({ page }) => {
  await loginForOffers(page);
  await page.goto(OFFERS_URL);
  await expect(page.getByTestId("offers-count")).toContainText("7");
  await expect(page.getByTestId(`offers-row-${SEED_NO.sent}`)).toBeVisible();

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("teklif-liste.png", { fullPage: true });
});

test("teklif liste bos gorsel", async ({ page }) => {
  await loginForOffers(page, { seeded: false });
  await page.goto(OFFERS_URL);
  await expect(page.getByText("Henüz teklif hazırlanmadı")).toBeVisible();

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("teklif-liste-bos.png", { fullPage: true });
});

test("teklif yeni gorsel", async ({ page }) => {
  await loginForOffers(page);
  await page.goto(`${OFFERS_URL}/yeni`);
  await expect(page.getByRole("heading", { level: 1, name: "Yeni Teklif" })).toBeVisible();
  // Ayar ön değerleri geldi (yükleme durumu dondurulmasın).
  await expect(page.getByText(/Teklif ayarı varsayılanı/).first()).toBeVisible();

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("teklif-yeni.png", { fullPage: true });
});

test("teklif yeni hata gorsel", async ({ page }) => {
  await loginForOffers(page);
  await page.goto(`${OFFERS_URL}/yeni`);
  await expect(page.getByText(/Teklif ayarı varsayılanı/).first()).toBeVisible();
  await page.getByRole("button", { name: "Teklifi oluştur ve kalemlere geç →" }).click();
  await expect(page.getByText(/alan eksik\./)).toBeVisible();

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("teklif-yeni-hata.png", { fullPage: true });
});

test("teklif detay taslak gorsel", async ({ page }) => {
  await loginForOffers(page);
  await openOfferDetail(page, SEED_NO.draftEmpty);
  await expect(page.getByRole("button", { name: "Taslak Kaydet" })).toBeVisible();
  await expect(page.getByText("Revizyon yükleniyor")).toHaveCount(0);

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("teklif-detay-taslak.png", { fullPage: true });
});

test("teklif detay eski revizyon gorsel", async ({ page }) => {
  await loginForOffers(page);
  await openOfferDetail(page, SEED_NO.withHistory, "?rev=0");
  await expect(page.getByText(/salt okunur/).first()).toBeVisible();

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("teklif-detay-eski-rev.png", { fullPage: true });
});

test("teklif kaybedildi modal gorsel", async ({ page }) => {
  await loginForOffers(page);
  await openOfferDetail(page, SEED_NO.sent);
  await page.getByRole("button", { name: "Kaybedildi" }).click();
  const modal = page.getByRole("dialog", { name: "Kaybedildi olarak işaretle" });
  await expect(modal).toBeVisible();
  await modal.getByLabel("Kayıp nedeni (isteğe bağlı)").fill("Rakip daha ucuz");
  await modal.getByLabel("Kazanan teklif tutarı (isteğe bağlı, KDV hariç ₺)").fill("1500000");
  await page.mouse.move(0, 0);

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("teklif-kaybedildi-modal.png", { fullPage: true });
});

test("teklif detay kalemler gorsel", async ({ page }) => {
  await loginForOffers(page);
  await openOfferDetail(page, SEED_NO.draftItems);
  await expect(page.getByTestId("oit-amount").first()).toBeVisible();

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("teklif-detay-kalemler.png", { fullPage: true });
});

/** IZN-F4.2 · `maliyet_kar` gizli rol: backend revizyonda GG/kâr %, kalem maliyeti ve iç toplamları `null` döner. */
function maskMaliyetKar(path: string, body: unknown): unknown {
  if (!/^\/offers\/[^/]+\/revisions\/\d+$/.test(path) || typeof body !== "object" || body === null) return body;
  const revision = body as {
    overhead_pct: string | null;
    profit_pct: string | null;
    groups: Array<{ items: Array<Record<string, unknown>> }>;
    totals: { internal: Record<string, unknown> };
  };
  return {
    ...revision,
    overhead_pct: null,
    profit_pct: null,
    groups: revision.groups.map((group) => ({
      ...group,
      items: group.items.map((item) => ({
        ...item,
        cost_unit_price: null,
        overhead_pct: null,
        profit_pct: null,
        internal: { cost: null, overhead: null, profit: null, profit_pct: null, man_hours: (item.internal as { man_hours: unknown }).man_hours },
      })),
    })),
    totals: {
      ...revision.totals,
      internal: { ...revision.totals.internal, cost: null, overhead: null, profit: null, profit_pct: null },
    },
  };
}

// IZN-F4.2 · `/auth/me.hidden_fields = ["maliyet_kar"]` yalnız bu sayfada (page.route); fake sunucu aynı rol için GG/kâr %'yi `null`
// döndürür. Beklenen: oranlar salt okunur "—" + kilit ipucu, kalem GG/kâr hücreleri "—" ve kapalı, toplamlarda "—".
test("teklif detay maliyet gizli gorsel", async ({ page }) => {
  await page.route("**/api/auth/me", async (route) => {
    const response = await route.fetch();
    const me = (await response.json()) as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...me, hidden_fields: ["maliyet_kar"] }),
    });
  });
  await loginForOffers(page, { transformBody: maskMaliyetKar });
  await openOfferDetail(page, SEED_NO.draftItems);
  await expect(page.getByTestId("oit-amount").first()).toBeVisible();
  await expect(page.getByLabel("Genel gider", { exact: true })).toHaveValue("—");
  await expect(page.getByLabel("Kâr", { exact: true })).toHaveValue("—");
  await expect(page.getByTestId("hidden-mark").first()).toBeVisible();

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("teklif-detay-maliyet-gizli.png", { fullPage: true });
});

test("teklif secici gorsel", async ({ page }) => {
  await loginForOffers(page);
  await openOfferDetail(page, SEED_NO.draftItems);
  const picker = await openItemPicker(page);
  await expect(picker.getByTestId("wip-selected")).toHaveText("0");

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("teklif-secici.png", { fullPage: true });
});

test("teklif pdf isveren gorsel", async ({ page }) => {
  await loginForOffers(page);
  await openOfferPrint(page, SEED_NO.sentUnpriced, "isveren");

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("teklif-pdf-isveren.png", { fullPage: true });
});

test("teklif pdf ic gorsel", async ({ page }) => {
  await loginForOffers(page);
  await openOfferPrint(page, SEED_NO.sentUnpriced, "ic");

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("teklif-pdf-ic.png", { fullPage: true });
});

// ------------------------------------------------------------------------------------ TKL-F4.8
// Şablonlar + şablondan başlangıç + miktarsız kalem kadrajları (plan §8 F4.8; mockup TS/TY). Şablon verisi
// `mock-offer-templates.ts` TOHUMUDUR (deterministik tarih); yazan akışlar sahte sunucuda koşar (paylaşılan mock'a yazmaz).

const TEMPLATES_URL = `${OFFERS_URL}/sablonlar`;
const DEFAULT_TEMPLATE_NAME = "Kaba İnşaat Standart";

async function defaultTemplateId(page: Page): Promise<string> {
  const response = await page.request.get("/api/backend/offers/templates");
  expect(response.ok()).toBe(true);
  const list = (await response.json()) as { items: Array<{ id: string; name: string }> };
  const hit = list.items.find((item) => item.name === DEFAULT_TEMPLATE_NAME);
  if (hit === undefined) throw new Error(`tohum şablon yok: ${DEFAULT_TEMPLATE_NAME}`);
  return hit.id;
}

test("teklif sablonlar gorsel", async ({ page }) => {
  await loginForOffers(page);
  await page.goto(TEMPLATES_URL);
  await expect(page.getByRole("heading", { level: 1, name: "Teklif Şablonları" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Şablon kalemleri" })).toBeVisible();
  await expect(page.getByText("Şablon yükleniyor")).toHaveCount(0);
  await expect(page.getByText(/GG %/).first()).toBeVisible();

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("teklif-sablonlar.png", { fullPage: true });
});

test("teklif sablon yeni modal gorsel", async ({ page }) => {
  await loginForOffers(page);
  await page.goto(TEMPLATES_URL);
  await expect(page.getByRole("region", { name: "Şablon kalemleri" })).toBeVisible();
  await page.getByRole("button", { name: "+ Yeni Şablon", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "Yeni Şablon" });
  await expect(modal).toBeVisible();
  await modal.getByLabel("Şablon adı").fill("Konut · ince işler");
  await expect(modal.getByRole("button", { name: /^\+ / }).first()).toBeVisible();
  await expect(modal.getByLabel("Varsayılan genel gider")).not.toHaveValue("");
  await page.mouse.move(0, 0);

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("teklif-sablon-yeni-modal.png", { fullPage: true });
});

test("teklif yeni sablondan gorsel", async ({ page }) => {
  await loginForOffers(page);
  const templateId = await defaultTemplateId(page);
  await page.goto(`${OFFERS_URL}/yeni?sablon=${templateId}`);
  await expect(page.getByRole("heading", { level: 1, name: "Yeni Teklif" })).toBeVisible();
  await expect(page.getByRole("radio", { name: new RegExp(`^${DEFAULT_TEMPLATE_NAME}`) })).toBeChecked();
  await expect(page.getByLabel("Genel gider", { exact: true })).toHaveValue("10");

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("teklif-yeni-sablondan.png", { fullPage: true });
});

test("teklif detay miktarsiz gorsel", async ({ page }) => {
  await loginForOffers(page);
  const templateId = await defaultTemplateId(page);
  await page.goto(`${OFFERS_URL}/yeni?sablon=${templateId}`);
  await expect(page.getByRole("radio", { name: new RegExp(`^${DEFAULT_TEMPLATE_NAME}`) })).toBeChecked();
  await page.getByLabel("İşveren", { exact: true }).selectOption({ index: 1 });
  await page.getByLabel("İş adı").fill("Şablondan Kaba İnşaat Teklifi");
  await page.getByRole("button", { name: "Teklifi oluştur ve kalemlere geç →" }).click();
  await expect(page).toHaveURL(/\/teklif-hazirlama\/[0-9a-f-]{36}$/);
  await expect(page.getByText(/kalemde miktar girilmedi/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Gönderildi İşaretle" })).toBeDisabled();
  await expect(page.getByText("Revizyon yükleniyor")).toHaveCount(0);
  await page.mouse.move(0, 0);

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("teklif-detay-miktarsiz.png", { fullPage: true });
});

// ------------------------------------------------------------------------------------ TKL-F5.6
// Teklif → Proje DÖNÜŞTÜR kadrajları (plan §8 F5.6; mockup TDN). Yazan akışlar (kalem düzenleme, oluşturma) sayfaya özel
// sahte yazımda koşar (`offers-convert-helpers.ts`): paylaşılan mock'a HİÇBİR yazma gitmez. Yetkisiz kare `projects: full`
// ile yalnız bu sayfanın `/auth/me` yanıtını değiştirir. Saat `login` içinde çakılı (24.09.2026).

test("teklif donustur proje gorsel", async ({ page }) => {
  const harness = await setUpConvert(page);
  await openConvertScreen(page, harness.offerId);
  await fillStep1(page);
  await settleFocus(page);
  await expect(page.getByTestId("convert-step-1").getByLabel("Sözleşme no")).toHaveValue("SZL-2026-İ01");

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("teklif-donustur-proje.png", { fullPage: true });
});

test("teklif donustur kalemler gorsel", async ({ page }) => {
  const harness = await setUpConvert(page);
  await openConvertScreen(page, harness.offerId);
  await fillStep1(page);
  await goToItems(page);
  await editItems(page);
  await settleFocus(page);
  await expect(page.getByTestId("convert-step-2")).toContainText("3 dahil · 1 çıkarıldı · 2 değişti · 1 yeni");

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("teklif-donustur-kalemler.png", { fullPage: true });
});

test("teklif donustur onay gorsel", async ({ page }) => {
  const harness = await setUpConvert(page);
  await walkToConfirm(page, harness.offerId);
  await settleFocus(page);
  await expect(page.getByTestId("convert-summary-step3")).toContainText("KDV dahil");

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("teklif-donustur-onay.png", { fullPage: true });
});

// Başarı sonrası kare: ekran Adım 3'te kalır (F5.6 kapı yarışı düzeltmesinin görsel bekçisi).
test("teklif donustur tamam gorsel", async ({ page }) => {
  const harness = await setUpConvert(page);
  await walkToConfirm(page, harness.offerId);
  await createProject(page);
  await settleFocus(page);
  await expect(page.getByTestId("convert-step-3")).toBeVisible();
  await expect(page.getByRole("button", { name: "Oluşturuldu" })).toBeDisabled();

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("teklif-donustur-tamam.png", { fullPage: true });
});

test("teklif detay donustur pasif gorsel", async ({ page }) => {
  const harness = await setUpConvert(page);
  await page.route("**/api/auth/me", async (route) => {
    const response = await route.fetch();
    const me = (await response.json()) as { permissions?: Record<string, string>; pages?: Record<string, PageGrant> };
    // IZN-F6d: sayfa modeli devrede → dönüştürme kapısı `teklif.teklif_hazirlama` Onaylar'ıdır; onay yok.
    await route.fulfill({
      response,
      json: {
        ...me,
        permissions: { ...me.permissions, projects: "full" },
        pages: withPageLevels(me.pages, ["teklif.teklif_hazirlama"], "edit"),
      },
    });
  });
  await page.goto(`${OFFERS_URL}/${harness.offerId}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(SEED_NO.withHistory);
  await expect(page.getByRole("button", { name: "Projeye Dönüştür →" })).toBeDisabled();
  await expect(page.getByText(/Projeye dönüştürme için Teklif Hazırlama sayfasında Onaylar yetkisi gerekir/)).toBeVisible();
  await expect(page.getByText("Revizyon yükleniyor")).toHaveCount(0);
  await page.mouse.move(0, 0);

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("teklif-detay-donustur-pasif.png", { fullPage: true });
});

test("teklif liste donusturuldu gorsel", async ({ page }) => {
  const harness = await setUpConvert(page);
  // Teklif zaten projeye dönüşmüş (sahte sunucunun sayfaya özel durumu; paylaşılan mock'a yazılmaz).
  const state = harness.server.state();
  state.offers = state.offers.map((offer) =>
    offer.id === harness.offerId
      ? {
          ...offer,
          projectId: "p-e2e-1",
          convertedAt: "2026-09-24T05:00:00.000Z",
          convertedByUserId: offer.preparedByUserId,
          project: { id: "p-e2e-1", code: "PRJ-2026-005", name: "Güneşkent A Blok Projesi", slug: "guneskent-a-blok-projesi" },
        }
      : offer,
  );
  await page.goto(OFFERS_URL);
  await expect(page.getByTestId("offers-count")).toContainText("7");
  await expect(page.getByTestId(`offers-row-${SEED_NO.withHistory}`).getByRole("link", { name: /^Proje: / })).toBeVisible();
  await expect(page.getByTestId("offers-card-convert")).toHaveCount(0);
  await page.mouse.move(0, 0);

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("teklif-liste-donusturuldu.png", { fullPage: true });
});
