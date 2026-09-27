import { test, expect, type Page } from "@playwright/test";

import { pinLeaveRequests } from "./leaves-helpers";
import { prepareFrame } from "./visual-scroll";

// F-IZN T7 · İZ (`/personel/izinler`) görsel testleri — kanon mockup'lar
// `İK - İzin Yönetimi.dc.html` (ekran) · `Form - Izin Talebi.dc.html` (talep
// formu) · `Form - Izin Reddi.dc.html` (red diyaloğu).
//
// DÖRT kare: dolu ekran · bekleyen talep YOK hâli · talep formu · red diyaloğu.
// Diyalog kadrajları `fullPage`dir ki örtü katmanı ve altındaki ekran da kareye
// girsin (`form-dialogs-visual.spec.ts` emsali — eleman kadrajı örtüyü
// göstermez).
//
// 🔒 SALT-OKUR: bu dosya HİÇBİR POST/PATCH tetiklemez. Diyaloglar yalnız açılır
// ve alanları doldurulur; "Onaya Gönder"/"Reddet" düğmelerine BASILMAZ. Bu
// zorunludur: `POST /leave-requests` bekleyen listeyi büyütür,
// `POST /leave-requests/{id}/reject` ise satırı listeden düşürürdü — ikisi de
// bu dosyanın KENDİ baseline'larını ve `fullyParallel` altında diğerlerini
// sessizce kırardı.
//
// 🔒 FİKSTÜR SÜZGECİ: `pinLeaveRequests` (e2e/leaves-helpers.ts, T6 kanonu)
// kadrajı OKUMA adasına (`lv-1…lv-5`) süzer; `leaves.spec.ts`in yazma akışları
// (`lv-w1`/`lv-w2`) ve doğurduğu `lv-new-*` kayıtları kareye giremez. Kanonik
// uygulama TEK yerdedir — gövde KOPYALANMAZ, import edilir.
//
// 🔴 "YÜKLENDİ" İDDİASI HER BAĞIMSIZ VERİ KAYNAĞINI KAPSAR (WORKFLOW §4, 5.
// parça). Kaç sorgu olduğu tahmin EDİLMEDİ, hook katmanına bakıldı
// (`src/lib/api/hooks/useLeaves.ts` + `LeaveRequestFormModal.tsx`):
//   • Ekran   → `useHrLeavesSummary(year)`  → `GET /hr/leaves/summary?year=`
//               (KPI şeridi + bakiye tablosu)
//               `usePendingLeaveRequests()` → `GET /leave-requests?status=pending`
//               (onay bekleyen tablo). Özet gövdesinde talep SATIRLARI YOKTUR;
//               iki uç birbirini BEKLEMEZ.
//   • Talep formu → yukarıdaki ikisine EK olarak `useLeaveTypes()`
//               (`GET /leave-types`, tip seçeneği + rozet şeridi) ve
//               `usePersonnel({isActive:true})` (`GET /personnel`, personel
//               seçeneği). Diyalogda DÖRT bağımsız kaynak vardır ve dördü de
//               ayrı ayrı doğrulanır.
// Her kaynak için o kaynağa ÖZGÜ iddia yazıldı; ayrıca iki kaynağın KESİŞTİĞİ
// hücreler (K4 istemci JOIN'i: "Kalan Hak" · aşım bandı · red sistem notu)
// ölçülür — biri pending kalsaydı o hücre "—" donar ve kare bozuk çıkardı.
//
// 📅 TARİH BAĞIMLI — `page.clock` ZORUNLU: `LeavesView`in `currentYear`
// varsayılanı `new Date().getFullYear()`tır ve ÜÇ yüzeyi birden sürer:
// (a) bakiye tablosunun yıl seçicisinin seçili değeri, (b) seçicinin iki
// seçeneği (`buildYearOptions` → yıl + bir önceki), (c) özet ucuna giden
// `?year=` parametresi. Sahte backend bakiyeleri YALNIZ 2026'da döner
// (`LEAVE_YEAR`), yani takvim 2027'ye döndüğü an bakiye tablosu boş duruma
// düşer ve dört karenin üçü kendiliğinden değişirdi. Saat fikstür ayına
// çakılır (`FIXED_NOW`), NAVİGASYONDAN ÖNCE. Ekranda bunun dışında `new Date()`
// türevi YOKTUR: KPI'lar sunucu damgasıdır, gün sayıları tarihlerden türer,
// kıdem/aşım sunucunun `remaining`inden gelir.
//
// ⚠️ DİYALOG KONUMU ÖLÇÜLDÜ (WORKFLOW §4, 4. parça): `.modal-overlay`
// `position: fixed; inset: 0` + flex ORTALAMAdır (src/components/settings/
// modal.css) — konum `getBoundingClientRect()` türevinden GELMEZ, kesirli ölçü
// yoktur. `Math.round` kanonu bu iki diyalogda UYGULANMAZ. `.modal`ın kendisi
// `max-height: 85vh; overflow-y: auto` ile kaydırılabilirdir; `prepareFrame`
// onu da (sayfadaki HER kap gibi) iki eksende sıfırlar.
//
// ⚠️ Sabit `waitForTimeout` YOKTUR; her bekleme durum tabanlıdır.
// ⚠️ `getByRole("alert")` bu depoda YASAKTIR.
//
// 📌 AÇIK BORÇ (ölçüldü, kabul edildi): talep formu `max-height: 85vh`e
// SIĞMAZ. Kaydırma sıfırlaması kanon olduğu için kare diyaloğun ÜST yarısını
// basar; belge kartının alt kısmı, "Açıklama" alanı ve footer (engel gerekçesi
// + "Onaya Gönder") kadrajın DIŞINDA kalır. Bu yüzeyler `leaves.spec.ts`te ve
// `LeaveRequestFormModal.test.tsx`te ölçülür; görsel kanıt için diyaloğu
// kaydırmak kadrajı belirsizleştirirdi (kaydırma ofseti baseline'a sızardı).
// Red diyaloğu sığar ve footer'ı kadrajdadır.
//
// Baseline `.png` YALNIZ Linux CI'da üretilir (visual-baselines.yml →
// workflow_dispatch → artifact → `e2e/`); macOS'ta koşturulup commit edilmez.

