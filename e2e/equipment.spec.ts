import { test, expect } from "@playwright/test";

import { EQUIPMENT_URL, login } from "./equipment-helpers";

// F-MK T5b · M1 (`/makine`) FONKSİYONEL e2e'si — görsel spec'ler
// `equipment-visual.spec.ts`te (dosya/test adında "gorsel" GEÇMEZ ki beşinci
// kapıda koşsun).
//
// Kapsam: kabuk sidebar girişi (ComingSoon DEĞİL) · KPI şeridinin SUNUCU
// sayaçları + bilinmeyen bedel notu · K12 duruma göre değişen kart alt kutusu ·
// K3 "—" (kira/operatör) · K4 "Düzenle" rotası · K1 beş sekme + iki devre-dışı
// sekmenin GÖRÜNÜR gerekçesi.
//
// 🔒 FİKSTÜR İZOLASYONU (F-ST kuralı): ekipman kayıtlarının PROJE KAPSAMI
// YOKTUR ve BAŞARILI bir yazma kart ızgarasını değiştirip görsel baseline'ları
// sessizce kırardı. Bu dosya YALNIZ okur; formun gönderim davranışı
// `equipment-form.spec.ts`te BFF katmanında karşılanan isteklerle kanıtlanır.

test("kabuk sidebar'ındaki 'Makine & Ekipman' gerçek ekranı açar (ComingSoon DEĞİL)", async ({
  page,
}) => {
  await login(page);

  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Makine & Ekipman" })
    .first()
    .click();
  await expect(page).toHaveURL(/\/makine$/);
  await expect(page.getByRole("heading", { level: 1, name: "Makine & Ekipman" })).toBeVisible();
  await expect(page.getByText("Bu modül yakında eklenecek.")).toHaveCount(0);
});

test("KPI şeridi SUNUCU sayaçlarını basar; bilinmeyen bedel GÖRÜNÜR notla bildirilir", async ({
  page,
}) => {
  await login(page);
  await page.goto(EQUIPMENT_URL);

  const strip = page.getByTestId("makine-kpi-strip");
  await expect(strip).toContainText("Aktif Çalışıyor");
  await expect(strip).toContainText("Arızalı");
  await expect(strip).toContainText("Bakımda");
  // Sunucu `monthly_cost`u SATIRLARDAN toplar (§0); ekran onu basar.
  await expect(strip).toContainText("₺ 144,2B");

  // K9 — sunucu DÖRT sayaç veriyor, mockup ÜÇ çiziyor: `Boşta` KPI kartı YOK
  // (ekipman kendi rozetiyle ızgarada görünür).
  await expect(strip).not.toContainText("Boşta");

  // K16/K21 — bedeli bilinmeyen makine toplama uydurma 0'la girmez, ADETÇE
  // bildirilir ve bu bildirim EKRANDA görünür.
  await expect(page.getByTestId("makine-kpi-cost-unknown-hint")).toContainText("1 ekipmanın");
});

test("K12 — kart alt kutuları DURUMA göre şekil değiştirir; K3 boş türevler '—' basar", async ({
  page,
}) => {
  await login(page);
  await page.goto(EQUIPMENT_URL);

  await expect(page.getByTestId("makine-card")).toHaveCount(5);

  // `working` → (Günlük Kira, Operatör) ikilisi; adlar AYRI sorgulardan çözülür.
  const working = page.locator('[data-equipment-id="eq-1"]');
  await expect(working.getByTestId("makine-card-fact-boxes")).toBeVisible();
  await expect(working).toContainText("Mehmet Kılıç");
  await expect(working).toContainText("Kule A A-Blok Şantiyesi");

  // `broken` → tek geniş uyarı kutusu (`status_note` + `status_expected_date`).
  const broken = page.locator('[data-equipment-id="eq-4"]');
  await expect(broken.getByTestId("makine-card-warning-box")).toContainText(
    "Hidrolik hortum patladı",
  );
  await expect(broken.getByTestId("makine-card-warning-box")).toContainText("19 Ağustos 2026");
  await expect(broken.getByTestId("makine-card-fact-boxes")).toHaveCount(0);
  // K6 — `site_id: null` ⇒ "Depoda (Atanmadı)", boş dize DEĞİL.
  await expect(broken).toContainText("Depoda (Atanmadı)");

  // `maintenance` de uyarı kutusu basar (K12'nin ikinci kolu).
  await expect(
    page.locator('[data-equipment-id="eq-2"]').getByTestId("makine-card-warning-box"),
  ).toContainText("Periyodik bakım");

  // `idle` mockup'ta çizilmedi; ikili kutuya düşer ve rozeti kendi adını taşır.
  const idle = page.locator('[data-equipment-id="eq-5"]');
  await expect(idle.getByTestId("makine-card-fact-boxes")).toBeVisible();
  await expect(idle).toContainText("Boşta");
});

