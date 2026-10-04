import { test, expect } from "@playwright/test";

import {
  VISUAL_VIEWPORT,
  openApprovals,
  openApprovalsTab,
  visualLogin,
} from "./onay-kutusu-helpers";
import { prepareFrame } from "./visual-scroll";

// F-OK T5 · `/onay-kutusu` görsel kadrajları.
// Kanonik mockup: `projedesign/Onay Kutusu.dc.html`.
//
// 🔴 BAŞLIK KURALI: her testin adında "gorsel" GEÇER. Beşinci kapı
// `--grep-invert "gorsel"` ile BAŞLIĞA göre süzer; içermeyen bir görsel test
// fonksiyonel turda baseline'sız koşar ve KIRMIZI olur.
//
// 🔴 NEDEN `fullPage` DEĞİL, ELEMAN KADRAJI — ÖLÇÜLMÜŞ GEREKÇE:
// Bu ekranın kendi fonksiyonel spec'i (`onay-kutusu.spec.ts`) listedeki BİR
// kalemi (`scpp-8`) GERÇEKTEN onaylar; o an liste bir kart eksilir. Mutasyon
// testi durumu geri alsa da `playwright.config.ts` `fullyParallel`dır ve iki
// dosya AYNI mock sunucuyu paylaşır — sayfa bütünü kadrajı, mutasyon
// penceresine denk gelirse SESSİZCE farklı bir kare üretirdi (yani baseline'ın
// hangi varyanta oturduğu ŞANSA kalırdı; `puantaj-hucre-popover` çift-modluluğu
// tam bu sınıftı). Eleman kadrajları yalnız DEĞİŞMEYEN kayıtlara bakar
// (`scpp-3` · `pr-2` · `pp-5`) ve yapısal olarak yarışsızdır.
//
// 🔒 SALT-OKUR: bu dosya hiçbir POST tetiklemez.
//
// ⚠️ Sabit `waitForTimeout` YOKTUR; her bekleme durum tabanlıdır ve İKİ
// BAĞIMSIZ KAYNAK (`/approvals` + `/approvals/settings`) için AYRI iddia
// taşır (`openApprovals` — WORKFLOW §4 "GÖRSEL SPEC KURALI" 1. + 5. parça).
//
// Baseline `.png` YALNIZ Linux CI'da üretilir (visual-baselines.yml →
// workflow_dispatch → artifact → `e2e/`); macOS'ta koşturulup commit edilmez.

test.beforeEach(async ({ page }) => {
  await visualLogin(page);
});

// ---------------------------------------------------------------------------
// 1) :42-76 · Rol akışı şeridi + sekme şeridi (sayfa başlığı dahil)
// ---------------------------------------------------------------------------
test("onay kutusu baslik ve rol akisi gorsel", async ({ page }) => {
  await page.setViewportSize({ ...VISUAL_VIEWPORT });
  await openApprovals(page);

  // Damga "veri geldi" der, "ekrana bastı" DEMEZ — eşiğin GERÇEK rakamı ve
  // devre-dışı yüzeyler ayrıca ölçülür.
  await expect(page.getByTestId("ok-flow-role")).toHaveCount(4);
  await expect(page.getByTestId("ok-flow-pill")).toHaveText(
    "₺500.000 altı için PM + Muhasebe yeterli",
  );
  await expect(page.getByTestId("ok-bulk-approve")).toBeDisabled();
  await expect(page.getByTestId("ok-tab-tumu")).toHaveAttribute("aria-selected", "false");

  await prepareFrame(page);
  await expect(page.getByTestId("ok-flow")).toHaveScreenshot("onay-kutusu-rol-akisi.png");
});

// ---------------------------------------------------------------------------
// 2) :118-148 · TAŞERON HAKEDİŞ kartı — eşik rozetli, İKİ tutar kutulu
// ---------------------------------------------------------------------------
test("onay kutusu taseron hakedis karti gorsel", async ({ page }) => {
  await page.setViewportSize({ ...VISUAL_VIEWPORT });
  await openApprovals(page);

  const card = page.getByTestId("ok-card").filter({ hasText: "Akın İnşaat" });
  await expect(card.getByTestId("ok-card-threshold")).toHaveText(">₺500.000 — Patron Gerekli");
  await expect(card.getByTestId("ok-step")).toHaveCount(3);
  await expect(card.getByTestId("ok-card-net")).toContainText("₺1.016.800");

  await prepareFrame(page);
  await expect(card).toHaveScreenshot("onay-kutusu-kart-taseron.png");
});

