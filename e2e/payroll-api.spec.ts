import { test, expect, type Page } from "@playwright/test";

import { loginForPayroll } from "./payroll-helpers";

/**
 * F-BORDRO T1 · bordro modülünün **AÇILIŞ SÖZLEŞMESİ** — ekran DEĞİL, uç.
 *
 * 🔴 NEDEN AYRI BİR DOSYA: `bordro.spec.ts` ve `bordro-visual.spec.ts`
 * ikisi de **zaten açılmış ve zaten dolu** dönemleri kullanır. Modülün
 * gerçek İLK KURULUM hâli — "tablo boş, kullanıcı ayı kendi açar" — hiçbir
 * kapıda temsil edilmiyordu; 6173 testlik paket bu yüzden canlıdaki
 * *"bordro kısmı çalışmıyor"* kusurunu göremedi.
 *
 * Bu dosya SAHTE BACKEND'İ SÖZLEŞMEYE KARŞI ÖLÇER. İki iddia gerçek
 * backend'den ÖLÇÜLDÜ (`payroll/router.py` · `payroll/service.py`):
 *
 *   1. `POST /payroll/periods` — *"Ay AÇAR, doldurmaz — satırlar `compute`
 *      ucundan gelir."* ⇒ yeni dönem **SIFIR satırlıdır**.
 *   2. `POST /payroll/periods/{id}/compute` — `created` = *"Yeni açılan satır
 *      sayısı"* (şema açıklaması) ⇒ ilk hesap satırları **gerçekten üretir**
 *      ve sayar; ikinci hesap aynı satırları **günceller** (`created` = 0).
 *
 * Ayrıca `compute` yanıtının BEŞİNCİ alanı `missing_prior_period_count`
 * (K4 · eksik kümülatif matrah uyarısı) sözleşmede ZORUNLUDUR.
 *
 * 🔒 MUTASYON ADASI: yalnız **2025** ve KENDİ ayları (01/02/03/04). Kadrajların
 * yılı (2026) ve oransız yıl (2024) bu dosyadan HİÇ etkilenmez; yeni bir YIL
 * açmak `bordro-gecmis` karesinin yıl seçicisini oynatırdı — 2025 zaten
 * seçenekte olduğu için kare sabit kalır. `fullyParallel` altında aynı
 * dosyanın testleri başka worker'larda eşzamanlı koşabildiği için ay ayrımı
 * zorunludur (`PAYROLL_PERIOD_SEEDS` kanonu).
 *
 * ⚠️ Sabit `waitForTimeout` YOKTUR. ⚠️ `getByRole("alert")` bu depoda YASAKTIR.
 */

interface ApiLine {
  id: string;
  personnel_source: string;
  status: string;
  gross_amount: string | null;
}

interface ApiDetail {
  id: string;
  year: number;
  month: number;
  status: string;
  payment_due_date: string | null;
  summary: { line_count: number; gross_total: string; net_total: string };
  sections: { personnel_source: string; line_count: number; lines: ApiLine[] }[];
}

interface ApiComputeResult {
  created: number;
  updated: number;
  skipped_overridden: number;
  skipped_approved: number;
  missing_prior_period_count: number;
}

function allLines(detail: ApiDetail): ApiLine[] {
  return detail.sections.flatMap((section) => section.lines);
}

async function createPeriod(
  page: Page,
  body: { year: number; month: number; payment_due_date?: string | null },
): Promise<ApiDetail> {
  const response = await page.request.post("/api/backend/payroll/periods", { data: body });
  expect(response.status(), `dönem açma 201 dönmeli: ${await response.text()}`).toBe(201);
  return (await response.json()) as ApiDetail;
}

/**
 * Dönemi açar; AYNI koşuda daha önce açılmışsa (Playwright yeniden denemesi — paylaşılan mock durumu korunur) onu bulur.
 * Yalnız yeniden-deneme güvenli olması GEREKEN testler kullanır; açılış sözleşmesini ölçen testler `createPeriod` ile 201 ister.
 */
