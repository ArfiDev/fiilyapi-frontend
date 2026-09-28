import { test, expect } from "@playwright/test";

import { APPROVALS_URL, WRITE_TARGET_TITLE, login, openApprovals } from "./onay-kutusu-helpers";

// F-OK T5 · `/onay-kutusu` FONKSİYONEL e2e'si — görsel spec
// `onay-kutusu-visual.spec.ts`tedir (dosya/test adında "gorsel" GEÇMEZ ki
// beşinci kapıda koşsun).
//
// Kapsam: kabuk sidebar girişi (ComingSoon DEĞİL) · devre-dışı sekmeler ve
// görünür gerekçeleri · devre-dışı "Tümünü Onayla" · rotası olmayan "Detay" ·
// ret modalının ZORUNLU gerekçe kapısı · onay sonrası listenin TAZELENMESİ.
//
// 🔒 YAZMA ALANI DİSİPLİNİ: bu dosyanın MUTASYONA UĞRATTIĞI tek kayıt
// `scpp-8`dir (`mock-backend.ts`te `hiddenFromLists: true`, sözleşme `sc-3`) —
// liste/özet uçlarından tamamen dışlanır, dolayısıyla hiçbir görsel spec onu
// görmez. Listedeki öbür üç kalem (`scpp-3` · `pr-2` · `pp-5`) BAŞKA
// spec'lerin sabit kayıtlarıdır: OKUNUR, MUTASYONA UĞRATILMAZ.
//
// ⚠️ `getByRole("alert")` KULLANILMAZ (F-P6 dersi): akış-SSR ikinci bir kopya
// bastığında `alert` rolü çift eşleşir ve test YALNIZ Linux CI'da patlar.
//
// Zamanlayıcıya dayalı bekleme YOK — her adım `expect(...)`in kendi
// deterministik yeniden denemesiyle bekler.

test("kabuk sidebar'ındaki 'Onay Kutusu' gerçek ekranı açar (ComingSoon DEĞİL)", async ({
  page,
}) => {
  await login(page);

  await page.getByRole("navigation").getByRole("link", { name: "Onay Kutusu" }).first().click();

  await expect(page).toHaveURL(/\/onay-kutusu$/);
  await expect(page.getByRole("heading", { level: 1, name: "Onay Kutusu" })).toBeVisible();
  // 🔴 Bu dilimin ÖZÜ: rota artık catch-all ComingSoon'a DÜŞMEZ.
  await expect(page.getByText("Bu modül yakında eklenecek.")).toHaveCount(0);
  await expect(page.getByTestId("ok-flow")).toBeVisible();
});

test("üç evrak tipinin üçü de kendi rozeti/tutar kutularıyla listelenir", async ({ page }) => {
  await login(page);
  await openApprovals(page);

  // 🔴 MUTLAK SAYI İDDİA EDİLMEZ: `fullyParallel` altında mutasyon testi
  // yazma hedefini (`scpp-8`) geçici olarak kümeden düşürür. Okuma testleri
  // KİMLİKLE eşleşir; sayıya bağlanan bir iddia sıraya göre kırmızı olurdu.
  const cards = page.getByTestId("ok-card");

  // Taşeron hakediş — İKİ tutar kutusu (Brüt · Net).
  const subcontractor = cards.filter({ hasText: "Akın İnşaat" });
  await expect(subcontractor.getByTestId("ok-card-type")).toHaveText("HAKEDİŞ");
  await expect(subcontractor.getByTestId("ok-card-gross")).toContainText("₺1.240.000");
  await expect(subcontractor.getByTestId("ok-card-net")).toContainText("₺1.016.800");

  // Satınalma — TEK kutu (`net_amount` HER ZAMAN null) + fiyatsız kalem düşüşü.
  const purchase = cards.filter({ hasText: "SATIN ALMA" });
  await expect(purchase.getByTestId("ok-card-net")).toHaveCount(0);
  await expect(purchase.getByTestId("ok-card-gross")).toContainText("—");

  // İşveren hakediş — mor rozet, patron adımı YOK ⇒ eşik rozeti de yok.
  const employer = cards.filter({ hasText: "İŞVEREN HAKEDİŞ" });
  await expect(employer.getByTestId("ok-card-threshold")).toHaveCount(0);
  await expect(employer.getByTestId("ok-card-net")).toContainText("₺1.674.570");
});

