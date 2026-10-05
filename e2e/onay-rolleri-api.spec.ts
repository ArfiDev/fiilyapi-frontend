import { test, expect } from "@playwright/test";

import { login } from "./onay-rolleri-helpers";

// F-OKROL · Onay Eşiği YAZMA ucunun ALTYAPI e2e'si (ekran DEĞİL).
// IZN-B3b: rol atama uçları KALKTI (backend 410) — bu dosyada yalnız eşik kaldı.
//
// Neden UI'sız: `PUT /approvals/settings` PAYLAŞILAN mock durumunu değiştirir;
// yalnız REDDEDİLEN gövde denenir — durum değişmez, hiçbir kare oynamaz.
//
// 🔴 BFF KÖKÜ: `approvals` kökü `ALLOWED_ROOTS`ta. Bu dosya PUT metodunun da o
// kökten geçtiğini kanıtlar — GET'in geçmesi PUT hakkında hiçbir şey söylemez.

/**
 * 🔴 KONTROL SORUSU: "bu mock, gerçek backend'in REDDEDECEĞİ bir isteği
 * reddediyor mu?" — sözleşme `Field(ge=0, max_digits=18, decimal_places=2)`.
 * Reddetmeseydi istemci korkuluğu bir ONAYLAYICI üzerinde sınanmış olurdu.
 *
 * 🔒 Üç gövde de REDDEDİLİR ⇒ eşik durumu DEĞİŞMEZ, hiçbir kare oynamaz.
 */
test("esik ucu sozlesme disi govdeleri 422 ile reddeder ve durumu DEGISTIRMEZ", async ({
  page,
}) => {
  await login(page);
  const önce = await (await page.request.get("/api/backend/approvals/settings")).json();

  for (const gövde of [
    { approval_threshold_try: "-1" },
    { approval_threshold_try: "100.005" },
    { approval_threshold_try: "9".repeat(17) },
    { approval_threshold_try: "500000", baska_alan: 1 },
  ]) {
    const res = await page.request.put("/api/backend/approvals/settings", { data: gövde });
    expect(res.status(), JSON.stringify(gövde)).toBe(422);
  }

  const sonra = await (await page.request.get("/api/backend/approvals/settings")).json();
  expect(sonra).toEqual(önce);
});
