import { expect, type Locator, type Page, type Response } from "@playwright/test";

import { DIARY_LINE_ARM_FIXTURE, EV_DAY_SCENARIO_DAYS } from "./mock-backend";

// DET-1.4 · `Şantiye - Günlük Kayıt Detay (Salt Okunur)` görsel kadrajlarının
// YARDIMCILARI — yalnız `site-diary-detail-visual.spec.ts` kullanır.
//
// ⚠️ Bu dosya `*.spec.ts` DEĞİLDİR; `prepareFrame` BURADAN RE-EXPORT EDİLMEZ
// (`site-diary-progress-helpers.ts` emsali). Kadraj hazırlığı spec'te,
// doğrudan `visual-scroll.ts`ten çağrılır.
//
// Veri kaynağı: `e2e/mock-backend.ts` — Temmuz günlükleri (d-1), EV gün
// ikizi (d-4 · d-6 · d-7, `EV_DAY_SCENARIO_DAYS`) ve Kural A SATIR KOLU
// fikstürü (d-10, `DIARY_LINE_ARM_FIXTURE`). Hepsi s-1'dedir; kadraj bağlamı
// sec-1'dir (Kat 6–10 Kaba İnşaat).
//
// 🔒 SALT-OKUR: detay sayfası yalnız GET atar. Kadraja giren yazma hedefi YOK
// (d-8 `writeTarget` · d-9 `unlockTarget` açılmaz); d-9 yalnız d-4'ün ÖNCEKİ
// bağlantısında TARİHİYLE görünür ve tarihi hiçbir akışta değişmez.

export const DETAIL_DESKTOP_WIDTH = 1440;
/** Mockup "(1024)" kadrajı — iki sütun tek sütuna iner. */
export const DETAIL_TABLET_WIDTH = 1024;
const INITIAL_HEIGHT = 900;

/**
 * 📅 SAAT ÇAKILIR (NAVİGASYONDAN ÖNCE, TEK KEZ). Detay sayfası BUGÜNÜ
 * basmaz (tarihler kayıttan gelir), ama görsel kanon her kadrajı dondurur
 * (`visual-frame-guard`) — damga bütün fikstür günlerinden SONRADIR.
 */
const FIXED_NOW = "2026-11-20T09:00:00Z";

/** Bölüm bağlamı (URL anahtarı = kanonik kimlik). */
export const DETAIL_SECTION_ID = "sec-1";
export const DETAIL_SECTION_NAME = "Kat 6–10 Kaba İnşaat";
/** Bölümün Günlük Kayıt SEKMESİ — kırıntı ve "dön" bağlantısının hedefi. */
export const SECTION_DIARY_TAB_HREF = `/projeler/p-1/santiyeler/s-1/bolumler/${DETAIL_SECTION_ID}?sekme=gunluk-kayit`;
/** "Günlük kayıtta aç →" hedefi (şantiye günlüğü ekranı). */
export const SITE_DIARY_HREF = "/projeler/p-1/santiyeler/s-1/gunluk-kayit";
/** Başlık meta satırının yer parçası (`site_name · project_name`). */
export const PLACE = "A-Blok Şantiyesi · Kule A";

/**
 * Kadraj senaryoları → kayıt. `planned`: günün EV kaydı VAR (uzantı kurulur);
 * yoksa çekirdek detay (`has_baseline: false`).
 */
