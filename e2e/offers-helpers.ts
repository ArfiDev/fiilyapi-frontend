import { expect, type Page } from "@playwright/test";

import { login } from "./earned-value-helpers";
import { installFakeOffersServer, type FakeOffersOptions, type FakeOffersServer } from "./offers-fake-server";

// TKL-F3.8 · görsel + önizleme spec'lerinin ORTAK yardımcıları (`*.spec.ts` DEĞİLDİR).

export const OFFERS_VIEWPORT = { width: 1440, height: 900 } as const;
export const OFFERS_URL = "/teklif-hazirlama";

/** Tohum teklif numaraları (`mock-offer-seed.ts`): 0001 kazanılan Rev.1 + eski Rev.0 · 0002/0003 gönderilmiş · 0004 taslak (fiyatsız kalemli) · 0007 boş taslak. */
export const SEED_NO = {
  withHistory: "TKL-2026-0001",
  sent: "TKL-2026-0002",
  sentUnpriced: "TKL-2026-0003",
  draftItems: "TKL-2026-0004",
  draftEmpty: "TKL-2026-0007",
} as const;

/** Saat navigasyondan ÖNCE çakılır (`login`), sonra sahte teklif sunucusu kurulur (oturum çerezi gerekir). */
export async function loginForOffers(page: Page, options?: FakeOffersOptions): Promise<FakeOffersServer> {
  await page.setViewportSize(OFFERS_VIEWPORT);
  await login(page);
  return installFakeOffersServer(page, options);
}

export async function offerIdByNo(page: Page, offerNo: string): Promise<string> {
  const response = await page.request.get(`/api/backend/offers?q=${offerNo}`);
  expect(response.ok()).toBe(true);
  const list = (await response.json()) as { items: Array<{ id: string; offer_no: string }> };
  const hit = list.items.find((item) => item.offer_no === offerNo);
  if (hit === undefined) throw new Error(`tohum teklif yok: ${offerNo}`);
  return hit.id;
}

export async function openOfferDetail(page: Page, offerNo: string, query = ""): Promise<void> {
  const offerId = await offerIdByNo(page, offerNo);
  await page.goto(`${OFFERS_URL}/${offerId}${query}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(offerNo);
}

export async function openOfferPrint(page: Page, offerNo: string, kind: "isveren" | "ic"): Promise<void> {
  const offerId = await offerIdByNo(page, offerNo);
  await page.emulateMedia({ media: "print" });
  await page.goto(`${OFFERS_URL}/${offerId}/yazdir?rev=0&tur=${kind}`);
  await expect(page.getByTestId("offer-print-document")).toBeVisible();
  await expect(page.locator(".ev-print-sheet").first()).toBeVisible();
}

export async function openItemPicker(page: Page) {
  await page.getByRole("button", { name: "+ Katalogdan Ekle" }).click();
  const picker = page.getByRole("dialog", { name: "Katalogdan Kalem Ekle" });
  await expect(picker).toBeVisible();
  await page.mouse.move(0, 0);
  return picker;
}