const LEAVES_URL = "/personel/izinler";
const VISUAL_VIEWPORT = { width: 1440, height: 900 } as const;

/** Fikstür ayına çakılı "şimdi" — `LEAVE_YEAR` (2026) ile AYNI yıl. */
const FIXED_NOW = "2026-08-16T09:00:00Z";

/** Yükleme durumlarının metinleri — kadraja GİREMEZLER. */
const PENDING_LOADING_TEXT = "İzin talepleri yükleniyor...";
const BALANCES_LOADING_TEXT = "İzin bakiyeleri yükleniyor...";

async function login(page: Page) {
  await page.setViewportSize({ ...VISUAL_VIEWPORT });
  await page.goto("/login");
  await page.getByLabel(/e-posta/i).fill("patron@fiil.com");
  await page.getByLabel(/^şifre$/i).fill("dogruparola");
  await page.getByRole("button", { name: /giriş yap/i }).click();
  await expect(page.getByRole("heading", { name: "Gösterge Paneli" })).toBeVisible();
}

/**
 * 📅 Saat OTURUM AÇILDIKTAN SONRA, İZ ekranına gitmeden ÖNCE dondurulur
 * (`subcontractors-visual.spec.ts` kanonu — "kimlik/çerez akışına
 * dokunmadan"). ÖLÇÜLDÜ: `setFixedTime`ı girişten ÖNCE kurmak giriş akışını
 * kırar ve "Gösterge Paneli" hiç açılmaz; sıra bu yüzden bağlayıcıdır.
 * `currentYear` sayfa render'ında okunduğu için navigasyondan önce donması
 * YETERLİdir.
 */
