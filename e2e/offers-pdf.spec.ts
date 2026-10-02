import { test, expect, type Page } from "@playwright/test";

import { login } from "./earned-value-helpers";

// TKL-F3.8 · PDF AZAMİ UZUNLUK İDDİASI (işveren A4 dikey + iç A4 yatay).
//
// Backend sınırlarında (iş adı 200, kapsam 2000, notlar/ödeme 2000, grup adı 200, poz no 32) ve ~60 kalemlik
// (uzun tarifli, fiyatsız dahil) bir teklifin yazdırma görünümünde HİÇBİR kalem satırı ve kapanış bloğu kendi
// sayfa kutusunun dışına taşmaz. Veri `page.route` ile paylaşılan mock'un GERÇEK yanıtından türetilir (mock'a yazma YOK).
//
// ⏱️ ÖLÇÜM TURU SİNYALİ: yazdırma kökü (`OfferCustomerPrint` / `OfferInternalPrint`) ölçüm turu bitince
// (yazı tipleri hazır ∧ imza değişmedi ∨ ölçülemez ∨ MAX_PASSES) `data-measured="true"` basar; bekleme budur.

const API = "**/api/backend";
const PRINT_BASE = "/teklif-hazirlama";
const SEED_OFFER_NO = "TKL-2026-0004";
const TITLE_LENGTH = 200;
const TEXT_LENGTH = 2000;
const GROUP_NAME_LENGTH = 200;
const POZ_NO_LENGTH = 32;
const GROUP_COUNT = 3;
const ITEMS_PER_GROUP = 20;
const UNPRICED_EVERY = 7;
const INTERNAL_WORDS = ["Maliyet", "Kâr", "a-s", "Genel gider", "adam-saat"] as const;

type Json = Record<string, unknown>;

const filler = (seed: string, length: number): string => seed.repeat(Math.ceil(length / seed.length)).slice(0, length);

async function seedOfferId(page: Page): Promise<string> {
  const response = await page.request.get(`/api/backend/offers?q=${SEED_OFFER_NO}`);
  expect(response.ok()).toBe(true);
  const list = (await response.json()) as { items: Array<{ id: string; offer_no: string }> };
  const hit = list.items.find((item) => item.offer_no === SEED_OFFER_NO);
  if (hit === undefined) throw new Error("tohum teklif yok");
  return hit.id;
}

function buildGroups(pricedTemplate: Json, unpricedTemplate: Json): Json[] {
  const description = filler("Uzun tarifli kalem açıklaması ", 400);
  return Array.from({ length: GROUP_COUNT }, (_, groupIndex) => ({
    id: `0ff30000-0000-0000-0000-00000000000${groupIndex}`,
    name: filler(`Grup ${groupIndex + 1} `, GROUP_NAME_LENGTH),
    sort_order: groupIndex,
    items: Array.from({ length: ITEMS_PER_GROUP }, (_, itemIndex) => {
      const serial = groupIndex * ITEMS_PER_GROUP + itemIndex;
      const isUnpriced = serial % UNPRICED_EVERY === UNPRICED_EVERY - 1;
      return {
        ...(isUnpriced ? unpricedTemplate : pricedTemplate),
        id: `0ff40000-0000-0000-0000-${String(serial).padStart(12, "0")}`,
        group_id: `0ff30000-0000-0000-0000-00000000000${groupIndex}`,
        sort_order: itemIndex,
        poz_no: filler(`P${serial}-`, POZ_NO_LENGTH),
        description: `${serial}. ${description}`,
      };
    }),
  }));
}

/** Detay + revizyon yanıtlarını azami uzunluklu içerikle yeniden yazar. */
async function serveMaxOffer(page: Page, offerId: string): Promise<void> {
  await page.route(`${API}/offers/${offerId}`, async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const base = (await (await route.fetch()).json()) as Json;
    return route.fulfill({
      json: { ...base, title: filler("İş adı ", TITLE_LENGTH), scope_summary: filler("Kapsam özeti ", TEXT_LENGTH) },
    });
  });
  await page.route(`${API}/offers/${offerId}/revisions/0`, async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const base = (await (await route.fetch()).json()) as { groups: Array<{ items: Json[] }> } & Json;
    const items = base.groups.flatMap((group) => group.items);
    const priced = items.find((item) => item.priced === true);
    const unpriced = items.find((item) => item.priced === false);
    if (priced === undefined || unpriced === undefined) throw new Error("tohumda fiyatlı ve fiyatsız kalem gerekir");
    return route.fulfill({
      json: {
        ...base,
        payment_terms: filler("Ödeme koşulları ", TEXT_LENGTH),
        notes: filler("Notlar ", TEXT_LENGTH),
        groups: buildGroups(priced, unpriced),
      },
    });
  });
}

