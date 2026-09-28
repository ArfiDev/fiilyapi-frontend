import { test, expect, type Page } from "@playwright/test";

// F-P5 T2 · SZL (`/sozlesmeler`) fonksiyonel e2e. Kapsam: rotanın ComingSoon'dan
// çıkması, sekme URL state'i (+ geri tuşu), taşeron sekmesinde ilerleme/hakediş
// alanlarının "—" düşmesi, S2 devre-dışı butonu, "Taşeron Firmaları →" girişi,
// satır → detay hedefleri.
//
// ⚠️ `getByRole("alert")` KULLANILMAZ (Next route-announcer tuzağı). Bu dosya
// HİÇBİR mock kaydını mutasyona uğratmaz — yalnız okur.
//
// Zamanlayıcıya dayalı bekleme YOK.

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/e-posta/i).fill("patron@fiil.com");
  await page.getByLabel(/^şifre$/i).fill("dogruparola");
  await page.getByRole("button", { name: /giriş yap/i }).click();
  await expect(page.getByRole("heading", { name: "Gösterge Paneli" })).toBeVisible();
}

test("sözleşmeler: rota ComingSoon değil gerçek listedir", async ({ page }) => {
  await login(page);
  await page.goto("/sozlesmeler");

  await expect(page.getByRole("heading", { name: "Sözleşmeler" })).toBeVisible();
  await expect(page.locator("main").getByText("Bu modül yakında eklenecek.")).toHaveCount(0);
  await expect(page.getByTestId("szl-kpi-strip")).toBeVisible();
});

test("sözleşmeler: sekme durumu URL'dedir, geri tuşu çalışır", async ({ page }) => {
  await login(page);
  await page.goto("/sozlesmeler");

  const tabs = page.getByRole("navigation", { name: "Sözleşme türü" });
  await expect(tabs.getByRole("link", { name: "İşveren" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  await tabs.getByRole("link", { name: "Taşeron" }).click();
  await expect(page).toHaveURL(/\/sozlesmeler\?type=subcontractor$/);
  await expect(tabs.getByRole("link", { name: "Taşeron" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  await page.goBack();
  await expect(page).toHaveURL(/\/sozlesmeler$/);
  await expect(tabs.getByRole("link", { name: "İşveren" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("sözleşmeler: işveren sekmesi — çubuklu ilerleme + devre-dışı 'Yeni Sözleşme'", async ({
  page,
}) => {
  await login(page);
  await page.goto("/sozlesmeler");

  // Backend işveren satırında `progress_pct` DOLU döner → çubuk çizilir.
  await expect(page.getByTestId("szl-progress").first()).toBeVisible();
  await expect(page.getByTestId("szl-progress-pending")).toHaveCount(0);

  // ONAYLI KARAR S2: buton silinmez, devre dışı + görünür gerekçe.
  const disabled = page.getByTestId("szl-new-contract-disabled");
  await expect(disabled).toBeDisabled();
  await expect(page.locator("main").getByText("İşveren sözleşmesi proje formunda kurulur.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Taşeron Firmaları →" })).toHaveCount(0);

  // Satır → işveren detayı PROJE kimliğine gider (T3'te yazılacak rota).
  await expect(page.getByRole("link", { name: "Detay →" }).first()).toHaveAttribute(
    "href",
    /\/sozlesmeler\/isveren\/[^/]+$/,
  );
});

test("sözleşmeler: taşeron sekmesi — ilerleme GERÇEK, '—' yalnız BEDELSİZ sözleşmede", async ({
  page,
}) => {
  await login(page);
  await page.goto("/sozlesmeler?type=subcontractor");

  // 🔴 F-SZLPCT (2026-08-25) — bu testin eski hâli *"backend taşeron tarafında
  // ikisini de `None` döndürür"* diyordu ve ÜÇ KATMANIN (mock · bu spec ·
  // görsel spec) birbirini doğruladığı bir YALANDI:
  //   · `progress_pct`            → P-YT4  (`c0d3ac8`, 2026-08-23) bağladı,
  //   · `progress_payment_total`  → TH-SUM (`cb9e26e`, 2026-08-16) bağladı.
  // "—" ARTIK sekmenin özelliği DEĞİL, BEDELSİZ sözleşmenin özelliğidir:
  // `progress_pct` sıfır/negatif paydada bölme yapmaz. Fikstürde üç dal da
  // temsil edilir → sc-1 gerçek yüzde, sc-2 GERÇEK `%0` (hakedişi yok ama
  // bedeli var), kalemsiz sc-3 "—".
  //
  // HAK-NULL: fikstüre PROJE GENELİ `sc-4` eklendi (kalemli, dolayısıyla
  // bedelli) → gerçek yüzde basan sözleşme sayısı 2→3. "—" dalı DEĞİŞMEDİ:
  // bedelsiz olan hâlâ YALNIZ sc-3'tür, testin asıl iddiası odur.
  await expect(page.getByTestId("szl-progress")).toHaveCount(3);
  await expect(page.getByTestId("szl-progress-pending")).toHaveCount(1);
  await expect(page.getByTestId("szl-progress-pending")).toHaveAttribute(
    "title",
    "Sözleşme bedeli girilmemiş — ilerleme oranı hesaplanamaz",
  );
  // Hakediş toplamı KPI'ı da GERÇEK bir sayıdır; "—" bir daha DÖNMEZ.
  await expect(page.getByTestId("szl-kpi-payment-total")).not.toHaveText(/—/);
  // Kolon ve kart SİLİNMEZ.
  await expect(page.getByRole("columnheader", { name: "İlerleme" })).toBeVisible();
  await expect(page.locator("main").getByText("Toplam Hakediş")).toBeVisible();

  // İkinci kolon başlığı bu sekmede "Taşeron"dur.
  await expect(page.getByRole("columnheader", { name: "Taşeron", exact: true })).toBeVisible();

  await expect(page.getByRole("link", { name: "Taşeron Firmaları →" })).toHaveAttribute(
    "href",
    "/sozlesmeler/taseronlar",
  );
  await expect(page.getByRole("link", { name: "+ Yeni Sözleşme" })).toHaveAttribute(
    "href",
    "/sozlesmeler/taseron/yeni",
  );
  await expect(page.getByRole("link", { name: "Detay →" }).first()).toHaveAttribute(
    "href",
    /\/sozlesmeler\/taseron\/[^/]+$/,
  );
});
