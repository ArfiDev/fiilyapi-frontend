import { test, expect, type Page } from "@playwright/test";

import {
  ACCOUNTING_URL,
  ACCOUNTING_WRITE_TIME,
  loginAt,
  openAccounting,
  openChartOfAccounts,
} from "./accounting-helpers";
import { withSystemAdmin } from "./with-system-admin";

// F-MU1 T5 · Muhasebe DİYALOGLARININ fonksiyonel e2e'si (T4 yüzeyleri).
//
// 🔒 FİKSTÜR İZOLASYONU — iki ayrı mekanizma, ikisi de YAPISAL:
//
//   1. **Fiş yazma → AYRI AY.** Defter/özet/fiş uçlarının hepsi DÖNEM
//      süzgeçlidir. Bu dosyanın mutasyon akışları HAZİRAN 2026'da koşar;
//      T6'nın kadrajı TEMMUZ 2026'dadır. `fullyParallel` altında sıra garanti
//      olmasa bile Haziran'daki hiçbir kayıt Temmuz'a sızamaz.
//      Ayrıca her akış KENDİ kaydını oynatır (`je-2606-mut-*`) — tek bir
//      "mutasyon fişi" paylaşılsaydı iki test aynı durumu yarıştırırdı
//      (F-FAT2'nin ÖLÇÜLMÜŞ `inv-in-2` yarışı).
//
//   2. **Hesap yazma → LİSTEDEN DÜŞÜRME.** Hesap planının dönem süzgeci
//      YOKTUR, dolayısıyla "ayrı ay" kaçışı burada mümkün değildir. Mock
//      backend e2e'de OLUŞTURULAN hesabı süzgeçsiz listeden düşürür
//      (`dropCreatedSuppliers`/`hiddenFromLists` emsali) ama kayıt VARDIR ve
//      `q` araması onu BULUR — yaratma yine uçtan uca kanıtlanır.
//
// ⚠️ `getByRole("alert")` KULLANILMAZ (F-P6 dersi).

/** Haziran'a (mutasyon adası) çakılmış `/muhasebe`. */
async function openMutationMonth(page: Page) {
  await loginAt(page, ACCOUNTING_WRITE_TIME);
  await page.goto(ACCOUNTING_URL);
  await expect(page.getByTestId("mu-loaded-drafts")).toBeAttached();
  await expect(page.getByTestId("mu-period-label")).toHaveText("Haziran 2026");
}