async function gotoLeaves(page: Page) {
  await page.clock.setFixedTime(new Date(FIXED_NOW));
  await page.goto(LEAVES_URL);
}

/**
 * KAYNAK A · `GET /hr/leaves/summary` — KPI şeridi + bakiye tablosu.
 *
 * Beş KPI'ın BEŞİ de sunucu fikstüründen GERÇEK sayıya dönüştü: pending
 * zarfında hepsi `UNKNOWN_VALUE` ("—") basar, o yüzden şeritte "—" KALMAMASI
 * özetin geldiğinin tek başına yeterli kanıtıdır. Bakiye tablosu AYNI gövdenin
 * `balances` dizisinden gelir ama AYRI bir yüzeydir; satırları da ayrıca
 * ölçülür (yükleme satırı kadraja giremez).
 */
async function expectSummaryLoaded(page: Page) {
  await expect(page.getByTestId("iz-kpi-pending")).toHaveText("7");
  await expect(page.getByTestId("iz-kpi-on-leave")).toHaveText("3");
  await expect(page.getByTestId("iz-kpi-used")).toHaveText("46 gün");
  await expect(page.getByTestId("iz-kpi-debt")).toHaveText("128,5 gün");
  await expect(page.getByTestId("iz-kpi-risk")).toHaveText("2 kişi");
  await expect(page.getByTestId("iz-kpi-strip")).not.toContainText("—");

  // Bakiye tablosu: beş satır, üç ayrı dal (normal · devreden riski · hak yok).
  await expect(page.getByTestId("iz-balance-row-per-1")).toBeVisible();
  await expect(page.getByTestId("iz-balance-row-per-5")).toBeVisible();
  await expect(page.getByTestId("iz-remaining-balance-per-1")).toHaveText("12");
  await expect(page.getByTestId("iz-remaining-balance-per-5")).toHaveText("Hak yok");
  await expect(page.getByTestId("iz-carried-per-2")).toHaveText("6");
  await expect(page.getByTestId("iz-balances-empty")).toHaveCount(0);
  await expect(page.getByTestId("iz-balances-error")).toHaveCount(0);
  await expect(page.locator("main").getByText(BALANCES_LOADING_TEXT)).toHaveCount(0);
  // 📅 `page.clock` KANITI: yıl seçici dondurulmuş takvimden 2026'ya düştü —
  // fikstür yılı budur ve bakiye satırları ancak bu yılda gelir.
  await expect(page.getByTestId("iz-year-select")).toHaveValue("2026");
}

/**
 * KAYNAK B · `GET /leave-requests?status=pending` — onay bekleyen tablo.
 *
 * Başlıktaki sayı liste zarfının `total`ıdır (K5) ve `pinLeaveRequests` onu
 * süzülen kümeye göre yeniden yazar: TAM 5 ⇒ hem uç yanıtladı hem süzgeç tuttu.
 */
async function expectPendingLoaded(page: Page) {
  await expect(page.getByTestId("iz-pending-title")).toHaveText(
    "Onay Bekleyen İzin Talepleri (5)",
  );
  await expect(page.getByTestId("iz-pending-row-lv-1")).toBeVisible();
  await expect(page.getByTestId("iz-pending-row-lv-5")).toBeVisible();
  // Süzgeç TUTTU: yazma adası kadrajda YOK (olsaydı kare kâh 5 kâh 7 satırdı).
  await expect(page.getByTestId("iz-pending-row-lv-w1")).toHaveCount(0);
  await expect(page.getByTestId("iz-pending-row-lv-w2")).toHaveCount(0);
  await expect(page.getByTestId("iz-pending-empty")).toHaveCount(0);
  await expect(page.getByTestId("iz-pending-error")).toHaveCount(0);
  await expect(page.locator("main").getByText(PENDING_LOADING_TEXT)).toHaveCount(0);
  // Karar akışı BAĞLI (T4) — "henüz bağlanmadı" bandı kadraja giremez.
  await expect(page.getByTestId("iz-decision-reason")).toHaveCount(0);
  await expect(page.getByTestId("iz-decision-error")).toHaveCount(0);
}

