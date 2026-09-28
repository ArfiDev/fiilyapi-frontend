import { expect, type Page } from "@playwright/test";

/**
 * `src/lib/workspace-tabs/types.ts`teki `WorkspaceTab`in KOPYASI — o dosyayı
 * doğrudan içe aktarmak `nav-config.ts` → `ui/icons` zincirini (CSS içe
 * aktarımı taşır) Playwright'ın Node tarafı derleyicisine sürükler ve
 * "Unexpected token" ile patlar (ölçüldü). Alan kümesi BİREBİR aynı kalmalı.
 */
interface WorkspaceTab {
  readonly id: string;
  readonly url: string;
  readonly moduleKey: string;
  readonly title: string;
  readonly lastViewedAt: number;
  readonly pinned: boolean;
}

/**
 * SEKME-F1.5 · e2e ortak yardımcıları — çalışma sekmeleri şeridi.
 *
 * Depo kanonu (`playwright.config.ts` + mevcut spec'ler): her test gerçek
 * girişten başlar, `localStorage` deterministiktir (her test temiz bağlamda
 * başlar — Playwright varsayılanı, ayrıca bağlam paylaşılmaz). Giriş deseni
 * `timesheet.spec.ts`/`project-detail-tabs.spec.ts` ile BİREBİR — patron
 * kullanıcısı, aynı e-posta/şifre.
 */

/** `mock-backend.ts` `ME.id` ile BİREBİR — kalıcılık anahtarı bunu taşır. */
export const ME_USER_ID = "11111111-1111-1111-1111-111111111111";
export const WORKSPACE_TABS_STORAGE_KEY = `fiil.workspaceTabs.v1:${ME_USER_ID}`;

export async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(/e-posta/i).fill("patron@fiil.com");
  await page.getByLabel(/^şifre$/i).fill("dogruparola");
  await page.getByRole("button", { name: /giriş yap/i }).click();
  await expect(page.getByRole("heading", { name: "Gösterge Paneli" })).toBeVisible();
}

/** Sol menüden DÜZ tıkla bir modül açar/öne getirir (bkz. `Sidebar.tsx`). */
export async function openViaSidebar(page: Page, label: string): Promise<void> {
  await page.locator(".sidebar-nav").getByRole("link", { name: label, exact: true }).click();
}

/** Sol menüdeki bağlantının kendisi — modifier tuşlu tıklama testleri için. */
export function sidebarLink(page: Page, label: string) {
  return page.locator(".sidebar-nav").getByRole("link", { name: label, exact: true });
}

export function tabsList(page: Page) {
  return page.getByRole("tablist", { name: "Çalışma sekmeleri" });
}

export function tabByName(page: Page, name: string, options?: { exact?: boolean }) {
  return tabsList(page).getByRole("tab", { name, exact: options?.exact ?? true });
}

export function closeTabButton(page: Page, tabTitle: string) {
  return page.getByRole("button", { name: `${tabTitle} sekmesini kapat` });
}

export function panelTab(page: Page) {
  return tabByName(page, "Gösterge Paneli");
}

export function unsavedGuardModal(page: Page) {
  return page.getByRole("dialog", { name: "Kaydedilmemiş değişiklikler var" });
}

/** Şeritte AÇIK olan sekme sayısı (panel dahil). */
export async function tabCount(page: Page): Promise<number> {
  return tabsList(page).getByRole("tab").count();
}

/** `fiil.workspaceTabs.v1:` önekli `localStorage` anahtarı sayısı. */
export async function workspaceStorageKeyCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    let count = 0;
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key !== null && key.startsWith("fiil.workspaceTabs.v1:")) count++;
    }
    return count;
  });
}

/**
 * `localStorage`ya doğrudan geçerli bir sekme durumu yazar (görsel/genişlik
 * testleri için — gerçek gezinmeden BAĞIMSIZ, `persistence.ts`teki doğrulayıcı
 * kurallarına birebir uyar: ilk sekme panel, tekil kimlikler). `moduleKey`
 * ÇAĞIRAN tarafından verilir (bkz. yukarıdaki not — `moduleOf` burada içe
 * aktarılamaz); üretimdeki gerçek değeriyle BİREBİR olmalı (`/faturalar`,
 * `/onay-kutusu` gibi kök modül url'leri için modül anahtarı url'in kendisidir).
 *
 * Sekmeler `page.goto`dan ÖNCE yazılmalı (tam sayfa yüklemesi mağazayı
 * kaydın SIFIRINDAN okumasını tetikler) — çağıran önce `login` ile aynı
 * kökene gelmiş olmalı (localStorage kökene bağlıdır).
 */
export async function seedWorkspaceTabs(
  page: Page,
  tabs: readonly WorkspaceTab[],
  activeId: string,
): Promise<void> {
  await page.evaluate(
    ([key, payload]) => {
      window.localStorage.setItem(key as string, payload as string);
    },
    [WORKSPACE_TABS_STORAGE_KEY, JSON.stringify({ version: 1, tabs, activeId })] as const,
  );
}
