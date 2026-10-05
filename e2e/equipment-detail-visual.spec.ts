import { test, expect } from "@playwright/test";

import { EQUIPMENT_URL, visualLogin } from "./equipment-helpers";
import { prepareFrame } from "./visual-scroll";

// F-MKD · Ekipman Detay görsel testleri (`Makine - Ekipman Detay.dc.html`).
//
// SALT-OKUR: hiçbir POST/PATCH tetiklemez → `fullyParallel` altında yarış YOK.
//
// 📅 TARİH BAĞIMSIZ ve `page.clock` GEREKMEZ: ekranın dönemi ile belge
// geçerlilik rozetlerinin tabanı SUNUCUNUN `as_of` damgasıdır
// (`GET /equipment/{id}/detail`) ve ikiz onu 2026-08-20'ye SABİTLER. İstemci
// saatinden türeseydi "21 gün kaldı" rozeti her gün başka bir sayı basar ve
// kare her koşuda oynardı.
//
// 🔴 "YÜKLENDİ" İDDİASI HER BAĞIMSIZ KAYNAĞI KAPSAR (F-İK dersi): bu ekranın
// YEDİ ayrı sorgusu var (detay · şantiye seçenekleri · çalışma özeti ×3 ·
// yakıt özeti · belgeler · tedarikçi · kira hakedişleri). Tek bayrakla
// beklemek, ikinci kaynağın "Yükleniyor…" hâlini kadraja DONDURURDU.
//
// Baseline `.png` YALNIZ Linux CI'da üretilir (visual-baselines.yml →
// workflow_dispatch → artifact → `e2e/`); macOS'ta koşturulup commit edilmez.

const LOADING_TEXT = "Yükleniyor…";

async function waitForDetailSources(page: import("@playwright/test").Page) {
  await expect(page.getByTestId("makine-det-loaded-detail")).toHaveCount(1);
  await expect(page.getByTestId("makine-det-loaded-sites")).toHaveCount(1);
  await expect(page.getByTestId("makine-det-loaded-work-0")).toHaveCount(1);
  await expect(page.getByTestId("makine-det-loaded-work-1")).toHaveCount(1);
  await expect(page.getByTestId("makine-det-loaded-work-2")).toHaveCount(1);
  await expect(page.getByTestId("makine-det-loaded-fuel")).toHaveCount(1);
  await expect(page.getByTestId("makine-det-loaded-documents")).toHaveCount(1);
  await expect(page.getByTestId("makine-det-loaded-supplier")).toHaveCount(1);
  await expect(page.getByTestId("makine-det-loaded-invoices")).toHaveCount(1);
  await expect(page.getByText(LOADING_TEXT)).toHaveCount(0);
}

test("ekipman detay gorsel (kendi malimiz — bakim cubugu DOLU)", async ({ page }) => {
  await visualLogin(page);
  await page.goto(`${EQUIPMENT_URL}/eq-1`);
  await expect(page.getByRole("heading", { level: 1, name: "Tower Crane TC-48" })).toBeVisible();
  await waitForDetailSources(page);

  // Kadraj hazırlığı (kaydırma sıfırlama + imleç parkı): `visual-scroll.ts`.
  await prepareFrame(page);
  await expect(page).toHaveScreenshot("makine-detay.png", { fullPage: true });
});

test("ekipman detay gorsel (kiralik — bakim penceresi YOK, belge rozetleri)", async ({ page }) => {
  await visualLogin(page);
  await page.goto(`${EQUIPMENT_URL}/eq-3`);
  await expect(page.getByRole("heading", { level: 1, name: "Damperli Kamyon FMX" })).toBeVisible();
  await waitForDetailSources(page);

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("makine-detay-kiralik.png", { fullPage: true });
});

// IZN-F4d.2 · ekipman detay (kiralık) — rol için GİZLİ maliyet (maliyet_kar)
// ---------------------------------------------------------------------------
// `/auth/me.hidden_fields = ["maliyet_kar"]` ve ilgili yanıtlardaki tutarlar `null` (IZN-B4d-SOZLESME §1:
// kira bedeli · çalışma maliyeti · yakıt tutarı · kira hakedişi ödenecek · kümülatif ödenen). YALNIZ bu testte
// (`page.route`); paylaşılan mock backend'e YAZILMAZ. Beklenen: tutarlar "—", yanlarında kilit; saat/litre açık.
type JsonRecord = Record<string, unknown>;

async function maskJson(
  page: import("@playwright/test").Page,
  pattern: RegExp,
  mutate: (body: JsonRecord) => JsonRecord,
) {
  await page.route(pattern, async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as JsonRecord;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mutate(body)) });
  });
}

const nullRows = (rows: unknown, field: string) =>
  (Array.isArray(rows) ? rows : []).map((row) => ({ ...(row as JsonRecord), [field]: null }));

test("ekipman detay maliyet gizli gorsel (kiralik)", async ({ page }) => {
  await maskJson(page, /\/api\/auth\/me$/, (me) => ({ ...me, hidden_fields: ["maliyet_kar"] }));
  await maskJson(page, /\/api\/backend\/equipment\/eq-3(\?.*)?$/, (body) => ({ ...body, rate_amount: null, purchase_amount: null, market_value: null }));
  await maskJson(page, /\/api\/backend\/equipment\/eq-3\/detail(\?.*)?$/, (body) => ({
    ...body,
    rental: { ...(body.rental as JsonRecord), cumulative_paid: null },
  }));
  await maskJson(page, /\/api\/backend\/equipment\/work-summary(\?.*)?$/, (body) => ({
    ...body,
    rows: nullRows(body.rows, "cost"),
    totals: { ...(body.totals as JsonRecord), cost: null },
  }));
  await maskJson(page, /\/api\/backend\/equipment\/fuel-summary(\?.*)?$/, (body) => ({
    ...body,
    rows: nullRows(body.rows, "amount"),
    total_amount: null,
    avg_unit_price: null,
  }));
  await maskJson(page, /\/api\/backend\/equipment\/rental-invoices(\?.*)?$/, (body) => ({
    ...body,
    items: nullRows(body.items, "payable_total"),
  }));

  await visualLogin(page);
  await page.goto(`${EQUIPMENT_URL}/eq-3`);
  await expect(page.getByRole("heading", { level: 1, name: "Damperli Kamyon FMX" })).toBeVisible();
  await waitForDetailSources(page);
  // Maliyet kutusu + yakıt maliyeti + kira bedeli + kümülatif ödenen + hakediş bağlantısı: tutar YOK, kilit VAR.
  await expect(page.getByTestId("makine-det-monthly-cost")).toContainText("—");
  await expect(page.getByTestId("makine-det-monthly-cost").getByTestId("hidden-mark")).toHaveCount(1);
  await expect(page.getByTestId("makine-det-fuel-amount").getByTestId("hidden-mark")).toHaveCount(1);
  await expect(page.getByTestId("makine-det-cumulative-paid").getByTestId("hidden-mark")).toHaveCount(1);

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("makine-detay-maliyet-gizli.png", { fullPage: true });
});