/**
 * A ∩ B · K4 istemci JOIN'i — "Kalan Hak" sütunu TALEP satırını (B) ÖZET
 * bakiyesiyle (A) birleştirir. Biri pending kalsaydı hücre "—"ye donar ve
 * kare sessizce bozuk çıkardı; bu yüzden kesişim AYRICA ölçülür.
 */
async function expectJoinResolved(page: Page) {
  await expect(page.getByTestId("iz-remaining-lv-1")).toHaveText("12 gün");
  await expect(page.getByTestId("iz-remaining-lv-4")).toHaveText("Düşmez");
  await expect(page.getByTestId("iz-remaining-lv-2")).toContainText("2 gün");
  // Hak aşan satır açıklama hücresinde fazlalığı yazar (İZ 98) — bu metin de
  // ancak iki kaynak birlikte çözüldüğünde doğar.
  await expect(page.getByTestId("iz-pending-row-lv-2")).toContainText("Hak aşımı — 4 gün fazla");
}

/* ── 1) İZ · dolu ekran ──────────────────────────────────────────────────── */

test("izin yonetimi gorsel", async ({ page }) => {
  await login(page);
  await pinLeaveRequests(page);
  await gotoLeaves(page);

  // YERLEŞİM OTURDU (WORKFLOW §4, 1. parça): başlık + İKİ bağımsız kaynak +
  // kesişimleri. `.first()` gerekmez, hepsi `data-testid` kapsamlı.
  await expect(page.getByRole("heading", { level: 1, name: "İzin Yönetimi" })).toBeVisible();
  await expectSummaryLoaded(page);
  await expectPendingLoaded(page);
  await expectJoinResolved(page);

  // Kadraj hazırlığı (kaydırma sıfırlama + imleç parkı): `visual-scroll.ts`.
  await prepareFrame(page);
  await expect(page).toHaveScreenshot("izin-yonetimi.png", { fullPage: true });
});

/* ── 2) İZ · bekleyen talep YOK ──────────────────────────────────────────── */

test("izin yonetimi (bos) gorsel", async ({ page }) => {
  // BOŞ DURUM KAYNAĞI (`personnel-list-visual.spec.ts` `personel-liste-bos`
  // emsali): paylaşılan mock durumu BOŞALTILMAZ — `leaves.spec.ts`in yazma
  // adasını ve başka baseline'ları kırardı. Yerine TEK bir GET yanıtı kadraja
  // özel boş `LeaveRequestListResponse` zarfıyla karşılanır; sunucu durumu HİÇ
  // değişmez, yarış da yoktur. `pinLeaveRequests` burada ÇAĞRILMAZ: aynı yolu
  // iki kez yakalamak gereksiz, süzgecin işini zaten boş zarf yapıyor.
  await page.route(
    (url) => url.pathname === "/api/backend/leave-requests",
    async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [], total: 0, limit: 50, offset: 0 }),
      });
    },
  );

  await login(page);
  await gotoLeaves(page);

  await expect(page.getByRole("heading", { level: 1, name: "İzin Yönetimi" })).toBeVisible();

  // KAYNAK A DEĞİŞMEDİ: özet ucu boşaltılmadı, KPI'lar ve bakiye tablosu
  // GERÇEK sayılarıyla kadrajda. 🔴 Bu iddia bu karede KRİTİKTİR: yalnız
  // bekleyen tabloyu bekleyen bir spec, özetin pending hâlini ("—" beş kart)
  // donmuş yakalayıp bozuk kareyi sessizce commit'lerdi.
  await expectSummaryLoaded(page);

  // KAYNAK B · boş zarf GELDİ ve boş durum basıldı (K3 onaylı sapması —
  // mockup boş hâli çizmez, bekleyen talep olmaması NORMAL işletme hâlidir).
  await expect(page.getByTestId("iz-pending-title")).toHaveText(
    "Onay Bekleyen İzin Talepleri (0)",
  );
  await expect(page.getByTestId("iz-pending-empty")).toHaveText("Onay bekleyen izin talebi yok.");
  await expect(page.getByTestId("iz-pending-row-lv-1")).toHaveCount(0);
  await expect(page.getByTestId("iz-pending-error")).toHaveCount(0);
  await expect(page.locator("main").getByText(PENDING_LOADING_TEXT)).toHaveCount(0);
  // ⚠️ KPI "Bekleyen Talep 7" ile tablo "(0)" ÇELİŞMEZ, iki AYRI uçtandır ve
  // ekran bunu bilerek böyle basar (K5 gerekçesi) — kare de öyle kalır.

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("izin-yonetimi-bos.png", { fullPage: true });
});

