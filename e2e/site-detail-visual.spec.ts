import { test, expect } from "@playwright/test";

import { prepareFrame } from "./visual-scroll";

// Şantiye Detay ekranı görsel testi (Task 12). mock-backend.ts'teki s-1
// (A-Blok Şantiyesi) iki bölümle gelir — biri aktif (mavi ilerleme şeması),
// biri tamamlandı (yeşil) — SectionCard'ın durum bazlı varyantlarını kapsar.
test("santiye detay ekrani gorsel", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/login");
  await page.getByLabel(/e-posta/i).fill("patron@fiil.com");
  await page.getByLabel(/^şifre$/i).fill("dogruparola");
  await page.getByRole("button", { name: /giriş yap/i }).click();
  await expect(page.getByRole("heading", { name: "Gösterge Paneli" })).toBeVisible();

  await page.goto("/projeler/p-1/santiyeler/s-1");
  await expect(page.getByRole("heading", { level: 1, name: "A-Blok Şantiyesi" })).toBeVisible();
  await expect(page.getByText("Kat 6–10 Kaba İnşaat")).toBeVisible();

  // Kadraj hazırlığı (kaydırma sıfırlama + imleç parkı): `visual-scroll.ts`.
  await prepareFrame(page);
  await expect(page).toHaveScreenshot("santiye-detay.png", { fullPage: true });
});

// SIL-F1.2 — ortak silme onay penceresi. Mock oturum `is_system_admin: false`
// döner (yukarıdaki kare Sil düğmesini GÖRMEZ); bu test oturumu yalnız kendi
// kadrajı için Sistem Yöneticisi yapar (`page.route`, paylaşılan durum oynamaz).
// Önizleme mock'u mali satır + "silinmeyecek" bölümü + "+N daha" örneği taşır.
test("silme onay penceresi gorsel", async ({ page }) => {
  await page.route("**/api/auth/me", async (route) => {
    const response = await route.fetch();
    const me = (await response.json()) as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...me, is_system_admin: true }),
    });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/login");
  await page.getByLabel(/e-posta/i).fill("patron@fiil.com");
  await page.getByLabel(/^şifre$/i).fill("dogruparola");
  await page.getByRole("button", { name: /giriş yap/i }).click();
  await expect(page.getByRole("heading", { name: "Gösterge Paneli" })).toBeVisible();

  await page.goto("/projeler/p-1/santiyeler/s-1");
  await expect(page.getByRole("heading", { level: 1, name: "A-Blok Şantiyesi" })).toBeVisible();
  await page.getByRole("button", { name: "Sil" }).click();
  const dialog = page.getByRole("dialog", { name: "Şantiye silinsin mi?" });
  await expect(dialog.getByText("A-Blok Şantiyesi ve bağlı 14 kayıt silinecek.")).toBeVisible();
  await expect(dialog.getByText("mali kayıt")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Sil" })).toBeEnabled();

  // Kadraj hazırlığı (kaydırma sıfırlama + imleç parkı): `visual-scroll.ts`.
  await prepareFrame(page);
  await expect(page).toHaveScreenshot("silme-onay-penceresi.png", { fullPage: true });
});

// SIL-F2.2 — MALİ silme önizlemesi: muhasebe fişleri listesi AÇIK (biri kapalı dönem + ters kayıt),
// kapalı dönem uyarısı ve kapanmış bordro mesajı. Mock önizleme yalnız BU testte `page.route` ile
// zenginleştirilir (paylaşılan mock/diğer kareler oynamaz); oturum yalnız bu kadraj için Sistem Yöneticisi.
test("silme onay penceresi mali gorsel", async ({ page }) => {
  await page.route("**/api/auth/me", async (route) => {
    const response = await route.fetch();
    const me = (await response.json()) as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...me, is_system_admin: true }),
    });
  });
  await page.route("**/api/backend/admin/silme/*/*/onizleme", async (route) => {
    const response = await route.fetch();
    const preview = (await response.json()) as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...preview,
        journal_entry_count: 3,
        closed_period_entry_count: 1,
        journal_entries: [
          {
            entry_no: "FIS-2026-0412",
            entry_date: "2026-05-14",
            status: "posted",
            is_reversal: false,
            source_type: "progress_payment",
            total: "1250000.00",
            period_closed: false,
          },
          {
            entry_no: "FIS-2026-0388",
            entry_date: "2026-03-31",
            status: "posted",
            is_reversal: false,
            source_type: "progress_payment",
            total: "980500.50",
            period_closed: true,
          },
          {
            entry_no: "FIS-2026-0389",
            entry_date: "2026-04-02",
            status: "reversed",
            is_reversal: true,
            source_type: null,
            total: "980500.50",
            period_closed: false,
          },
        ],
        other_projects: [{ project_id: "00000000-0000-4000-8000-0000000000b2", name: "Vadi Evleri", count: 4 }],
        status_changes: [{ kind: "invoice", label: "Fatura F-0007", from: "collected", to: "sent" }],
        closed_payroll_timesheet_count: 6,
        closed_payroll_periods: [{ year: 2026, month: 3, status: "closed" }],
        closed_payroll_message:
          "Kapanmış bordro dönemine ait 6 puantaj satırı bu şantiyeye bağlı; silinirse bordro yeniden hesaplanamaz.",
      }),
    });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/login");
  await page.getByLabel(/e-posta/i).fill("patron@fiil.com");
  await page.getByLabel(/^şifre$/i).fill("dogruparola");
  await page.getByRole("button", { name: /giriş yap/i }).click();
  await expect(page.getByRole("heading", { name: "Gösterge Paneli" })).toBeVisible();

  await page.goto("/projeler/p-1/santiyeler/s-1");
  await expect(page.getByRole("heading", { level: 1, name: "A-Blok Şantiyesi" })).toBeVisible();
  await page.getByRole("button", { name: "Sil" }).click();
  const dialog = page.getByRole("dialog", { name: "Şantiye silinsin mi?" });
  await dialog.getByText("Silinecek muhasebe fişleri (3)").click();
  await expect(dialog.getByText("FIS-2026-0388")).toBeVisible();
  // "kapalı dönem" hem uyarı satırında hem rozette geçer → yalnız rozet (tam metin).
  await expect(dialog.getByText("kapalı dönem", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Kapanmış bordro dönemine ait 6 puantaj satırı", { exact: false })).toBeVisible();
  await expect(dialog.getByText("Başka projeler de etkilenecek")).toBeVisible();
  await expect(dialog.getByText("Fatura F-0007: Tahsil Edildi → Gönderildi")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Sil" })).toBeEnabled();

  // Kadraj hazırlığı (kaydırma sıfırlama + imleç parkı): `visual-scroll.ts`.
  await prepareFrame(page);
  await expect(page).toHaveScreenshot("silme-onay-mali.png", { fullPage: true });
});
