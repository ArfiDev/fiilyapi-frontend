// @vitest-environment node
// Not: jsdom ortamında global `URL` whatwg-url polyfill'i ile değiştirilir ve
// `new URL(relative, import.meta.url)` file:// tabanını yanlış çözer
// (http://localhost:3000/... üretir). Bu saf metin testi dosya sistemi
// okuduğu için node ortamında çalıştırılır.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const tokensCss = readFileSync(
  fileURLToPath(new URL("./tokens.css", import.meta.url)),
  "utf8",
);

/**
 * tokens.css'teki hex renk literali sayısı. Palet burada TANIMLANIR, bu yüzden
 * hex'in tek meşru yeri burasıdır; ama sayı sabittir — artması yeni bir rengin
 * gözden kaçtığı anlamına gelir (şantiye formu spec §5.1: yeni renk gerekmiyor).
 *
 * P7 T3 (Ekran 15 "Sözleşme İlerlemesi" çubukları): 69 → 70. Fiziksel çubuğunun
 * açık ucu (#4ade80, mockup 185) mevcut tonlarla karşılanmadığı için tek yeni
 * hex eklendi (`--color-success-light`); diğer iki gradyan mevcut token
 * çiftleriyle kuruldu, yeni hex taşımıyor.
 *
 * F-TH T5 (Şantiye Hakedişler "Taşeron Hakedişleri" panel başlığı): 70 → 72.
 * Mockup zemin/metin tonunun (#fff7ed/#c2410c) karşılığı YOKTU — iki yeni
 * token eklendi (`--color-orange-tint`/`--color-orange-tint-text`).
 *
 * F-SD T4 (Hakediş Özeti "Taşeron Hakediş →" bağlantısı, mockup satır 226):
 * 72 → 73. Zemin/metin tonu mevcut turuncu token çiftiyle karşılandı, yalnız
 * kenarlık tonunun (#fed7aa) karşılığı yoktu (`--color-orange-tint-border`).
 *
 * F-PL T2 (Planlama ızgarası): 73 → 74. Altı hücre renk etiketinin HEPSİ ve
 * grup başlığı renkleri mevcut token çiftleriyle karşılandı; yalnız hafta sonu
 * HÜCRE zemini (`--color-amber-tint-cell`, P132-133) yeniydi — başlık
 * satırının tonuyla (`--color-amber-tint`, P116) aynı DEĞİLDİR.
 *
 * F-PT T2 (Puantaj): 74 → 77. Hücre rozetlerinin zemin/metin tonlarının HEPSİ
 * mevcut token çiftleriyle karşılandı; yalnız legend çiplerinin ÜÇ kenarlık
 * tonunun karşılığı yoktu (`--color-primary-border-soft` E5 80/ŞP 107 ·
 * `--color-warning-border-soft` E5 83/ŞP 110 · `--color-success-border-soft`
 * ŞP 111). Dördüncü kenarlık (#fca5a5) zaten `--color-danger-border-soft`tur.
 *
 * F-PT T4 (Personel Ekle formu): 77 → 78. Mockup'ın renklerinin tamamı mevcut
 * palette karşılandı; yalnız belge uyarı kutusunun koyu kehribar metin tonu
 * (FP 196) yeniydi — mevcut `--color-warning-strong` ve
 * `--color-orange-tint-text` ondan AÇIK olduğu için kontrastı düşürürdü
 * (`--color-warning-deep-text`).
 *
 * F-P5 T7 (TSD · Taşeron Sözleşme Detayı): 78 → 79. Mockup'ın renklerinin
 * tamamı mevcut palette karşılandı (zincir rozetleri, kehribar bant, tfoot,
 * ilerleme çubuğu); YALNIZ bilgi bandının gövde metin tonu (TSD 83) yeniydi —
 * `--color-warning-strong` ondan AÇIK, `--color-warning-deep-text` ondan
 * KOYUdur (`--color-warning-body-text`).
 *
 * F-P8 T3 (DS · Yeni Satış formu): 79 → 81. Mockup'ın renklerinin çoğu mevcut
 * mor/yeşil/mono palette karşılandı; YALNIZ iki değer yeniydi — satış bedeli
 * girişinin mor kenarlığı (`--color-accent-purple-border`, DS 86) ve ödeme
 * planı parametre şeridinin açık mor zemini (`--color-plan-params-bg`, DS 102).
 *
 * F-İK T5 (BT · Belge & Sertifika): 81 → 82. Mockup'ın renklerinin tamamı
 * mevcut palette karşılandı (satır tinti = --color-audit-danger-row-bg, kehribar
 * başlık = --color-amber-tint-cell/--color-warning-deep-text, bilgi kutusu =
 * --color-nav-active-bg/--color-primary-hover, çubuk dilimleri = success/
 * warning/danger/border); YALNIZ koyu kırmızı başlık tonu (BT 51, 81) yeniydi —
 * `--color-danger-strong` ondan AÇIKtır ve başlık/gövde hiyerarşisini düşürürdü
 * (`--color-danger-deep`).
 *
 * F-HZ T2 (E9 · Hazine): 82 → 83. Kart şeridinin ÜÇ gradyanının altı ucu da
 * mevcut token'larla karşılandı (primary-hover/primary-light ·
 * accent-teal-start/-end · accent-purple/accent-purple-grad-end) ve ödeme
 * satırlarının turuncu/yeşil tonları da mevcut (warning/orange-tint ·
 * success-strong/success-tint); YALNIZ kırmızı satırın zemini (#fef2f2, E9:116)
 * yeniydi — `--color-danger-soft` (#fee2e2) ondan KOYU, `--color-danger-tint`
 * (#fff0f0) ondan PEMBEdir (`--color-danger-row-bg`).
 */