async function openOrReusePeriod(page: Page, body: { year: number; month: number }): Promise<string> {
  const response = await page.request.post("/api/backend/payroll/periods", { data: body });
  if (response.status() === 201) return ((await response.json()) as ApiDetail).id;
  expect(response.status(), `dönem açma 201 ya da (yeniden denemede) 409: ${await response.text()}`).toBe(409);
  const list = await page.request.get("/api/backend/payroll/periods?limit=100");
  expect(list.status()).toBe(200);
  const rows = ((await list.json()) as { items: { id: string; year: number; month: number }[] }).items;
  const row = rows.find((item) => item.year === body.year && item.month === body.month);
  if (row === undefined) throw new Error(`409 verdi ama ${body.year}-${body.month} listede yok`);
  return row.id;
}

async function compute(page: Page, periodId: string): Promise<ApiComputeResult> {
  const response = await page.request.post(
    `/api/backend/payroll/periods/${periodId}/compute`,
  );
  expect(response.status(), `hesap 200 dönmeli: ${await response.text()}`).toBe(200);
  return (await response.json()) as ApiComputeResult;
}

async function getDetail(page: Page, periodId: string): Promise<ApiDetail> {
  const response = await page.request.get(`/api/backend/payroll/periods/${periodId}`);
  expect(response.status()).toBe(200);
  return (await response.json()) as ApiDetail;
}

/* ── 1) AÇILIŞ SÖZLEŞMESİ · aç → BOŞ · hesapla → DOLU ────────────────────── */

test("donem acmak satir URETMEZ; satirlari compute uretir ve created sayar", async ({
  page,
}) => {
  await loginForPayroll(page);

  const created = await createPeriod(page, { year: 2025, month: 1 });

  // 🔴 ÇEKİRDEK İDDİA 1 — gerçek backend ayı AÇAR, DOLDURMAZ. Sahte backend
  // burada 7 satırlık dolu bir dönem döndürüyorsa, harness modülün gerçek
  // ilk-kurulum hâlini YAPISAL OLARAK üretemiyor demektir.
  expect(allLines(created).length, "yeni dönem SIFIR satırlıdır").toBe(0);
  expect(created.summary.line_count, "özet satır sayısı da sıfırdır").toBe(0);
  expect(created.status, "yeni dönem HER ZAMAN draft'tır").toBe("draft");
  // Satırı olmayan dönemin toplamları SIFIRDIR — `null` değil (ekran "—"
  // basmasın diye) ve uydurma bir sayı hiç değil.
  expect(created.summary.gross_total).toBe("0.00");
  expect(created.summary.net_total).toBe("0.00");

  // Liste ucu da aynı şeyi söyler: dönem AÇILDI ama kimse yok.
  const listRow = await getDetail(page, created.id);
  expect(listRow.summary.line_count).toBe(0);

  const first = await compute(page, created.id);

  // 🔴 ÇEKİRDEK İDDİA 2 — `created` = YENİ AÇILAN satır sayısı. Sabit `0`
  // basmak, `compute`ın ASIL İŞİNİ görünmez kılar.
  expect(first.created, "ilk hesap satırları ÜRETİR ve sayar").toBeGreaterThan(0);
  expect(first.updated, "ilk hesapta güncellenecek satır YOKTUR").toBe(0);
  expect(first.skipped_overridden).toBe(0);
  expect(first.skipped_approved).toBe(0);
  // Sözleşmenin BEŞİNCİ alanı (K4): 2025-01 yılın İLK ayıdır ⇒ eksik önceki
  // dönem yoktur. Alanın VARLIĞI da iddianın parçasıdır — eksikse ekran
  // kümülatif matrah uyarısını hiç basamaz.
  expect(typeof first.missing_prior_period_count, "K4 alanı sözleşmede ZORUNLU").toBe(
    "number",
  );
  expect(first.missing_prior_period_count).toBe(0);

  // Hesap sonrası dönem GERÇEKTEN doldu ve sayı `created` ile birebir tutar.
  const afterCompute = await getDetail(page, created.id);
  expect(allLines(afterCompute).length).toBe(first.created);
  expect(afterCompute.summary.line_count).toBe(first.created);

  // T6 · hesaplanan dönem KENDİLİĞİNDEN onaya düşer (ödenebilir satır çıktı).
  expect(afterCompute.status, "hesap sonrası dönem onay bekler").toBe("pending_approval");

  // İKİNCİ hesap: aynı satırlar yeniden ÜRETİLMEZ, GÜNCELLENİR.
  const second = await compute(page, created.id);
  expect(second.created, "ikinci hesap yeni satır AÇMAZ").toBe(0);
  expect(second.updated, "ikinci hesap mevcut satırları günceller").toBeGreaterThan(0);
  const afterSecond = await getDetail(page, created.id);
  expect(allLines(afterSecond).length, "satır sayısı ikiye KATLANMAZ").toBe(first.created);
});

