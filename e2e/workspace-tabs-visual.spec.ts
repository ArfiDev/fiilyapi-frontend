import { test, expect } from "@playwright/test";

import { prepareFrame } from "./visual-scroll";
import { login, openViaSidebar, tabByName, tabsList } from "./workspace-tabs-helpers";

/**
 * SEKME-F1.5 · çalışma sekmeleri şeridi — GÖRSEL kareler (emir §3).
 *
 * KADRAJ: depodaki emsalin ÇOĞUNLUĞU (205 karenin 204'ü) TAM SAYFA 1440'tır
 * (`shell-visual.spec.ts`, `dashboard.visual.spec.ts` vb. — `toHaveScreenshot`
 * `fullPage: true`). Bu dosya da aynı kanonu izler: şerit kabuğun (topbar)
 * bir PARÇASI ve içerik ile aynı karede birlikte anlam taşıyor (aktif sekmenin
 * altındaki sayfa da karede görünür) — yalnız şeridi kırpmak bunu keserdi ve
 * depoda "yalnız şerit" diye ayrı bir emsal de YOK. Baseline'lar YALNIZ CI'dan
 * (Linux) alınır — bu dosya yerelde YALNIZ "yüklendi" iddialarını sınamak
 * için koşulur (bkz. RAPOR).
 *
 * 📅 SAAT DONDURULUR (`page.clock`): `login()` (`workspace-tabs-helpers.ts`,
 * `workspace-tabs.spec.ts` ile PAYLAŞILIR) kendi içinde `page.goto("/login")`
 * çağırır — bu dosya o fonksiyonu DEĞİŞTİRMEZ. Sıra `leaves-visual.spec.ts`
 * kanonuyla AYNI: dondurma GİRİŞTEN SONRA, sekme açan ilk `openViaSidebar`
 * gezinmesinden ÖNCE kurulur ("saat girişten önce kurulmak giriş akışını
 * kırar" ÖLÇÜMÜ o dosyada yapıldı, burada tekrarlanmadı).
 */

const VIEWPORT_1440 = { width: 1440, height: 900 } as const;
const VIEWPORT_390 = { width: 390, height: 844 } as const;

/** Fikstür "şimdi"si — bu dosyanın kadrajlarında görünen içerik BUNA BAĞLI DEĞİL, dondurma yalnız kadraj DETERMİNİZMİ içindir. */
const FIXED_NOW = "2026-08-27T09:00:00";

