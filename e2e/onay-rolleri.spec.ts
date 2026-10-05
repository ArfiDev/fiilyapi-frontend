import { test, expect } from "@playwright/test";

import { APPROVAL_ROLES_URL, login, openApprovalRoles } from "./onay-rolleri-helpers";

// F-OKROL · `Ayarlar > Onay Eşiği` (eski: Onay Rolleri ve Eşik) FONKSİYONEL e2e'si.
// Kanonik mockup: `projedesign/Ayarlar - Onay Rolleri.dc.html`.
//
// 🔒 SALT-OKUR: bu dosya HİÇBİR mutasyon tetiklemez. Eşik yazma
// uçları `onay-rolleri-api.spec.ts`tedir ve yalnız REDDEDİLEN gövde dener.
//
// ⚠️ `getByRole("alert")` KULLANILMAZ (F-P6 dersi).

test("ayarlar menusundeki 'Onay Eşiği' gercek ekrani acar", async ({ page }) => {
  await login(page);
  await page.goto("/ayarlar/kullanicilar");

  await page
    .getByRole("complementary", { name: "Ayarlar menüsü" })
    .getByRole("link", { name: /Onay Eşiği/ })
    .click();

  await expect(page).toHaveURL(new RegExp(`${APPROVAL_ROLES_URL}$`));
  await expect(page.getByRole("heading", { level: 1, name: "Onay Eşiği" })).toBeVisible();
  // 🔴 Bu dilimin ÖZÜ: menüsü olmayan ekran kullanıcıya görünmez.
  await expect(page.locator("main").getByText("Bu modül yakında eklenecek.")).toHaveCount(0);
});

test("IZN-B3b: kullanici x rol tablosu YOK, yonlendirme notu VAR", async ({ page }) => {
  await login(page);
  await openApprovalRoles(page);

  await expect(page.locator("table")).toHaveCount(0);
  await expect(
    page.getByText("Onayı, belgenin projesinde ilgili role atanmış kişi verir", { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /^Kullanıcılar/ }).last()).toHaveAttribute(
    "href",
    "/ayarlar/kullanicilar",
  );
});

test("esik korkulugu: sozlesmenin reddedecegi deger ISTEK URETMEZ", async ({ page }) => {
  await login(page);
  await openApprovalRoles(page);

  const requests: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "PUT" && r.url().includes("/approvals/settings")) requests.push(r.url());
  });

  const input = page.getByLabel(/Patron Onay Eşiği/);
  await input.fill("-1");
  await page.getByTestId("okr-threshold-save").click();

  await expect(page.getByText("Eşik negatif olamaz.")).toBeVisible();
  expect(requests).toEqual([]);
  // Eşik ayarı DEĞİŞMEDİ — şerit hâlâ eski değeri okuyor (kare güvenliği).
  await expect(page.getByText("₺500.000 ve üstü")).toBeVisible();
});

test("esik serildi `>=` glifi BASMAZ (kapsanmayan glif yasagi)", async ({ page }) => {
  await login(page);
  await openApprovalRoles(page);

  const body = await page.locator("body").innerText();
  expect(body).not.toContain("≥");
  expect(body).toContain("₺500.000 altı");
});
