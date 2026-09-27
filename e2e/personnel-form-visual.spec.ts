import { test, expect, type Page } from "@playwright/test";

import { prepareFrame } from "./visual-scroll";

// F-PT T5 · "Yeni Personel Kaydı" formu görsel testi (mockup
// `Form - Personel Ekle.dc.html`). `section-form-visual.spec.ts` /
// `site-form-visual.spec.ts` deseninin aynısı.
//
// SALT-OKUR: form GÖNDERİLMEZ, yalnız render edilir — paylaşılan mock durumu
// değişmez, `personnel-form.spec.ts`in kayıt akışıyla yarışmaz.
//
// Mock oturumda (`ME`) `permissions` alanı YOKTUR → bilinmezlik kuralı gereği
// form (yalnız `personnel:full` yüzeyi) etkin hâlde baseline'a girer.
//
// 📅 Bu ekranın tarihe bağlı türevi yoktur (dönem taşımaz) — ay sabitlemesi
// gerekmez; dönüş bağlantısı yine de AÇIK dönemle verilir ki "İptal" hedefi
// baseline'da sabit kalsın.
//
// Baseline `.png` YALNIZ Linux CI'da üretilir (visual-baselines.yml →
// workflow_dispatch); macOS'ta koşturulup commit edilmez.

const RETURN_TO = encodeURIComponent("/projeler/p-1/santiyeler/s-1/puantaj?year=2026&month=8");

async function login(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/login");
  await page.getByLabel(/e-posta/i).fill("patron@fiil.com");
  await page.getByLabel(/^şifre$/i).fill("dogruparola");
  await page.getByRole("button", { name: /giriş yap/i }).click();
  await expect(page.getByRole("heading", { name: "Gösterge Paneli" })).toBeVisible();
}

test("yeni personel formu gorsel", async ({ page }) => {
  await login(page);
  await page.goto(`/personel/yeni?donus=${RETURN_TO}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Yeni Personel Kaydı" }).first(),
  ).toBeVisible();

  // Taşeron sorgusu (GET /subcontractors) çözüldü — seçici "Yükleniyor…"
  // durumunda dondurulmasın (yükleme durumu baseline'a girmesin).
  await expect(page.locator("main").getByLabel("Çalışan Tipi").first()).toBeEnabled();
  // F-İK T3 · "Atandığı Proje" (GET /projects) AYRI bir sorgu — kendi
  // "Yükleniyor…" notu çözülmeden kadraja girilmez (JobCard.projectNote).
  // Sayfada başka hiçbir yerde bu metin basılmaz (bu ekran "yeni" kipinde,
  // `isEdit` yükleme dalı devre dışı) — genel yokluk kontrolü yeterli.
  await expect(page.locator("main").getByText("Yükleniyor…")).toHaveCount(0);
  // Son kart (belge kutuları) render oldu — sayfanın tamamı kadrajda.
  await expect(page.getByTestId("personnel-form-notices").first()).toBeVisible();
  await expect(page.locator("main .pf-actions").first()).toBeVisible();

  // Kadraj hazırlığı (kaydırma sıfırlama + imleç parkı): `visual-scroll.ts`.
  await prepareFrame(page);
  await expect(page).toHaveScreenshot("personel-formu-yeni.png", { fullPage: true });
});