test.describe("çalışma sekmeleri — 1440", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORT_1440);
    await login(page);
    await page.clock.setFixedTime(new Date(FIXED_NOW));
  });

  test("4 sekme (biri aktif)", async ({ page }) => {
    await openViaSidebar(page, "Onay Kutusu");
    await openViaSidebar(page, "Raporlar");
    await openViaSidebar(page, "Puantaj");
    await expect(tabByName(page, "Puantaj")).toHaveAttribute("aria-selected", "true");

    await prepareFrame(page);
    await expect(page).toHaveScreenshot("workspace-tabs-4-tabs.png", { fullPage: true });
  });

  test("10 sekme sona kaydırılmış (panel sticky, aktif görünür)", async ({ page }) => {
    // Şerit `scroll-behavior: smooth` — `prefers-reduced-motion: reduce`
    // altında `auto`ya düşer (bkz. `WorkspaceTabsStrip.tsx` tepe yorumu).
    // Sekmeler açılmadan ÖNCE kurulur: aktif sekme her `openViaSidebar`da
    // `scrollIntoView` ile kaydırılıyor, animasyonun anlık olması gerekli.
    await page.emulateMedia({ reducedMotion: "reduce" });

    const modules = [
      "Onay Kutusu",
      "FİİL AI",
      "Raporlar",
      "Projeler",
      "Puantaj",
      "Makine & Ekipman",
      "Günlük Kayıt",
      "Personel",
      "Planlama Paneli",
    ];
    for (const label of modules) await openViaSidebar(page, label);
    await expect(tabByName(page, "Planlama Paneli")).toHaveAttribute("aria-selected", "true");

    // FLK-F1: testin kendi `scrollIntoView` çağrısı KALDIRILDI — native çağrı
    // sticky paneli bilmez ve bileşenin kendi kaydırmasıyla yarışıyordu
    // (aralıklı: scrollLeft ≈ maxScrollLeft − 38px). Üretimin kaydırması
    // ölçülür; "oturdu" açıkça doğrulanır.
    await page.evaluate(() => document.fonts.ready);

    const list = tabsList(page);
    await expect
      .poll(
        () =>
          list.evaluate((el) => {
            const active = el.querySelector(".workspace-tab--active");
            if (!active) return false;
            // Şeridin sağ `padding-inline-end`i (8px) kaydırılabilir alana dahil:
            // aktif sekme sarmalayıcısı (× dahil) şerit sağına hizalanınca
            // scrollLeft = max − padding olur (ölçüldü 1440px: 190 / 198).
            const padEnd = parseFloat(getComputedStyle(el).paddingInlineEnd) || 0;
            const atEnd =
              Math.abs(el.scrollLeft - (el.scrollWidth - el.clientWidth)) <= padEnd + 1;
            const activeVisible =
              active.getBoundingClientRect().right <= el.getBoundingClientRect().right + 1;
            return atEnd && activeVisible;
          }),
        { message: "şerit sona oturmalı ve aktif sekme tam görünmeli" },
      )
      .toBe(true);
    await expect
      .poll(() =>
        list.evaluate(
          (el) =>
            new Promise<boolean>((resolve) => {
              const before = el.scrollLeft;
              requestAnimationFrame(() =>
                requestAnimationFrame(() => resolve(el.scrollLeft === before)),
              );
            }),
        ),
      )
      .toBe(true);
    await expect(page.locator(".workspace-tabs")).toHaveClass(/workspace-tabs--fade-left/);

    // CEO kararı "d" (2026-09-28): kanon DEĞİŞMEDİ — `prepareFrame` yine
    // `toHaveScreenshot`tan hemen önceki satır (`visual-frame-guard.test.ts`
    // bunu değişmeden doğrular). Yalnız BU çağrı `preserveScrollLeft` ile
    // şeridin (`.workspace-tabs__list`) yatay kaydırmasını korur — dikey
    // sıfırlama ve imleç parkı her zamanki gibi çalışır (bkz. `visual-scroll.ts`).
    await prepareFrame(page, { preserveScrollLeft: [".workspace-tabs__list"] });

    // fullPage YOK, bilinçli sapma (CEO K5, ölçüldü): `fullPage: true` kadrajı
    // şeridin `scrollLeft`ini SIFIRLIYOR (bu turda gözlemlendi) ve bu karenin
    // ANLAMI olan "şerit sona kaydırılmış" durumunu bozuyor — depodaki genel
    // "tam sayfa" kanonundan (bu dosyanın başlık yorumu) bu tek kare için
    // BİLİNÇLİ sapılır.
    await expect(page).toHaveScreenshot("workspace-tabs-10-tabs-scrolled.png", {
      fullPage: false,
    });
  });

  test("sağ tık menüsü açık", async ({ page }) => {
    await openViaSidebar(page, "Onay Kutusu");
    await openViaSidebar(page, "Raporlar");
    // Sabit imleç koordinatı: menü konumu deterministik olsun (park noktasına
    // BAĞIMSIZ — menü kendi `x`/`y`sinde açılır, bu tıklama koordinatıdır).
    await tabByName(page, "Raporlar").click({ button: "right", position: { x: 10, y: 10 } });
    await expect(page.getByRole("menu", { name: "Sekme seçenekleri" })).toBeVisible();

    // `prepareFrame` imleci sağ-alt köşeye park eder — menü ZATEN açık
    // olduğundan hover kararsızlığı yok, yalnız kaydırma/park uygulanır.
    await prepareFrame(page);
    await expect(page).toHaveScreenshot("workspace-tabs-context-menu.png", { fullPage: true });
  });

  test("dirty onay modalı", async ({ page }) => {
    await openViaSidebar(page, "Projeler");
    await page.getByRole("link", { name: "+ Yeni Proje" }).click();
    await page.getByLabel("Proje Adı").fill("Deneme Projesi");
    await openViaSidebar(page, "Puantaj");
    await expect(page.getByRole("dialog", { name: "Kaydedilmemiş değişiklikler var" })).toBeVisible();

    await prepareFrame(page);
    await expect(page).toHaveScreenshot("workspace-tabs-dirty-modal.png", { fullPage: true });
  });
});

test.describe("çalışma sekmeleri — 390 (dar ekran amblemi)", () => {
  test("4 sekme, logo amblemi", async ({ page }) => {
    await page.setViewportSize(VIEWPORT_390);
    await login(page);
    await page.clock.setFixedTime(new Date(FIXED_NOW));
    await openViaSidebar(page, "Onay Kutusu");
    await openViaSidebar(page, "Raporlar");
    await openViaSidebar(page, "Puantaj");
    await expect(tabByName(page, "Puantaj")).toHaveAttribute("aria-selected", "true");

    // VIS-390-F1 (ölçüldü): 390'da şerit (`.workspace-tabs__list`) aktif sekmeyi
    // görünür tutmak için KENDİ kendini yatay kaydırır (`scroll-behavior:
    // smooth`, sekme durumu oturana dek birkaç kez `scrollTo`). Baseline zaten
    // bu "aktif sekme panelin yanında" durumunu basar. `prepareFrame` şeridin
    // `scrollLeft`ini 0'a çekince bileşen onu geri kaydırıyordu (yarış → poll
    // 1'de kalır). 1280'deki 10 sekme karesiyle AYNI CEO K5 kararı: yatay
    // kaydırma korunur; kare anlamı olan durum önce OTURUR (iki kare üst üste
    // aynı `scrollLeft`), dikey sıfırlama ve imleç parkı aynen çalışır.
    const list = tabsList(page);
    await expect.poll(() => list.evaluate((el) => Math.round(el.scrollLeft) > 0)).toBe(true);
    await expect
      .poll(() =>
        list.evaluate(
          (el) =>
            new Promise<boolean>((resolve) => {
              const before = el.scrollLeft;
              requestAnimationFrame(() =>
                requestAnimationFrame(() => resolve(el.scrollLeft === before)),
              );
            }),
        ),
      )
      .toBe(true);

    await prepareFrame(page, { preserveScrollLeft: [".workspace-tabs__list"] });
    await expect(page).toHaveScreenshot("workspace-tabs-390-emblem.png", { fullPage: true });
  });
});
