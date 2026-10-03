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