test.describe("yevmiye fişi diyaloğu — denge kapısı", () => {
  /**
   * 🔴 DENGE KAPISI UÇTAN UCA: dengesiz fişte Kaydet KAPALI, engel cümlesi
   * EKRANDA; dengelenince Kaydet AÇILIR. Sunucunun 422'si SON ÇAREdir —
   * kullanıcı hangi tarafın eksik olduğunu yazarken görmelidir.
   */
  test("dengesiz satırlarda Kaydet kapalı, dengeleyince açılır", async ({ page }) => {
    await openAccounting(page);
    await page.getByTestId("mu-create-entry").click();

    const save = page.getByTestId("mu-entry-dialog-save");
    // Boş formda zaten kapalıdır (tarih hariç her şey eksik).
    await expect(save).toBeDisabled();

    await page.getByTestId("mu-entry-description").fill("Denge kapısı ölçümü");
    await page.getByTestId("mu-line-account-0").selectOption("coa-100");
    await page.getByTestId("mu-line-account-1").selectOption("coa-600");
    await page.getByTestId("mu-line-debit-0").fill("1000");
    await page.getByTestId("mu-line-credit-1").fill("400");

    // Dengesiz: şerit "dengede değil" der, engel listesi görünür, Kaydet KAPALI.
    await expect(page.getByTestId("mu-balance-strip")).toBeVisible();
    // İDDİA TAŞINDI (F-MUF T4): mockup `M:200-201` başlığı ve gerekçeyi AYRI
    // iki satıra böler; tek cümle artık iki `data-testid`dedir.
    await expect(page.getByTestId("mu-balance-state")).toHaveText("Fiş dengede değil");
    await expect(page.getByTestId("mu-balance-state-detail")).toHaveText(
      "Borç ve alacak toplamları eşit olmadan kaydedilemez",
    );
    await expect(page.getByTestId("mu-balance-difference")).toHaveText("600");
    await expect(page.getByTestId("mu-entry-dialog-blockers")).toContainText(
      "Fiş dengede değil: borç ve alacak toplamları eşit olmalıdır",
    );
    await expect(save).toBeDisabled();

    // Dengele → kapı AÇILIR ve engel listesi kaybolur.
    await page.getByTestId("mu-line-credit-1").fill("1000");
    await expect(page.getByTestId("mu-balance-state")).toHaveText("Fiş dengede");
    await expect(page.getByTestId("mu-balance-state-detail")).toHaveText("Kaydedilmeye hazır");
    await expect(page.getByTestId("mu-balance-difference")).toHaveText("0");
    await expect(page.getByTestId("mu-entry-dialog-blockers")).toHaveCount(0);
    await expect(save).toBeEnabled();
  });

  /**
   * 🔴 TEK TARAF (`ck_journal_lines_single_side`): bir bacakta hem borç hem
   * alacak dolamaz — bir tarafa değer girilince ÖTEKİ KİLİTLENİR.
   */
  test("aynı satırda borç girilince alacak kutusu kilitlenir (ve tersi)", async ({ page }) => {
    await openAccounting(page);
    await page.getByTestId("mu-create-entry").click();

    const debit = page.getByTestId("mu-line-debit-0");
    const credit = page.getByTestId("mu-line-credit-0");
    await expect(debit).toBeEnabled();
    await expect(credit).toBeEnabled();

    await debit.fill("500");
    await expect(credit).toBeDisabled();

    // Borç boşalınca kilit AÇILIR; alacak yazılınca bu kez borç kilitlenir.
    await debit.fill("");
    await expect(credit).toBeEnabled();
    await credit.fill("750");
    await expect(debit).toBeDisabled();
  });

  /** Satır sayısı engeli: iki bacaktan azı SUNUCUDA 422'dir, kapı ÖNCE kapanır. */
  test("tek satırlı fişte 'en az iki satır' engeli basılır", async ({ page }) => {
    await openAccounting(page);
    await page.getByTestId("mu-create-entry").click();

    await page.getByTestId("mu-line-remove-1").click();
    await expect(page.getByTestId("mu-entry-dialog-blockers")).toContainText(
      "Fişte en az iki satır olmalıdır",
    );
    await expect(page.getByTestId("mu-entry-dialog-save")).toBeDisabled();
  });

  /**
   * 🔴 HESAPLANMIŞ SONUÇ BEKÇİSİ — F-FISNO'da doğan sınıfı KAPATIR.
   *
   * KÖK OLAY: `accounting.css` aylardır `.mu-modal { width: min(760px, 92vw) }`
   * yazıyordu ve `accounting.css.test.ts` o bildirimin METİNDE var olduğunu
   * doğruluyordu — test hep yeşildi. Ama bildirim ATILDI: `.modal`
   * (`settings/modal.css`) `width:100%` + **`max-width:480px`** verir ve
   * `max-width` kaskadı KAZANIR. Diyalog 480px'te kırpılıyordu; ölçülen iç
   * genişlik 478px'ti. Sonuç: `M:88`in `170px 1fr 170px` ızgarası `Açıklama`ya
   * yalnız 70px bırakıyor, ipucu 6 satıra sarıyor, gövde 66px kayıyordu.
   *
   * 🔑 KANON: **bir kuralın DOSYADA YAZILI olması, KASKADI KAZANDIĞI anlamına
   * gelmez.** Metin taraması bir CSS kuralının ETKİSİNİ bekçileyemez. Bu yüzden
   * bu bekçi TARAYICIDA ÖLÇER: `max-width` ezmesi geri alınırsa genişlik 480'e
   * düşer ve bu test KIRILIR (metin taraması kırılmazdı).
   *
   * Beklenen değer ELLE yazıldı, üretim ifadesinden türetilmedi: viewport 1280
   * (playwright.config) ⇒ `min(760px, 92vw)` = `min(760, 1177.6)` = **760**.
   * `box-sizing: border-box` (globals.css) ⇒ `boundingBox` kenarlık dahil 760.
   */
  test("fiş diyaloğu TARAYICIDA 760px'tir — 480px kabuk ezmesi GERÇEKTEN yürürlükte", async ({
    page,
  }) => {
    await openAccounting(page);
    await page.getByTestId("mu-create-entry").click();

    const dialog = page.getByRole("dialog", { name: "Yeni Yevmiye Fişi" });
    await expect(dialog).toBeVisible();

    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect(Math.round(box!.width)).toBe(760);

    // Varsayılan kabuğun 480px'ine DÜŞMEDİĞİ ayrıca ve AÇIKÇA iddia edilir:
    // `max-width` ezmesi silinirse ölçülen genişlik tam olarak buraya düşer.
    expect(Math.round(box!.width)).not.toBe(480);

    // Hesaplanmış `max-width` de 760px'tir — `.modal`ın 480px'i EZİLMİŞTİR.
    const computedMaxWidth = await dialog.evaluate(
      (el) => getComputedStyle(el).maxWidth,
    );
    expect(computedMaxWidth).toBe("760px");
  });
});

