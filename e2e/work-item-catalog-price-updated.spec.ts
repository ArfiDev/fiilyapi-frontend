import { test, expect } from "@playwright/test";

import { loginForCatalog, openWorkItemCatalog } from "./work-item-catalog-helpers";

// KAT-F1.5 · "Fiyat güncelleme" hücresi (KIK:145) — tarih KESİLMEZ, "Düzenle" hücresine TAŞMAZ.
// Mockup'ta 92px sütuna 12.5px JetBrains Mono "dd.mm.yyyy" (75px) sığar; ölçüm gerçek düzende yapılır.

test("fiyat guncelleme tarihi hucrede tam gorunur", async ({ page }) => {
  await loginForCatalog(page);
  await openWorkItemCatalog(page);

  const cells = page.locator(".wik-upd");
  const count = await cells.count();
  expect(count).toBeGreaterThan(0);

  for (let index = 0; index < count; index += 1) {
    const cell = cells.nth(index);
    const m = await cell.evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const text = range.getBoundingClientRect();
      const box = el.getBoundingClientRect();
      const action = el.nextElementSibling;
      const button = action?.querySelector("button")?.getBoundingClientRect();
      const next = action?.getBoundingClientRect();
      return {
        label: el.textContent,
        clientWidth: el.clientWidth,
        scrollWidth: el.scrollWidth,
        textRight: text.right,
        boxRight: box.right,
        nextLeft: next?.left ?? box.right,
        buttonLeft: button?.left ?? box.right,
      };
    });
    expect(m.scrollWidth, `${m.label} hücreden taşıyor`).toBeLessThanOrEqual(m.clientWidth);
    expect(m.textRight, `${m.label} sağ hücreye biniyor`).toBeLessThanOrEqual(m.nextLeft);
    expect(m.textRight, `${m.label} "Düzenle" düğmesinin altında kalıyor`).toBeLessThanOrEqual(m.buttonLeft);
  }
});

// KAT-F1.5b · "Düzenle" düğmesi kartın/kaydırma kabının DIŞINA TAŞMAZ (mockup 64px sütunda 69px düğmeyle taşıyordu).
test("duzenle dugmesi kaydirma kabindan tasmaz", async ({ page }) => {
  await loginForCatalog(page);
  await openWorkItemCatalog(page);

  const buttons = page.locator(".wik-row .wik-cell--action button");
  const count = await buttons.count();
  expect(count).toBeGreaterThan(0);

  const scroll = await page.locator(".wik-scroll").evaluate((el) => ({
    right: el.getBoundingClientRect().right,
    clientWidth: el.clientWidth,
    scrollWidth: el.scrollWidth,
  }));
  expect(scroll.scrollWidth, "kaydırma kabında yatay taşma var").toBeLessThanOrEqual(scroll.clientWidth);

  for (let index = 0; index < count; index += 1) {
    const m = await buttons.nth(index).evaluate((el) => {
      const box = el.getBoundingClientRect();
      const cell = el.parentElement?.getBoundingClientRect();
      return { left: box.left, right: box.right, cellRight: cell?.right ?? box.right };
    });
    expect(m.right, `satır ${index}: Düzenle kaydırma kabının sağını aşıyor`).toBeLessThanOrEqual(scroll.right);
    expect(m.right, `satır ${index}: Düzenle kendi hücresini aşıyor`).toBeLessThanOrEqual(m.cellRight);
  }
});
