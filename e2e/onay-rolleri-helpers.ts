import { expect, type Page } from "@playwright/test";

// F-OKROL · `Ayarlar > Onay Eşiği` (eski: Onay Rolleri ve Eşik) e2e'lerinin ORTAK yardımcıları.
//
// ⚠️ Bu dosya `*.spec.ts` DEĞİLDİR; `prepareFrame` BURADAN RE-EXPORT EDİLMEZ
// (görsel kadraj bekçisi yalnız `from "./visual-scroll"` yazan spec'leri tarar).

export const VISUAL_VIEWPORT = { width: 1440, height: 900 } as const;

export const APPROVAL_ROLES_URL = "/ayarlar/onay-rolleri";

export async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/e-posta/i).fill("patron@fiil.com");
  await page.getByLabel(/^şifre$/i).fill("dogruparola");
  await page.getByRole("button", { name: /giriş yap/i }).click();
  await expect(page.getByRole("heading", { name: "Gösterge Paneli" })).toBeVisible();
}

/**
 * Ekranı açar ve eşik kaynağının (`GET /approvals/settings`) indiğini doğrular
 * (WORKFLOW §4 "GÖRSEL SPEC KURALI"). IZN-B3b: kullanıcı × rol tablosu
 * kalktı; ekranı yalnız eşik besliyor.
 */
export async function openApprovalRoles(page: Page) {
  await page.goto(APPROVAL_ROLES_URL);
  await expect(page.getByRole("heading", { level: 1, name: "Onay Eşiği" })).toBeVisible();
  // `GET /approvals/settings` — eşik şeridi.
  await expect(page.getByText("₺500.000 ve üstü")).toBeVisible();
  await expect(page.getByText("Yükleniyor…")).toHaveCount(0);
}