test.describe("yevmiye fişi diyaloğu — yazma akışları (HAZİRAN adası)", () => {
  test("dengeli fiş KAYDEDİLİR ve dönem panelinde taslak olarak görünür", async ({ page }) => {
    await openMutationMonth(page);
    await page.getByTestId("mu-create-entry").click();

    await page.getByTestId("mu-entry-date").fill("18.06.2026");
    await page.getByTestId("mu-entry-description").fill("MUT · yeni fiş uçtan uca");
    await page.getByTestId("mu-entry-detail-note").fill("T5 ölçüm dayanağı");
    await page.getByTestId("mu-line-account-0").selectOption("coa-100");
    await page.getByTestId("mu-line-debit-0").fill("7500");
    await page.getByTestId("mu-line-account-1").selectOption("coa-600");
    await page.getByTestId("mu-line-credit-1").fill("7500");

    await page.getByTestId("mu-entry-dialog-save").click();

    // Diyalog KAPANIR (hata kalsaydı açık kalırdı) ve satır listeye düşer.
    await expect(page.getByTestId("mu-entry-dialog-save")).toHaveCount(0);
    const panel = page.getByRole("region", { name: "Dönem Fişleri" });
    await expect(panel.getByText("MUT · yeni fiş uçtan uca")).toBeVisible();
    await expect(panel.getByText("T5 ölçüm dayanağı")).toBeVisible();
  });

  test("taslak KAYITLAŞTIRILIR: rozet 'Kayıtlı' olur, eylemler Storno'ya döner", async ({
    page,
  }) => {
    await openMutationMonth(page);

    const row = page.getByTestId("mu-draft-row-je-2606-mut-post");
    await expect(row).toContainText("Taslak");

    await page.getByTestId("mu-draft-post-je-2606-mut-post").click();

    await expect(row).toContainText("Kayıtlı");
    // Yönetim kararı 2 — geçişten SONRA da geçerlidir.
    await expect(page.getByTestId("mu-draft-edit-je-2606-mut-post")).toHaveCount(0);
    await expect(page.getByTestId("mu-draft-delete-je-2606-mut-post")).toHaveCount(0);
    await expect(page.getByTestId("mu-draft-reverse-je-2606-mut-post")).toBeVisible();
  });

  test("taslak SİLİNİR ve satır listeden düşer", async ({ page }) => {
    await withSystemAdmin(page); // IZN-F6d: taslak silme `need: "sa"` — mock patron SA değil.
    await openMutationMonth(page);

    await expect(page.getByTestId("mu-draft-row-je-2606-mut-delete")).toBeVisible();
    await page.getByTestId("mu-draft-delete-je-2606-mut-delete").click();
    // SIL-F2.2 — silme ortak onay penceresinden (önizleme + token) geçer.
    const dialog = page.getByRole("dialog", { name: "Muhasebe fişi silinsin mi?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Sil", exact: true }).click();
    await expect(page.getByTestId("mu-draft-row-je-2606-mut-delete")).toHaveCount(0);
  });

  /**
   * 🔴 STORNO YENİ BİR FİŞTİR (alan ya da bayrak değil): orijinal `reversed`
   * damgalanır, ters bacaklı kopya `posted` doğar. `reversed` TERMİNALDİR.
   */
  test("posted fiş STORNOLANIR: orijinal 'Ters Kayıtlı' olur, storno fişi doğar", async ({
    page,
  }) => {
    await openMutationMonth(page);

    const original = page.getByTestId("mu-draft-row-je-2606-mut-reverse");
    await expect(original).toContainText("Kayıtlı");
    // Storno ÖNCESİ: düzenle/sil sunulmaz, Storno sunulur.
    await expect(page.getByTestId("mu-draft-edit-je-2606-mut-reverse")).toHaveCount(0);
    await expect(page.getByTestId("mu-draft-delete-je-2606-mut-reverse")).toHaveCount(0);

    await page.getByTestId("mu-draft-reverse-je-2606-mut-reverse").click();

    await expect(original).toContainText("Ters Kayıtlı");
    // `reversed` uçtur: hiçbir eylem kalmaz.
    await expect(page.getByTestId("mu-draft-reverse-je-2606-mut-reverse")).toHaveCount(0);
    // Storno fişinin KENDİSİ listeye düşer.
    const panel = page.getByRole("region", { name: "Dönem Fişleri" });
    await expect(panel.getByText("Storno: MUT · storno ölçümü")).toBeVisible();
  });

  test("taslak DÜZENLENİR: diyalog sunucudaki bacakları yükler, değişiklik yazılır", async ({
    page,
  }) => {
    await openMutationMonth(page);

    await page.getByTestId("mu-draft-edit-je-2606-mut-edit").click();

    // Bacaklar LİSTE ucundan gelemez (o yalnız başlık döner) → detay çekilir.
    await expect(page.getByTestId("mu-entry-description")).toHaveValue("MUT · düzenleme ölçümü");
    await expect(page.getByTestId("mu-line-debit-0")).toHaveValue("3000.00");
    await expect(page.getByTestId("mu-entry-detail-note")).toHaveValue("İlk dayanak");
    // 🔴 `entry_no` SUNUCUDAN gelir ve salt-okunur basılır (F-FISNO). Beklenen
    // dize ELLE yazıldı: `je-2606-mut-edit` tohumu `seq: 3` + `date: "2026-06-12"`
    // ⇒ `YEV-{yıl}-{sıra:04d}`. Üretim ifadesinden KOPYALANMADI.
    await expect(page.getByTestId("mu-entry-no")).toHaveValue("YEV-2026-0003");

    await page.getByTestId("mu-entry-description").fill("MUT · düzenleme ölçümü (güncel)");
    await page.getByTestId("mu-line-debit-0").fill("3300");
    await page.getByTestId("mu-line-credit-1").fill("3300");
    await expect(page.getByTestId("mu-entry-dialog-save")).toBeEnabled();
    await page.getByTestId("mu-entry-dialog-save").click();

    await expect(page.getByTestId("mu-entry-dialog-save")).toHaveCount(0);
    const row = page.getByTestId("mu-draft-row-je-2606-mut-edit");
    await expect(row).toContainText("MUT · düzenleme ölçümü (güncel)");
    // 🔴 Toplamlar SUNUCUDA türer (K1) — istemci yazmaz.
    await expect(row).toContainText("3.300");
  });
});

