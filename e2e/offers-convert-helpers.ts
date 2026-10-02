import { expect, type Page } from "@playwright/test";

import { login } from "./earned-value-helpers";
import { createLocalConvert, installConvertedProjectReads, type LocalConvert } from "./offers-convert-fake";
import { installFakeOffersServer, type FakeOffersServer } from "./offers-fake-server";
import { OFFERS_URL, OFFERS_VIEWPORT, SEED_NO, offerIdByNo } from "./offers-helpers";

// TKL-F5.6 · dönüştürme e2e + görsel kareler için ORTAK kurulum (`*.spec.ts` DEĞİLDİR).
//
// 🔒 Dönüştürme yazımı sayfaya özel (`offers-convert-fake.ts`): paylaşılan mock'a HİÇBİR yazma gitmez.
// 📅 Saat `login` içinde navigasyondan ÖNCE çakılır (24.09.2026 → İstanbul bugünü 2026-09-24).

export interface ConvertHarness {
  readonly server: FakeOffersServer;
  readonly local: LocalConvert;
  /** Kazanılmış, dönüştürülmemiş tohum teklifin kimliği. */
  readonly offerId: string;
}

/** Kazanılmış (Rev.1) dönüştürülmemiş tohum teklif: 3 kalem (biri fiyatsız), tek grup "Kaba İnşaat". */
export const WON_OFFER_NO = SEED_NO.withHistory;
export const WON_OFFER_TITLE = "A Blok Kaba İnşaat";
export const SEED_CITY = "Çankaya / Ankara";
export const SEED_TODAY_ISO = "2026-09-24";

/** Giriş + sahte teklif sunucusu + sayfaya özel dönüştürme yazımı/okumaları. */
export async function setUpConvert(page: Page): Promise<ConvertHarness> {
  await page.setViewportSize(OFFERS_VIEWPORT);
  await login(page);
  const local = await createLocalConvert(page);
  const server = await installFakeOffersServer(page, { convert: local.port });
  await installConvertedProjectReads(page, local);
  return { server, local, offerId: await offerIdByNo(page, WON_OFFER_NO) };
}

export async function openConvertScreen(page: Page, offerId: string): Promise<void> {
  await page.goto(`${OFFERS_URL}/${offerId}/donustur`);
  await expect(page.getByRole("heading", { level: 1, name: "Proje ve Sözleşmeye Dönüştür" })).toBeVisible();
  await expect(page.getByTestId("convert-step-1")).toBeVisible();
}

// ------------------------------------------------------------------------------------ adım yardımcıları

export interface Step1Input {
  readonly projectName?: string;
  readonly projectCode?: string;
  /** Küçük harf yazılır; blur'da tr-TR büyük harfe çevrilir (iddia spec'te). */
  readonly contractNo: string;
  readonly city: string;
  readonly signatureDate: string;
  readonly endDate: string;
}

export const STEP1_DEFAULT: Step1Input = {
  projectName: "Güneşkent A Blok Projesi",
  contractNo: "szl-2026-i01",
  city: SEED_CITY,
  signatureDate: "25.09.2026",
  endDate: "31.12.2026",
};

/** Adım 1 alanlarını doldurur; tarih/ad kutuları `fill` ile (maske `gg.aa.yyyy` tam girişte işler). */
export async function fillStep1(page: Page, input: Step1Input = STEP1_DEFAULT): Promise<void> {
  const step = page.getByTestId("convert-step-1");
  if (input.projectName !== undefined) await step.getByLabel("Proje adı").fill(input.projectName);
  if (input.projectCode !== undefined) await step.getByLabel("Proje kodu").fill(input.projectCode);
  await step.getByLabel("Sözleşme no").fill(input.contractNo);
  await step.getByLabel("Sözleşme tarihi", { exact: true }).fill(input.signatureDate);
  await step.getByLabel("Bitiş tarihi").fill(input.endDate);
  await step.getByLabel("İl / İlçe").fill(input.city);
}

export async function goToItems(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Kalemlere geç →" }).click();
  await expect(page.getByTestId("convert-step-2")).toBeVisible();
}

export async function goToConfirm(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Onaya geç →" }).click();
  await expect(page.getByTestId("convert-step-3")).toBeVisible();
}

