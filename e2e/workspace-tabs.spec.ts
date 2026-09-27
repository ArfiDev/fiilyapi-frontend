import { test, expect } from "@playwright/test";

import {
  closeTabButton,
  login,
  openViaSidebar,
  panelTab,
  seedWorkspaceTabs,
  sidebarLink,
  tabByName,
  tabCount,
  tabsList,
  unsavedGuardModal,
  workspaceStorageKeyCount,
  WORKSPACE_TABS_STORAGE_KEY,
} from "./workspace-tabs-helpers";

/**
 * SEKME-F1.5 · çalışma sekmeleri şeridi — FONKSİYONEL bekçi (emir §1).
 *
 * Her test gerçek girişten başlar; Playwright her testi TEMİZ bir tarayıcı
 * bağlamıyla açar (ayrı `localStorage`), bu yüzden ayrı bir sıfırlama adımı
 * gerekmez — depo kanonu (`timesheet.spec.ts` vb.) da buna güvenir.
 */

test.describe("a) aç/geç/kapat", () => {
  test("iki modül açılır, sekmeye tıklamak HATIRLANAN adrese (query dahil) döner, × komşuyu aktif bırakır", async ({
    page,
  }) => {
    await login(page);

    await openViaSidebar(page, "Projeler");
    await expect(page).toHaveURL("/projeler");
    await openViaSidebar(page, "Puantaj");
    await expect(page).toHaveURL("/puantaj");

    // Panel + Projeler + Puantaj = 3 sekme.
    await expect(tabsList(page).getByRole("tab")).toHaveCount(3);

    // Projeler sekmesinde filtre değiştir (query yazılır).
    await tabByName(page, "Projeler").click();
    await expect(page).toHaveURL("/projeler");
    await page.getByRole("tab", { name: /^Taahhüt/ }).click();
    await expect(page).toHaveURL(/\/projeler\?tab=taahhut$/);

    // Puantaj'a geç, geri dön: query GERİ GELİR.
    await tabByName(page, "Puantaj").click();
    await expect(page).toHaveURL("/puantaj");
    await tabByName(page, "Projeler").click();
    await expect(page).toHaveURL(/\/projeler\?tab=taahhut$/);

    // × ile kapat → komşu (soldaki Puantaj) aktif.
    await closeTabButton(page, "Projeler").click();
    await expect(tabsList(page).getByRole("tab")).toHaveCount(2);
    await expect(tabByName(page, "Puantaj")).toHaveAttribute("aria-selected", "true");
    await expect(page).toHaveURL("/puantaj");
  });
});

test.describe("b) yenile → geri gelir", () => {
  test("3 sekme + aktif, reload sonrası aynı sekmeler/sıra/aktif", async ({ page }) => {
    await login(page);
    await openViaSidebar(page, "Onay Kutusu");
    await openViaSidebar(page, "Raporlar");
    await openViaSidebar(page, "Puantaj");
    await expect(tabsList(page).getByRole("tab")).toHaveCount(4); // panel + 3

    const titlesBefore = await tabsList(page).getByRole("tab").allTextContents();
    await expect(tabByName(page, "Puantaj")).toHaveAttribute("aria-selected", "true");

    await page.reload();
    await expect(tabsList(page).getByRole("tab")).toHaveCount(4);
    const titlesAfter = await tabsList(page).getByRole("tab").allTextContents();
    expect(titlesAfter).toEqual(titlesBefore);
    await expect(tabByName(page, "Puantaj")).toHaveAttribute("aria-selected", "true");
    await expect(page).toHaveURL("/puantaj");
  });
});