/* ── 3) T · Yeni İzin Talebi formu ───────────────────────────────────────── */

test("izin talep formu gorsel", async ({ page }) => {
  await login(page);
  await pinLeaveRequests(page);
  await gotoLeaves(page);

  // Alttaki ekranın İKİ kaynağı da oturdu — diyalog örtüsünün ARDINDAKİ ekran
  // da `fullPage` kareye girer, yükleme hâlinde donmuş olamaz.
  await expectSummaryLoaded(page);
  await expectPendingLoaded(page);

  await page.getByTestId("iz-new-request").click();
  const dialog = page.getByRole("dialog", { name: "Yeni İzin Talebi" });
  await expect(dialog).toBeVisible();

  // KAYNAK C · `GET /leave-types` — rozet şeridi DÖRT tipi de basar. Şerit
  // yalnız `types.length > 0` iken çizilir, yani gelmemişse HİÇ yoktur ve kare
  // sessizce eksik çıkardı.
  const badges = dialog.getByTestId("iz-request-type-badges");
  await expect(badges).toContainText("Yıllık İzin");
  await expect(badges).toContainText("Hastalık İzni");
  await expect(badges).toContainText("Ücretsiz İzin");
  await expect(badges).toContainText("Mazeret İzni");
  await expect(dialog.getByTestId("iz-request-type-error")).toHaveCount(0);

  // KAYNAK D · `GET /personnel` — seçenek listesi geldi. `selectOption`
  // seçeneğin VARLIĞINI bekler, yani deterministik bir yükleme kapısıdır
  // (sabit bekleme yok); değeri ayrıca doğrulanır.
  await dialog.getByTestId("iz-request-personnel").selectOption("per-3");
  await expect(dialog.getByTestId("iz-request-personnel")).toHaveValue("per-3");
  await expect(dialog.getByTestId("iz-request-personnel-error")).toHaveCount(0);

  // KAYNAK A (diyalog içinde) · özet bakiyesi — hak kartı GERÇEK sayılarla
  // doldu. Kıdem yalnız bakiye satırından gelir; özet pending olsaydı kart
  // "bakiye kaydı yok" notuna düşer ve kare YANLIŞ dalı basardı.
  const balanceCard = dialog.getByTestId("iz-request-balance");
  await expect(balanceCard).toContainText("Ramazan Yıldız");
  await expect(balanceCard).toContainText("Kıdem: 4 yıl 10 ay");
  await expect(dialog.getByTestId("iz-request-remaining")).toContainText("2");
  await expect(dialog.getByTestId("iz-request-no-balance")).toHaveCount(0);

  // Mockup 132-158 · tarihler + TÜRETİLEN gün + HAK AŞIMI bandı.
  // ⚠️ ONAYLI SAPMA / açık borç: mockup aynı karede hem "belge zorunlu" tipi
  // hem hak aşımı bandını çizer. Fikstürde bu İKİSİ AYNI ANDA İMKÂNSIZDIR —
  // belge zorunlu tek tip (`lt-2` Hastalık İzni) `deducts_from_annual: false`
  // taşır ve `leaveOverrun` düşmeyen tipte aşım İDDİA ETMEZ (K9/KARAR 4).
  // Aşım bandı seçildi: mockup'ın en büyük forma-özgü yüzeyidir ve İKİ
  // kaynağın (tip bayrağı + özet `remaining`) kesişimini kanıtlar. Belge
  // kartı kadrajda yine var, "opsiyonel" varyantıyla.
  await dialog.getByTestId("iz-request-type").selectOption("lt-1");
  await dialog.getByTestId("iz-request-start").fill("07.09.2026");
  await dialog.getByTestId("iz-request-end").fill("12.09.2026");
  await expect(dialog.getByTestId("iz-request-days")).toHaveValue("6");

  const overrun = dialog.getByTestId("iz-request-overrun");
  await expect(overrun).toContainText("Hak aşımı — talep kaydedilemez");
  await expect(overrun).toContainText("kalan izin hakkı olan");
  // Önerilen bitiş `addDays(start, floor(remaining) - 1)` türevidir — sunucu
  // `remaining`i gelmeden bu tarih HİÇ basılmaz.
  await expect(overrun).toContainText("08.09.2026");
  // Pasif düğmenin gerekçesi footer'da OKUNUR (`title`da saklanmaz).
  await expect(dialog.getByTestId("iz-request-block-reason")).toContainText(
    "Hak aşımı düzeltilmeden gönderilemez.",
  );
  await expect(dialog.getByTestId("iz-request-submit")).toBeDisabled();
  await expect(dialog.getByTestId("iz-request-error")).toHaveCount(0);

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("izin-talep-formu.png", { fullPage: true });
});