/* ── 2) K4 · eksik önceki dönem sayacı GERÇEKTEN sayar ───────────────────── */

test("compute eksik onceki donemleri sayar (K4)", async ({ page }) => {
  await loginForPayroll(page);

  // Haziran 2025: aynı yılda ÖNCE gelen beş ay (Ocak–Mayıs). Ocak · Şubat · Nisan başka testlerin adasıdır ve
  // `fullyParallel` altında açılmış/hesaplanmış OLABİLİR ⇒ iddia bir ARALIKTIR. 🔴 MAYIS 2025 HİÇBİR testin ve
  // tohumun adası DEĞİLDİR ⇒ HER ZAMAN eksiktir (alt sınır 1 bu yüzden sağlam).
  // (Eski hâli Mart'tı ve "Şubat hiçbir testin adası değil" diyordu — YANLIŞTI: "açılmış ay 409" testi Şubat'ı
  // açıp hesaplar. Ocak+Şubat önce bittiğinde sayaç 0 oluyordu; PR #166 CI run 37009367129'da yeniden denemede kırmızı.)
  // Yeniden denemede dönem zaten açıktır → `openOrReusePeriod` (paylaşılan mock durumu korunur).
  const periodId = await openOrReusePeriod(page, { year: 2025, month: 6 });
  const result = await compute(page, periodId);

  expect(result.created + result.updated, "hesap satır üretir ya da (yeniden denemede) günceller").toBeGreaterThan(0);
  expect(result.missing_prior_period_count, "en az Mayıs eksik").toBeGreaterThanOrEqual(1);
  expect(result.missing_prior_period_count, "en fazla Ocak–Mayıs").toBeLessThanOrEqual(5);
});

/* ── 3) Sözleşme kapıları · 409 · 422 ────────────────────────────────────── */

test("acilmis ay 409, gecersiz ay 422, kilitli donem 409 doner", async ({ page }) => {
  await loginForPayroll(page);

  // Aynı ayı ikinci kez açmak 409'dur (UQ `(year, month)`).
  const first = await createPeriod(page, { year: 2025, month: 2 });
  const duplicate = await page.request.post("/api/backend/payroll/periods", {
    data: { year: 2025, month: 2 },
  });
  expect(duplicate.status(), "açılmış ay 409").toBe(409);

  // Geçersiz ay 422 (şema `ge=1, le=12`).
  const badMonth = await page.request.post("/api/backend/payroll/periods", {
    data: { year: 2025, month: 13 },
  });
  expect(badMonth.status(), "13. ay 422").toBe(422);

  // 🔴 `compute` KİLİTLİ dönemde 409'dur (`approved`/`paid`). Ekranın
  // düğmesini kapatan kural budur; 2026-06 fikstürü `approved`tır ve BU TEST
  // ONU OYNATMAZ — 409 yanıtı dönemin durumuna DOKUNMAZ (salt kapı ölçümü).
  const locked = await page.request.post(
    "/api/backend/payroll/periods/pp-2026-06/compute",
  );
  expect(locked.status(), "approved dönem yeniden hesaplanamaz").toBe(409);

  // Açılan dönem hâlâ hesaplanabilir durumdadır (kapı yalnız kilitliye kapalı).
  const ok = await compute(page, first.id);
  expect(ok.created).toBeGreaterThan(0);
});

/* ── 3b) 🔴 KRIT-BORDRO · ÖDENECEK SATIRI OLMAYAN DÖNEM ONAYLANAMAZ ──────── */