test.describe("c) çıkış → temiz", () => {
  test("çıkış sonrası anahtar silinir, yeniden girişte yalnız panel", async ({ page }) => {
    await login(page);
    await openViaSidebar(page, "Onay Kutusu");
    await openViaSidebar(page, "Raporlar");
    expect(await workspaceStorageKeyCount(page)).toBe(1);

    await page.getByRole("button", { name: /çıkış/i }).click();
    await expect(page).toHaveURL(/\/login/);
    expect(await workspaceStorageKeyCount(page)).toBe(0);

    await login(page);
    await expect(tabsList(page).getByRole("tab")).toHaveCount(1);
    await expect(panelTab(page)).toBeVisible();
    // 🔴 ÇÜRÜTÜLEN ÖNCÜL: emir "anahtar sayısı 0" bekliyordu; ölçüldü —
    // `TabsRouterSync` ilk yüklemede `reconcileWithUrl("/")` çalıştırır, bu da
    // panel sekmesinin `lastViewedAt`ını günceller (`focusTab`, YENİ referans)
    // ve `tabs-store.ts`teki `setState` HER referans değişiminde kaydeder —
    // yani "yalnız panel" durumu bile bir yazma tetikler. Anahtar SAYISI 0
    // değil 1'dir; İÇERİK yalnız paneldir (bu, gerçek kusur DEĞİL — önceki
    // kullanıcının verisi sızmıyor, K1 değişmezi duruyor). Doğru iddia:
    // anahtar VARSA içeriği yalnız panel taşımalı, başka kullanıcıya ait
    // sekme YOK.
    expect(await workspaceStorageKeyCount(page)).toBe(1);
    const stored = await page.evaluate(
      (key) => window.localStorage.getItem(key as string),
      WORKSPACE_TABS_STORAGE_KEY,
    );
    const parsed = JSON.parse(stored ?? "{}") as { tabs: Array<{ id: string }> };
    expect(parsed.tabs.map((t) => t.id)).toEqual(["panel"]);
  });
});

test.describe("d) panel kapanmaz", () => {
  test("panelde × yok, orta tık etkisiz, sağ tık 'Tümünü kapat' paneli bırakır", async ({ page }) => {
    await login(page);
    await openViaSidebar(page, "Onay Kutusu");
    await openViaSidebar(page, "Raporlar");

    // × düğmesi panelde HİÇ YOK.
    await expect(
      page.getByRole("button", { name: "Gösterge Paneli sekmesini kapat" }),
    ).toHaveCount(0);

    // Orta tık panelde etkisiz (kapanmaz — zaten kapatma düğmesi yok, sekme sayısı sabit kalır).
    const before = await tabCount(page);
    await panelTab(page).click({ button: "middle" });
    expect(await tabCount(page)).toBe(before);

    // Sağ tık → "Tümünü kapat": panel kalır, diğerleri gider.
    await tabByName(page, "Raporlar").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Tümünü kapat" }).click();
    await expect(tabsList(page).getByRole("tab")).toHaveCount(1);
    await expect(panelTab(page)).toBeVisible();
    await expect(page).toHaveURL("/");
  });
});

test.describe("e) sidebar tekilleştirme", () => {
  test("açık modüle tık yeni sekme açmaz (öne getirir, hatırlanan url), aktif modüle tık köküne gider", async ({
    page,
  }) => {
    await login(page);
    await openViaSidebar(page, "Projeler");
    await page.getByRole("tab", { name: /^Taahhüt/ }).click();
    await expect(page).toHaveURL(/\/projeler\?tab=taahhut$/);

    await openViaSidebar(page, "Puantaj");
    await expect(tabsList(page).getByRole("tab")).toHaveCount(3); // panel + Projeler + Puantaj

    // Projeler zaten açık: sidebar tekrar tık → YENİ SEKME AÇMAZ, hatırlanan url'e döner.
    await openViaSidebar(page, "Projeler");
    await expect(tabsList(page).getByRole("tab")).toHaveCount(3);
    await expect(page).toHaveURL(/\/projeler\?tab=taahhut$/);
    await expect(tabByName(page, "Projeler")).toHaveAttribute("aria-selected", "true");

    // Aktif sekmenin KENDİ modülüne tık → modül KÖKÜNE gider (query düşer).
    await openViaSidebar(page, "Projeler");
    await expect(page).toHaveURL("/projeler");
    await expect(tabsList(page).getByRole("tab")).toHaveCount(3);
  });
});

