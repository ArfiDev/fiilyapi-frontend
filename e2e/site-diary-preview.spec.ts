import { test, expect, type Page } from "@playwright/test";

// GKS-F1.6 · günlük kayıt ÖNİZLEMESİ e2e (kayıtsız günde kalemler kaydetmeden gelir).
// Kaynak: GUNLUK-KAYIT-ONIZLEME-SPEC.md (G-a/G-b, Ü3 diyalog metni, Ü8 kilit).
//
// 🔒 SALT-OKUR: bu dosya mock'a HİÇBİR yazma göndermez (yalnız GET iskelet +
// liste). Mock backend paylaşılan tek sunucudur (fullyParallel); kayıt AÇMAK
// gerekirse `site-diary-fake-create.ts` kullanılır, burada gerekmez.
//
// ⏱️ Saat her testte NAVİGASYONDAN ÖNCE sabitlenir (varsayılan gün = bugün).
//
// 📊 FİKSTÜR ÖLÇÜMÜ (mock `BOQ_FIXTURE` · kural A, s-1):
//   · bölüm seçilmedi → 6 kalem (01.001 · 01.002 · 02.001 · 02.002 · 03.001 · 03.002) Bölümsüz
//   · sec-1 "Kat 6–10 Kaba İnşaat" → 01.001 · 02.001 · 02.002 (3 kalem)
//   · sec-2 "Zemin Kat Kaba İnşaat" → 01.001 · 02.001 (2 kalem)

const SITE_DIARY_URL = "/projeler/p-1/santiyeler/s-1/gunluk-kayit";
/** Temmuz'da kayıt OLMAYAN gün (kayıtlar 15-16 Temmuz). */
const FREE_DAY = "2026-07-20T09:00:00Z";
/**
 * Gün kilidi olan ama günlük KAYDI olmayan gün: puantaj onayı `ev-apr-3`
 * (12–15 Ekim) s-1'de kilit üretir; hiçbir spec bu günleri açmaz/yazmaz.
 */
const LOCKED_NO_ENTRY_DAY = "2026-10-13T09:00:00Z";

const SECTION_1 = { id: "sec-1", name: "Kat 6–10 Kaba İnşaat", itemCodes: ["01.001", "02.001", "02.002"] };
const SECTION_2 = { id: "sec-2", name: "Zemin Kat Kaba İnşaat", itemCodes: ["01.001", "02.001"] };
const ALL_ITEM_CODES = ["01.001", "01.002", "02.001", "02.002", "03.001", "03.002"];

async function openDiary(page: Page, day: string) {
  await page.clock.setFixedTime(new Date(day));
  await page.goto("/login");
  await page.getByLabel(/e-posta/i).fill("patron@fiil.com");
  await page.getByLabel(/^şifre$/i).fill("dogruparola");
  await page.getByRole("button", { name: /giriş yap/i }).click();
  await expect(page.getByRole("heading", { name: "Gösterge Paneli" })).toBeVisible();
  await page.goto(SITE_DIARY_URL);
  await expect(page.getByRole("heading", { level: 1, name: "Günlük Kayıt & Planlama" })).toBeVisible();
  return page.locator("main");
}

type Content = ReturnType<Page["locator"]>;

/**
 * Miktar girişi: bölümsüz satır "KOD bugün yapılan miktar", bölümlü satır
 * "KOD · BÖLÜM bugün yapılan miktar" (başlığın bölümü seçiliyken tüm satırlar bölümlüdür).
 */
function quantityInput(content: Content, code: string, sectionName?: string) {
  const label = sectionName === undefined ? code : `${code} · ${sectionName}`;
  return content.getByLabel(`${label} bugün yapılan miktar`, { exact: true });
}

/** Önizleme satırlarının kalem kodları (miktar girişlerinin etiketinden). */
async function previewItemCodes(content: Content): Promise<string[]> {
  const labels = await content.getByLabel(/ bugün yapılan miktar$/).evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("aria-label") ?? ""),
  );
  return [...new Set(labels.map((label) => label.split(" ")[0]))].sort();
}

test("önizleme: bölüm seçilmedi → şantiyenin tüm kalemleri kayıt açılmadan gelir", async ({ page }) => {
  const content = await openDiary(page, FREE_DAY);

  await expect(quantityInput(content, "01.001")).toHaveValue("");
  await expect.poll(() => previewItemCodes(content)).toEqual(ALL_ITEM_CODES);
  await expect(content.getByText("Önce Taslak Kaydet", { exact: false })).toHaveCount(0);
  // Kayıt AÇILMADI: durum rozeti yok, Gönder pasif.
  await expect(content.locator(".diary__status-row")).not.toContainText("Taslak");
  await expect(page.getByRole("button", { name: "Kaydet & Gönder" })).toBeDisabled();
});