export const DETAIL_SCENARIOS = {
  /** (a) Temmuz · gönderilmiş · başlığı sec-1 · planlamasız. */
  submitted: { entryId: "d-1", day: "2026-07-15", planned: false },
  /** (b) Ekim · gönderilmiş · 05.10 raporuyla KİLİTLİ · EV'li. */
  locked: { entryId: "d-4", day: EV_DAY_SCENARIO_DAYS.locked, planned: true },
  /** (c)(g) Ekim · taslak · EV'li dolu gün. */
  draft: { entryId: "d-6", day: EV_DAY_SCENARIO_DAYS.full, planned: true },
  /** (d) Kasım · gönderilmiş · başlığı sec-2, sec-1'e YALNIZ satırla bağlı. */
  lineArm: { entryId: DIARY_LINE_ARM_FIXTURE.entryId, day: DIARY_LINE_ARM_FIXTURE.day, planned: false },
  /** (e) Ekim · taslak · EV kurulu şantiyede baseline'sız gün (planlamasız). */
  unplanned: { entryId: "d-7", day: EV_DAY_SCENARIO_DAYS.noEv, planned: false },
} as const;

export type DetailScenario = keyof typeof DETAIL_SCENARIOS;

/** (f) Var olmayan kayıt kimliği. */
export const MISSING_ENTRY_ID = "d-yok";

export function diaryDetailUrl(entryId: string): string {
  return `/projeler/p-1/santiyeler/s-1/bolumler/${DETAIL_SECTION_ID}/gunluk-kayit/${entryId}`;
}

async function loginFrozen(page: Page, width: number) {
  await page.setViewportSize({ width, height: INITIAL_HEIGHT });
  await page.clock.setFixedTime(new Date(FIXED_NOW));
  await page.goto("/login");
  await page.getByLabel(/e-posta/i).fill("patron@fiil.com");
  await page.getByLabel(/^şifre$/i).fill("dogruparola");
  await page.getByRole("button", { name: /giriş yap/i }).click();
  await expect(page.getByRole("heading", { name: "Gösterge Paneli" })).toBeVisible();
}

/** GET yanıtını bekleyen söz — `goto`dan ÖNCE kurulur (istek kaçmaz). */
function getResponse(page: Page, matches: (url: URL) => boolean): Promise<Response> {
  return page.waitForResponse(
    (response) => response.request().method() === "GET" && matches(new URL(response.url())),
  );
}

function evResponse(page: Page, suffix: string): Promise<Response> {
  return getResponse(page, (url) => url.pathname === `/api/backend/sites/s-1/earned-value${suffix}`);
}

function entryResponse(page: Page, entryId: string): Promise<Response> {
  return getResponse(page, (url) => url.pathname === `/api/backend/diary/${entryId}`);
}

/** Yükleme izleri kalmadı (iskelet `aria-busy` · kırıntı yer tutucusu). */
async function expectSettled(page: Page) {
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  await expect(page.getByTestId("crumb-pending")).toHaveCount(0);
  await expect(page.getByText(/[Yy]ükleniyor/)).toHaveCount(0);
}

export interface OpenDiaryDetailOptions {
  width?: number;
}

/**
 * Detay sayfasını senaryo kaydıyla açar ve BÜTÜN kaynakların indiğini
 * doğrular (GÖRSEL SPEC KURALI 1. + 5. parça): kayıt (bölüm bağlamında) +
 * günün EV görünümü; EV'li günde kod ağacı + PF eşikleri + aktif bütçe.
 */
export async function openDiaryDetail(
  page: Page,
  scenario: DetailScenario,
  { width = DETAIL_DESKTOP_WIDTH }: OpenDiaryDetailOptions = {},
) {
  const { entryId, day, planned } = DETAIL_SCENARIOS[scenario];
  await loginFrozen(page, width);

  const entry = entryResponse(page, entryId);
  const waits = [
    evResponse(page, `/days/${day}`),
    ...(planned ? [evResponse(page, "/code-tree"), evResponse(page, "/settings"), evResponse(page, "/budget")] : []),
  ];
  await page.goto(diaryDetailUrl(entryId));

  const entryRes = await entry;
  expect(entryRes.status(), "kayıt yanıtı").toBe(200);
  // Önceki/sonraki BÖLÜM bağlamında hesaplanır (Kural A kümesi).
  expect(new URL(entryRes.url()).searchParams.get("section_id")).toBe(DETAIL_SECTION_ID);
  for (const response of await Promise.all(waits)) {
    expect(response.status(), new URL(response.url()).pathname).toBe(200);
  }

  await expect(page.locator(".diary-detail__title")).toBeVisible();
  if (planned) {
    // Uzantı kuruldu: başlık eki + Saat Dağıtımı özeti + KPI.
    await expect(page.getByTestId("diary-detail-meta")).toContainText(/Gün \d+ · H\d+$/);
    await expect(page.locator(".ev-detail-hours")).toBeVisible();
    await expect(kpiLabels(page)).toContainText(["Bugün kazanılmış"]);
  } else {
    await expect(page.locator(".ev-detail-hours")).toHaveCount(0);
  }
  await expectSettled(page);
}