test.describe("f) Ctrl/Cmd+tık ve orta tık: yeni sekme ARKA PLANDA", () => {
  test("sidebar bağlantısında", async ({ page }) => {
    await login(page);
    expect(page.context().pages().length).toBe(1);

    const modifier = process.platform === "darwin" ? "Meta" : "Control";
    await sidebarLink(page, "Projeler").click({ modifiers: [modifier] });

    // Aktif değişmedi (hâlâ panel), URL değişmedi, yeni sekme ARKA PLANDA açıldı.
    await expect(page).toHaveURL("/");
    await expect(panelTab(page)).toHaveAttribute("aria-selected", "true");
    await expect(tabByName(page, "Projeler")).toBeVisible();
    await expect(tabByName(page, "Projeler")).toHaveAttribute("aria-selected", "false");
    // Tarayıcının kendi sekmesi/penceresi AÇILMADI.
    expect(page.context().pages().length).toBe(1);
  });

  test("sayfa içi bağlantıda (proje kartı)", async ({ page }) => {
    await login(page);
    await openViaSidebar(page, "Projeler");
    await expect(tabByName(page, "Projeler")).toHaveAttribute("aria-selected", "true");
    expect(page.context().pages().length).toBe(1);

    const projectCard = page.getByRole("link", { name: /Kule A/ }).first();
    await projectCard.click({ button: "middle" });

    // Aktif hâlâ Projeler listesi, URL değişmedi, yeni sekme arka planda AÇILDI.
    // 🔴 ÇÜRÜTÜLEN ÖNCÜL: arka planda açılan sekme "Kule A" değil, YİNE
    // "Projeler" başlığı taşır — varlık adına çözüm (`useActiveTabTitleSync`,
    // `TabsRouterSync.tsx`) YALNIZ AKTİF sekme için çalışır; bu sekme arka
    // planda kaldığı sürece genel modül etiketinde kalır (bkz. `openTab`
    // reducer'ı: `title: mod.label`).
    await expect(page).toHaveURL("/projeler");
    const projelerTabs = tabsList(page).getByRole("tab", { name: "Projeler", exact: true });
    await expect(projelerTabs).toHaveCount(2);
    await expect(projelerTabs.first()).toHaveAttribute("aria-selected", "true");
    await expect(projelerTabs.last()).toHaveAttribute("aria-selected", "false");
    expect(page.context().pages().length).toBe(1);
  });
});