/** Tohum kalemleri: Kalıp KAB-0001 · Demir KAB-0003 · Beton döküm KAB-0004 (fiyatsız → çıkarılmalı). */
export const ITEM_ROWS = { formwork: /Kalıp/, rebar: /Demir/, concrete: /Beton döküm/ } as const;
export const ADDED_POZ = "KAB-0002";
/**
 * Miktarlar 3 haneli kesirli SEÇİLDİ: satır başı yuvarlama (Σ ROUND_HALF_UP(miktar × B.F.)) ≠ toplamda yuvarlama
 * (19.942.575,25 ≠ 19.942.575,24) — Σ kuralı bozulursa ekran/gövde eşitliği kırılır.
 */
export const EDITS = { formworkQty: "4500,001", rebarBf: "36000,50", addedQty: "100,02", addedBf: "1500,25" } as const;

/** Beton çıkar · Kalıp miktarı · Demir B.F. değiştir · katalogdan KAB-0002 ekle (seçici kapanır). */
export async function editItems(page: Page): Promise<void> {
  await page.getByRole("row", { name: ITEM_ROWS.concrete }).getByLabel("Sözleşmeye dahil et").uncheck();
  await page.getByRole("row", { name: ITEM_ROWS.formwork }).getByLabel("Sözleşme miktarı").fill(EDITS.formworkQty);
  await page.getByRole("row", { name: ITEM_ROWS.rebar }).getByLabel("Sözleşme birim fiyatı").fill(EDITS.rebarBf);
  await page.getByRole("button", { name: "+ Katalogdan kalem ekle" }).click();
  const picker = page.getByRole("dialog", { name: "Katalogdan Kalem Ekle" });
  await expect(picker).toBeVisible();
  // Teklifteki (dahil YA DA çıkarılmış) kalemler "Listede var": gizlenir; gösterilince miktar kutusu KİLİTLİ (yeniden eklenemez).
  await expect(picker.getByLabel("KAB-0001 miktar")).toHaveCount(0);
  await picker.getByLabel("Listede olanları gizle").uncheck();
  await expect(picker.getByText(/Listede var/).first()).toBeVisible();
  await expect(picker.getByLabel("KAB-0001 miktar")).toBeDisabled();
  await picker.getByLabel(`${ADDED_POZ} miktar`).fill(EDITS.addedQty);
  await picker.getByLabel(`${ADDED_POZ} birim fiyat`).fill(EDITS.addedBf);
  await picker.getByRole("button", { name: /Kalemi? Ekle/ }).click();
  await expect(picker).toHaveCount(0);
}

/** Alanlar blur olsun, imleç/odak kareyi etkilemesin. */
export async function settleFocus(page: Page): Promise<void> {
  await page.getByRole("heading", { level: 1 }).click();
  await page.mouse.move(0, 0);
}

/** "₺19.942.545,00" → kuruş (tamsayı). Yuvarlama/kayan nokta YOK. */
export function centsOf(text: string): bigint {
  const digits = text.replace(/[^\d,-]/g, "").replace(",", ".");
  const [whole = "0", frac = ""] = digits.split(".");
  return BigInt(whole.replace("-", "")) * BigInt(100) + BigInt(frac.padEnd(2, "0").slice(0, 2));
}

/** Nokta-ondalık metin ("19942545.00" ya da "19942545") → kuruş (tamsayı). */
export function centsOfDecimal(text: string): bigint {
  const [whole = "0", frac = ""] = text.split(".");
  return BigInt(whole) * BigInt(100) + BigInt(frac.padEnd(2, "0").slice(0, 2));
}

export async function createProject(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Projeyi ve Sözleşmeyi Oluştur" }).click();
  await expect(page.getByTestId("convert-done")).toBeVisible();
}

/** Tam yol: adım 1 → düzenlemeler → onay (oluşturmadan). */
export async function walkToConfirm(page: Page, offerId: string, step1: Step1Input = STEP1_DEFAULT): Promise<void> {
  await openConvertScreen(page, offerId);
  await fillStep1(page, step1);
  await goToItems(page);
  await editItems(page);
  await goToConfirm(page);
}