// ---------------------------------------------------------------------------
// 3) :151-179 · SATIN ALMA kartı — TEK tutar kutusu, fiyatsız kalem (`—`),
//    teklif çipi ve DEVRE-DIŞI "Detay" (rotası yok)
// ---------------------------------------------------------------------------
test("onay kutusu satinalma karti gorsel", async ({ page }) => {
  await page.setViewportSize({ ...VISUAL_VIEWPORT });
  await openApprovals(page);

  const card = page.getByTestId("ok-card").filter({ hasText: "SATIN ALMA" });
  await expect(card.getByTestId("ok-card-net")).toHaveCount(0);
  await expect(card.getByTestId("ok-card-gross")).toContainText("—");
  await expect(card.getByTestId("ok-card-detail")).toBeDisabled();
  await expect(card.getByTestId("ok-step")).toHaveCount(4);

  await prepareFrame(page);
  await expect(card).toHaveScreenshot("onay-kutusu-kart-satinalma.png");
});

// ---------------------------------------------------------------------------
// 4) :209-238 · İŞVEREN HAKEDİŞ kartı — MOR rozet/ikon/onay düğmesi, eşik
//    rozeti YOK (zincirde patron adımı yok)
// ---------------------------------------------------------------------------
test("onay kutusu isveren hakedis karti gorsel", async ({ page }) => {
  await page.setViewportSize({ ...VISUAL_VIEWPORT });
  await openApprovals(page);

  const card = page.getByTestId("ok-card").filter({ hasText: "İŞVEREN HAKEDİŞ" });
  await expect(card.getByTestId("ok-card-threshold")).toHaveCount(0);
  await expect(card.getByTestId("ok-step")).toHaveCount(2);
  await expect(card.getByTestId("ok-card-chip")).toHaveText("Hakediş Detayı");

  await prepareFrame(page);
  await expect(card).toHaveScreenshot("onay-kutusu-kart-isveren.png");
});

// ---------------------------------------------------------------------------
// 5) OKT-F1.2 · "Onay Verildi" sekmesi — onaylanmış kart: yeşil "Onaylandı"
//    rozeti + "Karar: ad · tarih", Onayla/Reddet YOK. SABİT tohum (mock
//    `APPROVAL_HISTORY_DECIDED`) — onay yazan spec'lerden bağımsızdır.
//    Kadraj ELEMAN (`ok-list`): tek kartlı, yarışsız.
// ---------------------------------------------------------------------------
test("onay kutusu onay verildi sekmesi gorsel", async ({ page }) => {
  await page.setViewportSize({ ...VISUAL_VIEWPORT });
  await openApprovalsTab(page, "onaylanan");

  const list = page.getByTestId("ok-list");
  await expect(list.getByTestId("ok-card")).toHaveCount(1);
  await expect(list.getByTestId("ok-card-decision-badge")).toHaveText("Onaylandı");
  await expect(list.getByTestId("ok-card-approve")).toHaveCount(0);

  await prepareFrame(page);
  await expect(list).toHaveScreenshot("onay-kutusu-sekme-onaylanan.png");
});

// ---------------------------------------------------------------------------
// 6) OKT-F1.2 · "Reddedildi" sekmesi — kırmızı rozet + karar satırı + Gerekçe.
// ---------------------------------------------------------------------------
test("onay kutusu reddedildi sekmesi gorsel", async ({ page }) => {
  await page.setViewportSize({ ...VISUAL_VIEWPORT });
  await openApprovalsTab(page, "reddedilen");

  const list = page.getByTestId("ok-list");
  await expect(list.getByTestId("ok-card")).toHaveCount(1);
  await expect(list.getByTestId("ok-card-decision-badge")).toHaveText("Reddedildi");
  await expect(list.getByTestId("ok-card-decision-reason")).toContainText("Gerekçe:");
  await expect(list.getByTestId("ok-card-reject")).toHaveCount(0);

  await prepareFrame(page);
  await expect(list).toHaveScreenshot("onay-kutusu-sekme-reddedilen.png");
});