// F-DKAP: 83 → 84 — `--color-purple-tint-border` (DK:71) mevcut token'larda
// karşılanmıyordu, TEK yeni renk açıldı (bekçinin kendisi doğruladı).
// PUAN-SAAT: 84 → 89 — haftalık saat ızgarasının BEŞ tonu mevcut palette
// karşılanmıyordu (E5 `5f3a944`): `--color-info-soft`/`-border-soft`/`-strong`
// ("eksik gün" hücresi, E5 204) ile `--color-warning-tint` (Cumartesi sütunu,
// E5 222) ve `--color-danger-tint-weak` (Pazar sütunu, E5 223). Mevcut
// `--color-danger-tint` (#fff0f0) Pazar zemininden PEMBE, `--color-warning-soft`
// (#fef3c7) Cumartesi zemininden KOYUdur — ikisi de sütun zemini olarak
// hücrenin kendi tonunu yutardı.
// kalan-6 no 18: 89 → 91 — `--color-ai-info-tint` (#f8faff) ve
// `--color-ai-warning-tint` (#fffbf5); ai-panel.css'teki çıplak hex'ler
// mevcut token'larla karşılanmadı, iki YENİ ton açıldı (DEĞER değişmedi).
// PLN-F1.2 (Planlama ortak kit): 91 → 92 — hata kartı başlık/eylem metni
// #b91c1c (Planlama - Panel.dc.html:427, :429) mevcut kırmızılarla karşılanmadı
// (--color-danger-strong #dc2626 açık, --color-danger-deep #991b1b koyu).
// Diğer kit token'ları mevcut tonlara TAKMA AD, yeni hex taşımaz.
// PLN-F1 (Planlama ekranları AYP · KAT · BÜT): 92 → 97 — BEŞ ton mevcut
// palette yoktu, ekranlar en yakın tona bağlanmıştı: nötr çip (surface-muted
// ondan koyu-soğuk), PF sarı bölge / fark alt çizgisi (warning-border-soft
// ondan koyu), düzenleyici zemini (ai-info-tint ondan mor), açık satır
// (surface-2 ondan gri), boş oran satırı (danger-row-bg ondan pembe).
// Üç gölge (sticky-bar · menu · popover) hex taşımaz, sayacı oynatmaz.
// PLN-F2.3 (Günlük ilerleme adaptörü): 97 → 102 — BEŞ ton mevcut palette
// yoktu, adaptör en yakın tona bağlanmıştı: kod kolonu çizgisi #eef2f6
// (ev-chip-neutral #eef2f7 ondan mavi), hücre çizgisi #f5f7fa (divider #f1f5f9
// ondan koyu), grup başlığı #f5f7ff (ev-editor-bg #f8fbff ondan açık-mavi),
// grup hücresi #fafbff (ev-row-open-bg #fbfdff ondan morumsu), taşeron satırı
// #fcfcfd (surface-2 #f8fafc ondan koyu-mavi). Kaynak: Günlük Kayıt (İlerleme)
// İ 443/469/664/666/670. Gönder çubuğu gölgesi (.10) shadow-menu'den (.12)
// ayrı değerdir; hex taşımaz, sayacı oynatmaz.
// DSC-F1.2 (Kullanıcı Disiplin Ataması modalı): 102 → 103 — bilgi kutusu metni
// #1e40af (Kullanıcı Disiplin Ataması.dc.html:23); mevcut mavilerle karşılanmadı
// (--color-primary-900 #1e3a8a ondan koyu, --color-info-strong #0369a1 ondan
// yeşilimsi). Tek YENİ ton, `--color-info-deep-text`; yorumu hex taşımaz.
const EXPECTED_HEX_COUNT = 103;

