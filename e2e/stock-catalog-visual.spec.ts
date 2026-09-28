import { test, expect, type Page } from "@playwright/test";

import { EMPTY_STOCK_SUMMARY_RESPONSE } from "./mock-backend";
import { prepareFrame } from "./visual-scroll";

// F-ST T5 · E3 (`/stok`) görsel testleri — `site-planning-visual.spec.ts` /
// `section-detail-visual.spec.ts` deseninin aynısı.
//
// SALT-OKUR: bu dosya hiçbir POST tetiklemez, yalnız fikstürleri render eder.
// Stok kayıtlarının PROJE KAPSAMI YOKTUR (T1 kuralı): başarılı bir yazma
// katalog satırlarını değiştirip bu baseline'ları sessizce kırardı. Fonksiyonel
// spec'ler (`stock-catalog.spec.ts` · `site-stock.spec.ts` · `stock-entry.
// spec.ts`) bu yüzden yalnız REDDEDİLEN gövdeleri dener → `fullyParallel`
// altında yarış yoktur.
//
// 📅 TARİH BAĞIMSIZ: bu iki kadrajda tarihe bağlı hiçbir türev yoktur
// (bakiye/durum/KPI'ların hepsi SUNUCU damgasıdır) — `page.clock` gerekmez.
// Giriş formunun bugüne bağlı tarih alanı `stock-entry-visual.spec.ts`te
// sabitlenir.
//
// Baseline `.png` YALNIZ Linux CI'da üretilir (visual-baselines.yml →
// workflow_dispatch → artifact → `e2e/`); macOS'ta koşturulup commit edilmez.

const STOCK_URL = "/stok";

async function login(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/login");
  await page.getByLabel(/e-posta/i).fill("patron@fiil.com");
  await page.getByLabel(/^şifre$/i).fill("dogruparola");
  await page.getByRole("button", { name: /giriş yap/i }).click();
  await expect(page.getByRole("heading", { name: "Gösterge Paneli" })).toBeVisible();
}

test("stok genel katalog (dolu) gorsel", async ({ page }) => {
  await login(page);
  await page.goto(STOCK_URL);
  await expect(page.getByRole("heading", { level: 1, name: "Stok & Depo" })).toBeVisible();

  // YERLEŞİM OTURDU (WORKFLOW §4, 1. parça): KPI şeridi GERÇEK sayıyı basıyor
  // ("—" yer tutucusu değil) ve tablo satırları geldi; "Stok listesi
  // yükleniyor…" boş durumu kadraja giremez.
  await expect(page.getByTestId("stok-kpi-strip")).toContainText("8 Kalem");
  await expect(page.getByTestId("stok-row-SNK-0421")).toBeVisible();
  // Dört durum rozetinin dördü de kadrajda — palet tam basılır.
  await expect(page.getByTestId("stok-status-SNK-0421")).toHaveText("Kritik");
  await expect(page.getByTestId("stok-status-ELK-0334")).toHaveText("Düşük");
  await expect(page.getByTestId("stok-status-SNK-0108")).toHaveText("Normal");
  await expect(page.getByTestId("stok-status-SNK-0447")).toHaveText("Fazla");
  // Eşiksiz kalem (min_stock null) rozet İCAT ETMEZ.
  await expect(page.getByTestId("stok-status-ICY-0090")).toHaveText("—");

  // Kadraj hazırlığı (kaydırma sıfırlama + imleç parkı): `visual-scroll.ts`.
  await prepareFrame(page);
  await expect(page).toHaveScreenshot("stok-genel.png", { fullPage: true });
});

test("stok genel katalog (bos) gorsel", async ({ page }) => {
  // BOŞ DURUM KAYNAĞI (F-PL `planlama-bos` emsali): paylaşılan mock durumu
  // BOŞALTILMAZ — başka spec'lerin fikstürlerini kırardı. Yerine TEK bir GET
  // yanıtı kadraja özel olarak `EMPTY_STOCK_SUMMARY_RESPONSE` ile karşılanır;
  // sunucu durumu HİÇ değişmez, dolayısıyla yarış da yoktur.
  await page.route(
    (url) => url.pathname === "/api/backend/stock/summary",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(EMPTY_STOCK_SUMMARY_RESPONSE),
      });
    },
  );

  await login(page);
  await page.goto(STOCK_URL);
  const content = page.locator("main");
  await expect(page.getByRole("heading", { level: 1, name: "Stok & Depo" })).toBeVisible();

  // YERLEŞİM OTURDU (1. parça): yanıt GELDİ ve boş-katalog metni basıldı —
  // "Stok listesi yükleniyor…" durumu kadraja girmez. `.first()` ZORUNLU:
  // akış-SSR'da (streamed SSR) sunucu kopyası ile hidrasyon kopyası bir an yan
  // yana durur ve strict-mode ihlali verir (F-PL baseline turu dersi, yalnız
  // Linux CI'da patlar).
  await expect(content.getByText("Henüz malzeme kartı yok.").first()).toBeVisible();
  await expect(content.getByText("“+ Malzeme Ekle” ile ilk kartı oluşturun.").first()).toBeVisible();
  // Sıfır KPI'lar sunucudan gelir; ekran sahte sayı basmaz.
  await expect(page.getByTestId("stok-kpi-strip")).toContainText("0 Kalem");
  // Süzgeçsiz boş katalogda kırpılma/fiyat uyarıları BASILMAZ.
  await expect(page.getByTestId("stok-truncation-notice")).toHaveCount(0);
  await expect(page.getByTestId("stok-price-notice")).toHaveCount(0);

  // Kadraj hazırlığı (kaydırma sıfırlama + imleç parkı): `visual-scroll.ts`.
  await prepareFrame(page);
  await expect(page).toHaveScreenshot("stok-genel-bos.png", { fullPage: true });
});
