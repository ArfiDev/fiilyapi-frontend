import { test, expect } from "@playwright/test";

import { login, pinPurchasingFixtures } from "./purchasing-visual-helpers";
import { prepareFrame } from "./visual-scroll";

// F-SA T5a · SIP (`/satinalma/siparisler`) Siparişler listesi — mockup
// `Satınalma - Siparişler.dc.html`.
//
// SALT-OKUR: hiçbir yazma tetiklenmez; kadraj ayrıca `pinPurchasingFixtures`
// ile `p-1`e daraltılır (yazma zinciri `p-2`de yürür).
//
// ⏱️ SAAT SABİTLEME (ZORUNLU — bu dilimin TEK istemci türevi): ekranın İKİ
// yüzeyi "bugün"e bakar ve ikisi de `PurchaseOrdersView`in
// `useState(() => new Date())` değerinden beslenir:
//   · başlık altı ay adı + yıl (SIP 32 → `sip-subtitle`),
//   · "Teslimat" sütununun RENGİ (`deliveryTone`: gecikmiş kırmızı · yakın
//     kehribar · nötr).
// Sabitlenmezse kare üretildiği güne donar ve sonraki gün KENDİLİĞİNDEN
// kırılır (`stock-entry-visual.spec.ts` ile aynı gerekçe ve yöntem).
//
// Sabit an, ÜÇ TONU DA tek karede gösterecek şekilde seçilir (fikstürler
// `mock-backend.ts` · `PURCHASE_ORDER_FIXTURES`):
//   · `SP-2026-0001` → 14.08.2026, `in_transit` → 2 gün kaldı = KEHRİBAR,
//   · `SP-2026-0003` → 08.08.2026, `approved`   → 4 gün geçti = KIRMIZI,
//   · `SP-2026-0002` → 04.08.2026, `delivered`  → teslim edilmiş = NÖTR.
// Saat 09:00 UTC seçilir: hem UTC hem TR (+03) yerel takviminde AYNI güne
// düşer (`deliveryTone` yerel takvimden türetir, TZ kayması olmaz).
//
// Baseline `.png` YALNIZ Linux CI'da üretilir (visual-baselines.yml →
// workflow_dispatch → artifact → `e2e/`); macOS'ta koşturulup commit edilmez.

const ORDERS_URL = "/satinalma/siparisler";

/** Kadrajın sabit "bugünü" — mock'un `PURCHASING_TODAY`i ile AYNI gün. */
const FIXED_NOW = "2026-08-12T09:00:00Z";

test("satinalma siparisler listesi gorsel", async ({ page }) => {
  await pinPurchasingFixtures(page);
  await page.clock.setFixedTime(new Date(FIXED_NOW));
  await login(page);

  await page.goto(ORDERS_URL);
  await expect(page.getByRole("heading", { level: 1, name: "Siparişler" })).toBeVisible();

  // YERLEŞİM OTURDU (WORKFLOW §4, 1. parça):
  // (a) saat sabitlemesi İŞLEDİ ve sayaç SUNUCUDAN geldi (özet gelmeden
  //     satır yalnız ay adını basardı).
  await expect(page.getByTestId("sip-subtitle")).toHaveText("Ağustos 2026 · 2 aktif sipariş");
  // (b) KPI şeridi gerçek sayı basıyor ("—" yer tutucusu değil).
  await expect(page.getByTestId("sip-kpi-active")).toHaveText("2");
  await expect(page.getByTestId("sip-kpi-transit")).toHaveText("1");
  await expect(page.getByTestId("sip-kpi-delivered")).toHaveText("1");
  // (c) üç satır da geldi; talepsiz sipariş "Talep No" alt satırını "—" basar.
  await expect(page.getByTestId("sip-row-SP-2026-0001")).toContainText("SAT-2026-0004");
  // ⚠️ `toHaveText` KULLANILMAZ: pending hücresi görünür "—"in yanında bir de
  // `sr-only` gerekçe taşır (ekran okuyucu "—" duymasın diye). Sıkı eşitlik
  // ikisini birleştirip kırılırdı; iki iddia AYRI AYRI yapılır ki hem görünen
  // yer tutucu hem erişilebilir gerekçe kilitli kalsın.
  await expect(page.getByTestId("sip-request-SP-2026-0003")).toContainText("—");
  await expect(page.getByTestId("sip-request-SP-2026-0003")).toHaveAttribute(
    "title",
    "Talebe bağlı değil — doğrudan sipariş",
  );
  // (d) TESLİMAT RENGİNİN ÜÇ TONU DA kadrajda — sabit an bunun için seçildi.
  await expect(page.getByTestId("sip-delivery-SP-2026-0001")).toHaveClass(/sip-delivery--soon/);
  await expect(page.getByTestId("sip-delivery-SP-2026-0003")).toHaveClass(/sip-delivery--overdue/);
  await expect(page.getByTestId("sip-delivery-SP-2026-0002")).toHaveClass(/sip-delivery--neutral/);
  // (e) fikstür sabitlemesi İŞLEDİ: yalnız tohum siparişleri kadrajda.
  await expect(page.locator("main .sip-row")).toHaveCount(3);
  await expect(page.getByTestId("sip-truncation-notice")).toHaveCount(0);

  // Kadraj hazırlığı (kaydırma sıfırlama + imleç parkı): `visual-scroll.ts`.
  await prepareFrame(page);
  await expect(page).toHaveScreenshot("satinalma-siparisler.png", { fullPage: true });
});
