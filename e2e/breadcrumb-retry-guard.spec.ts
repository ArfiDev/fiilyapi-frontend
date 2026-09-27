import { test, expect, type Page } from "@playwright/test";

/**
 * SEKME-F1.5-FIX · BEKÇİ — kırıntının (`useCrumbNames`) paylaşılan Query
 * `options`'ını ZEHİRLEMEDİĞİNİN e2e kanıtı.
 *
 * Kök kusur (ölçüldü, `useCrumbNames.retry-poisoning.test.tsx` +
 * `page.retry-poisoning.test.tsx`te birim/bileşen seviyesinde doğrulandı):
 * kırıntı eskiden `useQuery({ queryFn: skipToken })` ile abone oluyordu;
 * sayfadan SONRA yeniden çizildiğinde paylaşılan Query'nin `options`'ını
 * skipToken'a çeviriyordu. `QueryProvider`'da `retry: 1` açıkken bu,
 * YENİDEN DENEMENİN ağa hiç çıkmadan senkron reddetmesine yol açıyordu —
 * yani bilinmeyen bir kayıtta AĞA GİDEN İSTEK SAYISI 2 DEĞİL 1'de kalıyordu
 * (ilk deneme sonrası kırıntı hemen zehirliyor, retry hiç fetch etmiyor).
 *
 * Bu bekçi ağa giden GERÇEK istek sayısını sayar: kırıntı sağlıklıysa
 * `retry: 1` her zaman TAM 2 istek üretir (ilk deneme + 1 yeniden deneme).
 * Sayı 1'e düşerse zehirlenme GERİ GELMİŞTİR.
 */

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/e-posta/i).fill("patron@fiil.com");
  await page.getByLabel(/^şifre$/i).fill("dogruparola");
  await page.getByRole("button", { name: /giriş yap/i }).click();
  await expect(page.getByRole("heading", { name: "Gösterge Paneli" })).toBeVisible();
}

function countRequestsTo(page: Page, needle: string): { count: () => number } {
  let count = 0;
  page.on("request", (request) => {
    if (request.url().includes(needle)) count += 1;
  });
  return { count: () => count };
}

test("proje detay: bilinmeyen kayıtta yeniden deneme ağa çıkar (2 istek), kırıntı zehirlemez", async ({
  page,
}) => {
  await login(page);
  const requests = countRequestsTo(page, "/api/backend/projects/yok-boyle-bir-proje");

  await page.goto("/projeler/yok-boyle-bir-proje");
  await expect(page.locator("main").getByText("Proje yüklenemedi")).toBeVisible();

  // Yeniden deneme penceresi (retry: 1, üstel gecikme) geçsin.
  await page.waitForTimeout(2000);
  expect(requests.count()).toBe(2);
});

test("şantiye detay: bilinmeyen kayıtta yeniden deneme ağa çıkar (2 istek), kırıntı zehirlemez", async ({
  page,
}) => {
  await login(page);
  const requests = countRequestsTo(page, "/api/backend/sites/yok-boyle-bir-santiye");

  await page.goto("/projeler/p-1/santiyeler/yok-boyle-bir-santiye");
  await expect(page.locator("main").getByText("Şantiye yüklenemedi")).toBeVisible();

  await page.waitForTimeout(2000);
  expect(requests.count()).toBe(2);
});