/** (f) Var olmayan kayıt — iki 404 (sorgu bir kez yeniden dener) sonrası hâl kartı. */
export async function openMissingDiaryDetail(page: Page) {
  await loginFrozen(page, DETAIL_DESKTOP_WIDTH);
  const entry = entryResponse(page, MISSING_ENTRY_ID);
  await page.goto(diaryDetailUrl(MISSING_ENTRY_ID));
  expect((await entry).status(), "var olmayan kayıt 404").toBe(404);
  await expect(page.getByText("Günlük kayıt bulunamadı", { exact: true })).toBeVisible();
  await expectSettled(page);
}

/** KPI etiketleri (sırasıyla) — `.diary-detail__kpi-label`. */
export function kpiLabels(page: Page): Locator {
  return page.locator(".diary-detail__kpi-label");
}

/** "📋 Yapılan Miktarlar" kartı. */
export function linesCard(page: Page): Locator {
  return page.locator("section[aria-labelledby='diary-detail-lines']");
}

/** Satır tablosunun gerçek satırları (alt satır/ayraç/ara toplam HARİÇ). */
export function currentRows(page: Page): Locator {
  return linesCard(page).locator("tr.diary-detail-lines__row:not(.diary-detail-lines__row--other)");
}

export function otherRows(page: Page): Locator {
  return linesCard(page).locator("tr.diary-detail-lines__row.diary-detail-lines__row--other");
}

/** "Günlük kayıtta aç" bağlantıları (başlık + Saat Dağıtımı özeti ayağı). */
export function openLinks(page: Page): Locator {
  return page.getByRole("link", { name: /Günlük kayıtta aç/ });
}

/** Çekirdek kartların başlıkları — her kayıtta TAM basılır. */
export const CORE_CARD_HEADINGS = [
  "📝 Yapılan İşler",
  "Şantiye Şefi Notu",
  "📅 Temel Bilgiler & Hava",
  "⛑ İş Güvenliği",
  "📋 Yapılan Miktarlar",
  "👷 Bugünkü İşçi Dağılımı",
  "📷 Şantiye Fotoğrafları",
] as const;

export async function expectCoreCards(page: Page) {
  for (const name of CORE_CARD_HEADINGS) {
    await expect(page.getByRole("heading", { level: 2, name, exact: true })).toBeVisible();
  }
}

/** Planlama uzantısının HİÇBİR parçası yok (kolon · KPI · Saat Dağıtımı · başlık eki). */
export async function expectNoPlanning(page: Page) {
  await expect(linesCard(page).getByText("Bugün kaz. a-s")).toHaveCount(0);
  await expect(kpiLabels(page)).toHaveText(["Miktar satırı", "Hakediş katkısı", "İşçi"]);
  await expect(page.locator(".ev-detail-hours")).toHaveCount(0);
  await expect(page.getByTestId("diary-detail-meta")).not.toContainText(/Gün \d+ · H\d+/);
}

/** Kırıntı: son parça (bağlantı DEĞİL) + "Günlük Kayıt" parçasının bölüm sekmesine bağı. */
export function crumbItems(page: Page): Locator {
  return page.getByTestId("topbar-crumbs").locator("li");
}