test("eşik İKİ yerde de AYNI kaynaktan gelir (rol akışı şeridi + kart rozeti)", async ({
  page,
}) => {
  await login(page);
  await openApprovals(page);

  // :62 patron kartı + :65 sağa yaslı pill — ikisi de `GET /approvals/settings`ten.
  await expect(page.getByTestId("ok-flow")).toContainText("Final onay > ₺500.000");
  await expect(page.getByTestId("ok-flow-pill")).toHaveText(
    "₺500.000 altı için PM + Muhasebe yeterli",
  );

  // :158 rozet kalemin KENDİ donmuş eşiğinden; iki sayı ayrışırsa ekran
  // kendini yalanlardı.
  await expect(
    page.getByTestId("ok-card").filter({ hasText: "Akın İnşaat" }).getByTestId("ok-card-threshold"),
  ).toHaveText(">₺500.000 — Patron Gerekli");
});

test("dönem alt başlıkta Türkçeleştirilir (backend `MM/YYYY` gömer)", async ({ page }) => {
  await login(page);
  await openApprovals(page);

  await expect(
    page.locator("main").getByText("Güneşkent A-Blok · Kat 6–8 · Temmuz 2026"),
  ).toBeVisible();
});

test("ÜÇ sekme devre dışıdır, SAYI BASMAZ ve gerekçesi GÖRÜNÜR", async ({ page }) => {
  await login(page);
  await openApprovals(page);

  // Sayı SUNUCUNUN `total`inden gelir; burada RENDER EDİLEN kart sayısıyla
  // karşılaştırılır — mutlak sabit yerine gerçek bir DEĞİŞMEZ (kırpma yokken
  // `total === items.length`). Mutasyon testinin sırasından bağımsızdır.
  const renderedCards = await page.getByTestId("ok-card").count();
  await expect(page.getByTestId("ok-tab-benim")).toHaveText(`Benim Onayım (${renderedCards})`);
  for (const key of ["tumu", "onaylanan", "reddedilen"]) {
    const tab = page.getByTestId(`ok-tab-${key}`);
    await expect(tab).toHaveAttribute("aria-disabled", "true");
    // 🔴 Mockup'ın `(7)`/`(12)`/`(2)` rakamları ÇİZİM VERİSİDİR.
    await expect(tab).not.toContainText(/\d/);
  }
  await expect(page.getByTestId("ok-tabs-reason")).toHaveText(
    "Karar verilmiş ve başkasına düşen onaylar henüz listelenmiyor.",
  );
});

test("'Tümünü Onayla' devre dışıdır ve gerekçesi GÖRÜNÜR", async ({ page }) => {
  await login(page);
  await openApprovals(page);

  await expect(page.getByTestId("ok-bulk-approve")).toBeDisabled();
  await expect(page.getByTestId("ok-bulk-reason")).toHaveText(
    "Toplu onay henüz desteklenmiyor; her kalem kendi kartından onaylanır.",
  );
});

test("'Detay' rotası olan tipte bağlantı, OLMAYAN tipte devre-dışı + gerekçelidir", async ({
  page,
}) => {
  await login(page);
  await openApprovals(page);

  const cards = page.getByTestId("ok-card");

  // 🔴 Rota bekçisi `href` DENETLER — ölü/uydurma bağlantı basılmaz.
  await expect(
    cards.filter({ hasText: "Akın İnşaat" }).getByTestId("ok-card-detail"),
  ).toHaveAttribute("href", "/hakedisler/taseron/scpp-3");
  await expect(
    cards.filter({ hasText: "İŞVEREN HAKEDİŞ" }).getByTestId("ok-card-detail"),
  ).toHaveAttribute("href", "/hakedisler/pp-5");

  // Satınalma talebinin DETAY rotası YOKTUR (`/satinalma/talepler/{id}` yok).
  const purchase = cards.filter({ hasText: "SATIN ALMA" });
  await expect(purchase.getByTestId("ok-card-detail")).toBeDisabled();
  await expect(purchase.getByTestId("ok-card-reason")).toHaveText(
    "Satın alma talebinin detay ekranı henüz yazılmadı.",
  );
  // Teklif karşılaştırma çipinin rotası ise VARDIR.
  await expect(purchase.getByTestId("ok-card-chip")).toHaveAttribute(
    "href",
    "/satinalma/talepler/pr-2/teklifler",
  );
});

