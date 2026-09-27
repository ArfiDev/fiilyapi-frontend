import { test, expect, type Page } from "@playwright/test";

// F-PL T4 · Şantiye Planlama fonksiyonel e2e (görsel DEĞİL).
// Kapsam: ızgaranın okunması, hafta gezinmesi (`?week=`), hücre/satır/hedef/
// sprint düzenlemelerinin GERÇEKTEN kalıcı olması ve F-SD ekranından geçiş.
//
// 📅 TARİH BAĞIMSIZLIĞI (zorunlu): planlama ekranının varsayılan haftası
// İÇİNDE BULUNULAN haftadır. Bu dosya "bu hafta"ya ASLA dayanmaz — her
// gezinme AÇIK `?week=` parametresiyle yapılır, aksi hâlde gerçek takvim
// ilerledikçe fikstür haftası ekrandan çıkar ve test çürür.
//
// 🔒 FİKSTÜR İZOLASYONU (P7 dersi): mock backend TÜM spec'lerde TEK paylaşılan
// sunucudur. Planlama uçlarının üçü (rows/sprint + CASCADE hücreler) ŞANTİYE
// kapsamlıdır, yani hafta ayırmak yetmez. Bu yüzden MUTASYON akışları bilerek
// s-2'de (B-Blok) yürür; `site-planning-visual.spec.ts` yalnız s-1'e bakar ve
// s-1'i hiçbir spec değiştirmez. Salt-okur testler s-1'i okur ama yazmaz.
//
// ⚠️ `getByRole("alert")` bu depoda YASAKTIR — görünür metinle iddia edilir.

/** Mock fikstürlerinin haftası (Pazartesi) — `mock-backend.ts` ile aynı sabit. */
const FIXTURE_WEEK = "2026-08-03";
const NEXT_WEEK = "2026-08-10";

/** Salt-okur ızgara: s-1 (A-Blok), beş satır + altı renk + dört hedef. */
const READ_ONLY_URL = `/projeler/p-1/santiyeler/s-1/gunluk-kayit/planlama?week=${FIXTURE_WEEK}`;
/** Mutasyon akışlarının izole şantiyesi: s-2 (B-Blok), bölümsüz iki satır. */
const MUTATION_URL = `/projeler/p-1/santiyeler/s-2/gunluk-kayit/planlama?week=${FIXTURE_WEEK}`;

/**
 * 🔒 HEDEF İZOLASYONU (F-TB3 T4 — iki kez rapor edilen flake'in kökü).
 *
 * Hedefler `(şantiye, hafta)` çiftine kapsamlıdır (`PUT …/plan/goals?week_start=`
 * yalnız o haftayı değiştirir). s-2'nin FİKSTÜR haftasındaki hedef sayısı ise
 * SABİT DEĞİLDİR: aynı seri bloğun "hedef ekleme ve düzenleme kalıcıdır" testi
 * o haftayı 1 hedeften 2 hedefe çıkarır. Bu yüzden "sunucuya bir şey gitmedi"
 * iddiası o hafta üzerinden kurulamaz — iddiaya giren kayıt, başka bir testin
 * mutasyona uğrattığı kayıtla AYNI kümedir (`pinRoster` / `pinPurchasingFixtures`
 * emsalinin çözdüğü sınıf).
 *
 * Çözüm: iddia kendi haftasına taşınır. Bu hafta (17–23 Ağustos 2026) hiçbir
 * fikstür taşımaz ve başka HİÇBİR spec/test okumaz ya da yazmaz — dolayısıyla
 * başlangıç sayısı YAPISAL olarak 0'dır ve testin kurduğu tek hedef yalnız
 * kendisine aittir. Paylaşılan mock DURUMUNA ek kayıt konmaz; görsel kadrajlar
 * (`site-planning-visual.spec.ts`) yalnız s-1/fikstür haftasına bakar.
 */
