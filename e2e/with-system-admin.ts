import type { Page } from "@playwright/test";

/**
 * IZN-F6d · `need: "sa"` kapılı eylemi (silme / geri al / parola) SINAYAN kadraj/test için: oturum yükü YALNIZ
 * bu sayfada sistem yöneticisi olur (`site-detail-visual` deseni; paylaşılan mock'a yazılmaz). Navigasyondan
 * ÖNCE çağrılmalıdır; `withEarnedValueLevel` ile BİRLEŞTİRİLMEZ (tek `/auth/me` yolu kazanır).
 */
export async function withSystemAdmin(page: Page) {
  await page.route("**/api/auth/me", async (route) => {
    const response = await route.fetch();
    const me = (await response.json()) as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...me, is_system_admin: true }),
    });
  });
}