test.describe("g) dirty modalı", () => {
  test("g1: puantaj hücresi değişir → sekme değişiminde onay; Vazgeç veri korur, at-ve-geç geçer", async ({
    page,
  }) => {
    await login(page);
    await openViaSidebar(page, "Puantaj");
    await page.goto("/projeler/p-1/santiyeler/s-1/puantaj?iso_year=2026&iso_week=32");
    await expect(
      page.getByRole("heading", { level: 1, name: "A-Blok Şantiyesi — Puantaj" }).first(),
    ).toBeVisible();
    // "Onay Kutusu" ARKA PLANDA açılır (Ctrl/Cmd+tık) — puantaj sekmesi aktif
    // ve dokunulmamış kalır; öndeyken açsaydık dolduracağımız hücreden ÖNCE
    // sayfadan ayrılırdık.
    const modifier = process.platform === "darwin" ? "Meta" : "Control";
    await sidebarLink(page, "Onay Kutusu").click({ modifiers: [modifier] });

    const box = page
      .locator(".ts-week-table")
      .first()
      .getByLabel("Mehmet Kılıç · 3 Ağu saati");
    await box.fill("5");
    await box.blur();

    await tabByName(page, "Onay Kutusu").click();
    await expect(unsavedGuardModal(page)).toBeVisible();

    // Vazgeç: aynı sayfada kalır, veri duruyor.
    await page.getByRole("button", { name: "Vazgeç" }).click();
    await expect(unsavedGuardModal(page)).toBeHidden();
    await expect(page).toHaveURL(/\/puantaj\?/);
    await expect(box).toHaveValue("5");

    // Tekrar dene: "Değişiklikleri at ve geç" → geçer.
    await tabByName(page, "Onay Kutusu").click();
    await expect(unsavedGuardModal(page)).toBeVisible();
    await page.getByRole("button", { name: "Değişiklikleri at ve geç" }).click();
    await expect(unsavedGuardModal(page)).toBeHidden();
    await expect(page).toHaveURL("/onay-kutusu");
  });

  test("g2: proje oluşturma formu — alan yazılınca sekme kapatmak onay ister", async ({ page }) => {
    await login(page);
    await openViaSidebar(page, "Projeler");
    await page.getByRole("link", { name: "+ Yeni Proje" }).click();
    await expect(page).toHaveURL("/projeler/yeni");
    // Aynı modül (Projeler) — YENİ sekme açılmadı.
    await expect(tabsList(page).getByRole("tab")).toHaveCount(2);

    await page.getByLabel("Proje Adı").fill("Deneme Projesi");

    await closeTabButton(page, "Projeler").click();
    await expect(unsavedGuardModal(page)).toBeVisible();
    await expect(unsavedGuardModal(page)).toContainText("Proje");
    await page.getByRole("button", { name: "Vazgeç" }).click();
    await expect(unsavedGuardModal(page)).toBeHidden();
    await expect(page).toHaveURL("/projeler/yeni");
    await expect(page.getByLabel("Proje Adı")).toHaveValue("Deneme Projesi");
  });

  test("g3 (D1): dirty iken aktif modülün KENDİ sidebar öğesine tık de onay ister", async ({ page }) => {
    await login(page);
    await openViaSidebar(page, "Projeler");
    await page.getByRole("link", { name: "+ Yeni Proje" }).click();
    await page.getByLabel("Proje Adı").fill("Deneme Projesi");

    await openViaSidebar(page, "Projeler");
    await expect(unsavedGuardModal(page)).toBeVisible();
    await page.getByRole("button", { name: "Değişiklikleri at ve geç" }).click();
    await expect(unsavedGuardModal(page)).toBeHidden();
    await expect(page).toHaveURL("/projeler");
  });

  test("g4: dokunulmamış formda sekme değişimi onay İSTEMEZ", async ({ page }) => {
    await login(page);
    await openViaSidebar(page, "Projeler");
    await page.getByRole("link", { name: "+ Yeni Proje" }).click();
    await expect(page.getByLabel("Proje Adı")).toHaveValue("");

    await openViaSidebar(page, "Puantaj");
    await expect(unsavedGuardModal(page)).toBeHidden();
    await expect(page).toHaveURL("/puantaj");
  });
});

test.describe("h) 11. sekme LRU", () => {
  test("10 sekme dolunca yenisi en uzun süredir bakılmayanı kapatır", async ({ page }) => {
    await login(page);
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
    for (const label of modules) {
      await openViaSidebar(page, label);
    }
    // Panel + 9 modül = 10 (tavanda, henüz taşma yok).
    await expect(tabsList(page).getByRole("tab")).toHaveCount(10);
    await expect(tabByName(page, "Onay Kutusu")).toBeVisible();

    // 10. modülü aç (11. sekme denemesi) → en eski bakılan ("Onay Kutusu") kapanır.
    await openViaSidebar(page, "Stok & Depo");
    await expect(tabsList(page).getByRole("tab")).toHaveCount(10);
    await expect(tabByName(page, "Onay Kutusu")).toHaveCount(0);
    await expect(panelTab(page)).toBeVisible();
    await expect(tabByName(page, "Stok & Depo")).toHaveAttribute("aria-selected", "true");
  });
});

test.describe("i) geri tuşu", () => {
  test("yalnız AKTİF sekmenin url'sini günceller, diğer sekmeler değişmez", async ({ page }) => {
    await login(page);

    // Tab A: /personel → bir kayda gir (/personel/{id}).
    await openViaSidebar(page, "Personel");
    await expect(page).toHaveURL("/personel");
    await page.locator(".personel-detail-link").first().click();
    await expect(page).toHaveURL(/\/personel\/[^/]+$/);
    const detailUrl = page.url();

    // Tab B: Puantaj (aktif olur).
    await openViaSidebar(page, "Puantaj");
    await expect(page).toHaveURL("/puantaj");

    await page.goBack();
    // Tarayıcı bir önceki geçmiş kaydına (personel detay) döner — bu adres
    // AKTİF sekmeye (Puantaj idi) yazılır (Q5 bilinen davranış).
    await expect(page).toHaveURL(detailUrl);

    // Tab A (Personel) DOKUNULMADI: hâlâ kendi detay adresinde.
    // Not: Puantaj sekmesi artık personel detayını gösterdiği için önceki
    // adıyla aranamaz — panelden SONRAKİ İKİNCİ sekmeye (Tab A, index 1) geçilir.
    await tabsList(page).getByRole("tab").nth(1).click();
    await expect(page).toHaveURL(detailUrl);
  });
});

