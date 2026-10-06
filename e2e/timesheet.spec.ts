import { readFile } from "node:fs/promises";

import { test, expect, type Page } from "@playwright/test";

import type { components } from "@/lib/api/schema";

import { withPageLevels } from "./mock-role-pages";

type PageGrant = components["schemas"]["PageGrant"];
/** IZN-F6d · puantaj sayfaları (kök + şantiye + bölüm ikizi). */
const TIMESHEET_PAGE_KEYS = ["saha.puantaj", "santiye.puantaj", "bolum.puantaj"] as const;

// PUAN-SAAT · Puantaj fonksiyonel e2e (görsel DEĞİL).
// Kapsam: haftalık ızgaranın okunması, saat kutusu, kod popover'ı, Excel
// indirme, "Önceki Haftayı Kopyala" ve — bu dilimin EN KRİTİK KANITI —
// `PUT .../timesheet/week` KAPSAM KURALININ İKİ BACAĞI.
//
// ⚠️ KAPSAM KANITI NEDEN BURADA ÇALIŞIR: `mock-backend.ts`in PUT ucu gerçek
// backend gibi DEĞİŞTİRME semantiğini uygular — gövdede geçmeyen hücre
// SİLİNİR — ve kapsamı AY DEĞİL HAFTAdır. Ekran gövdeyi süzülmüş görünümden
// kursaydı aşağıdaki "diğer bölümün kaydı duruyor" iddiası GERÇEKTEN kırmızı
// olurdu; kapsam ay olsaydı "öbür hafta duruyor" iddiası kırmızı olurdu.
//
// 🔒 FİKSTÜR İZOLASYONU: 2026-W32 (3–9 Ağu) · s-1 GÖRSEL kadrajdır ve bu dosya
// onu YALNIZ OKUR. Tüm mutasyonlar 2026-W36'da (31 Ağu – 6 Eyl) yürür — orada
// iki farklı bölümün (sec-1 + sec-2) hücresi bilerek durur. 2026-W35 (24–30
// Ağu) "öbür hafta" tanığıdır ve HİÇ yazılmaz.
//
// ⚠️ `getByRole("alert")` bu depoda YASAKTIR — görünür metinle iddia edilir.
//
// ⚠️ AKIŞ-SSR ÇİFT KOPYA TUZAĞI (Linux CI'da fiilen patladı): streamed SSR
// sırasında sunucudan gelen kopya ile hidrasyonla eklenen kopya kısa bir an
// YAN YANA durur ve strict-mode ihlali verir. macOS'ta HİÇ görülmez. Bu yüzden
// TEKİL eleman bekleyen her locator `.first()` alır. `toHaveCount(0)`
// iddiaları İSTİSNADIR.

/** Görsel kadraj haftası — SALT-OKUR. */
const WEEK_32 = "iso_year=2026&iso_week=32";
/** Fonksiyonel oyun alanı — iki bölümlü, mutasyonlar burada. */
const WEEK_36 = "iso_year=2026&iso_week=36";
/** "Öbür hafta" tanığı — hiçbir test buraya YAZMAZ. */
const WEEK_35 = "iso_year=2026&iso_week=35";
/** 409 tetikleyicisinin haftası (Ramazan Yıldız 10 Eyl'de s-2'de kayıtlı). */
const WEEK_37 = "iso_year=2026&iso_week=37";

const SITE_URL = "/projeler/p-1/santiyeler/s-1/puantaj";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/e-posta/i).fill("patron@fiil.com");
  await page.getByLabel(/^şifre$/i).fill("dogruparola");
  await page.getByRole("button", { name: /giriş yap/i }).click();
  await expect(page.getByRole("heading", { name: "Gösterge Paneli" })).toBeVisible();
}

/** Saat kutusu — akış-SSR'da çift kopya riskine karşı `main` + ızgaraya kapsamlanır. */
function hourBox(page: Page, person: string, dayMonth: string) {
  return page
    .locator("main")
    .locator(".ts-week-table")
    .first()
    .getByLabel(`${person} · ${dayMonth} saati`);
}

/** Saat yazar ve odaktan çıkarak taslağa işler. */
async function setHours(page: Page, person: string, dayMonth: string, value: string) {
  const box = hourBox(page, person, dayMonth);
  await box.fill(value);
  await box.blur();
}

