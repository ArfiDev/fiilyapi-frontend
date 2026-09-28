import { test, expect, type Page } from "@playwright/test";

import { pinRoster } from "./personnel-roster";
import { prepareFrame } from "./visual-scroll";

// F-PT2 T4 · P (`/personel`) görsel testleri — mockup `Personel.dc.html`.
// `stock-catalog-visual.spec.ts` / `site-documents-visual.spec.ts` deseninin
// aynısı.
//
// SALT-OKUR: bu dosya hiçbir POST/PATCH tetiklemez, yalnız fikstürleri render
// eder. Personel kartoteksi PUANTAJ görsel baseline'larının da kaynağıdır
// (`timesheet-visual.spec.ts` → `pinRoster`) — başarılı bir yazma hem o
// baseline'ları hem bu dosyanınkileri sessizce kırardı.
//
// ⚠️ KARTOTEKS GLOBALDİR (F-PT2 T1 notu; `timesheet-visual.spec.ts` 14-19.
// satırlardaki dersin aynısı): mock backend TÜM spec dosyaları arasında
// PAYLAŞILIR, `fullyParallel` altında başka dosyaların POST'ları (ör.
// `personnel-form.spec.ts`in ürettiği "per-new-*" kayıtlar) KPI toplamını ve
// sayfalama özetini değiştirebilir — bu yalnız bir iddia sorunu değil, PİKSEL
// sorunu: ekrandaki gerçek sayı da değişir. Çözüm `pinRoster` (aşağısı):
// kadraj için TEK bir GET yanıtı `per-new-` önekli kayıtları düşürür, tohum
// altı kayıt (`per-1…per-6`) aynen kalır — sunucu durumu HİÇ değişmez.
//
// 📅 TARİH BAĞIMSIZ: bu üç kadrajda tarihe bağlı hiçbir türev yoktur (KPI/
// rozet/sayfalama hepsi sunucu fikstüründen türer) — `page.clock` gerekmez.
//
// Baseline `.png` YALNIZ Linux CI'da üretilir (visual-baselines.yml →
// workflow_dispatch → artifact → `e2e/`); macOS'ta koşturulup commit edilmez.

const PERSONNEL_URL = "/personel";

async function login(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/login");
  await page.getByLabel(/e-posta/i).fill("patron@fiil.com");
  await page.getByLabel(/^şifre$/i).fill("dogruparola");
  await page.getByRole("button", { name: /giriş yap/i }).click();
  await expect(page.getByRole("heading", { name: "Gösterge Paneli" })).toBeVisible();
}

test("personel liste (dolu) gorsel", async ({ page }) => {
  await login(page);
  await pinRoster(page);
  await page.goto(PERSONNEL_URL);

  // YERLEŞİM OTURDU (WORKFLOW §4, 1. parça): tablo sunucu fikstüründen geldi
  // ("Personel listesi yükleniyor…" durumu kadraja giremez) VE `pinRoster`
  // sabitlemesi TUTTU — toplam TAM 6 (tohum kadro), sayfa 1'de altısı da var.
  await expect(page.getByRole("heading", { level: 1, name: "İnsan Kaynakları" })).toBeVisible();
  await expect(page.getByTestId("personel-row-per-1")).toBeVisible();
  await expect(page.getByTestId("personel-row-per-6")).toBeVisible();
  await expect(page.getByTestId("personel-kpi-strip")).toContainText("6");
  await expect(page.locator("main").getByText("6 personelden 1–6 gösteriliyor").first()).toBeVisible();
  // Tür rozetlerinin üçü de kadrajda — palet tam basılır (Şirket/Taşeron/Genel).
  await expect(page.getByTestId("personel-row-per-1").getByText("Şirket")).toBeVisible();
  await expect(page.getByTestId("personel-row-per-3").getByText("Taşeron")).toBeVisible();
  await expect(page.getByTestId("personel-row-per-5").getByText("Genel")).toBeVisible();
  // Durum rozetlerinin ikisi de kadrajda (per-6 tek pasif tohum kaydı).
  await expect(page.getByTestId("personel-row-per-1").getByText("Aktif")).toBeVisible();
  await expect(page.getByTestId("personel-row-per-6").getByText("Pasif")).toBeVisible();
  // F-İK T6a · Proje sütunu AYRI bir sorgudan gelir (`GET /projects`) — kendi
  // yükleme durumu SGK/rozet sorgusundan bağımsız çözülür; hücre "Kule A"ya
  // dönüşmemiş "—" pending durumunda kalıp kadraja girebilir, o yüzden burada
  // GERÇEK proje adı ayrıca doğrulanır.
  await expect(page.getByTestId("personel-row-per-1").getByText("Kule A")).toBeVisible();

  // Kadraj hazırlığı (kaydırma sıfırlama + imleç parkı): `visual-scroll.ts`.
  await prepareFrame(page);
  await expect(page).toHaveScreenshot("personel-liste.png", { fullPage: true });
});

test("personel liste (bos) gorsel", async ({ page }) => {
  // BOŞ DURUM KAYNAĞI (F-ST `stok-genel-bos` / F-PL `planlama-bos` emsali):
  // paylaşılan mock durumu BOŞALTILMAZ — başka spec'lerin fikstürlerini
  // kırardı. Yerine TEK bir GET yanıtı kadraja özel `PersonnelListResponse`
  // boş zarfıyla karşılanır; sunucu durumu HİÇ değişmez, yarış da yoktur.
  await page.route(
    (url) => url.pathname === "/api/backend/personnel",
    async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [], total: 0, limit: 200, offset: 0 }),
      });
    },
  );

  await login(page);
  await page.goto(PERSONNEL_URL);

  // YERLEŞİM OTURDU (1. parça): yanıt GELDİ ve boş-kadro metni basıldı —
  // "Personel listesi yükleniyor…" durumu kadraja girmez. `.first()` ZORUNLU:
  // akış-SSR'da sunucu kopyası ile hidrasyon kopyası bir an yan yana durur ve
  // kapsam daraltmadan yapılan `getByText` strict-mode ihlali verir (F-PL/
  // F-ST baseline turu dersi, yalnız Linux CI'da patlar).
  await expect(page.getByRole("heading", { level: 1, name: "İnsan Kaynakları" })).toBeVisible();
  await expect(page.locator("main").getByText("Henüz personel kaydı yok.").first()).toBeVisible();
  await expect(
    page.locator("main").getByText("“+ Personel Ekle” ile ilk kaydı oluşturun.").first(),
  ).toBeVisible();
  // Sıfır KPI sunucudan gelir; ekran sahte sayı basmaz.
  await expect(page.getByTestId("personel-kpi-strip")).toContainText("0");
  // Süzgeçsiz boş listede kırpılma uyarısı BASILMAZ.
  await expect(page.getByTestId("personel-truncation-notice")).toHaveCount(0);

  // Kadraj hazırlığı (kaydırma sıfırlama + imleç parkı): `visual-scroll.ts`.
  await prepareFrame(page);
  await expect(page).toHaveScreenshot("personel-liste-bos.png", { fullPage: true });
});
