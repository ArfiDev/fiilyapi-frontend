import { test, expect, type Page, type Route } from "@playwright/test";

import { prepareFrame } from "./visual-scroll";

// DSC-F1.2 · Kullanıcı Disiplin Ataması görsel kareleri (yalnız 1440×900).
// Kaynak mockup: Ayarlar - Kullanıcı Disiplin Ataması.dc.html.
//
// 🔒 İZOLASYON: paylaşılan sahte backend durumuna YAZILMAZ. `fullyParallel`
// altında `ayarlar-kullanicilar` karesi (settings-visual.spec.ts) aynı kullanıcı
// tablosunu basar; burada atama PUT'ları sahte backend'e gitseydi o kare
// yarışırdı. Bu yüzden disiplin uçları TARAYICI KATMANINDA (`page.route`)
// sahtelenir — durum yalnız o testin sayfasında yaşar, temizlik gerekmez.
//
// 📌 j karesi: sahte backend tohumu 4 disiplin taşır; tohumu genişletmek mevcut
// EV kadrajlarını değiştirir (CEO kararı) → YALNIZ bu testte 7 kayıtlı liste
// `page.route` ile verilir (aramalı liste 6'dan uzun listede görünür).
//
// ⏱️ Tarih sabitlenir (`page.clock.setFixedTime`) — navigasyondan ÖNCE.
// Modal/menü kareleri `fullPage`tir (örtü katmanı da kadraja girsin); her
// karede `prepareFrame` `toHaveScreenshot`tan hemen önceki SON çağrıdır.

const FIXED_NOW = "2026-09-24T09:00:00Z";

interface Discipline {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly color: string;
  readonly used: number;
}

const KAB: Discipline = { id: "00000000-0000-4000-8000-0000000000a1", code: "KAB", name: "Kaba İnşaat", color: "#2563eb", used: 12 };
const DUV: Discipline = { id: "00000000-0000-4000-8000-0000000000a2", code: "DUV", name: "Duvar & Sıva", color: "#93c5fd", used: 6 };
const MEK: Discipline = { id: "00000000-0000-4000-8000-0000000000a3", code: "MEK", name: "Mekanik Tesisat", color: "#64748b", used: 9 };
const ELK: Discipline = { id: "00000000-0000-4000-8000-0000000000a4", code: "ELK", name: "Elektrik", color: "#cbd5e1", used: 7 };
const CEL: Discipline = { id: "00000000-0000-4000-8000-0000000000a5", code: "CEL", name: "Çelik Yapı", color: "#2563eb", used: 5 };
const ALT: Discipline = { id: "00000000-0000-4000-8000-0000000000a6", code: "ALT", name: "Altyapı", color: "#93c5fd", used: 4 };
const PEY: Discipline = { id: "00000000-0000-4000-8000-0000000000a7", code: "PEY", name: "Peyzaj", color: "#64748b", used: 3 };

const CATALOG_4 = [KAB, DUV, MEK, ELK];
const CATALOG_7 = [KAB, DUV, MEK, ELK, CEL, ALT, PEY];

/** Sahte backend tohum kullanıcıları (`e2e/mock-backend.ts`): u-1 Patron … u-5 Satınalma. */
const ASSIGNED: Record<string, readonly Discipline[]> = {
  "u-1": [],
  "u-2": [KAB],
  "u-3": [],
  "u-4": [KAB, DUV],
  "u-5": [KAB, DUV, MEK, ELK],
};

const ref = (d: Discipline) => ({ id: d.id, code: d.code, name: d.name, color: d.color });
const read = (d: Discipline, index: number) => ({
  ...ref(d),
  default_contractor_type: "own",
  sort_order: index,
  used_by_item_count: d.used,
  used_by_site_count: 0,
  user_count: 0,
});
const assignmentBody = (list: readonly Discipline[]) => ({
  discipline_ids: list.map((d) => d.id).sort(),
  disciplines: [...list].sort((a, b) => a.id.localeCompare(b.id)).map(ref),
});

