import { test, expect } from "@playwright/test";

import { prepareFrame } from "./visual-scroll";

// P7 T7 · Hakedişler listesi (Ekran 14) görsel testi. `e2e/boq-visual.spec.ts`
// deseninin BİREBİR aynısı. Fikstür kaynağı `e2e/mock-backend.ts` ·
// `buildProgressPaymentFixtures()` — değerler `Şantiye - Hakedişler.dc.html`
// satır 90-107'den (İşveren Hakedişleri kartları) alınır; proje/şantiye
// kimlikleri mevcut evrene (p-1 "Kule A") bağlıdır, mockup'ın "Güneşkent
// Konut" ismiyle AYNI DEĞİL (bilinçli, brief §Belirsizlik çözümü 1).
//
// Mock oturumda (`ME`) `permissions` alanı YOKTUR → bilinmezlik kuralı
// gereği tüm yazma yüzeyleri ("+ Yeni Hakediş") GÖRÜNÜR hâlde baseline'a
// girer (bkz. mevcut `boq-visual.spec.ts` üst yorumu).
//
// Baseline `.png` YALNIZ Linux CI'da üretilir (visual-baselines.yml →
// workflow_dispatch); macOS'ta koşturulup commit edilmez.
test("hakedişler listesi ekrani gorsel", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/login");
  await page.getByLabel(/e-posta/i).fill("patron@fiil.com");
  await page.getByLabel(/^şifre$/i).fill("dogruparola");
  await page.getByRole("button", { name: /giriş yap/i }).click();
  await expect(page.getByRole("heading", { name: "Gösterge Paneli" })).toBeVisible();

  await page.goto("/hakedisler");
  await expect(page.getByRole("heading", { name: "Hakedişler" })).toBeVisible();
  // Liste yüklendi: KPI alt metni (dinamik hakediş sayısı) ve son satırın
  // başlığı basılı olmadan ekran görüntüsü alınırsa baseline yükleme
  // durumunu dondurur — durum rozeti yerine bu daha kararlı bir çapa
  // (rozet veri gelmeden de "Taslak" ile basılabilir).
  await expect(page.getByTestId("pp-kpi-subtitle")).toBeVisible();
  await expect(page.locator("main").getByText("Kat 6–8 döşeme")).toBeVisible();

  // İKİNCİ BAĞIMSIZ VERİ KAYNAĞI (F-PRJTAB T6 · F-İK dersi): proje süzgeci
  // hakediş listesinden AYRI bir sorgudan (`useProjects` → GET /projects)
  // beslenir ve AYRI çözülür. Yalnız hakediş verisini beklemek yetmez —
  // baseline turu süzgeci "Tüm Projeler"den ibaret, yüklenmemiş hâlde
  // donmuş yakalayabilir ve o bozuk kare sessizce commit'lenir. Bu yüzden
  // seçeneklerin TAMAMI ölçülür (fikstür: `PROJECT_FIXTURES`, dört proje;
  // `GET /projects` süzgeçsiz çağrıldığında tamamlanmış p-4 de döner).
  const projectFilter = page.getByRole("combobox", { name: "Proje filtresi" });
  await expect(projectFilter).toBeVisible();
  await expect(projectFilter.locator("option")).toHaveText([
    "Tüm Projeler",
    "Kule A",
    "Villa B",
    "Bahçelievler Konut",
    "Güneşkent B-Blok",
  ]);
  // Süzgeçsiz giriş: `project_id` URL'de yok → "Tüm Projeler" seçili basılır.
  await expect(projectFilter).toHaveValue("");
  // Hiçbir yüzey yükleme metnini basmıyor.
  await expect(page.locator("main").getByText("Yükleniyor…")).toHaveCount(0);

  // Kadraj hazırlığı (kaydırma sıfırlama + imleç parkı): `visual-scroll.ts`.
  await prepareFrame(page);
  await expect(page).toHaveScreenshot("hakedisler-listesi.png", { fullPage: true });
});