const ISOLATED_GOAL_WEEK = "2026-08-17";
const ISOLATED_GOAL_URL = `/projeler/p-1/santiyeler/s-2/gunluk-kayit/planlama?week=${ISOLATED_GOAL_WEEK}`;

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/e-posta/i).fill("patron@fiil.com");
  await page.getByLabel(/^şifre$/i).fill("dogruparola");
  await page.getByRole("button", { name: /giriş yap/i }).click();
  await expect(page.getByRole("heading", { name: "Gösterge Paneli" })).toBeVisible();
}

/**
 * Izgara kartı. Locator'lar BURAYA kapsamlanır: "Makine & Ekipman" gibi
 * metinler drill sidebar'da da geçiyor ve sayfa genelinde çoklu eşleşir.
 */
function gridCard(page: Page) {
  return page.locator("main").locator(".plan-card--grid").first();
}

/**
 * Hafta etiketi — akış-SSR sırasında sunucu kopyası + hidrate kopya yan yana
 * durabilir ve locator İKİ elemana çözülür (strict-mode ihlali). Bu YALNIZ
 * Linux CI'da patladı (visual-baselines run 30997344422), macOS'ta hiç
 * görülmedi; bu yüzden karta kapsamlanır VE `.first()` alır.
 */
function weekLabel(page: Page) {
  return gridCard(page).locator(".plan-week-nav__label").first();
}

/** Sprint şeridi — `weekLabel` ile aynı çift-eşleşme riski. */
function sprintLabel(page: Page) {
  return gridCard(page).locator(".plan-week-nav__sprint").first();
}

/**
 * Hedefler kartı — `weekLabel` ile AYNI akış-SSR çift-kopya sınıfı. Kapsamsız
 * `.plan-goals` locator'ı hidrasyon anında iki elemana çözülebilir; `.first()`
 * hem `toHaveCount` sayımlarını hem de içine kapsamlanan tıklamaları korur.
 */
function goalsCard(page: Page) {
  return page.locator("main").locator(".plan-goals").first();
}

/** Kaydetme durum şeridi — aynı çift-kopya riski. */
function saveStatus(page: Page) {
  return page.locator("main").locator(".plan-save-status").first();
}

/** Ekip grubu — ızgara kartına kapsamlanır (sayfada tek kopya garantisi yok). */
function crewGroup(page: Page) {
  return gridCard(page).locator(".plan-grid__group--crew").first();
}

/** Satır etiketi sütunu artık menü de içerir; metin karşılaştırması bu düğümledir. */
function rowLead(page: Page, label: string) {
  return gridCard(page).locator(".plan-grid__lead-text", { hasText: label });
}

/** "Kaydet" → adım sonucunu bekle (zaman aşımına dayalı bekleme YOK). */
async function saveAndExpect(page: Page, doneLine: string) {
  await page.getByRole("button", { name: "Kaydet" }).click();
  const status = saveStatus(page);
  await expect(status).toContainText(doneLine);
  await expect(status).not.toContainText("kaydedilemedi");
}