function fulfillJson(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function stubAssignments(page: Page, onPut?: (route: Route) => Promise<void> | void) {
  await page.route("**/api/backend/users/*/disciplines", async (route) => {
    const request = route.request();
    if (request.method() === "PUT") {
      if (onPut) return onPut(route);
      return fulfillJson(route, assignmentBody([]));
    }
    const userId = /\/users\/([^/]+)\/disciplines/.exec(request.url())?.[1] ?? "";
    return fulfillJson(route, assignmentBody(ASSIGNED[userId] ?? []));
  });
}

async function stubCatalog(page: Page, catalog: readonly Discipline[] | 403) {
  await page.route("**/api/backend/earned-value/disciplines", (route) =>
    catalog === 403 ? fulfillJson(route, { detail: "Yetkisiz işlem" }, 403) : fulfillJson(route, catalog.map(read)),
  );
}

async function login(page: Page) {
  await page.clock.setFixedTime(new Date(FIXED_NOW));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/login");
  await page.getByLabel(/e-posta/i).fill("patron@fiil.com");
  await page.getByLabel(/^şifre$/i).fill("dogruparola");
  await page.getByRole("button", { name: /giriş yap/i }).click();
  await expect(page.getByRole("heading", { name: "Gösterge Paneli" })).toBeVisible();
}

async function openUsers(page: Page) {
  await page.goto("/ayarlar/kullanicilar");
  await expect(page.getByRole("cell", { name: /Ahmet Yılmaz/ })).toBeVisible();
  // Atama hücreleri dolu: u-5'in ikinci rozeti + "Tümü (kısıtsız)" (u-1) basılı.
  const yusuf = page.getByRole("row", { name: /Yusuf Kaya/ });
  await expect(yusuf.getByText("+2")).toBeVisible();
  await expect(page.getByRole("row", { name: /Ahmet Yılmaz/ }).getByText("Tümü (kısıtsız)")).toBeVisible();
}

async function openModal(page: Page, userName: RegExp) {
  await page.getByRole("row", { name: userName }).getByRole("button", { name: /Disiplin atamasını düzenle/ }).click();
  const dialog = page.getByRole("dialog", { name: "Disiplin Ataması" });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Liste yüklendi VE etkin (atama GET'i döndü) olana dek bekler. */
async function expectListReady(dialog: ReturnType<Page["getByRole"]>) {
  await expect(dialog.getByRole("checkbox").first()).toBeEnabled();
}

test("gorsel: disiplin kullanicilar tablosu (0/1/2/4 rozet)", async ({ page }) => {
  await login(page);
  await stubAssignments(page);
  await openUsers(page);
  await prepareFrame(page);
  await expect(page).toHaveScreenshot("ayarlar-disiplin-tablo.png", { fullPage: true });
});

test("gorsel: disiplin kullanicilar tablosu +N tooltip acik", async ({ page }) => {
  await login(page);
  await stubAssignments(page);
  await openUsers(page);
  // Fare DEĞİL odak: `prepareFrame` imleci parklar (mouseleave tooltip'i kapatırdı).
  await page.getByRole("row", { name: /Yusuf Kaya/ }).getByRole("button", { name: /Disiplin atamasını düzenle/ }).focus();
  await expect(page.getByRole("tooltip")).toContainText("4 disiplinle sınırlı");
  await prepareFrame(page);
  await expect(page).toHaveScreenshot("ayarlar-disiplin-tablo-tooltip.png", { fullPage: true });
});

test("gorsel: disiplin modali kisitsiz", async ({ page }) => {
  await login(page);
  await stubAssignments(page);
  await stubCatalog(page, CATALOG_4);
  await openUsers(page);
  const dialog = await openModal(page, /Ayşe Demir/);
  await expectListReady(dialog);
  await expect(dialog.getByText("Kısıtsız — tüm disiplinleri görür")).toBeVisible();
  await prepareFrame(page);
  await expect(page).toHaveScreenshot("ayarlar-disiplin-modal-kisitsiz.png", { fullPage: true });
});

test("gorsel: disiplin modali 2 secili kirli", async ({ page }) => {
  await login(page);
  await stubAssignments(page);
  await stubCatalog(page, CATALOG_4);
  await openUsers(page);
  const dialog = await openModal(page, /Ayşe Demir/);
  await expectListReady(dialog);
  await dialog.getByRole("checkbox", { name: /Kaba İnşaat/ }).check();
  await dialog.getByRole("checkbox", { name: /Elektrik/ }).check();
  await expect(dialog.getByText("2 disiplinle sınırlı")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Kaydet" })).toBeEnabled();
  await prepareFrame(page);
  await expect(page).toHaveScreenshot("ayarlar-disiplin-modal-secili.png", { fullPage: true });
});

test("gorsel: disiplin modali yonetici uyarisi", async ({ page }) => {
  await login(page);
  await stubAssignments(page);
  await stubCatalog(page, CATALOG_4);
  await openUsers(page);
  // u-4 Kadir Arslan = Proje Müdürü (`project_manager`), atanmış 2 disiplin → uyarı.
  const dialog = await openModal(page, /Kadir Arslan/);
  await expectListReady(dialog);
  // Mockup (c): kirli seçim (3. disiplin eklendi) → Kaydet ETKİN, uyarı kayıt ENGELLEMEZ.
  await dialog.getByRole("checkbox", { name: /Mekanik/ }).check();
  await expect(dialog.getByRole("button", { name: "Kaydet" })).toBeEnabled();
  await expect(dialog.getByText(/Bu kullanıcı yönetici rolünde/)).toBeVisible();
  await prepareFrame(page);
  await expect(page).toHaveScreenshot("ayarlar-disiplin-modal-yonetici-uyarisi.png", { fullPage: true });
});

test("gorsel: disiplin modali kaydediliyor", async ({ page }) => {
  await login(page);
  await stubAssignments(page, () => new Promise<void>(() => {})); // PUT askıda
  await stubCatalog(page, CATALOG_4);
  await openUsers(page);
  const dialog = await openModal(page, /Ayşe Demir/);
  await expectListReady(dialog);
  await dialog.getByRole("checkbox", { name: /Kaba İnşaat/ }).check();
  await dialog.getByRole("button", { name: "Kaydet" }).click();
  await expect(dialog.getByText("Kaydediliyor…")).toBeVisible();
  await prepareFrame(page);
  await expect(page).toHaveScreenshot("ayarlar-disiplin-modal-kaydediliyor.png", { fullPage: true });
});

test("gorsel: disiplin modali sunucu hatasi 503", async ({ page }) => {
  await login(page);
  await stubAssignments(page, (route) => fulfillJson(route, {}, 503));
  await stubCatalog(page, CATALOG_4);
  await openUsers(page);
  const dialog = await openModal(page, /Ayşe Demir/);
  await expectListReady(dialog);
  await dialog.getByRole("checkbox", { name: /Kaba İnşaat/ }).check();
  await dialog.getByRole("checkbox", { name: /Duvar/ }).check();
  await dialog.getByRole("button", { name: "Kaydet" }).click();
  await expect(dialog.getByText("Kaydedilemedi.")).toBeVisible();
  await prepareFrame(page);
  await expect(page).toHaveScreenshot("ayarlar-disiplin-modal-sunucu-hatasi.png", { fullPage: true });
});

test("gorsel: disiplin modali bos katalog", async ({ page }) => {
  await login(page);
  await stubAssignments(page);
  await stubCatalog(page, []);
  await openUsers(page);
  const dialog = await openModal(page, /Ayşe Demir/);
  await expect(dialog.getByText("Henüz disiplin tanımlı değil")).toBeVisible();
  await prepareFrame(page);
  await expect(page).toHaveScreenshot("ayarlar-disiplin-modal-bos-katalog.png", { fullPage: true });
});

test("gorsel: disiplin modali kirli kapatma onayi", async ({ page }) => {
  await login(page);
  await stubAssignments(page);
  await stubCatalog(page, CATALOG_4);
  await openUsers(page);
  const dialog = await openModal(page, /Ayşe Demir/);
  await expectListReady(dialog);
  await dialog.getByRole("checkbox", { name: /Mekanik/ }).check();
  await dialog.getByRole("button", { name: "Vazgeç" }).click();
  await expect(page.getByRole("alertdialog", { name: "Kaydedilmemiş değişiklikler var" })).toBeVisible();
  await prepareFrame(page);
  await expect(page).toHaveScreenshot("ayarlar-disiplin-modal-kirli-kapatma.png", { fullPage: true });
});

test("gorsel: disiplin modali yetki yok 403", async ({ page }) => {
  await login(page);
  await stubAssignments(page);
  await stubCatalog(page, 403);
  await openUsers(page);
  const dialog = await openModal(page, /Ayşe Demir/);
  await expect(dialog.getByText("Disiplin listesini görme yetkiniz yok.")).toBeVisible();
  await prepareFrame(page);
  await expect(page).toHaveScreenshot("ayarlar-disiplin-modal-yetki-yok.png", { fullPage: true });
});

test("gorsel: disiplin modali aramali liste", async ({ page }) => {
  await login(page);
  await stubAssignments(page);
  await stubCatalog(page, CATALOG_7);
  await openUsers(page);
  const dialog = await openModal(page, /Ayşe Demir/);
  await expectListReady(dialog);
  await dialog.getByPlaceholder("Disiplin ara (kod ya da ad)").fill("el");
  await expect(dialog.getByRole("checkbox")).toHaveCount(2);
  await dialog.getByRole("checkbox", { name: /Elektrik/ }).check();
  await expect(dialog.getByText("1 / 7 seçili")).toBeVisible();
  await prepareFrame(page);
  await expect(page).toHaveScreenshot("ayarlar-disiplin-modal-arama.png", { fullPage: true });
});

test("gorsel: avatar menusu acik atamasiz", async ({ page }) => {
  await login(page);
  await page.goto("/ayarlar/kullanicilar");
  await expect(page.getByRole("cell", { name: /Ahmet Yılmaz/ })).toBeVisible();
  await page.getByRole("button", { name: "Kullanıcı menüsü" }).click();
  const menu = page.getByRole("menu", { name: "Kullanıcı menüsü" });
  await expect(menu).toBeVisible();
  await expect(page.getByText("Tümü (kısıtsız)").first()).toBeVisible();
  await prepareFrame(page);
  await expect(page).toHaveScreenshot("ayarlar-disiplin-avatar-menu-kisitsiz.png", { fullPage: true });
});

test("gorsel: avatar menusu acik kisitli", async ({ page }) => {
  await login(page);
  // `/auth/me` yalnız bu sayfada 2 disiplinli döner; sahte backend durumu kirlenmez.
  await page.route("**/api/auth/me", async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as Record<string, unknown>;
    return fulfillJson(route, { ...body, disciplines: [ref(KAB), ref(DUV)] });
  });
  await page.goto("/ayarlar/kullanicilar");
  await expect(page.getByRole("cell", { name: /Ahmet Yılmaz/ })).toBeVisible();
  await page.getByRole("button", { name: "Kullanıcı menüsü" }).click();
  await expect(page.getByRole("menu", { name: "Kullanıcı menüsü" })).toBeVisible();
  await expect(page.getByText("Kaba İnşaat ve Duvar & Sıva")).toBeVisible();
  await prepareFrame(page);
  await expect(page).toHaveScreenshot("ayarlar-disiplin-avatar-menu-kisitli.png", { fullPage: true });
});