/** Kod çapasını açıp rozet seçer (mockup rozeti çizer, seçme yolunu çizmez). */
async function setCode(page: Page, person: string, dayMonth: string, codeLabel: string) {
  await page
    .locator("main")
    .locator(".ts-week-table")
    .first()
    .getByRole("button", { name: `${person} · ${dayMonth} puantaj kodu` })
    .click();
  const popover = page
    .getByRole("dialog", { name: `${person} · ${dayMonth} — puantaj hücresi` })
    .first();
  await popover.getByRole("button", { name: codeLabel }).click();
  await expect(popover).toBeHidden();
}

async function saveAndExpectSuccess(page: Page) {
  await page.getByRole("button", { name: "Haftayı Kaydet" }).first().click();
  const status = page.locator("main").locator(".ts-save-status").first();
  await expect(status).toContainText("Hafta kaydedildi.");
  await expect(status).not.toContainText("çakışma");
}

test.describe("haftalık puantaj (SALT-OKUR, 2026-W32)", () => {
  test("şantiye ızgarası: 7 gün, saat kutuları, KPI ve türev kolonları", async ({ page }) => {
    await login(page);
    await page.goto(`${SITE_URL}?${WEEK_32}`);
    const content = page.locator("main");

    await expect(
      page.getByRole("heading", { level: 1, name: "A-Blok Şantiyesi — Puantaj" }).first(),
    ).toBeVisible();
    await expect(content.locator(".ts-week-nav__index").first()).toHaveText("32. Hafta");
    // Gün başlıkları GERÇEK takvimden — mockup'ın "13 Tem"i kopyalanmaz.
    for (const weekday of ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"]) {
      await expect(
        content.locator(".ts-week-table").first().getByText(weekday, { exact: true }),
      ).toBeVisible();
    }
    // 🔴 Normal/FM SUNUCUDAN gelir. Mehmet Kılıç: 9 + 5 + 9 = 23 saat, hiçbiri
    // günlük 9'u aşmıyor ve haftalık 45'in altında ⇒ FM 0.
    const row = page
      .locator(".ts-week-table tbody tr")
      .filter({ hasText: "Mehmet Kılıç" })
      .first();
    await expect(row.locator(".ts-week-table__row-total--normal")).toHaveText("23");
    await expect(row.locator(".ts-week-table__row-total--overtime")).toHaveText("0");
    // Ramazan Yıldız: 12 + 9 = 21; günlük tavan aşımı 3 ⇒ FM 3, Normal 18.
    const overtimeRow = page
      .locator(".ts-week-table tbody tr")
      .filter({ hasText: "Ramazan Yıldız" })
      .first();
    await expect(overtimeRow.locator(".ts-week-table__row-total--overtime")).toHaveText("3");
  });

  test("izin/görev ROZETTİR ve KPI kartlarında AYRI sayılır", async ({ page }) => {
    await login(page);
    await page.goto(`${SITE_URL}?${WEEK_32}`);
    const content = page.locator("main");
    const grid = content.locator(".ts-week-table").first();
    await expect(grid.getByText("İzin", { exact: true }).first()).toBeVisible();
    await expect(grid.getByText("Görev", { exact: true }).first()).toBeVisible();

    // 🔴 Yönetim kararı: geçici görev bir izin DEĞİLDİR — ayrı kart, ayrı sayı.
    const leaveCard = content.locator(".ts-kpi--leave").first();
    const dutyCard = content.locator(".ts-kpi--duty").first();
    await expect(leaveCard.locator(".ts-kpi__value")).toHaveText("1");
    await expect(dutyCard.locator(".ts-kpi__value")).toHaveText("1");
  });

  test("ay şeridi 'girilmedi' rozetini basar ve hafta değiştirir", async ({ page }) => {
    await login(page);
    await page.goto(`${SITE_URL}?${WEEK_32}`);
    const content = page.locator("main");
    // W33'te (10–16 Ağu) hiç kayıt yok ⇒ "girilmedi".
    const week33 = content.locator(".ts-month-week").filter({ hasText: "33. Hafta" }).first();
    await expect(week33).toContainText("girilmedi");
    await week33.click();
    await expect(content.locator(".ts-week-nav__index").first()).toHaveText("33. Hafta");
  });

  test("genel puantaj (E5) ızgarayı basar; Excel YOKTUR", async ({ page }) => {
    await login(page);
    await page.goto(`/puantaj?site=s-1&${WEEK_32}`);
    const content = page.locator("main");
    await expect(page.getByRole("heading", { level: 1, name: "Puantaj" }).first()).toBeVisible();
    await expect(content.getByLabel("Meslek").first()).toBeVisible();
    // E5 mockup'ında dışa aktarım YOKTUR — uydurulmaz.
    await expect(page.getByRole("button", { name: "Excel" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Dışa Aktar" })).toHaveCount(0);
  });

  test("şantiye sekmesi Excel indirir (ikili gövde BFF'ten sağlam geçer)", async ({ page }) => {
    await login(page);
    await page.goto(`${SITE_URL}?${WEEK_32}`);
    await expect(
      page.getByRole("heading", { level: 1, name: "A-Blok Şantiyesi — Puantaj" }).first(),
    ).toBeVisible();
    await expectXlsxDownload(page, "Excel");
  });

  test("E5 satır süzgeci istemci tarafında süzer ve sayacı günceller", async ({ page }) => {
    await login(page);
    await page.goto(`/puantaj?site=s-1&${WEEK_32}`);
    const content = page.locator("main");
    await expect(content.locator(".ts-week-table tbody tr").first()).toBeVisible();
    await content.getByLabel("Meslek").first().selectOption("Elektrikçi");
    await expect(
      content.locator(".ts-week-table tbody tr").filter({ hasText: "Ramazan Yıldız" }),
    ).toHaveCount(1);
    await expect(
      content.locator(".ts-week-table tbody tr").filter({ hasText: "Mehmet Kılıç" }),
    ).toHaveCount(0);
  });
});

/**
 * İZİN DALLARI — oturum yükü kadraja özel olarak değiştirilir.
 *
 * Mock backend TEK kullanıcı döndürür (`patron`), bu yüzden rol değiştirmek
 * yerine YALNIZ `/api/auth/me` yanıtına izin haritası eklenir: paylaşılan mock
 * durumu HİÇ değişmez, dolayısıyla başka spec'lerle yarış yoktur.
 */
async function withTimesheetLevel(page: Page, level: string) {
  await page.route("**/api/auth/me", async (route) => {
    const response = await route.fetch();
    const me = (await response.json()) as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      // `personnel` bilerek verilmez: "Personel Ekle" girişi ayrı modülün
      // yetkisindedir ve bilinmezlik kuralıyla görünür kalır.
      body: JSON.stringify({
        ...me,
        permissions: { timesheet: level },
        // IZN-F6d: sayfa modeli devrede → eski modül düşürmesi tek başına etkisiz; aynı düzey sayfa grant'ına da yazılır.
        pages: withPageLevels(me.pages as Record<string, PageGrant> | undefined, TIMESHEET_PAGE_KEYS, level === "none" ? "none" : "view"),
      }),
    });
  });
}

test.describe("puantaj izin dalları", () => {
  test("saha mühendisi (view) ızgarayı görür, düzenleyemez — iki rotada da", async ({ page }) => {
    await login(page);
    await withTimesheetLevel(page, "view");

    for (const url of [`${SITE_URL}?${WEEK_32}`, `/puantaj?site=s-1&${WEEK_32}`]) {
      await page.goto(url);
      await expect(page.getByRole("button", { name: "Haftayı Kaydet" }).first()).toBeDisabled();
      await expect(
        page.getByRole("button", { name: "Önceki Haftayı Kopyala" }).first(),
      ).toBeDisabled();
      await expect(
        page.getByText("Puantaj kaydetme yetkiniz yok", { exact: false }).first(),
      ).toBeVisible();
      // Salt-okunur ızgara: saatler durur, saat KUTUSU hiç basılmaz.
      await expect(page.locator(".ts-week-table .ts-hours").first()).toBeVisible();
      await expect(page.locator(".ts-week-table .ts-hin")).toHaveCount(0);
    }
  });

  test("PM (none) her iki rotada da AccessDenied görür", async ({ page }) => {
    await login(page);
    await withTimesheetLevel(page, "none");

    for (const url of [`${SITE_URL}?${WEEK_32}`, `/puantaj?site=s-1&${WEEK_32}`]) {
      await page.goto(url);
      await expect(page.getByText("Bu alana yetkiniz yok").first()).toBeVisible();
      await expect(page.locator(".ts-week-table")).toHaveCount(0);
    }
  });
});

/**
 * İndirilen dosya GERÇEKTEN ikili mi — ad yetmez: BFF ikili gövdeyi JSON
 * sanıp bozarsa dosya iner ama içeriği çöp olur. `PK\x03\x04` xlsx (zip)
 * imzasıdır ve mock'un ürettiği baytlarla birebir aynıdır.
 */
async function expectXlsxDownload(page: Page, buttonName: string) {
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: buttonName }).first().click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain(".xlsx");
  const path = await download.path();
  const bytes = await readFile(path);
  expect([...bytes.subarray(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
}

/**
 * 🔴 ŞANTİYE KİMLİĞİ ÇÖZÜLMEDEN YAZMA YOLU AÇILMAZ (SALT-OKUR — mutasyon yok).
 *
 * ŞP rotası şantiyeyi SLUG'la taşır; UUID `GET /sites/{key}` yanıtından gelir
 * ve o ana kadar `siteId` BOŞ STRING'tir. Ağa giden hook'ların hepsi
 * `enabled: siteId.length > 0` kapısında durur — ama "Önceki Haftayı Kopyala"
 * HOOK DEĞİL, elde çağrılan `queryClient.fetchQuery` yoludur ve o kapının
 * DIŞINDAYDI: boş kimlikle `/sites//timesheet/week` istenir, yol sahte
 * backend'in HİÇBİR desenine uymaz ve catch-all 404 `{"detail":"not found"}`
 * döner. Kullanıcı gerekçe olarak ham `"not found"` görürdü.
 *
 * CI run 33312094802'de canlı görüldü: `.ts-save-status` beklenen "Önceki
 * haftadan" yerine `"not found"` bastı. Yerelde YÜKSÜZ koşuda görünmez —
 * şantiye çözümü tıklamadan önce dönerdi; burada istek BİLEREK tutulur ve
 * yarış deterministik hâle getirilir.
 */
test("şantiye kimliği çözülmeden 'Önceki Haftayı Kopyala' KAPALIDIR", async ({ page }) => {
  await login(page);

  let releaseSite = () => {};
  const siteGate = new Promise<void>((resolve) => {
    releaseSite = resolve;
  });
  // YALNIZ slug->UUID çözümü tutulur; `/sites/{id}/timesheet/week` bu desene
  // uymaz (sonrasında `/` gelir), o yüzden hafta ucu serbesttir.
  await page.route("**/api/backend/sites/s-1?*", async (route) => {
    await siteGate;
    await route.continue();
  });

  await page.goto(`${SITE_URL}?${WEEK_36}`);
  const copyButton = page.getByRole("button", { name: "Önceki Haftayı Kopyala" }).first();
  // Kimlik çözülmeden KAPALI. Açık olsaydı basış ham "not found" basardı.
  await expect(copyButton).toBeDisabled();

  releaseSite();
  // Kimlik gelince düğme AÇILIR — kapı "hep kapalı" diye geçmiyor (K-IKIZ1).
  await expect(copyButton).toBeEnabled();
});

/**
 * Mutasyon akışları TEK dosyada SIRAYLA koşar: hepsi 2026-W36 · s-1 kapsamını
 * yazar ve `PUT` o kapsamın TAMAMINI değiştirir — paralel koşarlarsa
 * birbirlerinin gövdesini ezerlerdi.
 */
test.describe("puantaj düzenleme (MUTASYON, 2026-W36 · s-1)", () => {
  test.describe.configure({ mode: "serial" });

  /**
   * 🔴🔴 KANON: RETRY, PAYLAŞILAN FİKSTÜRÜ BOZAR.
   *
   * `mock-backend.ts` `globalSetup` üzerinden TEK paylaşımlı süreçte koşar ve
   * durumu SIFIRLAYAN hiçbir ucu yoktur (`command grep -c
   * 'resetMockState|__reset|resetState' e2e/mock-backend.ts` → 0, EXIT=1).
   * Bu blok 2026-W36'yı MUTASYONA uğratır; `mode: "serial"` altında bir test
   * düşünce Playwright BLOĞUN TAMAMINI yeniden koşar — ama fikstür ilk turdan
   * kalan hâliyle durur. CI run 33312094802'de tam bu oldu: ilk turda "kod
   * seçmek" testi Mehmet Kılıç'ın 1 Eyl hücresini SAATTEN KODA çevirdi,
   * retry'da KAPSAM (a) aynı hücrede saat kutusu arayıp `element(s) not found`
   * ile düştü — kusur KAPSAM (a)'da DEĞİLDİ.
   *
   * Çözüm: bu adanın (s-1 · 2026-W36) fikstürü HER testin başında kanonik
   * hâline geri yazılır. Yazma, sahte backend'in KENDİ genel ucundan geçer —
   * teste özel arka kapı açılmaz — ve YALNIZ bu haftayı + bu şantiyeyi
   * kapsar, yani paralel koşan öbür işçinin verisine dokunmaz.
   *
   * `mock-backend.ts` içindeki `TIMESHEET_CELL_FIXTURES` bloğunun W36 · s-1
   * satırlarının BİREBİR ikizidir; orası değişirse burası da değişir.
   */
  const MOCK_PORT = Number(process.env.MOCK_BACKEND_PORT ?? 4319);
  const WEEK_36_FIXTURE = [
    { personnel_id: "per-1", work_date: "2026-09-01", hours: "9.0", code: null, section_id: "sec-1" },
    { personnel_id: "per-2", work_date: "2026-09-02", hours: "9.0", code: null, section_id: "sec-1" },
    { personnel_id: "per-4", work_date: "2026-09-01", hours: "8.0", code: null, section_id: "sec-2" },
  ];

  test.beforeEach(async ({ request }) => {
    const response = await request.put(
      `http://127.0.0.1:${MOCK_PORT}/sites/s-1/timesheet/week?iso_year=2026&iso_week=36`,
      {
        headers: { authorization: "Bearer e2e-fixture-reset" },
        data: { cells: WEEK_36_FIXTURE },
      },
    );
    // Sessiz sıfırlama YOK: geri yükleme başarısızsa test SAHTE bir tabanla
    // koşmaz, burada durur.
    expect(response.status(), await response.text()).toBe(200);
  });

  test("🔴 KAPSAM (a): bölüm filtresi açıkken kaydet → diğer bölümün kaydı SİLİNMEZ", async ({
    page,
  }) => {
    await login(page);
    // sec-1 süzgeci açık: İsmail Aksoy'un 1 Eyl kaydı (sec-2) EKRANDA YOK.
    await page.goto(`${SITE_URL}?${WEEK_36}&section=sec-1`);
    const content = page.locator("main");
    await expect(content.locator(".ts-summary__title").first()).toHaveText("Kat 6–10 Kaba İnşaat");
    await expect(hourBox(page, "İsmail Aksoy", "1 Eyl")).toHaveValue("");

    // Süzülmüş görünümde bir düzenleme yapıp kaydet.
    await setHours(page, "Mehmet Kılıç", "3 Eyl", "9");
    await saveAndExpectSuccess(page);

    // Süzgeci kaldır: sec-2'nin hücresi HÂLÂ ORADA. Gövde süzülmüş kümeden
    // kurulsaydı mock bu kaydı SİLERDİ ve bu iddia kırmızı olurdu.
    await page.goto(`${SITE_URL}?${WEEK_36}`);
    await expect(hourBox(page, "İsmail Aksoy", "1 Eyl")).toHaveValue("8");
    await expect(hourBox(page, "Mehmet Kılıç", "3 Eyl")).toHaveValue("9");
    // Sec-1'in dokunulmamış hücresi de duruyor.
    await expect(hourBox(page, "Mehmet Kılıç", "1 Eyl")).toHaveValue("9");
  });

  test("🔴 KAPSAM (b): hafta kaydetmek AYIN ÖBÜR HAFTASINA DOKUNMAZ", async ({ page }) => {
    // Backend bekçisinin (`test_hafta_kaydetmek_ayin_diger_haftasina_DOKUNMAZ`)
    // istemci ikizi. (a) ile BİRLİKTE ölçülmezse "her şeyi silen" bozuk bir
    // gövde de yeşil geçerdi (K-IKIZ1).
    await login(page);
    // Tanık: W35'te Mehmet Kılıç'ın 26 Ağu kaydı 9 saattir.
    await page.goto(`${SITE_URL}?${WEEK_35}`);
    await expect(hourBox(page, "Mehmet Kılıç", "26 Ağu")).toHaveValue("9");

    // W36'ya yaz ve kaydet.
    await page.goto(`${SITE_URL}?${WEEK_36}`);
    await setHours(page, "Hasan Demirci", "4 Eyl", "7,5");
    await saveAndExpectSuccess(page);

    // Tanık hâlâ yerinde — kapsam AY olsaydı SİLİNMİŞ olurdu.
    await page.goto(`${SITE_URL}?${WEEK_35}`);
    await expect(hourBox(page, "Mehmet Kılıç", "26 Ağu")).toHaveValue("9");
  });

  test("BOŞ hücreye ondalık saat girilir ve kalıcı olur", async ({ page }) => {
    await login(page);
    await page.goto(`${SITE_URL}?${WEEK_36}`);
    const content = page.locator("main");

    // Osman Şahin'in bu haftada HİÇ kaydı yok — satırı kartoteksten gelir (K1).
    await expect(hourBox(page, "Osman Şahin", "2 Eyl")).toHaveValue("");
    await setHours(page, "Osman Şahin", "2 Eyl", "6,5");
    await expect(content.locator(".ts-save-status").first()).toContainText("Kaydedilmemiş 1 hücre");
    await saveAndExpectSuccess(page);

    await page.reload();
    await expect(hourBox(page, "Osman Şahin", "2 Eyl")).toHaveValue("6,5");
  });

  test("kod seçmek SAATİ DÜŞÜRÜR (saat XOR kod) ve kalıcı olur", async ({ page }) => {
    await login(page);
    await page.goto(`${SITE_URL}?${WEEK_36}`);
    await expect(hourBox(page, "Mehmet Kılıç", "1 Eyl")).toHaveValue("9");

    await setCode(page, "Mehmet Kılıç", "1 Eyl", "İzin");
    await saveAndExpectSuccess(page);

    await page.reload();
    const reloadedContent = page.locator("main");
    const grid = reloadedContent.locator(".ts-week-table").first();
    await expect(
      grid.getByRole("button", { name: "Mehmet Kılıç · 1 Eyl puantajı" }),
    ).toHaveText("İzin");
    // Saat kutusu artık YOK — hücre kod hâlinde.
    await expect(hourBox(page, "Mehmet Kılıç", "1 Eyl")).toHaveCount(0);
  });

  test("kutuyu boşaltmak kaydı SİLER (gövdede geçmeyen hücre silinir)", async ({ page }) => {
    await login(page);
    await page.goto(`${SITE_URL}?${WEEK_36}`);
    await expect(hourBox(page, "Hasan Demirci", "2 Eyl")).toHaveValue("9");

    await setHours(page, "Hasan Demirci", "2 Eyl", "");
    await saveAndExpectSuccess(page);

    await page.reload();
    await expect(hourBox(page, "Hasan Demirci", "2 Eyl")).toHaveValue("");
  });

  test("geçersiz saat REDDEDİLİR — gerekçe hücrede kalır, taslağa yazılmaz", async ({ page }) => {
    await login(page);
    await page.goto(`${SITE_URL}?${WEEK_36}`);
    const content = page.locator("main");
    await setHours(page, "Osman Şahin", "3 Eyl", "25");
    await expect(content.getByText("Gün saati 0'dan büyük ve en çok 24 olmalı.").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Haftayı Kaydet" }).first()).toBeDisabled();
  });

  test("Önceki Haftayı Kopyala taslağa yazar — kaydetmeden ÖNCE görünür", async ({ page }) => {
    await login(page);
    // W37'ye geç: boş bir hafta. Önceki hafta (W36) kopyalanır.
    await page.goto(`${SITE_URL}?${WEEK_37}`);
    const content = page.locator("main");
    await page.getByRole("button", { name: "Önceki Haftayı Kopyala" }).first().click();
    const status = content.locator(".ts-save-status").first();
    await expect(status).toContainText("Önceki haftadan");
    await expect(status).toContainText("kopyalandı");
    // Kopya HENÜZ kaydedilmedi — "Haftayı Kaydet" açık.
    await expect(page.getByRole("button", { name: "Haftayı Kaydet" }).first()).toBeEnabled();
  });

  test("409 kişi-gün çakışması Türkçe basılır ve taslak KORUNUR", async ({ page }) => {
    await login(page);
    // Ramazan Yıldız 10 Eylül'de BAŞKA şantiyede (s-2) kayıtlı — mock bu
    // kişi-günü s-1'e yazmayı 409'la reddeder (gerçek backend kuralı).
    await page.goto(`${SITE_URL}?${WEEK_37}`);
    const content = page.locator("main");
    await setHours(page, "Ramazan Yıldız", "10 Eyl", "9");
    await page.getByRole("button", { name: "Haftayı Kaydet" }).first().click();

    const status = content.locator(".ts-save-status").first();
    await expect(status).toContainText("Kişi-gün çakışması");
    await expect(status).toContainText("B-Blok Şantiyesi");
    // Taslak KAYBOLMAZ: kullanıcı yazdığını görmeye devam eder.
    await expect(status).toContainText("Kaydedilmemiş");
    await expect(hourBox(page, "Ramazan Yıldız", "10 Eyl")).toHaveValue("9");
    await expect(page.getByRole("button", { name: "Haftayı Kaydet" }).first()).toBeEnabled();
  });
});
