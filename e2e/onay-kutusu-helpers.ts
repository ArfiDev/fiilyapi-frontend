import { expect, type Page } from "@playwright/test";

// F-OK T5 · Onay Kutusu e2e'lerinin ORTAK yardımcıları
// (`financial-instruments-helpers.ts` deseninin aynısı).
//
// ⚠️ Bu dosya `*.spec.ts` DEĞİLDİR; Playwright onu test dosyası olarak
// toplamaz, yalnız import edilir. `prepareFrame` BURADAN RE-EXPORT EDİLMEZ:
// görsel kadraj bekçisi (`src/test-guards/visual-frame-guard.test.ts`) yalnız
// `from "./visual-scroll"` yazan spec'leri tarar.

/** Görsel kadrajların ORTAK penceresi — mevcut görsel spec'lerle aynı. */
export const VISUAL_VIEWPORT = { width: 1440, height: 900 } as const;

export const APPROVALS_URL = "/onay-kutusu";

/**
 * 📅 TARİH BAĞIMSIZLIĞI: ekran istemci saatine HİÇ dokunmaz. `created_at`
 * mutlak bir tarihe çevrilir (`formatDateLong`) — mockup'ın "2 gün önce"
 * GÖRELİ ifadesi bilinçli olarak uygulanmadı, çünkü `Date.now()`e bağlı bir
 * metin kareyi HER GÜN oynatırdı. Bu yüzden `page.clock` GEREKMEZ.
 */

export async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/e-posta/i).fill("patron@fiil.com");
  await page.getByLabel(/^şifre$/i).fill("dogruparola");
  await page.getByRole("button", { name: /giriş yap/i }).click();
  await expect(page.getByRole("heading", { name: "Gösterge Paneli" })).toBeVisible();
}

/**
 * Ekranı açar ve İKİ BAĞIMSIZ KAYNAĞIN da indiğini doğrular (WORKFLOW §4
 * "GÖRSEL SPEC KURALI" 1. + 5. parça): onay listesi (`/approvals`) ve eşik
 * ayarı (`/approvals/settings`) AYRI sorgulardır. Tek bayrak beklemek
 * ötekinin hâlâ pending olduğunu GİZLERDİ ve kadraj eşiksiz bir rol akışı
 * şeridini donmuş yakalayabilirdi.
 */
export async function openApprovals(page: Page) {
  await page.goto(APPROVALS_URL);
  await expect(page.getByRole("heading", { level: 1, name: "Onay Kutusu" })).toBeVisible();
  await expect(page.getByTestId("ok-loaded-list")).toBeAttached();
  await expect(page.getByTestId("ok-loaded-settings")).toBeAttached();
  await expect(page.getByTestId("ok-loading")).toHaveCount(0);
}

/**
 * Belirli bir sekmeyi `?sekme=` ile açar (OKT-F1.2). Liste "yüklendi" bayrağı
 * AKTİF sekmenin verisine bağlıdır (`ok-loaded-list`); sekme seçili olduğu da
 * ayrıca doğrulanır.
 */
export async function openApprovalsTab(page: Page, key: "tumu" | "onaylanan" | "reddedilen") {
  await page.goto(`${APPROVALS_URL}?sekme=${key}`);
  await expect(page.getByRole("heading", { level: 1, name: "Onay Kutusu" })).toBeVisible();
  await expect(page.getByTestId(`ok-tab-${key}`)).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("ok-loaded-list")).toBeAttached();
  await expect(page.getByTestId("ok-loaded-settings")).toBeAttached();
  await expect(page.getByTestId("ok-loading")).toHaveCount(0);
}

/** Görsel kadrajların girişi — pencereyi ORTAK ölçüye çeker, sonra girer. */
export async function visualLogin(page: Page) {
  await page.setViewportSize({ ...VISUAL_VIEWPORT });
  await login(page);
}

/** 🔒 YAZMA HEDEFİ — `hiddenFromLists` işaretli, başka hiçbir spec'in bakmadığı kayıt. */
export const WRITE_TARGET_TITLE = "Onay Kutusu Yazma Hedefi — Hakediş #1";