describe("tokens.css", () => {
  it("çekirdek renk token'larını tanımlar (açık tema Slate + Blue)", () => {
    for (const token of [
      "--color-bg",
      "--color-surface",
      "--color-text",
      "--color-text-muted",
      "--color-border",
      "--color-primary",
      "--color-success",
      "--color-warning",
      "--color-danger",
    ]) {
      expect(tokensCss).toContain(token);
    }
  });

  it("tipografi, boşluk ve yarıçap token'larını tanımlar", () => {
    for (const token of [
      "--font-sans",
      "--font-mono",
      "--text-base",
      "--text-lg",
      "--space-4",
      "--radius-md",
      // F1 eklemeleri
      "--text-page-title",
      "--text-section",
      "--text-numeric",
      "--text-table-head",
      "--radius-14",
      "--shadow-card",
      "--focus-ring",
      "--color-surface-2",
      "--color-divider",
      "--anim-fade-up",
    ]) {
      expect(tokensCss).toContain(token);
    }
  });

  it("Ekran 13 (BOQ) token'ları tanımlı ve mockup değerlerini taşır", () => {
    // spec §3.5 — 13 yeni token; her değer mockup satır no ile gerekçeli.
    const boqTokens: ReadonlyArray<readonly [string, string]> = [
      ["--color-info-tint", "#f0f9ff"], // GENEL TOPLAM zemini (174)
      ["--border-width-total", "2px"], // GENEL TOPLAM üst çizgisi (174)
      ["--text-kpi-value", "20px"], // özet kartı değeri (75, 79, 83, 87)
      ["--text-boq-group", "12px"], // grup başlık satırı (108)
      ["--text-total-amount", "15px"], // genel toplam tutarı (176)
      ["--tracking-group", "0.5px"], // grup başlığı harf aralığı (108)
      ["--space-boq-cell-y", "11px"], // tablo hücre dikey iç boşluğu (96, 111)
      ["--space-boq-cell-x", "16px"], // Poz No / Tarif yatay iç boşluğu (96, 111)
      ["--space-boq-total-y", "13px"], // tfoot hücre dikey iç boşluğu (175, 176)
      ["--space-boq-kpi-label-gap", "5px"], // kart etiketi → değer (74)
      ["--space-boq-strip-gap", "20px"], // kart şeridi alt boşluğu (72)
      ["--space-boq-action-gap", "10px"], // iki buton arası (65)
      ["--space-boq-btn-x", "18px"], // birincil buton yatay iç boşluğu (67)
      ["--space-boq-crumb-gap", "6px"], // breadcrumb alt boşluğu (62)
    ];
    for (const [token, value] of boqTokens) {
      expect(tokensCss).toMatch(new RegExp(`${token}:\\s*${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*;`));
    }
  });

  it("Şantiye formu token'ları tanımlı ve mockup değerlerini taşır", () => {
    // spec §5.1 — 22 yeni token; kanon: projedesign "Form - Santiye Ekle.dc.html".
    // Her değer mockup satır no ile gerekçeli (parantez içi).
    const siteFormTokens: ReadonlyArray<readonly [string, string]> = [
      ["--radius-9", "9px"], // kutucuk kutusu, belge ikon kutusu (152, 160, 182)
      ["--leading-loose", "1.7"], // bilgi kutusu metni (55)
      ["--space-info-banner-y", "14px"], // bilgi kutusu dikey iç boşluk (53)
      ["--space-info-banner-x", "18px"], // bilgi kutusu yatay iç boşluk (53)
      ["--space-card-head-gap", "10px"], // Bölümler kartı başlık şeridi (103)
      ["--space-section-cell-y", "10px"], // bölüm tablosu hücre dikey (110–124)
      ["--space-section-cell-x", "12px"], // bölüm tablosu hücre yatay (111–124)
      ["--space-section-cell-x-lead", "16px"], // ilk sütun yatay (110, 119)
      ["--tracking-section-head", "0.7px"], // tablo başlığı harf aralığı (110–114)
      ["--width-col-responsible", "170px"], // Sorumlu sütunu (111)
      ["--width-col-date", "130px"], // Başlangıç / Bitiş sütunları (112, 113)
      ["--width-col-amount", "130px"], // Tahmini Bedel sütunu (114)
      ["--width-col-action", "40px"], // sil sütunu (115)
      ["--space-dashed-btn-y", "7px"], // "Bölüm ekle" butonu (136)
      ["--space-dashed-btn-x", "14px"], // "Bölüm ekle" butonu (136)
      ["--space-checkbox-list-gap", "7px"], // kutucuk listesi satır aralığı (152, 160)
      ["--size-checkbox-lg", "15px"], // alt şerit kutucuğu (221)
      ["--space-row-control-y", "6px"], // .row-in dikey iç boşluk (27)
      ["--space-row-control-x", "8px"], // .row-in yatay iç boşluk (27)
      ["--text-row-control", "12px"], // .row-in yazı boyu (27)
      ["--border-width-row-control", "1px"], // .row-in kenarlık (27)
      ["--radius-row-control", "var\\(--radius-6\\)"], // .row-in köşe (27)
      ["--space-form-action-gap", "10px"], // alt eylem grubu boşluğu (224)
    ];
    expect(siteFormTokens).toHaveLength(23);
    for (const [token, value] of siteFormTokens) {
      expect(tokensCss, `${token} tanımlı değil ya da değeri farklı`).toMatch(
        new RegExp(`${token}:\\s*${value}\\s*;`),
      );
    }
  });

  it("kart başlığı 14px token'ı tanımlıdır (mockup .card-t, satır 24)", () => {
    // 2026-07-30 düzeltmesi: `.pf-card__title` --text-body (13px) kullanıyordu.
    // İKİ form mockup'ı da (.card-t, satır 24) 14px/600 ilan ediyor; mockup
    // kazanır. Bu bilinçli bir sapma değil, fark edilmemiş bir kaymaydı.
    expect(tokensCss).toMatch(/--text-form-card-title:\s*14px\s*;/);
  });

  it("--radius-row-control yeni px icat etmez, mevcut --radius-6'ya bağlıdır", () => {
    // Mockup .row-in 6px köşe ister (27); repoda --radius-6 zaten var.
    expect(tokensCss).toMatch(/--radius-row-control:\s*var\(--radius-6\)\s*;/);
    expect(tokensCss).toMatch(/--radius-6:\s*6px\s*;/);
  });

  it("--tracking-section-head mevcut --tracking-wide'dan ayrı bir token'dır", () => {
    // Spec §5.1: mevcut --text-table-head 0.8px kullanır, bu form 0.7px ister.
    // Mevcut token'ı değiştirmek başka ekranları kaydırırdı → yeni token açıldı.
    expect(tokensCss).toMatch(/--tracking-wide:\s*0\.8px\s*;/);
    expect(tokensCss).toMatch(/--tracking-section-head:\s*0\.7px\s*;/);
  });

  it("Planlama ortak kit (PLN-F1.2) token'ları tanımlı ve mockup değerlerini taşır", () => {
    // Kaynak: Planlama - Panel.dc.html (P) · Adam-Saat Bütçesi.dc.html (AS).
    const planningTokens: ReadonlyArray<readonly [string, string]> = [
      ["--color-error-card-title", "#b91c1c"], // hata kartı başlığı + eylem (P 427, 429)
      ["--color-error-card-bg", "var(--color-danger-row-bg)"], // #fef2f2 (P 426)
      ["--color-error-card-border", "var(--color-danger-tint-border)"], // #fecaca (P 426)
      ["--shadow-segmented-selected", "0 1px 2px rgba(0, 0, 0, 0.08)"], // seçili segment (P 599)
      ["--color-chart-tooltip-bg", "var(--color-text)"], // #1e293b (P 215)
      ["--color-chart-tooltip-title", "var(--color-border-strong)"], // #cbd5e1 (P 216)
      ["--color-chart-tooltip-label", "var(--color-text-subtle)"], // #94a3b8 (P 217)
      ["--color-chart-tooltip-value", "var(--color-on-brand)"], // #fff (P 217)
      ["--color-chart-tooltip-negative", "var(--color-danger-border-soft)"], // #fca5a5 (P 220, AS 380)
      ["--color-chart-tooltip-positive", "var(--color-success-border-soft)"], // #86efac (P 315)
    ];
    for (const [token, value] of planningTokens) {
      expect(tokensCss).toMatch(new RegExp(`${token}:\\s*${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*;`));
    }
  });

  it("Planlama ekranları (PLN-F1 · AYP · KAT · BÜT) token'ları tanımlı ve mockup değerlerini taşır", () => {
    // Kaynak: Ayarlar - Planlama.dc.html (AYP) · Ayarlar - Planlama (Ek).dc.html (Ek) ·
    // Planlama - Birim Oran Kataloğu.dc.html (KAT) · Planlama - Adam-Saat Bütçesi.dc.html (BÜT).
    const screenTokens: ReadonlyArray<readonly [string, string]> = [
      ["--color-ev-chip-neutral", "#eef2f7"], // nötr çip (Ek 164 · KAT 451 · BÜT 92)
      ["--color-ev-amber-soft", "#fde68a"], // PF sarı bölge (Ek 193) · fark başlığı alt çizgisi (BÜT 156)
      ["--color-ev-editor-bg", "#f8fbff"], // paçal metrik düzenleyici (AYP 190)
      ["--color-ev-row-open-bg", "#fbfdff"], // katalog açık satır (KAT 495)
      ["--color-ev-row-empty-rate-bg", "#fff8f8"], // oranı boş satır (BÜT 632)
      ["--shadow-sticky-bar", "0 -4px 16px rgba(15, 23, 42, 0.06)"], // yapışkan Kaydet (Ek 402)
      ["--shadow-menu", "0 8px 24px rgba(15, 23, 42, 0.12)"], // açılır menü (KAT 112 · BÜT 109)
      ["--shadow-popover", "0 10px 28px rgba(15, 23, 42, 0.16)"], // popover (KAT 154 · BÜT 245)
    ];
    for (const [token, value] of screenTokens) {
      expect(tokensCss).toMatch(new RegExp(`${token}:\\s*${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*;`));
    }
  });

  it("Günlük ilerleme adaptörü (PLN-F2.3) token'ları tanımlı ve mockup değerlerini taşır", () => {
    // Kaynak: Şantiye - Günlük Kayıt (İlerleme).dc.html (İ) · … (Ek Formlar).dc.html (EF).
    const diaryTokens: ReadonlyArray<readonly [string, string]> = [
      ["--color-ev-diary-grid-line", "#eef2f6"], // kod kolonu çizgisi + boş hücre kenarlığı (İ 443, 481, 486, 666)
      ["--color-ev-diary-cell-line", "#f5f7fa"], // gövde hücresi dikey çizgisi (İ 469)
      ["--color-ev-diary-group-head-bg", "#f5f7ff"], // grup kodu başlık zemini (İ 670)
      ["--color-ev-diary-group-cell-bg", "#fafbff"], // grup kodu gövde hücresi zemini (İ 666)
      ["--color-ev-diary-sub-row-bg", "#fcfcfd"], // taşeron satırı zemini (İ 664)
      ["--shadow-ev-diary-submit-bar", "0 8px 24px rgba(15, 23, 42, 0.1)"], // gönder çubuğu (İ 493 · EF 591)
      // F-SUBPX — ızgara satır aralıkları tam piksel (gerekçe tokens.css + diary-progress.css.test.ts).
      ["--leading-ev-diary-row", "19px"], // ad · saat · alt toplam · PF satırı (İ 462, 466, 480, 485)
      ["--leading-ev-diary-meta", "16px"], // meslek · uyarı · ayırıcı · kolon başlığı (İ 441, 455, 463, 464)
      ["--leading-ev-diary-code", "14px"], // kod adı (İ 445)
      ["--leading-ev-diary-rule", "11px"], // kip düğmesi (İ 447)
      ["--leading-ev-diary-pf", "17px"], // PF rozeti (İ 486)
      ["--leading-ev-diary-row-tablet", "21px"], // tablet ad (İ 527-558)
    ];
    for (const [token, value] of diaryTokens) {
      expect(tokensCss).toMatch(new RegExp(`${token}:\\s*${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*;`));
    }
  });

  it("puantaj ızgaraları (F-SUBPX) satır aralığı token'ları tanımlı ve tam px", () => {
    // Gerekçe tokens.css + timesheet.css.test.ts "F-SUBPX".
    const timesheetTokens: ReadonlyArray<readonly [string, string]> = [
      ["--leading-timesheet-meta", "15px"], // 10 px
      ["--leading-timesheet-head", "16px"], // 11 px
      ["--leading-timesheet-sm", "18px"], // 12 px
      ["--leading-timesheet-body", "19px"], // 13 px
      ["--leading-timesheet-total", "21px"], // 14 px
      ["--leading-timesheet-sum", "22px"], // 15 px
      ["--leading-timesheet-error", "13px"], // 9 px
    ];
    for (const [token, value] of timesheetTokens) {
      expect(tokensCss).toMatch(new RegExp(`${token}:\\s*${value}\\s*;`));
    }
  });

  it("bilgi popover'ı genişliği (PLN-F2.5) token'dır; kullanıcı CSS'lerinde çıplak 292px kalmaz", () => {
    // Kaynak: Planlama - Adam-Saat Bütçesi.dc.html:245 (öneri popover'ı) · Şantiye - Puantaj (Kilitli Gün).dc.html:340.
    expect(tokensCss).toMatch(/--width-info-popover:\s*292px\s*;/);
    for (const file of [
      "../components/earned-value/budget/budget-rates.css",
      "../components/timesheet/timesheet.css",
    ]) {
      const css = readFileSync(fileURLToPath(new URL(file, import.meta.url)), "utf8");
      expect(css, file).not.toMatch(/\b292px\b/);
      expect(css, file).toContain("var(--width-info-popover)");
    }
  });

  it("şantiye formu için yeni renk token'ı eklenmedi", () => {
    // Spec §5.1 sonu: mockup'ın 19 rengi mevcut token'larda karşılanıyor.
    // Bu sayı artarsa yeni bir çıplak renk sızmış demektir.
    const hexCount = (tokensCss.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).length;
    expect(hexCount).toBe(EXPECTED_HEX_COUNT);
  });

  it("DET-1.2 — içe odak halkası token'ı birincil renge bağlıdır, hex taşımaz (sayaç oynamaz)", () => {
    // Kaynak: Şantiye - Günlük Kayıt Detay (Salt Okunur).dc.html:123 (.lr-focus).
    expect(tokensCss).toMatch(
      /--focus-ring-inset:\s*inset 0 0 0 1\.5px var\(--color-primary\), inset 0 0 0 4\.5px rgba\(37, 99, 235, 0\.12\)\s*;/,
    );
  });

  it("koyu tema varsayılanı yoktur — açık tema kanon", () => {
    // Açık tema kanon (README); koyu tema bu fazda YOK.
    expect(tokensCss).not.toContain("prefers-color-scheme: dark");
  });
});
