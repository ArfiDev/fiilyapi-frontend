import { test, expect } from "@playwright/test";

import { APPROVAL_ROLES_URL, login, openApprovalRoles } from "./onay-rolleri-helpers";

// F-OKROL · `Ayarlar - Onay Rolleri ve Eşik` FONKSİYONEL e2e'si.
// Kanonik mockup: `projedesign/Ayarlar - Onay Rolleri.dc.html`.
//
// 🔒 SALT-OKUR: bu dosya HİÇBİR mutasyon tetiklemez. Yazma yolu
// `onay-rolleri-api.spec.ts`tedir ve orada YALNIZ kimsenin bakmadığı yazma
// hedefine dokunulur — paylaşılan mock durumunda bir çip toggle'ı bu ekranın
// KENDİ karesini oynatırdı (`fullyParallel`, F-UNIT2 dersi).
//
// ⚠️ `getByRole("alert")` KULLANILMAZ (F-P6 dersi).

test("ayarlar menusundeki 'Onay Rolleri ve Eşik' gercek ekrani acar", async ({ page }) => {
  await login(page);
  await page.goto("/ayarlar/kullanicilar");

  await page
    .getByRole("complementary", { name: "Ayarlar menüsü" })
    .getByRole("link", { name: /Onay Rolleri ve Eşik/ })
    .click();

  await expect(page).toHaveURL(new RegExp(`${APPROVAL_ROLES_URL}$`));
  await expect(page.getByRole("heading", { level: 1, name: "Onay Rolleri ve Eşik" })).toBeVisible();
  // 🔴 Bu dilimin ÖZÜ: menüsü olmayan ekran kullanıcıya görünmez.
  await expect(page.locator("main").getByText("Bu modül yakında eklenecek.")).toHaveCount(0);
});

test("rolu OLMAYAN kullanici da satir alir — atama ucu onlari dondurmez", async ({ page }) => {
  await login(page);
  await openApprovalRoles(page);

  // Sercan Öztürk `GET /approvals/roles`ta VARDIR; asıl kanıt, hiçbir rolü
  // basılı OLMAYAN bir satırın da render edilmesidir. Mock seed'inde beş
  // kullanıcının hepsi rollü olduğu için burada kümenin BÜTÜNLÜĞÜ ölçülür:
  // katalogdaki her kullanıcı tabloya girer.
  // İddia TABLOYA sabitlenir: kabuk sidebar'ı da oturum sahibinin adını
  // basıyor, çıplak `getByText` strict-mode ihlali verir.
  const table = page.locator(".okr-table");
  for (const name of ["Ahmet Yılmaz", "Sercan Öztürk", "Ayşe Demir", "Kadir Arslan", "Yusuf Kaya"]) {
    await expect(table.getByText(name, { exact: true })).toBeVisible();
  }
  await expect(page.locator(".okr-table tbody tr")).toHaveCount(5);
  // 🔴 Sayaç VERİDEN türetilir — mockup'ın "8 kullanıcı"sı BASILMAZ.
  await expect(page.getByText("5 kullanıcı")).toBeVisible();
  await expect(page.getByText("8 kullanıcı")).toHaveCount(0);
});

test("bir kullanici BIRDEN COK onay rolu tasir ve hepsi basili gorunur", async ({ page }) => {
  await login(page);
  await openApprovalRoles(page);

  const row = page.locator(".okr-table tbody tr", { hasText: "Kadir Arslan" });
  await expect(row.getByRole("button", { name: "Şantiye Şefi", pressed: true })).toBeVisible();
  await expect(row.getByRole("button", { name: "Proje Müdürü", pressed: true })).toBeVisible();
  await expect(row.getByRole("button", { name: "Patron", pressed: false })).toBeVisible();
});

test("'Bekleyen' kolonu SAYI UYDURMAZ — devre disi ve gerekcesi gorunur", async ({ page }) => {
  await login(page);
  await openApprovalRoles(page);

  const head = page.getByRole("columnheader", { name: "Bekleyen" });
  await expect(head).toHaveAttribute("aria-disabled", "true");
  // 🔴 YAPISAL iddia (F-DASHONAY dersi): hücrelerde RAKAM YOKTUR.
  const cells = page.locator(".okr-td--pending");
  await expect(cells).toHaveCount(5);
  for (const text of await cells.allInnerTexts()) {
    expect(text).not.toMatch(/\d/);
  }
  await expect(
    page.getByText("Kullanıcı başına bekleyen onay sayısı henüz hiçbir uçtan gelmiyor", {
      exact: false,
    }),
  ).toBeVisible();
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