// 🔴 TEK MUTASYON TESTİ — ret kapısı VE onay tazelemesi AYNI testtedir.
//
// Gerekçe ölçümdür: `playwright.config.ts` `fullyParallel`dır ve iki ayrı test
// aynı `scpp-8` kaydına yazsaydı sıraya bağlı YARIŞ doğardı (biri reddeder,
// öbürü "onaylanacak kalem yok" bulur). Tek testte akış SIRALIDIR.
//
// ⚠️ KAPSAM SINIRI, AÇIKÇA: bir `<button disabled>` tarayıcıda `click` OLAYI
// ÜRETMEZ, bu yüzden buradaki "istek atılmadı" iddiası kapının GÖRÜNÜR
// yüzünü ölçer. Kapının DAVRANIŞSAL bekçisi birim testtedir
// (`ApprovalsView.test.tsx` — `disabled` bağı kaldırılınca KIRMIZI olduğu
// mutasyonla kanıtlandı) ve asıl bekçi TİPTİR: `mutateAsync`
// `ApprovalRejectInput` ister, koruma cümlesi silinirse `pnpm typecheck` kırar.
test("ret kapısı boş gerekçeyi geçirmez; onay sonrası liste TAZELENİR", async ({ page }) => {
  await login(page);
  await openApprovals(page);

  const decisionRequests: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (request.method() === "POST" && (url.includes("/reject") || url.includes("/approve"))) {
      decisionRequests.push(url);
    }
  });

  const target = page.getByTestId("ok-card").filter({ hasText: WRITE_TARGET_TITLE });
  await expect(target).toHaveCount(1);
  const before = await page.getByTestId("ok-card").count();

  // 1) Ret diyaloğu — gerekçe boşken gönderilemez.
  await target.getByTestId("ok-card-reject").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const submit = dialog.getByTestId("ok-reject-submit");

  // SIRA ÖNEMLİ: önce ÇAĞRI SAYACI, sonra `toBeDisabled()`. Ters yazılsaydı
  // kusur geri geldiğinde test disabled satırında düşer ve asıl ölçü —
  // isteğin ATILMAMASI — hiç koşmazdı (b97eaa8'de bulunan sahte-yeşil).
  expect(decisionRequests).toHaveLength(0);
  await expect(submit).toBeDisabled();
  await expect(dialog.getByTestId("ok-reject-required")).toBeVisible();

  // "   " ÜÇ karakterdir: `!== ""` ile kurulmuş bir kapı bunu GEÇİRİRDİ.
  await dialog.getByTestId("ok-reject-reason").fill("   ");
  expect(decisionRequests).toHaveLength(0);
  await expect(submit).toBeDisabled();

  // Dolu gerekçede düğme AÇILIR — kapının POZİTİF kontrolü. Hep-kapalı bir
  // düğme yukarıdaki iki iddiayı da anlamsız kılardı (sahte bekçi).
  await dialog.getByTestId("ok-reject-reason").fill("eksik metraj");
  await expect(submit).toBeEnabled();

  await dialog.getByRole("button", { name: "Vazgeç" }).click();
  await expect(dialog).toHaveCount(0);
  expect(decisionRequests).toHaveLength(0);

  // 2) Onay — kalem sunucudan DÜŞER, liste tazelenir. Mockup'ın "satırı
  //    DOM'dan sil" animasyonu (`:110`) TAKLİT EDİLMEZ: kaynak sunucudur,
  //    istemcinin sildiği satır değil.
  await target.getByTestId("ok-card-approve").click();

  await expect(page.getByText(WRITE_TARGET_TITLE)).toHaveCount(0);
  await expect(page.getByTestId("ok-card")).toHaveCount(before - 1);
  await expect(page.getByTestId("ok-pending-count")).toHaveText(`${before - 1} bekleyen`);
  expect(decisionRequests).toHaveLength(1);
  expect(decisionRequests[0]).toContain("/subcontractor-progress-payments/scpp-8/approve");

  // 🔒 DURUMU GERİ AL — paylaşılan mock state'i bu test KENDİ ARKASINDAN
  // TEMİZLER. Aksi hâlde `scpp-8` kalıcı olarak `approved` kalır ve testin
  // ikinci koşusu (retry / yerel tekrar) ön koşulunu kuramazdı.
  // BFF üzerinden gidilir: kimlik httpOnly çerezden enjekte edilir.
  const restore = await page.request.post(
    "/api/backend/subcontractor-progress-payments/scpp-8/unapprove",
  );
  expect(restore.ok()).toBe(true);
});