test.describe("planlama ızgarası (SALT-OKUR, s-1)", () => {
  test("ızgara, gruplar, hücreler, hedefler ve aktif sprint basılır", async ({ page }) => {
    await login(page);
    await page.goto(READ_ONLY_URL);
    const content = page.locator("main");

    await expect(
      page.getByRole("heading", { level: 1, name: "Planlama — A-Blok Şantiyesi" }),
    ).toBeVisible();
    // Hafta AÇIK parametreden gelir — "bugün" hangi hafta olursa olsun aynıdır.
    await expect(weekLabel(page)).toHaveText("3 – 9 Ağustos 2026");
    await expect(sprintLabel(page)).toHaveText(
      "Aktif Sprint: Sprint 12 · 6. Kat Kaba İnşaat",
    );

    const grid = gridCard(page);
    // İki grup: bölümlü ekip grubu (bölüm adı + sorumlusu) + bölümsüz ekipman.
    await expect(grid.getByText("Kat 6–10 Kaba İnşaat")).toBeVisible();
    await expect(grid.getByText("Bölüm sorumlusu: Sercan Öztürk")).toBeVisible();
    await expect(grid.getByText("Makine & Ekipman")).toBeVisible();

    // Ekip satırında işçi sayısı parantezde, ekipman satırında YOK.
    await expect(rowLead(page, "Kalıpçı Ekibi (14)")).toBeVisible();
    await expect(rowLead(page, "Tower Crane")).toBeVisible();

    // Yedi gün sütunu + seyrek hücreler (planı olmayan gün boştur).
    await expect(grid.locator(".plan-grid__day")).toHaveCount(7);
    await expect(grid.getByText("6. kat kalıp kurulumu")).toBeVisible();
    await expect(grid.getByText("Vinç periyodik bakım")).toBeVisible();

    // Dört hedef, dört farklı durumla.
    const goals = goalsCard(page);
    await expect(goals.locator(".plan-goals__row")).toHaveCount(4);
    await expect(
      goals.getByRole("combobox", { name: "6. kat kalıp tamamlansın — hedef durumu" }),
    ).toHaveValue("completed");
    await expect(
      goals.getByRole("combobox", { name: "Vinç yıllık muayenesi — hedef durumu" }),
    ).toHaveValue("service_pending");

    // Malzeme Planı kartı PENDING — mockup'ın sahte satırları BASILMAZ.
    await expect(content.getByText("Haftalık malzeme ihtiyacı hesaplanmıyor", { exact: false })).toBeVisible();
  });

  test("‹ / › haftayı URL'de taşır ve ızgarayı tazeler", async ({ page }) => {
    await login(page);
    await page.goto(READ_ONLY_URL);
    const content = page.locator("main");
    await expect(weekLabel(page)).toHaveText("3 – 9 Ağustos 2026");

    await page.getByRole("button", { name: "Sonraki hafta" }).click();
    await expect(page).toHaveURL(new RegExp(`week=${NEXT_WEEK}$`));
    await expect(weekLabel(page)).toHaveText("10 – 16 Ağustos 2026");
    // Satırlar ŞANTİYE kapsamlıdır (kalır), hücreler HAFTA kapsamlıdır (gider).
    await expect(rowLead(page, "Kalıpçı Ekibi (14)")).toBeVisible();
    await expect(gridCard(page).getByText("6. kat kalıp kurulumu")).toHaveCount(0);
    // Hedefler de hafta kapsamlıdır → boş durum metni.
    await expect(content.getByText("Bu hafta için hedef girilmemiş.")).toBeVisible();

    await page.getByRole("button", { name: "Önceki hafta" }).click();
    await expect(page).toHaveURL(new RegExp(`week=${FIXTURE_WEEK}$`));
    await expect(weekLabel(page)).toHaveText("3 – 9 Ağustos 2026");
    await expect(gridCard(page).getByText("6. kat kalıp kurulumu")).toBeVisible();
  });

  test("F-SD ekranından geçiş: mod anahtarı ve gömülü bloktaki bağlantı", async ({ page }) => {
    await login(page);
    await page.goto("/projeler/p-1/santiyeler/s-1/gunluk-kayit");
    await expect(
      page.getByRole("heading", { level: 1, name: "Günlük Kayıt & Planlama" }),
    ).toBeVisible();

    // 1) Mod anahtarındaki "Planlama".
    await page
      .getByRole("group", { name: "Görünüm seçimi" })
      .getByRole("link", { name: "Planlama" })
      .click();
    await expect(page).toHaveURL(/\/gunluk-kayit\/planlama$/);
    await expect(page.getByRole("heading", { level: 1, name: /^Planlama/ })).toBeVisible();

    // 2) Gömülü planlama bloğundaki "Planlama'ya git →".
    await page.goBack();
    await expect(
      page.getByRole("heading", { level: 1, name: "Günlük Kayıt & Planlama" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Planlama'ya git →" }).click();
    await expect(page).toHaveURL(/\/gunluk-kayit\/planlama$/);
    await expect(page.getByRole("heading", { level: 1, name: /^Planlama/ })).toBeVisible();
  });
});

// MUTASYON akışları — SERİ. Hepsi s-2'yi değiştirir; paralel koşsalardı
// birbirlerinin DEĞİŞTİRME (replace) gövdesini ezerlerdi.
test.describe("planlama düzenleme (MUTASYON, s-2)", () => {
  test.describe.configure({ mode: "serial" });

  test("hücre düzenleme kalıcıdır (metin + renk)", async ({ page }) => {
    await login(page);
    await page.goto(MUTATION_URL);
    await expect(weekLabel(page)).toHaveText("3 – 9 Ağustos 2026");
    // s-2'nin bölümü yok → ekip grubu "Bölümsüz Ekipler" başlığına düşer.
    await expect(gridCard(page).getByText("Bölümsüz Ekipler")).toBeVisible();
    await expect(gridCard(page).getByText("Bodrum duvar örgüsü")).toBeVisible();

    await page.getByRole("button", { name: "Duvarcı Ekibi (10) · Sal 4 Ağu planı" }).click();
    const popover = page.getByRole("dialog", { name: /hücre düzenleme$/ });
    await popover.getByLabel("Plan metni").fill("Kat 2 duvar örgüsü");
    await popover.getByRole("button", { name: "Yeşil" }).click();
    await popover.getByRole("button", { name: "Uygula" }).click();
    await expect(popover).toHaveCount(0);

    await saveAndExpect(page, "Hücreler: kaydedildi");

    // KALICILIK: yeniden yükleme sunucudan okur.
    await page.reload();
    await expect(gridCard(page).locator(".plan-cell__chip--green")).toHaveText("Kat 2 duvar örgüsü");
    // Dokunulmayan hücre DEĞİŞTİRME gövdesinde de yer aldı → silinmedi.
    await expect(gridCard(page).getByText("Bodrum duvar örgüsü")).toBeVisible();
  });

  test("satır ekleme ve silme (onay diyalogu) kalıcıdır", async ({ page }) => {
    await login(page);
    await page.goto(MUTATION_URL);
    await expect(weekLabel(page)).toHaveText("3 – 9 Ağustos 2026");

    // --- Ekleme
    await crewGroup(page).getByRole("button", { name: "+ Satır" }).click();
    const addPopover = page.getByRole("dialog", { name: "Yeni plan satırı" });
    await addPopover.getByLabel("Etiket").fill("Sıvacı Ekibi");
    await addPopover.getByLabel("İşçi sayısı").fill("6");
    await addPopover.getByRole("button", { name: "Ekle" }).click();
    await expect(rowLead(page, "Sıvacı Ekibi (6)")).toBeVisible();

    await saveAndExpect(page, "Plan satırları: kaydedildi");
    await page.reload();
    await expect(rowLead(page, "Sıvacı Ekibi (6)")).toBeVisible();

    // --- Silme (satır + hücreleri geri alınamaz → ONAY zorunlu)
    await page.getByRole("button", { name: "Sıvacı Ekibi (6) satır işlemleri" }).click();
    await page
      .getByRole("dialog", { name: "Sıvacı Ekibi (6) satır işlemleri" })
      .getByRole("button", { name: "Sil" })
      .click();
    const confirm = page.getByRole("dialog", { name: "Plan satırını sil" });
    await expect(confirm).toContainText("satırı ve bu satırın TÜM hücreleri silinecek");
    await confirm.getByRole("button", { name: "Sil" }).click();
    await expect(rowLead(page, "Sıvacı Ekibi (6)")).toHaveCount(0);

    await saveAndExpect(page, "Plan satırları: kaydedildi");
    await page.reload();
    await expect(rowLead(page, "Sıvacı Ekibi (6)")).toHaveCount(0);
    // Silme YALNIZ hedef satırı vurur; şantiyenin kalan satırları durur.
    await expect(rowLead(page, "Duvarcı Ekibi (10)")).toBeVisible();
    await expect(rowLead(page, "Mini Ekskavatör")).toBeVisible();
  });

  test("hedef ekleme ve düzenleme kalıcıdır (kutucuk + durum ayrı alanlar)", async ({ page }) => {
    await login(page);
    await page.goto(MUTATION_URL);
    const goals = goalsCard(page);
    await expect(goals.locator(".plan-goals__row")).toHaveCount(1);

    // Mevcut hedef: kutucuk işaretlenir ama durum "Beklemede" KALIR —
    // `is_done` ile `status` birbirinden türetilmez.
    await goals.getByRole("checkbox", { name: "Bodrum duvarları bitsin — tamamlandı işareti" }).check();

    // Yeni hedef "Beklemede" açılır; başlık ve durum yazılır.
    await page.getByRole("button", { name: "+ Hedef" }).click();
    await goals.getByRole("textbox", { name: "Yeni hedef — hedef başlığı" }).fill("İzolasyon kontrolü");
    await goals
      .getByRole("combobox", { name: "İzolasyon kontrolü — hedef durumu" })
      .selectOption("in_progress");

    await saveAndExpect(page, "Haftalık hedefler: kaydedildi");

    await page.reload();
    await expect(goals.locator(".plan-goals__row")).toHaveCount(2);
    await expect(
      goals.getByRole("checkbox", { name: "Bodrum duvarları bitsin — tamamlandı işareti" }),
    ).toBeChecked();
    await expect(
      goals.getByRole("combobox", { name: "Bodrum duvarları bitsin — hedef durumu" }),
    ).toHaveValue("waiting");
    await expect(
      goals.getByRole("combobox", { name: "İzolasyon kontrolü — hedef durumu" }),
    ).toHaveValue("in_progress");
  });

  test("sprint düzenlenir; BOŞ ad aktif sprinti kapatır (null yanıt hata değildir)", async ({
    page,
  }) => {
    await login(page);
    await page.goto(MUTATION_URL);
    await expect(sprintLabel(page)).toHaveText(
      "Aktif Sprint: Sprint 4 · Bodrum Kabası",
    );

    // --- Yeniden adlandırma
    await page.getByRole("button", { name: "Aktif sprinti düzenle" }).click();
    const sprintPopover = page.getByRole("dialog", { name: "Aktif sprinti düzenle" });
    await sprintPopover.getByLabel("Sprint adı").fill("Sprint 5 · Zemin Kat");
    await sprintPopover.getByRole("button", { name: "Uygula" }).click();
    await saveAndExpect(page, "Aktif sprint: kaydedildi");

    await page.reload();
    await expect(sprintLabel(page)).toHaveText(
      "Aktif Sprint: Sprint 5 · Zemin Kat",
    );

    // --- Boşaltma: uç `null` döner, bu bir HATA DEĞİLDİR.
    await page.getByRole("button", { name: "Aktif sprinti düzenle" }).click();
    await page
      .getByRole("dialog", { name: "Aktif sprinti düzenle" })
      .getByLabel("Sprint adı")
      .fill("");
    await page
      .getByRole("dialog", { name: "Aktif sprinti düzenle" })
      .getByRole("button", { name: "Uygula" })
      .click();
    await saveAndExpect(page, "Aktif sprint: kaydedildi");

    await page.reload();
    // Ad boşken "Aktif Sprint:" etiketi HİÇ basılmaz (boş bilgi uydurulmaz).
    await expect(sprintLabel(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Aktif sprinti düzenle" })).toBeVisible();
  });

  // T5 · satır ekleme popover'ı BÖLÜM seçtirir; grubun bölümünü devralmaz.
  // NOT: s-2'nin bölüm listesi başka spec'lerin oluşturduğu bölümlerle
  // değişebilir (mock backend TEK paylaşılan sunucudur), bu yüzden burada
  // sayıya değil YAPIYA bakılır: "Bölümsüz" her zaman ilk seçenektir.
  test("satır ekleme formunda bölüm seçicisi bulunur", async ({ page }) => {
    await login(page);
    await page.goto(MUTATION_URL);
    await crewGroup(page).getByRole("button", { name: "+ Satır" }).click();

    const addPopover = page.getByRole("dialog", { name: "Yeni plan satırı" });
    await expect(addPopover.getByLabel("Bölüm")).toBeEnabled();
    await expect(addPopover.getByLabel("Bölüm").locator("option").first()).toHaveText("Bölümsüz");
    await expect(addPopover.getByLabel("Bölüm")).toHaveValue("");

    // Tür "Makine / Ekipman" → bölüm alanı kapanır (backend: ekipmanın bölümü olamaz).
    await addPopover.getByLabel("Tür").selectOption("equipment");
    await expect(addPopover.getByLabel("Bölüm")).toBeDisabled();
    await addPopover.getByRole("button", { name: "Vazgeç" }).click();
    await expect(addPopover).toHaveCount(0);
  });

  // T5 · başlığı boş hedef ESKİDEN gövdeden sessizce eleniyordu ("kaydedildi"
  // yazıp hedef kaybolurdu). Artık kaydetme HİÇ başlamaz.
  //
  // 🔒 F-TB3 T4: kadraja giren hedefler `ISOLATED_GOAL_WEEK`e taşındı (yukarıdaki
  // gerekçe). Ayrıca "önceki sayı" artık `count()` ile ÖLÇÜLMEZ — `count()`
  // yeniden denemeyen ANLIK bir sorgudur ve ızgara istemci tarafında (react-query)
  // dolduğu için `goto`nun hemen ardından 0 döndürebiliyordu; sayı beklenen
  // SABİTLE (`toHaveCount`) iddia edilir.
  test("başlığı boş hedefte kaydetme başlamaz, görünür gerekçe basılır", async ({ page }) => {
    await login(page);
    await page.goto(ISOLATED_GOAL_URL);
    await expect(weekLabel(page)).toHaveText("17 – 23 Ağustos 2026");
    const goals = goalsCard(page);
    // İzole hafta fikstür taşımaz ve başka hiçbir test yazmaz → sayı SABİT 0.
    await expect(goals.locator(".plan-goals__row")).toHaveCount(0);

    // Bu testin SAHİBİ olduğu tek hedef: "sunucuya gitmedi" iddiası boş küme
    // üzerinde değil, GERÇEK bir kayıt üzerinde doğrulanır (eskiden bu rolü
    // başka testlerin bıraktığı kayıtlar üstleniyordu — yarışın kaynağı).
    await page.getByRole("button", { name: "+ Hedef" }).click();
    await goals.getByRole("textbox", { name: "Yeni hedef — hedef başlığı" }).fill("İzole hedef");
    await saveAndExpect(page, "Haftalık hedefler: kaydedildi");
    await page.reload();
    await expect(goals.locator(".plan-goals__row")).toHaveCount(1);

    // --- Asıl iddia: başlığı boş hedefle kaydetme HİÇ başlamaz.
    await page.getByRole("button", { name: "+ Hedef" }).click();
    await page.getByRole("button", { name: "Kaydet" }).click();

    const status = saveStatus(page);
    await expect(status).toContainText("Başlığı boş bir hedef var.");
    await expect(status).not.toContainText("kaydedildi");

    // Sunucuya hiçbir şey gitmedi: yeniden yükleme eski hâli getirir — boş
    // hedef YAZILMADI ve mevcut hedef de gövdeden ELENMEDİ.
    await page.reload();
    await expect(goals.locator(".plan-goals__row")).toHaveCount(1);
    await expect(
      goals.getByRole("combobox", { name: "İzole hedef — hedef durumu" }),
    ).toHaveValue("waiting");
  });
});