/**
 * 🔴 İKİZ, GERÇEK BACKEND'İN REDDETTİĞİNİ REDDETMELİDİR.
 *
 * Ölçülen canlı kusur: puantajı girilmemiş bir dönem İKİ tıkta `approved`
 * oluyordu. O andan sonra `compute` **409**, satır `PATCH` **409**, dönem
 * `DELETE` **405** (uç YOK) ve aynı ayı yeniden açmak **409** (UQ
 * `year, month`) — o ayın bordrosu elle SQL dışında kurtarılamaz hâle
 * geliyordu. Sunucu bunu artık `has_payable_line` ile 409'lar.
 *
 * Bu testin işi ekranı değil **İKİZİ** ölçmektir: mock bu 409'u taklit
 * etmezse ekranın korkuluğu yalnız ikizin izin verdiği bir dünyada sınanır ve
 * korkuluk silinse bile e2e yeşil kalırdı — ikiz bir ONAYLAYICI olurdu.
 *
 * 🔴 İkinci yarı KARŞIT KANITTIR: hesaplanmış AYNI dönem AYNI uçtan **200**
 * ile geçer. Yoksa her gövdeye 409 veren bozuk bir uç da bu testi geçerdi.
 */
test("odenecek satiri olmayan donem onaylanamaz (409), hesaplanan donem gecer", async ({
  page,
}) => {
  await loginForPayroll(page);

  // Yeni açılan dönem SIFIR satırlıdır (bu dosyanın 1. testinin çekirdek iddiası).
  const created = await createPeriod(page, { year: 2025, month: 4 });
  expect(allLines(created).length, "yeni dönem SIFIR satırlıdır").toBe(0);

  const bos = await page.request.post(
    `/api/backend/payroll/periods/${created.id}/approve`,
  );
  expect(bos.status(), "ödenecek satırı olmayan dönem 409").toBe(409);

  // 🔴 Dönem YAZILMAMIŞ olmalı: 409 "girip çıkma" değil "hiç girmeme"dir.
  const reddedilenSonrasi = await getDetail(page, created.id);
  expect(reddedilenSonrasi.status, "reddedilen onay dönemi ilerletmez").toBe("draft");

  // --- KARŞIT KANIT: hesaplanan dönem AYNI uçtan GEÇER ---
  const hesap = await compute(page, created.id);
  expect(hesap.created, "hesap ödenebilir satır üretir").toBeGreaterThan(0);

  const gecen = await page.request.post(
    `/api/backend/payroll/periods/${created.id}/approve`,
  );
  expect(gecen.status(), "ödenebilir satırı olan dönem onaylanır").toBe(200);
  const sonuc = (await gecen.json()) as { period_status: string };
  expect(sonuc.period_status).toBe("approved");
});

/* ── 4) 🔴 SAHTE-YEŞİLİN YEDİNCİ HÂLİ · mock sorgu kısıtlarını DOĞRULAR ───── */

/**
 * 🔴 Bu test canlıdaki kusurun **kaçtığı deliği** kapatır.
 *
 * `PAYROLL_PERIODS_LIMIT` elle `240` yazılmıştı; sözleşme tavanı **200**dür ve
 * backend aşımı *sessizce KIRPMAZ, 422 döner*. Kullanıcı birebir şunu gördü:
 * `Input should be less than or equal to 200`. Buna rağmen 6173 birim testi,
 * dört e2e ve dört kapı da **yeşil** geçti — çünkü **sahte backend `limit`i
 * DOĞRULAMIYOR, KIRPIYORDU** ve kendi tavanını da `240` yazmıştı: sahte
 * backend, frontend'in HATASINI taklit ediyordu.
 *
 * Bir sahte backend'in sözleşmeden SAPMASI, o sapmanın canlıda kusur olarak
 * yaşamasına izin verir. Kısıtlar bu yüzden `openapi.json`dan OKUNUR.
 */