// F-MKD: "(detay sayfası YOK)" ibaresi KALDIRILDI — `/makine/{id}` artık VAR
// ve kartın ADINDAN açılır. Bayat bir gerekçe cümlesi, ARTIK ÇALIŞAN bir
// ekranı yalanlar (F-PRJTAB kanonu).
test("K4 — kart üzerindeki 'Düzenle' düzenleme rotasına gider (ad ise DETAYA)", async ({
  page,
}) => {
  await login(page);
  await page.goto(EQUIPMENT_URL);

  await page
    .locator('[data-equipment-id="eq-1"]')
    .getByTestId("makine-card-edit-link")
    .click();

  await expect(page).toHaveURL(/\/makine\/eq-1\/duzenle$/);
  await expect(page.getByRole("heading", { level: 1, name: "Makine / Ekipman Düzenle" })).toBeVisible();

  // İKİ eylem AYRI rotalara iner: ad → detay, "Düzenle" → form.
  await page.goto(EQUIPMENT_URL);
  await page.locator('[data-equipment-id="eq-1"]').getByText("Tower Crane TC-48").click();
  await expect(page).toHaveURL(/\/makine\/eq-1$/);
});

test("K1 — beş sekme; dört gerçek rota gezinir, TEK sekme devre-dışı + GÖRÜNÜR gerekçeli", async ({
  page,
}) => {
  await login(page);
  await page.goto(EQUIPMENT_URL);

  // SEKME-F1.4b: üst çubukta kabuk-düzeyi bir çalışma sekmeleri şeridi de
  // `role="tab"` taşıyor (`aria-label="Çalışma sekmeleri"`) — sayfanın KENDİ
  // sekmeleri (`aria-label="Makine & Ekipman sekmeleri"`) ile locator artık
  // BİRLİKTE eşleşir. Bu testin iddiası her zaman EKRANIN kendi şeridi
  // içindi; locator ona DARALTILDI (e2e düzeltmesi — ürün davranışı DEĞİŞMEDİ).
  const localTabs = page.getByRole("tablist", { name: "Makine & Ekipman sekmeleri" });

  await expect(localTabs.getByRole("tab")).toHaveCount(5);
  // 🔴 F-KIRA: "Kira Hakedişi" devre-dışıdan CANLIYA geçti → bağlantı sayısı
  // 2'den 3'e çıktı (aktif sekme kendi sayfasına bağlanmaz, "Bakım Takvimi"
  // hâlâ devre-dışı).
  await expect(localTabs.locator('a[role="tab"]')).toHaveCount(3);

  // 🔴 Bir yüzeyin ölüden canlıya geçtiğini GÖRSEL KAPI KANITLAMAZ (F-IZN
  // dersi): span→link geçişinin renk deltası pixelmatch eşiğinin altındadır.
  // Kanıt DOM'dan alınır.
  const leaseTab = localTabs.getByRole("tab", { name: "Kira Hakedişi" });
  await expect(leaseTab).toHaveAttribute("href", "/makine/kira");

  const maintenanceTab = localTabs.getByRole("tab", { name: "Bakım Takvimi" });
  await expect(maintenanceTab).toHaveAttribute("aria-disabled", "true");

  // Gerekçeler `title` ipucuna GÖMÜLÜ DEĞİL, ekranda okunur (F-TH kuralı).
  // Düşen sekmenin cümlesi de paragraftan KALKAR (F-PRJTAB kanonu: gerekçe
  // açıkladığı öğeden türer, sabit basılsaydı canlı sekmeyi yalanlardı).
  const reasons = page.getByTestId("makine-tabs-reasons");
  await expect(reasons).toContainText("Bakım takvimi mockup'ı henüz yok");
  await expect(reasons).not.toContainText("Kira hakedişi");

  // Devre-dışı sekmeye tıklamak HİÇBİR YERE gitmez. `force: true` ZORUNLU:
  // Playwright `aria-disabled="true"` taşıyan öğeyi "enabled değil" sayar ve
  // normal `click()` eyleme geçmeden zaman aşımına düşer — bu da tıklanamazlığın
  // kanıtıdır ama testi kırar. Zorlanmış tıklama korkuluğu ATLAR ve asıl
  // iddiayı kurar: gezinme YOK.
  await maintenanceTab.click({ force: true });
  await expect(page).toHaveURL(/\/makine$/);

  // Gerçek rotalar gezinir.
  await localTabs.getByRole("tab", { name: "Çalışma Kaydı" }).click();
  await expect(page).toHaveURL(/\/makine\/calisma/);
  await expect(page.getByRole("heading", { level: 1, name: "Çalışma Kaydı" })).toBeVisible();

  await localTabs.getByRole("tab", { name: "Yakıt Takibi" }).click();
  await expect(page).toHaveURL(/\/makine\/yakit/);
  await expect(page.getByRole("heading", { level: 1, name: "Yakıt Takibi" })).toBeVisible();

  // 🔴 F-KIRA: sekmenin GERÇEKTEN indiği yer ölçülür (rota çözümü VARSAYILMAZ —
  // `/makine/[id]` dinamik kardeşi sabit metni yutabilirdi, F-TKV dersi).
  await localTabs.getByRole("tab", { name: "Kira Hakedişi" }).click();
  await expect(page).toHaveURL(/\/makine\/kira/);
  await expect(page.getByRole("heading", { level: 1, name: "Kira Hakedişi" })).toBeVisible();
});