test("önizleme: bölüm seç → yalnız o bölüme tahsisli kalemler", async ({ page }) => {
  const content = await openDiary(page, FREE_DAY);
  const section = content.getByRole("combobox", { name: "Bölüm" });
  await expect(quantityInput(content, "01.001")).toBeVisible();

  // Kat 6–10 (sec-1): 01.001 · 02.001 · 02.002 — 01.002 · 03.001 · 03.002 tahsissiz, satırı YOK.
  await section.selectOption(SECTION_1.id);
  await expect(quantityInput(content, "02.002", SECTION_1.name)).toBeVisible();
  await expect.poll(() => previewItemCodes(content)).toEqual(SECTION_1.itemCodes);
  for (const code of ["01.002", "03.001", "03.002"]) {
    await expect(content.getByLabel(new RegExp(`^${code.replace(".", "\\.")} .*bugün yapılan miktar$`))).toHaveCount(0);
  }

  // Zemin Kat (sec-2): 01.001 · 02.001 — 02.002 yalnız sec-1'e tahsisli, düşer.
  await section.selectOption(SECTION_2.id);
  await expect(quantityInput(content, "01.001", SECTION_2.name)).toBeVisible();
  await expect(content.getByLabel(/^02\.002 .*bugün yapılan miktar$/)).toHaveCount(0);
  await expect.poll(() => previewItemCodes(content)).toEqual(SECTION_2.itemCodes);

  // "Bölüm seçilmedi"ye dönüş: tüm kalemler geri gelir.
  await section.selectOption("");
  await expect(quantityInput(content, "01.002")).toBeVisible();
  await expect.poll(() => previewItemCodes(content)).toEqual(ALL_ITEM_CODES);
});

test("önizleme: miktar varken bölüm değiştir → diyalog, Vazgeç bölümü ve miktarı korur", async ({ page }) => {
  const content = await openDiary(page, FREE_DAY);
  const section = content.getByRole("combobox", { name: "Bölüm" });
  await section.selectOption(SECTION_1.id);
  const quantity = quantityInput(content, "01.001", SECTION_1.name);
  await expect(quantityInput(content, "02.002", SECTION_1.name)).toBeVisible();
  await quantity.fill("7");
  await expect(quantity).toHaveValue("7");

  await section.selectOption(SECTION_2.id);
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Girilen miktarlar silinecek")).toBeVisible();
  await expect(dialog).toContainText("1 satırlık miktar ve gerekçe kaydedilmeden silinir.");

  await dialog.getByRole("button", { name: "Vazgeç" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(section).toHaveValue(SECTION_1.id);
  await expect(quantity).toHaveValue("7");
  await expect(quantityInput(content, "02.002", SECTION_1.name)).toBeVisible();
  await expect.poll(() => previewItemCodes(content)).toEqual(SECTION_1.itemCodes);
});

test("önizleme: miktar varken bölüm değiştir → Değiştir miktarı siler, yeni bölümün kalemleri gelir", async ({
  page,
}) => {
  const content = await openDiary(page, FREE_DAY);
  const section = content.getByRole("combobox", { name: "Bölüm" });
  await section.selectOption(SECTION_1.id);
  await expect(quantityInput(content, "02.002", SECTION_1.name)).toBeVisible();
  await quantityInput(content, "01.001", SECTION_1.name).fill("7");

  await section.selectOption(SECTION_2.id);
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Girilen miktarlar silinecek")).toBeVisible();
  await dialog.getByRole("button", { name: "Değiştir" }).click();

  await expect(dialog).toHaveCount(0);
  await expect(section).toHaveValue(SECTION_2.id);
  await expect.poll(() => previewItemCodes(content)).toEqual(SECTION_2.itemCodes);
  await expect(quantityInput(content, "01.001", SECTION_2.name)).toHaveValue("");
  await expect(content.getByLabel(/^02\.002 .*bugün yapılan miktar$/)).toHaveCount(0);
  // (Sağ paneldeki "kaydedilmemiş" uyarısı BURADA beklenmez: başlıktaki bölüm artık
  //  tabandan farklıdır, yani form miktar olmadan da kirlidir.)
});

test("önizleme: kilitli gün (kayıtsız) → satırlar görünür ama salt okunur + kilit bandı", async ({ page }) => {
  const content = await openDiary(page, LOCKED_NO_ENTRY_DAY);

  // Kilit bandı (Ü8/Ü7: tek metin kaynağı): rapor tarihi önizleme yanıtından gelir.
  await expect(content.getByRole("status").filter({ hasText: "Bu gün 15.10.2026 raporuyla kilitlendi." })).toContainText(
    "Bütün alanlar salt okunur.",
  );
  // Önizleme satırları kilitte de OKUNUR (Kazı + Bölümsüz satırı), ama giriş YOK (düz metin).
  await expect(content.getByRole("row").filter({ hasText: "01.001" }).first()).toBeVisible();
  await expect(content.getByRole("row").filter({ hasText: "Bölümsüz" }).first()).toBeVisible();
  await expect(content.getByLabel(/bugün yapılan miktar$/)).toHaveCount(0);
  // Başlık alanları + kayıt düğmeleri kapalı.
  await expect(content.getByRole("combobox", { name: "Bölüm" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Taslak Kaydet" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Kaydet & Gönder" })).toBeDisabled();
});
