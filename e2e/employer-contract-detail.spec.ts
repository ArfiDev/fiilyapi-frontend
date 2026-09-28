import { test, expect, type Page } from "@playwright/test";

import { pinTimeline } from "./takvim-helpers";

// F-P5 T3 · E14 (`/sozlesmeler/isveren/[projectId]`) fonksiyonel e2e.
// Kapsam: rotanın ComingSoon'dan çıkması, başlık + 5 metrik, Hakediş Özeti,
// sekme URL state'i (+ geri tuşu), İş Kalemleri kolonları, Hakedişler
// sekmesinin proje filtresi, Milestone Takvimi (CANLI) + Belgeler PENDING'i, devre-dışı
// PDF/Düzenle, POZ ekranına giriş.
//
// ⚠️ Dağılım/işveren sözleşmesi uçları YALNIZ `p-1` için veri döner (mock).
// ⚠️ `getByRole("alert")` KULLANILMAZ (Next route-announcer tuzağı).
// Bu dosya HİÇBİR mock kaydını mutasyona uğratmaz — yalnız okur.
// Zamanlayıcıya dayalı bekleme YOK.

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/e-posta/i).fill("patron@fiil.com");
  await page.getByLabel(/^şifre$/i).fill("dogruparola");
  await page.getByRole("button", { name: /giriş yap/i }).click();
  await expect(page.getByRole("heading", { name: "Gösterge Paneli" })).toBeVisible();
}

test("işveren sözleşme detayı: listeden satıra tıklayınca açılır", async ({ page }) => {
  await login(page);
  await page.goto("/sozlesmeler");

  await page.getByRole("link", { name: "Detay →" }).first().click();
  await expect(page).toHaveURL(/\/sozlesmeler\/isveren\/p-1$/);
  await expect(page.locator("main").getByText("Bu modül yakında eklenecek.")).toHaveCount(0);
  await expect(page.getByTestId("ecd-metrics")).toBeVisible();
});