test.describe("hesap ekle diyaloğu", () => {
  /**
   * 🔴 İstemci kodu doğrulaması bir KOLAYLIKTIR (sunucu son sözü söyler) ama
   * kapı gerçekten kapanmalıdır: `1` (tek hane), `0A` (harf + sıfır hane),
   * `1234` (dört hane) — üçü de `ACCOUNT_CODE_PATTERN` dışıdır.
   */
  for (const invalid of ["1", "0A", "1234"]) {
    test(`geçersiz kod "${invalid}" istemcide engellenir`, async ({ page }) => {
      await openChartOfAccounts(page);
      await page.getByTestId("hp-create").click();

      await page.getByTestId("hp-dialog-code").fill(invalid);
      await page.getByTestId("hp-dialog-name").fill("Ölçüm Hesabı");

      await expect(page.getByTestId("hp-dialog-blockers")).toContainText(
        "Hesap kodu 10 · 100 ya da 100.01 biçiminde olmalıdır",
      );
      await expect(page.getByTestId("hp-dialog-save")).toBeDisabled();
    });
  }

  /**
   * 🔴 TARAYICIDA ÖLÇEN BEKÇİ — `accounting.css.test.ts`in metin taraması bunu
   * YAPAMAZ. Emsal ve gerekçe: aynı dosyadaki fiş diyaloğu bekçisi (`:137`).
   *
   * `.mu-modal--account` YALNIZ `width` bildiriyordu; `max-width` YOKTU ve
   * `settings/modal.css` `.modal { max-width: 480px }` kaskadı KAZANIYORDU
   * (iki seçici de tek sınıf ⇒ eşit özgüllük ⇒ demet sırası karar verir).
   * Ölçülen sonuç: diyalog 480px basıyordu, mockup `M:57` 560px istiyor.
   *
   * Beklenen değer ELLE yazıldı, üretim ifadesinden türetilmedi: viewport 1280
   * (playwright.config) ⇒ `min(560px, 92vw)` = `min(560, 1177.6)` = **560**.
   * `box-sizing: border-box` (globals.css) ⇒ `boundingBox` kenarlık dahil 560.
   */
  test("hesap diyaloğu TARAYICIDA 560px'tir — 480px kabuk ezmesi GERÇEKTEN yürürlükte", async ({
    page,
  }) => {
    await openChartOfAccounts(page);
    await page.getByTestId("hp-create").click();

    const dialog = page.getByRole("dialog", { name: "Yeni Hesap Ekle" });
    await expect(dialog).toBeVisible();

    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect(Math.round(box!.width)).toBe(560);

    // Varsayılan kabuğun 480px'ine DÜŞMEDİĞİ ayrıca ve AÇIKÇA iddia edilir:
    // `max-width` ezmesi silinirse ölçülen genişlik tam olarak buraya düşer.
    expect(Math.round(box!.width)).not.toBe(480);

    // Hesaplanmış `max-width` de 560px'tir — `.modal`ın 480px'i EZİLMİŞTİR.
    const computedMaxWidth = await dialog.evaluate((el) => getComputedStyle(el).maxWidth);
    expect(computedMaxWidth).toBe("560px");
  });

  test("geçerli kod KAYDEDİLİR; kayıt aramayla bulunur", async ({ page }) => {
    await openChartOfAccounts(page);
    await page.getByTestId("hp-create").click();

    await page.getByTestId("hp-dialog-code").fill("189.07");
    await page.getByTestId("hp-dialog-name").fill("T5 Ölçüm Hesabı");
    await page.getByTestId("hp-dialog-type").selectOption("asset");
    await expect(page.getByTestId("hp-dialog-save")).toBeEnabled();

    await page.getByTestId("hp-dialog-save").click();
    // Diyalog KAPANIR — sunucu hatası olsaydı açık kalır ve `hp-dialog-error` basardı.
    await expect(page.getByTestId("hp-dialog-save")).toHaveCount(0);
    await expect(page.getByTestId("hp-dialog-error")).toHaveCount(0);

    // 🔒 Kayıt süzgeçsiz listede GÖRÜNMEZ (T6 izolasyonu) ama VARDIR:
    // arama onu bulur — yaratma böylece uçtan uca kanıtlanır.
    await page.getByTestId("hp-search").fill("T5 Ölçüm Hesabı");
    await expect(page.getByTestId("hp-row-189.07")).toBeVisible();
    // Türev alanlar SUNUCUDAN gelir: `189.07` → sınıf `1`, düzey `3`.
    await expect(page.getByTestId("hp-type-189.07")).toHaveText("Aktif");
  });

  test("aynı kod ikinci kez açılamaz: sunucunun 409'u EKRANA basılır", async ({ page }) => {
    await openChartOfAccounts(page);
    await page.getByTestId("hp-create").click();

    // `100 Kasa` fikstürde VARDIR — çakışma sunucudadır, istemci engeli değil.
    await page.getByTestId("hp-dialog-code").fill("100");
    await page.getByTestId("hp-dialog-name").fill("Çakışan Kasa");
    await page.getByTestId("hp-dialog-save").click();

    // 🔴 Diyalog AÇIK kalır ve sunucunun Türkçe `detail` metni basılır.
    await expect(page.getByTestId("hp-dialog-error")).toContainText(
      "Bu hesap kodu zaten kullanılıyor.",
    );
    await expect(page.getByTestId("hp-dialog-save")).toBeVisible();
  });
});