/* ── 4) R · İzin Talebini Reddet diyaloğu ────────────────────────────────── */

test("izin red diyalogu gorsel", async ({ page }) => {
  await login(page);
  await pinLeaveRequests(page);
  await gotoLeaves(page);

  await expectSummaryLoaded(page);
  await expectPendingLoaded(page);
  await expectJoinResolved(page);

  // 🔒 `lv-2` OKUMA adasındadır ve burada YALNIZ diyalog açılır — red POST'u
  // atılmaz, satır listede kalır. (Yazma akışı `leaves.spec.ts`te `lv-w2`
  // üzerindedir ve `pinLeaveRequests` onu kadrajdan zaten süzer.)
  // `lv-2` seçildi çünkü hak aşan TEK okuma satırıdır: mockup'ın sistem notu
  // (R 95-99) ancak aşım GERÇEKTEN hesaplanabildiğinde basılır.
  await page.getByTestId("iz-reject-lv-2").click();
  const dialog = page.getByRole("dialog", { name: "İzin Talebini Reddet" });
  await expect(dialog).toBeVisible();

  // KAYNAK B (diyalog içinde) · talep özeti props'tan gelir — satır kadrajdaki
  // GERÇEK talep, yer tutucu değil.
  const summary = dialog.getByTestId("iz-reject-summary");
  await expect(summary).toContainText("Ramazan Yıldız");
  await expect(summary).toContainText("Yıllık İzin");
  await expect(summary).toContainText("07.09.2026");
  await expect(summary).toContainText("12.09.2026");

  // A ∩ B · sistem notu talebin `days`i ile ÖZETİN `remaining`ini birleştirir;
  // özet pending olsaydı not HİÇ basılmaz ve kare eksik çıkardı.
  await expect(dialog.getByTestId("iz-reject-system-note")).toContainText(
    "Kalan hak 2 gün — talep 4 gün aşıyor",
  );

  // Mockup R 103-107/123-128 · gerekçe alanı BOŞ başlar, düğme PASİF, footer
  // gerekçeyi yazar — mockup'ın çizdiği hâl budur (hazır gerekçelere BASILMAZ).
  await expect(dialog.getByTestId("iz-reject-reason")).toHaveValue("");
  await expect(dialog.getByTestId("iz-reject-required")).toContainText("Gerekçe zorunlu");
  await expect(dialog.getByTestId("iz-reject-submit")).toBeDisabled();
  await expect(dialog.getByTestId("iz-reject-error")).toHaveCount(0);

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("izin-red-diyalogu.png", { fullPage: true });
});
