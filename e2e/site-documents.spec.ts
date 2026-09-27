import { test, expect, type Page } from "@playwright/test";

// F-BC T2 · Şantiye › Belgeler (ŞB) FONKSİYONEL e2e'si — görsel spec'ler T5'te.
//
// Kapsam: klasör paneli + URL durumu (`?folder=`/`?q=`), kart ızgarası,
// "Son Eklenenler" listesi, indirme (kart + "İndir" düğmesi) ve `site_id`
// kapsam kuralının TELDEN kanıtı (jsdom bunu göremez: ağ isteğinin kendisi).
//
// ⏱️ TARİH SABİTLEME (zorunlu): "Bugün"/"Dün" etiketleri gerçek saate bağlıdır
// ve belge fikstürleri TEMMUZ 2026'dadır. Sabitlenmezse etiketler her gün
// değişir. `page.clock.setFixedTime` NAVİGASYONDAN ÖNCE kurulur (site-diary
// spec'iyle aynı yöntem).
//
// 🔒 FİKSTÜR İZOLASYONU: bu dosya SALT-OKURDUR — p-1/s-1 belge fikstürlerini
// hiç değiştirmez (yazma akışları `documents-api.spec.ts`te p-2'de yürür).

const DOCUMENTS_URL = "/projeler/p-1/santiyeler/s-1/belgeler";
/** Mockup'ın "bugünü" (ŞB 98 "Bugün" satırı fikstürlerle eşleşir). */
const FIXED_NOW = "2026-07-17T13:00:00Z";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/e-posta/i).fill("patron@fiil.com");
  await page.getByLabel(/^şifre$/i).fill("dogruparola");
  await page.getByRole("button", { name: /giriş yap/i }).click();
  await expect(page.getByRole("heading", { name: "Gösterge Paneli" })).toBeVisible();
}

test("şantiye belgeleri: klasör paneli, kart ızgarası ve Son Eklenenler basılır", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date(FIXED_NOW));
  await login(page);
  await page.goto(DOCUMENTS_URL);
  const content = page.locator("main");

  // ŞB 85 — başlık bloğu
  await expect(
    page.getByRole("heading", { level: 1, name: "A-Blok Şantiyesi — Belgeler" }),
  ).toBeVisible();

  // ŞB 73-80 — sekme şeridinde "Belgeler" aktif (artık ComingSoon DEĞİL)
  await expect(page.getByRole("tab", { name: "Belgeler" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(content.getByText("Bu bölüm yakında")).toHaveCount(0);

  // ŞB 37-69 — klasör paneli: kök + şantiye klasörleri
  const panel = page.getByRole("navigation", { name: "Belge klasörleri" });
  await expect(panel.getByRole("link", { name: /Tüm Belgeler/ })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(panel.getByRole("link", { name: /Günlük Raporlar/ })).toBeVisible();

  // ŞB 94-133 — kart ızgarası: tip ikonu + ad + "boyut · tarih"
  const card = page.getByRole("button", { name: /Hakediş_5_Jul2026\.pdf/ }).first();
  await expect(card).toBeVisible();
  await expect(card).toContainText("1,2 MB · Bugün");
  await expect(page.getByRole("button", { name: /Mimari_Proje_Rev3\.dwg/ }).first()).toContainText(
    "18 MB · Oca 2026",
  );

  // ŞB 137-164 — "Son Eklenenler": en yeni ÜÇ belge, meta satırı + İndir
  const recent = page.getByRole("list", { name: "Son eklenen belgeler" });
  await expect(recent.getByRole("listitem")).toHaveCount(3);
  await expect(recent.getByText("Günlük_Rapor_17.07.2026.pdf")).toBeVisible();
  await expect(recent.getByText("Günlük Raporlar · Şantiye Şefi: S. Öztürk")).toBeVisible();
  await expect(recent.getByRole("button", { name: "İndir" }).first()).toBeVisible();
});

test("kapsam kuralı: her belge/klasör isteği site_id taşır (telden kanıt)", async ({ page }) => {
  await page.clock.setFixedTime(new Date(FIXED_NOW));
  await login(page);

  const scopedUrls: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (/\/api\/backend\/(documents|projects\/[^/]+\/document-folders)/.test(url)) {
      scopedUrls.push(url);
    }
  });

  await page.goto(DOCUMENTS_URL);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Belgeler");
  // ⚠️ Locator KAPSAMLANIR. Eskiden drill kenar çubuğunda da "Hakedişler"
  // adlı bir bağlantı vardı ve kapsamsız locator onu tıklamaya çalışıp
  // takılıyordu; 🔴 DRILL-KALDIR (2026-08-29) o çubuğu sildi. Kapsam yine de
  // KALIR: klasör bağlantıları her zaman panel içinden alınır.
  const panel = page.getByRole("navigation", { name: "Belge klasörleri" });
  // Klasör süzgeci de eklendiğinde site_id DÜŞMEMELİDİR.
  await panel.getByRole("link", { name: /Hakedişler/ }).first().click();
  await expect(page).toHaveURL(/\?folder=df-s1-2/);
  await expect(page.getByRole("button", { name: /BOQ_ABlok_v4\.xlsx/ }).first()).toBeVisible();

  expect(scopedUrls.length).toBeGreaterThan(0);
  for (const url of scopedUrls) {
    expect(url, `site_id taşımayan istek: ${url}`).toContain("site_id=s-1");
  }
});