test.describe("j) DnD", () => {
  test("sekme sürükleme sırayı beklendiği gibi değiştirir, panel yerinde kalır", async ({ page }) => {
    await login(page);
    const modules = ["Onay Kutusu", "FİİL AI", "Raporlar", "Projeler"];
    for (const label of modules) await openViaSidebar(page, label);

    const tabs = tabsList(page).getByRole("tab");
    await expect(tabs).toHaveCount(5); // panel + 4
    const orderBefore = await tabs.allTextContents();
    expect(orderBefore[0]).toBe("Gösterge Paneli");

    // "Onay Kutusu"nu (index 1) SAĞA, "Projeler"in (son) hemen soluna sürükle.
    await tabByName(page, "Onay Kutusu").dragTo(tabByName(page, "Projeler"));
    let order = await tabs.allTextContents();
    expect(order[0]).toBe("Gösterge Paneli");
    expect(order.indexOf("Onay Kutusu")).toBeGreaterThan(order.indexOf("FİİL AI"));

    // Şimdi "Projeler"i (sonda) SOLA, "FİİL AI"nin önüne sürükle.
    await tabByName(page, "Projeler").dragTo(tabByName(page, "FİİL AI"));
    order = await tabs.allTextContents();
    expect(order[0]).toBe("Gösterge Paneli");
    expect(order.indexOf("Projeler")).toBeLessThan(order.indexOf("FİİL AI"));

    // Panel hep index 0, hep sabit — hiçbir sürüklemede taşınmadı.
    await expect(panelTab(page)).toBeVisible();
  });
});

test.describe("k) uzun ad ellipsis", () => {
  test("320px'i aşan başlık ellipsis alır (title tam ad taşır), kısa adda ellipsis yok", async ({
    page,
  }) => {
    await login(page);
    const longTitle =
      "Bu Sekme Başlığı Kasıtlı Olarak Çok Uzun Tutulmuştur Ve Üç Yüz Yirmi Pikseli Kesin Olarak Aşması Gerekmektedir Ölçüm İçin";
    const now = Date.now();
    await seedWorkspaceTabs(
      page,
      [
        {
          id: "panel",
          url: "/",
          moduleKey: "/",
          title: "Gösterge Paneli",
          lastViewedAt: now - 3000,
          pinned: true,
        },
        {
          id: "tab-long",
          url: "/faturalar",
          moduleKey: "/faturalar",
          title: longTitle,
          lastViewedAt: now - 2000,
          pinned: false,
        },
        {
          id: "tab-short",
          url: "/onay-kutusu",
          moduleKey: "/onay-kutusu",
          title: "Onay Kutusu",
          lastViewedAt: now - 1000,
          pinned: false,
        },
      ],
      "tab-short",
    );
    await page.goto("/onay-kutusu");
    await expect(tabsList(page).getByRole("tab")).toHaveCount(3);

    const longTab = tabByName(page, longTitle);
    await expect(longTab).toHaveAttribute("title", longTitle);
    const longTitleEl = longTab.locator(".workspace-tab__title");
    await expect
      .poll(async () =>
        longTitleEl.evaluate((el) => el.scrollWidth > el.clientWidth),
      )
      .toBe(true);

    const shortTitleEl = tabByName(page, "Onay Kutusu").locator(".workspace-tab__title");
    await expect
      .poll(async () =>
        shortTitleEl.evaluate((el) => el.scrollWidth > el.clientWidth),
      )
      .toBe(false);
  });
});