test("işveren sözleşme detayı: başlık kartı + 5 metrik + devre-dışı butonlar", async ({
  page,
}) => {
  await login(page);
  await page.goto("/sozlesmeler/isveren/p-1");

  await expect(page.getByRole("heading", { name: "Kule A" })).toBeVisible();
  await expect(page.locator("main").getByText("SZL-2025-01")).toBeVisible();

  const metrics = page.getByTestId("ecd-metrics");
  for (const label of [
    "Sözleşme Bedeli",
    "İmza Tarihi",
    "Başlangıç",
    "Bitiş Tarihi",
    "Avans",
  ]) {
    await expect(metrics.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(metrics.getByText("₺ 11,2M")).toBeVisible();

  // Üst kural: buton SİLİNMEZ, devre dışı + görünür gerekçe.
  await expect(page.getByTestId("ecd-pdf-disabled")).toBeDisabled();
  await expect(page.getByTestId("ecd-edit-disabled")).toBeDisabled();
  await expect(page.locator("main").getByText(/Dışa aktarma ucu henüz açılmadı/)).toBeVisible();
  await expect(page.locator("main").getByText(/İşveren sözleşmesi proje formunda kurulur/)).toBeVisible();

  await expect(page.getByRole("link", { name: "← Sözleşmeler" })).toHaveAttribute(
    "href",
    "/sozlesmeler",
  );
});

test("işveren sözleşme detayı: Genel sekmesi — özet kartı, milestone takvimi, S3 koşulları", async ({
  page,
}) => {
  await login(page);
  // 🔴 FİKSTÜR SÜZGECİ: `/projects/timeline` PAYLAŞILAN state'ten türer ve
  // `section-form.spec.ts` p-1'in s-2 şantiyesine YENİ bölüm ekler. Süzgeç
  // olmadan aşağıdaki grup/satır sayımları test SIRASINA bağlı olurdu.
  // Yanıt UYDURULMAZ, yalnız seed kümesine daraltılır (`pinTimeline` doğrudan
  // gerçek uca gider; `today` damgası sunucudan gelmeye devam eder).
  await pinTimeline(page);
  await page.goto("/sozlesmeler/isveren/p-1");

  // Hakediş Özeti — `progress_payment_summary` birebir.
  await expect(page.getByTestId("ecd-pps-contract-amount")).toHaveText("₺ 11.200.000");
  await expect(page.getByTestId("ecd-pps-cumulative")).toHaveText("₺ 8.400.000");
  await expect(page.getByTestId("ecd-pps-caption")).toHaveText("%75 hakkedildi");
  await expect(page.getByTestId("ecd-pps-advance")).toHaveText("- ₺ 1.680.000");
  await expect(page.getByTestId("ecd-pps-retention")).toHaveText("- ₺ 420.000");

  // 🔴 F-MILESTONE — kart artık CANLI: `GET /projects/timeline`den p-1'in
  // İKİ bölümünün (sec-2 · sec-1) ÜÇ milestone'u basılır. Milestone'suz sec-3
  // grup üretmez. Durum SUNUCUNUN `today`inden (2026-07-17) türer — istemci
  // saati burada sabitlenmez ve TÜREVİ ETKİLEMEZ.
  await expect(page.getByRole("heading", { name: "Milestone Takvimi" })).toBeVisible();
  await expect(page.getByTestId("ecd-ms-group")).toHaveCount(2);
  await expect(page.getByTestId("ecd-ms-section-name")).toHaveText([
    "Zemin Kat Kaba İnşaat",
    "Kat 6–10 Kaba İnşaat",
  ]);
  // Aralık GERÇEK bölüm tarihlerinden; üçüncü durum bölümün ENUM'undan.
  await expect(page.getByTestId("ecd-ms-section-meta")).toHaveText([
    "Mar–Ara 2025 · Tamamlandı",
    "Oca–Eyl 2026 · Devam Ediyor",
  ]);
  await expect(page.getByTestId("ecd-ms-title")).toHaveText([
    "Zemin kat teslim",
    "Kat 8 döşeme tamamlandı",
    "Kaba inşaat teslim",
  ]);
  await expect(page.getByTestId("ecd-ms-meta")).toHaveText([
    "1 Aralık 2025 · Tamamlandı",
    "15 Mayıs 2026 · Tamamlandı",
    "30 Eylül 2026 · Planlandı",
  ]);
  // Milestone'suz bölüm grup ÜRETMEZ; mockup'ın sahte metinleri BASILMAZ.
  await expect(page.locator("main").getByText("Peyzaj Düzenlemesi (Taslak)")).toHaveCount(0);
  await expect(page.locator("main").getByText("Temel ve Bodrum Katlar")).toHaveCount(0);
  await expect(page.locator("main").getByText("Teslimat & Kesin Kabul")).toHaveCount(0);

  // §7 S3 — salt-okunur koşullar; ızgaranın DIŞINDA ayrı bölüm.
  const terms = page.getByTestId("ecd-terms");
  await expect(terms.getByTestId("ecd-term-vat")).toHaveText("%20");
  await expect(terms.getByTestId("ecd-term-escalation")).toHaveText("Var");
  await expect(terms.getByTestId("ecd-term-index")).toHaveText("TÜFE");
  await expect(terms.locator("input, select, textarea")).toHaveCount(0);
});

test("işveren sözleşme detayı: sekme durumu URL'dedir, geri tuşu çalışır", async ({
  page,
}) => {
  await login(page);
  await page.goto("/sozlesmeler/isveren/p-1");

  const tabs = page.getByRole("navigation", { name: "Sözleşme detay sekmeleri" });
  await expect(tabs.getByRole("link", { name: "Genel" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  await tabs.getByRole("link", { name: "İş Kalemleri" }).click();
  await expect(page).toHaveURL(/\/sozlesmeler\/isveren\/p-1\?tab=items$/);
  await expect(tabs.getByRole("link", { name: "İş Kalemleri" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  await page.goBack();
  await expect(page).toHaveURL(/\/sozlesmeler\/isveren\/p-1$/);
  await expect(tabs.getByRole("link", { name: "Genel" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("işveren sözleşme detayı: İş Kalemleri sekmesi — dağıtılan/kalan kolonları + POZ girişi", async ({
  page,
}) => {
  await login(page);
  await page.goto("/sozlesmeler/isveren/p-1?tab=items");

  for (const header of [
    "Poz No",
    "Poz Adı",
    "Birim",
    "Sözl. Birim F.",
    "Toplam Miktar",
    "Dağıtılan",
    "Kalan",
  ]) {
    await expect(page.getByRole("columnheader", { name: header, exact: true })).toBeVisible();
  }

  await expect(page.getByTestId("ecd-item-distributed").first()).toBeVisible();
  await expect(page.getByTestId("ecd-item-remaining").first()).toBeVisible();

  // POZ ekranına GÖRÜNÜR giriş (T4'te yazılacak rota).
  await expect(page.getByTestId("ecd-distribution-link")).toHaveAttribute(
    "href",
    "/sozlesmeler/isveren/p-1/poz-dagilimi",
  );
});

test("işveren sözleşme detayı: Hakedişler sekmesi proje filtrelidir", async ({ page }) => {
  await login(page);
  await page.goto("/sozlesmeler/isveren/p-1?tab=payments");

  // p-1 hakedişleri gelir; proje adı etiketi TEKRAR basılmaz (başlıkta var).
  const list = page.locator("main").locator(".pp-list");
  await expect(list).toBeVisible();
  await expect(list.locator(".pp-row__project")).toHaveCount(0);
  await expect(list.getByRole("link").first()).toHaveAttribute(
    "href",
    /\/hakedisler\/[^/]+$/,
  );
});

test("işveren sözleşme detayı: Belgeler sekmesi basılır, içerik PENDING'dir", async ({
  page,
}) => {
  await login(page);
  await page.goto("/sozlesmeler/isveren/p-1?tab=documents");

  await expect(page.getByTestId("ecd-documents-pending")).toContainText(
    "Belge verisi bu yüzeye henüz bağlanmadı",
  );
  // Arşiv ekranı bu dilimde YAZILMAZ — tablo/yükleme yüzeyi yok.
  await expect(page.locator("main").locator(".ecd-items")).toHaveCount(0);
});
