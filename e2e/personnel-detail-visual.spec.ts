import { test, expect, type Page } from "@playwright/test";

import { prepareFrame } from "./visual-scroll";

// F-PT2 T4 · PD (`/personel/[id]`) görsel testi — mockup `Personel Detay.dc.html`.
//
// SALT-OKUR: bu dosya hiçbir PATCH tetiklemez, yalnız `GET /personnel/{id}`ı
// render eder. Fikstür `per-1` ("Mehmet Kılıç") seçildi — T1'in yazma
// fikstürü `per-new-pt2-fixture-1` KULLANILMAZ, çünkü `personnel-detail.spec.
// ts`in fonksiyonel PATCH testleri onu mutasyona uğratır (yarış); `per-1`
// puantaj/liste baseline'larının da SALT-OKUR kaynağıdır, tekil `GET` bu
// kayıtları hiç değiştirmez.
//
// 📅 TARİH BAĞIMSIZ: başlık kartındaki tüm alanlar ya sunucu GERÇEĞİ (ad/
// meslek/rozetler) ya da PENDING zarfıdır (telefon/e-posta/SGK/İşe Giriş/
// vergi/IBAN/ücret) — hiçbiri istemci saatine bağlı türetilmez, `page.clock`
// gerekmez.
//
// Baseline `.png` YALNIZ Linux CI'da üretilir (visual-baselines.yml →
// workflow_dispatch → artifact → `e2e/`); macOS'ta koşturulup commit edilmez.

const PERSONNEL_DETAIL_URL = "/personel/per-1";

async function login(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/login");
  await page.getByLabel(/e-posta/i).fill("patron@fiil.com");
  await page.getByLabel(/^şifre$/i).fill("dogruparola");
  await page.getByRole("button", { name: /giriş yap/i }).click();
  await expect(page.getByRole("heading", { name: "Gösterge Paneli" })).toBeVisible();
}

test("personel detay gorsel", async ({ page }) => {
  await login(page);
  await page.goto(PERSONNEL_DETAIL_URL);

  // YERLEŞİM OTURDU (WORKFLOW §4, 1. parça): başlık kartı sunucu fikstürünü
  // bastı ("Yükleniyor…" durumu kadraja giremez). `.first()` ZORUNLU: akış-
  // SSR'da sunucu kopyası ile hidrasyon kopyası bir an yan yana durur ve
  // kapsam daraltmadan yapılan `getByText` strict-mode ihlali verir (F-PL/
  // F-ST baseline turu dersi, yalnız Linux CI'da patlar) — bu yüzden isim/
  // rozet iddiaları `personnel-header-card` kabına KAPSANIR.
  const header = page.getByTestId("personnel-header-card");
  await expect(header).toBeVisible();
  await expect(header.getByRole("heading", { level: 1, name: "Mehmet Kılıç" })).toBeVisible();
  await expect(header.getByText("Aktif")).toBeVisible();
  await expect(header.getByText("Şirket")).toBeVisible();
  await expect(header.getByText("Kalıpçı").first()).toBeVisible();
  // F-İK T6a · alt başlığın proje adı AYRI bir sorgudan gelir (`GET
  // /projects`) — kendisi başlık kartındaki personel GET'inden bağımsız
  // çözülür; hücre "Kule A"ya dönüşmemiş pending durumunda kalıp kadraja
  // girebilir, o yüzden GERÇEK proje adı ayrıca doğrulanır.
  await expect(header.getByText("Kule A")).toBeVisible();
  // Dört pending kart (kural: SİLİNMEZ, gerekçeli basılır) + Belgeler kartı
  // ikisi de yerleşti — kadraj tam yükseklikte donmuş "Yükleniyor…" YAKALAMAZ.
  await expect(page.getByTestId("personnel-timesheet-summary-card")).toBeVisible();
  await expect(page.getByTestId("personnel-documents-card")).toBeVisible();

  // Kadraj hazırlığı (kaydırma sıfırlama + imleç parkı): `visual-scroll.ts`.
  await prepareFrame(page);
  await expect(page).toHaveScreenshot("personel-detay.png", { fullPage: true });
});

// IZN-F4c.2 · personel detay — rol için GİZLİ kimlik/iletişim/ücret (maas_kisisel)
// ---------------------------------------------------------------------------
// `/auth/me.hidden_fields = ["maas_kisisel"]` ve `GET /personnel/per-1` yanıtındaki dokuz maskeli alan `null`
// (IZN-B4c-SOZLESME §2: tc_no · iban · sgk_no · phone · email · address · emergency_contact_phone ·
// birth_date · wage_amount). YALNIZ bu testte (`page.route`); paylaşılan mock backend'e YAZILMAZ.
// Beklenen: ücret/SGK/IBAN/iletişim "—", her birinin yanında kilit.
const MASKED_PERSONNEL_FIELDS = [
  "tc_no",
  "iban",
  "sgk_no",
  "phone",
  "email",
  "address",
  "emergency_contact_phone",
  "birth_date",
  "wage_amount",
] as const;

test("personel detay kisisel gizli gorsel", async ({ page }) => {
  await page.route("**/api/auth/me", async (route) => {
    const response = await route.fetch();
    const me = (await response.json()) as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...me, hidden_fields: ["maas_kisisel"] }),
    });
  });
  await page.route("**/api/backend/personnel/per-1", async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as Record<string, unknown>;
    const masked = { ...body, ...Object.fromEntries(MASKED_PERSONNEL_FIELDS.map((field) => [field, null])) };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(masked) });
  });
  await login(page);
  await page.goto(PERSONNEL_DETAIL_URL);

  const header = page.getByTestId("personnel-header-card");
  await expect(header).toBeVisible();
  await expect(header.getByRole("heading", { level: 1, name: "Mehmet Kılıç" })).toBeVisible();
  await expect(header.getByText("Kule A")).toBeVisible();
  // 3 iletişim + ücret + SGK + IBAN = 6 kilit; hiçbir ₺ tutarı / IBAN öneki kadrajda KALMAZ.
  await expect(header.getByTestId("hidden-mark")).toHaveCount(6);
  await expect(header).not.toContainText(/TR\d{2}/);
  await expect(header).not.toContainText("₺");
  await expect(page.getByTestId("personnel-timesheet-summary-card")).toBeVisible();
  await expect(page.getByTestId("personnel-documents-card")).toBeVisible();

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("personel-detay-kisisel-gizli.png", { fullPage: true });
});
