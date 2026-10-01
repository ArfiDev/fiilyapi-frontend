import { expect, test, type Page } from "@playwright/test";

import { login } from "./earned-value-helpers";

// GRP-F1 · Günlük İlerleme Raporu — YAPRAK satırda uzun iş kalemi adı "Birim"
// hücresine TAŞMAMALI, mockup'taki gibi SARILMALI (GİR:246 ad div'inde
// `white-space` YOK). Fonksiyonel (ekran görüntüsü YOK); mock kalıcı durumuna
// YAZMAZ — yanıt `page.route` ile bu testin içinde değiştirilir.

const GIR_URL = "/projeler/p-1/santiyeler/s-1/gunluk-ilerleme-raporu";
const LONG_NAME = "SIM-CPH-01 Kompozit Panel Montajı (İdari Bina Cephesi)";
const WIDTHS = [1440, 1024] as const;

async function openWithLongLeaf(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await login(page);
  await page.route("**/reports/daily?**", async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as { quantities: { node_id: string; name: string }[] };
    const quantities = body.quantities.map((row) => (row.node_id === "i:buat-priz" ? { ...row, name: LONG_NAME } : row));
    await route.fulfill({ response, json: { ...body, quantities } });
  });
  await page.goto(GIR_URL);
  await expect(page.locator("main").getByText(LONG_NAME)).toBeVisible();
}

for (const width of WIDTHS) {
  test(`gunluk rapor yaprak satir uzun ad birim hucresine tasmaz ${width}`, async ({ page }) => {
    await openWithLongLeaf(page, width);

    const row = page.locator("main tr.tree-table__row--leaf", { hasText: LONG_NAME });
    const name = row.locator(".ev-qty-name > span").first();
    const uomCell = row.locator("td").nth(0);
    const nameBox = await name.boundingBox();
    const uomBox = await uomCell.boundingBox();
    expect(nameBox).not.toBeNull();
    expect(uomBox).not.toBeNull();
    // Ad hücresi içeriğinin sağ kenarı, "Birim" hücresinin sol kenarını AŞMAZ.
    expect(nameBox!.x + nameBox!.width).toBeLessThanOrEqual(uomBox!.x + 0.5);
    // Metin kırpılmadı/taşmadı: iç span kendi kutusuna sığar.
    expect(await name.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    // Sarıldı: iki+ satır (tek satır yüksekliğinden belirgin yüksek).
    expect(nameBox!.height).toBeGreaterThan(24);
  });
}