interface SheetReport {
  readonly sheetCount: number;
  /** Yalnız KALEM satırları (`data-print-row` = kalem id'si). */
  readonly rowCount: number;
  /** Grup başlığı (`{grup}:head`) ve ara toplam (`{grup}:sum`) satırları — onlar da ölçülür ve sayfa kutusunda kalmalı. */
  readonly groupHeadCount: number;
  readonly subtotalCount: number;
  /** TKL-F3.8.1 · kapanış parçaları (`data-print-closing-part`): belge sırasıyla id, sayfa no ve yükseklik. */
  readonly closingParts: Array<{ id: string; page: number; height: number }>;
  readonly escapes: string[];
  readonly sheetHeight: number;
  readonly text: string;
}

/** Ölçüm turu bittiğinde yazdırma kökü `data-measured="true"` basar (TKL-F4.3 · plan §7; sabit kare beklemesi kalktı). */
async function waitForMeasuredPages(page: Page): Promise<void> {
  await expect(page.getByTestId("offer-print-document")).toBeVisible();
  await expect(page.locator('[data-measured="true"]')).toBeVisible();
}

async function reportSheets(page: Page): Promise<SheetReport> {
  return page.evaluate(() => {
    const sheets = Array.from(document.querySelectorAll<HTMLElement>(".ev-print-sheet"));
    const escapes: string[] = [];
    let rowCount = 0;
    let groupHeadCount = 0;
    let subtotalCount = 0;
    const closingParts: Array<{ id: string; page: number; height: number }> = [];
    for (const sheet of sheets) {
      const box = sheet.getBoundingClientRect();
      const inside = (element: Element, label: string): void => {
        const rect = element.getBoundingClientRect();
        const isInside = rect.top >= box.top - 0.5 && rect.bottom <= box.bottom + 0.5 && rect.left >= box.left - 0.5 && rect.right <= box.right + 0.5;
        if (!isInside) escapes.push(`${label} (sayfa ${sheet.dataset.page}): ${Math.round(rect.bottom - box.bottom)}px alt, ${Math.round(rect.right - box.right)}px sağ`);
      };
      // `data-print-row` grup başlığı + kalem + ara toplam satırlarının HEPSİNDE (ölçüm anahtarı); "(devam)" satırında YOK.
      for (const row of Array.from(sheet.querySelectorAll("tr[data-print-row]"))) {
        const key = row.getAttribute("data-print-row") ?? "";
        if (key.endsWith(":head")) groupHeadCount += 1;
        else if (key.endsWith(":sum")) subtotalCount += 1;
        else rowCount += 1;
        inside(row, `satır ${key}`);
      }
      // Her kapanış parçası (toplamlar | koşullar | notlar | imza) KENDİ sayfa kutusunda — sayfadan büyük parça da.
      for (const part of Array.from(sheet.querySelectorAll("[data-print-closing-part]"))) {
        const id = part.getAttribute("data-print-closing-part") ?? "";
        closingParts.push({ id, page: Number(sheet.dataset.page), height: part.getBoundingClientRect().height });
        inside(part, `kapanış parçası ${id}`);
      }
    }
    return {
      sheetCount: sheets.length,
      rowCount,
      groupHeadCount,
      subtotalCount,
      closingParts,
      escapes,
      sheetHeight: sheets[0]?.getBoundingClientRect().height ?? 0,
      text: document.querySelector("[data-testid='offer-print-document']")?.textContent ?? "",
    };
  });
}

for (const kind of ["isveren", "ic"] as const) {
  test(`azami uzunluk (${kind}): her kalem satırı ve her kapanış parçası sayfa kutusunda, imza son sayfada`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1400, height: 1000 });
    await login(page);
    const offerId = await seedOfferId(page);
    await serveMaxOffer(page, offerId);
    await page.emulateMedia({ media: "print" });
    await page.goto(`${PRINT_BASE}/${offerId}/yazdir?rev=0&tur=${kind}`);
    await waitForMeasuredPages(page);

    const report = await reportSheets(page);
    // Ayrı ölçüm (kırmızı OLMAZ): parça yükseklikleri / sayfa yüksekliği / sayfa sayısı.
    const partsText = report.closingParts.map((part) => `${part.id} ${Math.round(part.height)}px (s.${part.page})`).join(" · ");
    testInfo.annotations.push({
      type: "ölçüm",
      description: `${kind}: ${partsText} / sayfa ${Math.round(report.sheetHeight)}px (${report.sheetCount} sayfa)`,
    });
    expect(report.rowCount).toBe(GROUP_COUNT * ITEMS_PER_GROUP);
    expect(report.groupHeadCount).toBe(GROUP_COUNT);
    expect(report.subtotalCount).toBe(GROUP_COUNT);
    // TKL-F3.8.1: dört parça TAM BİR kez, kanonik sırada; sayfa no azalmaz; İMZA son sayfada.
    expect(report.closingParts.map((part) => part.id)).toEqual(["totals", "terms", "notes", "signature"]);
    const partPages = report.closingParts.map((part) => part.page);
    expect(partPages).toEqual([...partPages].sort((a, b) => a - b));
    expect(report.closingParts.at(-1)?.page).toBe(report.sheetCount);
    expect(report.sheetCount).toBeGreaterThan(1);
    expect(report.escapes).toEqual([]);
    if (kind === "isveren") for (const word of INTERNAL_WORDS) expect(report.text).not.toContain(word);
    else expect(report.text).toContain("Maliyet");

  });
}