test("klasör seçimi ve arama URL durumuna yazılır, ızgarayı süzer", async ({ page }) => {
  await page.clock.setFixedTime(new Date(FIXED_NOW));
  await login(page);
  await page.goto(DOCUMENTS_URL);
  const content = page.locator("main");

  // Klasör seçimi (ŞB 45-68) → ?folder=; locator klasör paneline kapsamlanır
  const panel = page.getByRole("navigation", { name: "Belge klasörleri" });
  await panel.getByRole("link", { name: /İzin & Ruhsat/ }).first().click();
  await expect(page).toHaveURL(/\?folder=df-s1-4/);
  await expect(content.getByText("İzin & Ruhsat", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Yapı_Ruhsatı_2025\.pdf/ }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Puantaj_Tem2026\.xlsx/ })).toHaveCount(0);

  // Arama (ŞB 27-30) → ?q= (sunucu süzgeci); klasör süzgeci KORUNUR
  await page.getByRole("searchbox", { name: "Belge ara" }).fill("zemin");
  await expect(page).toHaveURL(/folder=df-s1-4/);
  await expect(page).toHaveURL(/q=zemin/);
  await expect(page.getByRole("button", { name: /Zemin_Etüdü_Raporu\.pdf/ }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Yapı_Ruhsatı_2025\.pdf/ })).toHaveCount(0);

  // Eşleşme yoksa boş-durum metni (uydurma satır YOK)
  await page.getByRole("searchbox", { name: "Belge ara" }).fill("boyleBirBelgeYok");
  await expect(content.getByText("Aramanızla eşleşen belge bulunamadı.")).toBeVisible();
});

test("indirme: kart tıklaması ve 'İndir' düğmesi dosyayı indirir", async ({ page }) => {
  await page.clock.setFixedTime(new Date(FIXED_NOW));
  await login(page);
  await page.goto(DOCUMENTS_URL);

  // ⚠️ TUZAK: Chromium indirme dosya adındaki ASCII DIŞI harfleri (ş, ü, ı)
  // alt çizgiye çevirir — `suggestedFilename()` "Hakedi__5_Jul2026.pdf" döner.
  // Bu tarayıcı davranışıdır, uygulama hatası DEĞİL; bu yüzden ada tam eşitlik
  // yerine ASCII gövde + uzantı üzerinden bakılır.

  // Kart tıklaması = indirme (spec §6 S1)
  const cardDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: /Hakediş_5_Jul2026\.pdf/ }).first().click();
  expect((await cardDownload).suggestedFilename()).toMatch(/^Hakedi.*_5_Jul2026\.pdf$/);

  // "Son Eklenenler" satırındaki "İndir" düğmesi (ŞB 147)
  const recent = page.getByRole("list", { name: "Son eklenen belgeler" });
  const rowDownload = page.waitForEvent("download");
  await recent.getByRole("button", { name: "İndir" }).first().click();
  expect((await rowDownload).suggestedFilename()).toMatch(/_Rapor_17\.07\.2026\.pdf$/);
});

// BASILMAYANLAR (spec §4) — canlı DOM üzerinde sızıntı taraması.
test("basılmayanlar: belge silme / klasör düzenleme / versiyon yüzeyi ekranda YOKTUR", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date(FIXED_NOW));
  await login(page);
  await page.goto(DOCUMENTS_URL);
  const content = page.locator("main");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Belgeler");

  await expect(page.getByRole("button", { name: /^sil$/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /yeniden adlandır/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /klasörü sil/i })).toHaveCount(0);
  await expect(content.getByText(/versiyon/i)).toHaveCount(0);
  await expect(content.getByText(/onay bekliyor/i)).toHaveCount(0);
});
