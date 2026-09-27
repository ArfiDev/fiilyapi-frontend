import { test, expect } from "@playwright/test";

import { login, pinPurchasingFixtures } from "./purchasing-visual-helpers";
import { prepareFrame } from "./visual-scroll";

// F-SA T5a · SAT (`/satinalma`) Satın Alma Talepleri listesi — mockup
// `Satınalma & Teklif.dc.html`. `sales-list-visual.spec.ts` /
// `stock-catalog-visual.spec.ts` deseninin aynısı.
//
// SALT-OKUR: bu dosya hiçbir POST/PATCH tetiklemez, yalnız fikstürü render
// eder. Yazma zinciri `purchasing-flows.spec.ts`tedir ve bilerek `p-2`de
// yürür; kadraj ayrıca `pinPurchasingFixtures` ile `p-1`e daraltılır →
// `fullyParallel` altında baseline yarışı YOKTUR.
//
// 📅 TARİH BAĞIMSIZ: bu ekranda istemci türevi TARİH YOKTUR — rozetler
// sunucunun `status` damgası, tutar `estimated_total`, KPI'lar
// `GET /purchasing/summary` (ayın toplamını da SUNUCU sayar). Ekran hiçbir
// yerde `new Date()` çağırmaz → `page.clock` gerekmez. (SIP'in ay adı ve
// teslimat rengi için gereklidir: `purchasing-orders-visual.spec.ts`.)
//
// Baseline `.png` YALNIZ Linux CI'da üretilir (visual-baselines.yml →
// workflow_dispatch → artifact → `e2e/`); macOS'ta koşturulup commit edilmez.

const REQUESTS_URL = "/satinalma";

test("satinalma talepler listesi gorsel", async ({ page }) => {
  await pinPurchasingFixtures(page);
  await login(page);

  await page.goto(REQUESTS_URL);
  await expect(page.getByRole("heading", { level: 1, name: "Satınalma & Teklif" })).toBeVisible();

  // YERLEŞİM OTURDU (WORKFLOW §4, 1. parça):
  // (a) KPI şeridi GERÇEK değer basıyor — yükleme hâlinde dört kart da "—"
  //     taşır ve hiçbirinde `₺` yoktur ("Bu Ay Sipariş" kartı para basar).
  await expect(page.getByTestId("sat-kpi-strip")).toContainText("₺");
  // (b) tablo satırları geldi ve proje adı `GET /projects`ten ÇÖZÜLDÜ
  //     (çözülemezse hücre "—" basardı).
  await expect(page.getByTestId("sat-row-SAT-2026-0001")).toContainText("Kule A");
  // (c) altı durumun rozetleri sunucunun damgasından basıldı — palet tam.
  await expect(page.getByTestId("sat-status-SAT-2026-0001")).toHaveText("Teklif Bekleniyor");
  await expect(page.getByTestId("sat-status-SAT-2026-0002")).toHaveText("Onay Bekliyor");
  await expect(page.getByTestId("sat-status-SAT-2026-0003")).toHaveText("Taslak");
  await expect(page.getByTestId("sat-status-SAT-2026-0004")).toHaveText("Sipariş Verildi");
  await expect(page.getByTestId("sat-status-SAT-2026-0005")).toHaveText("Teslim Edildi");
  await expect(page.getByTestId("sat-status-SAT-2026-0006")).toHaveText("Reddedildi");
  // (d) fikstür sabitlemesi İŞLEDİ: yalnız tohum talepleri kadrajda
  //     (yazma e2e'sinin `p-2` talebi sızarsa satır sayısı oynardı).
  await expect(page.locator("main .sat-row")).toHaveCount(6);
  // (e) kırpılma bandı KAPALI (`items.length === total`) — sabitleme `total`ı
  //     bozmuş olsaydı bant açılır ve kare kayardı.
  await expect(page.getByTestId("sat-truncation-notice")).toHaveCount(0);

  // Kadraj hazırlığı (kaydırma sıfırlama + imleç parkı): `visual-scroll.ts`.
  await prepareFrame(page);
  await expect(page).toHaveScreenshot("satinalma-talepler.png", { fullPage: true });
});