test("mock sorgu kisitlarini sozlesmeden okur ve ihlalde 422 doner", async ({ page }) => {
  await loginForPayroll(page);

  // Tavan AŞIMI 422'dir — kırpılıp 200 dönmez.
  const over = await page.request.get("/api/backend/payroll/periods?limit=201");
  expect(over.status(), "limit=201 ⇒ 422").toBe(422);
  // Mesaj FastAPI'nin ürettiğiyle aynı olmalı: kullanıcı bunu gördü.
  expect(JSON.stringify(await over.json())).toContain(
    "Input should be less than or equal to 200",
  );

  // Sınırın KENDİSİ geçerlidir (`le`, `lt` değil) — frontend tam burada durur.
  const atCeiling = await page.request.get("/api/backend/payroll/periods?limit=200");
  expect(atCeiling.status(), "limit=200 ⇒ 200").toBe(200);

  // Taban ihlalleri de 422'dir (`ge=1` / `ge=0`).
  expect((await page.request.get("/api/backend/payroll/periods?limit=0")).status()).toBe(422);
  expect((await page.request.get("/api/backend/payroll/periods?offset=-1")).status()).toBe(
    422,
  );

  // Parametresiz çağrı sunucunun varsayılanını kullanır (50) — kısıt YOK demek
  // değil, "gönderilmedi" demektir.
  expect((await page.request.get("/api/backend/payroll/periods")).status()).toBe(200);
});

/* ── 5) 🔴 F-BORDONEM · GÖVDE kısıtları da sözleşmeden ölçülür ────────────── */

/**
 * 🔴 **SÖZLEŞME KISITI TİPTE YAŞAMAZ** — `PayrollPeriodCreate.year` `number`
 * diye üretilir, `2000-2100` tipte İFADE EDİLEMEZ. Bu yüzden korkuluk (a)
 * formda, (b) sahte backend'de ve (c) `payroll-period-contract.test.ts`te
 * sözleşmeye çakılı olarak yaşar.
 *
 * Bu test (b)'yi ölçer: sahte backend 1999'u kabul ediyorsa, formun
 * korkuluğunu kaldıran bir mutasyon HİÇBİR testi kırmaz ve kusur canlıya
 * gider — sahte backend o hâlde ONAYLAYICIDIR, bekçi değil. (`limit=240`
 * kusurunun tıpatıp aynısı.)
 */
test("gecersiz YIL govdesi 422 doner ve mesaj FastAPI'ninkiyle AYNIDIR", async ({
  page,
}) => {
  await loginForPayroll(page);

  const tooEarly = await page.request.post("/api/backend/payroll/periods", {
    data: { year: 1999, month: 1 },
  });
  expect(tooEarly.status(), "1999 ⇒ 422").toBe(422);
  expect(JSON.stringify(await tooEarly.json())).toContain(
    "Input should be greater than or equal to 2000",
  );

  const tooLate = await page.request.post("/api/backend/payroll/periods", {
    data: { year: 2101, month: 1 },
  });
  expect(tooLate.status(), "2101 ⇒ 422").toBe(422);
  expect(JSON.stringify(await tooLate.json())).toContain(
    "Input should be less than or equal to 2100",
  );

  // 🔴 **NEGATİF KONTROL** — kapı *"her gövdeye 422 diyor"* olmamalı.
  //
  // ⚠️ Sınır DEĞERİNİN (2000/2100) kabul edildiği BURADA ölçülmez ve bu
  // bilinçlidir: `payrollState` modül düzeyindedir, yani 201 dönen bir
  // istek 2000 ve 2100 yıllarını **kalıcı** olarak listeye sokar ve
  // `bordro-gecmis` karesinin yıl seçicisine iki seçenek daha ekleyerek
  // BAŞKA bir dilimin baseline'ını kırardı (FAZLA FİKSTÜR kanonu). Sınır
  // değeri `payroll-period-contract.test.ts`te — şemadan okunan `minimum`/
  // `maximum` ile — çakılıdır (`ge`/`le`, `gt`/`lt` değil).
  //
  // Buradaki kanıt: geçerli bir yıl gövde kapısından GEÇER ve reddi başka
  // bir sebeple (409, açılmış ay) alır.
  const validYear = await page.request.post("/api/backend/payroll/periods", {
    data: { year: 2026, month: 7 },
  });
  expect(validYear.status(), "geçerli yıl gövde kapısını geçer ⇒ 409").toBe(409);

  // Ay sınırı da AYNI kapıdan geçer (elle yazılmış `1..12` değil, şemadan).
  const badMonth = await page.request.post("/api/backend/payroll/periods", {
    data: { year: 2026, month: 0 },
  });
  expect(badMonth.status(), "0. ay ⇒ 422").toBe(422);
  expect(JSON.stringify(await badMonth.json())).toContain(
    "Input should be greater than or equal to 1",
  );
});