test.describe("hesap planı yazma sözleşmesi (durum DEĞİŞTİRMEYEN gövdeler)", () => {
  /**
   * 🔒 Bu blok EKRANDAN değil TELDEN koşar: `Pasifleştir`/`Sil` düğmeleri
   * GÖRÜNÜR fikstür satırlarındadır ve tıklanmaları T6'nın HP kadrajını
   * bozardı. Aşağıdaki gövdelerin hiçbiri kaydı DEĞİŞTİRMEZ.
   */
  test("kayıtlı hesabın kodu kilitlidir (409) ve hesap silinemez (409)", async ({ page }) => {
    await loginAt(page, ACCOUNTING_WRITE_TIME);

    // `coa-120.01` fişlerde geçer → hem kod değişimi hem silme 409'dur.
    const patch = await page.request.patch("/api/backend/chart-of-accounts/coa-120.01", {
      data: { code: "121.01" },
    });
    expect(patch.status()).toBe(409);

    const remove = await page.request.delete("/api/backend/chart-of-accounts/coa-120.01");
    expect(remove.status()).toBe(409);
  });

  test("türev alan gövdeden gönderilemez (422) ve olmayan hesap 404'tür", async ({ page }) => {
    await loginAt(page, ACCOUNTING_WRITE_TIME);

    const derived = await page.request.post("/api/backend/chart-of-accounts", {
      data: { code: "199.99", name: "Türev sızması", account_type: "asset", level: 3 },
    });
    expect(derived.status()).toBe(422);

    expect((await page.request.get("/api/backend/chart-of-accounts/coa-yok")).status()).toBe(404);
  });

  test("posted fiş PATCH ile değiştirilemez (409); önizlemesiz DELETE 428 — kapı SUNUCUDADIR", async ({
    page,
  }) => {
    await loginAt(page, ACCOUNTING_WRITE_TIME);

    // `je-2607-post-1` TEMMUZ okuma fikstürüdür; iki istek de REDDEDİLİR,
    // dolayısıyla T6'nın kadrajı bu testten etkilenmez. SIL-B2: silme artık yalnız
    // önizleme (`/admin/silme/.../onizleme` → `preview_token`) ile; SisYön posted fişi de
    // silebilir (kapalı dönem durdurmaz), ama token'sız doğrudan DELETE 428 `preview_required`.
    const patch = await page.request.patch("/api/backend/journal-entries/je-2607-post-1", {
      data: { description: "olmaz" },
    });
    expect(patch.status()).toBe(409);

    const remove = await page.request.delete("/api/backend/journal-entries/je-2607-post-1");
    expect(remove.status()).toBe(428);

    // Dengesiz satır kümesi de 422'dir (sunucu son sözü söyler).
    const lines = await page.request.put("/api/backend/journal-entries/je-2607-draft-1/lines", {
      data: {
        lines: [
          { account_id: "coa-100", debit: "10", credit: "0" },
          { account_id: "coa-600", debit: "0", credit: "5" },
        ],
      },
    });
    expect(lines.status()).toBe(422);
  });
});
