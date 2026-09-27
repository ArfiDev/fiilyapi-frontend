// @vitest-environment node
// KAPSAM UYARISI (diary-progress.css.test.ts ile aynı): bu dosya YALNIZCA
// stylesheet METNİNDE ilgili kuralın var olduğunu doğrular; cascade'i ya da
// tarayıcıdaki geometriyi DOĞRULAMAZ (görsel doğrulama Playwright'ın işi).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(fileURLToPath(new URL("./timesheet.css", import.meta.url)), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);
const tokensCss = readFileSync(fileURLToPath(new URL("../../styles/tokens.css", import.meta.url)), "utf8");

/** Seçicinin TEK BAŞINA yazıldığı kural gövdeleri (seçici listesi `a, b {` sayılmaz). */
function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const bodies = [...css.matchAll(new RegExp(`(?:^|})\\s*${escaped}\\s*{([^}]*)}`, "g"))].map((match) => match[1]);
  expect(bodies.length, `${selector} kuralı yok`).toBeGreaterThan(0);
  return bodies.join("\n");
}

/** Seçicisinde `prefix` geçen BÜTÜN kurallar (medya sorguları dahil). */
function gridRules(prefix: string): string {
  return css
    .split("}")
    .filter((rule) => (rule.split("{")[0] ?? "").includes(prefix))
    .join("}");
}

/**
 * F-SUBPX — puantaj ızgaralarının (haftalık `.ts-week-table` + aylık
 * `.ts-table`) BÜTÜN satırları tam piksel yükseklikte ve tam piksel üstte.
 *
 * ÖLÇÜLDÜ (F-SUBPX probe'u): gövdenin 1.5 mirasıyla haftalık başlık 54.5,
 * gövde 56 / 55.5 dönüşümlü, ayak 49.5; aylık ayak 38.5, son satır 67.5.
 * İki kaynak vardı: (1) 11/13/15 px yazıda 16.5/19.5/22.5 px satır aralığı,
 * (2) `border-collapse: collapse` — 1 px satır çizgisi iki satıra 0.5 + 0.5
 * bölünür; içerik tam px olsa bile satır üstleri .5'te kalır (56.5 / 56 ·
 * 110.5 …). Yapışkan Personel kolonu satırın rect'ini taşıdığı için katmanı
 * yarım pikselde kalır ve raster turları arasında 1 px kayar.
 */
describe("timesheet.css — F-SUBPX ızgara satırları tam piksel", () => {
  it("--leading-timesheet-* token'larının HEPSİ tam px", () => {
    const tokens = [...tokensCss.matchAll(/(--leading-timesheet-[\w-]+):\s*([^;]+);/g)];
    expect(tokens.map(([, name]) => name).sort()).toEqual([
      "--leading-timesheet-body",
      "--leading-timesheet-error",
      "--leading-timesheet-head",
      "--leading-timesheet-meta",
      "--leading-timesheet-sm",
      "--leading-timesheet-sum",
      "--leading-timesheet-total",
    ]);
    for (const [, name, value] of tokens) {
      expect(value.trim(), `${name} tam px değil`).toMatch(/^\d+px$/);
    }
  });

  it.each([
    // Haftalık (E5 · ŞP · Kilitli Gün)
    [".ts-week-table__name-head", "head"],
    [".ts-week-table__day-head", "head"],
    [".ts-week-table__daydate", "meta"],
    [".ts-week-table__total-head", "meta"],
    [".ts-week-table__name", "body"],
    [".ts-week-table__meta", "meta"],
    [".ts-week-table__cell", "body"],
    [".ts-week-table__row-total", "total"],
    [".ts-week-table__row-total--sum", "sum"],
    [".ts-week-table__empty", "sm"],
    [".ts-week-table__foot-label", "head"],
    [".ts-week-table__foot-cell", "body"],
    [".ts-week-table__foot-total", "sum"],
    [".ts-week-cell__error", "error"],
    // Aylık (bölüm detayı · ŞP)
    [".ts-table--site .ts-table__name-head", "head"],
    [".ts-table--site .ts-table__lead-head", "meta"],
    [".ts-table--site .ts-table__lead-cell", "body"],
    [".ts-table--site .ts-table__day-head", "meta"],
    [".ts-table--site .ts-table__total-head", "head"],
    [".ts-table--site .ts-table__name", "sm"],
    [".ts-table__meta", "meta"],
    [".ts-table__cell", "body"],
    [".ts-table__row-total", "body"],
    [".ts-table__empty", "sm"],
    [".ts-table--site .ts-table__foot-label", "head"],
    [".ts-table__foot-cell", "head"],
    [".ts-table__foot-total", "body"],
  ])("%s satır aralığı --leading-timesheet-%s", (selector, token) => {
    expect(ruleBody(selector)).toMatch(new RegExp(`line-height:\\s*var\\(--leading-timesheet-${token}\\)`));
  });

  it("ızgaralarda çarpanlı (1.5 · 1.2 …) satır aralığı YOKTUR", () => {
    for (const prefix of [".ts-week-table", ".ts-table"]) {
      const rules = gridRules(prefix);
      expect(rules.length, prefix).toBeGreaterThan(0);
      expect(rules, prefix).not.toMatch(/line-height:\s*[\d.]+\s*;/);
    }
  });

  it.each([".ts-week-table", ".ts-table"])(
    "%s `border-collapse: separate` (collapse 1 px çizgiyi satırlara 0.5 + 0.5 böler)",
    (table) => {
      const body = ruleBody(table);
      expect(body).toMatch(/border-collapse:\s*separate/);
      expect(body).toMatch(/border-spacing:\s*0/);
    },
  );

  it.each([".ts-week-table", ".ts-table"])("%s satır çizgileri HÜCREDE (separate modelde `tr` kenarlığı çizilmez)", (table) => {
    expect(ruleBody(`${table} thead tr`)).not.toMatch(/border/);
    expect(ruleBody(`${table} thead th`)).toMatch(/border-bottom:/);
    expect(ruleBody(`${table} tbody tr > *`)).toMatch(/border-bottom:\s*1px solid var\(--color-divider\)/);
    // Collapse'ta son satırın çizgisi ayağın 2 px çizgisine katlanırdı — separate'te çift çizgi olmasın.
    expect(ruleBody(`${table} tbody tr:last-child > *`)).toMatch(/border-bottom:\s*0/);
    expect(css).not.toMatch(new RegExp(`(?:^|})\\s*${table.replace(".", "\\.")} tbody tr\\s*{[^}]*border`));
  });

  it.each([".ts-week-table__foot-row", ".ts-table__foot-row"])("%s üst çizgisi hücrede", (row) => {
    expect(ruleBody(row)).not.toMatch(/border/);
    expect(ruleBody(`${row} > *`)).toMatch(/border-top:\s*var\(--border-width-total\) solid var\(--color-border\)/);
  });
});

/**
 * F-SUBPX-3 (lider denetimi, ÇALIŞMA ZAMANI ölçüldü) · `.ts-info` satır
 * aralığı KESİR ÜRETMEZ. Eskiden `line-height: 1.7` × `font-size: 12px` =
 * `20.4px` — TAM SAYI DEĞİL — üretiyordu; DOM'da yukarıdan aşağı taranan İLK
 * kesirli-yükseklik elemanı buydu (`puantaj-kilitli-hucre-popover` karesi).
 * Paylaşılan `--leading-loose` (`tokens.css:291`) oranına DOKUNULMADI (on iki
 * ayrı dosyada kullanılıyor); yalnız bu TEK kuralın SONUCU tam piksele
 * (20px) oturtuldu.
 */
describe("timesheet.css — .ts-info satır aralığı tam piksel (F-SUBPX-3)", () => {
  it("`line-height` tam PİKSEL değeridir — kesir üreten oran (1.7 vb.) YOKTUR", () => {
    const body = ruleBody(".ts-info");
    expect(body).toMatch(/line-height:\s*20px\s*;/);
    expect(body).not.toMatch(/line-height:\s*1\.7/);
    expect(body).not.toMatch(/line-height:\s*var\(--leading-loose\)/);
  });
});

/**
 * F-SUBPX-4 (ajan B, ÇALIŞMA ZAMANI ölçüldü) · aday #2b — `.ts-week-nav__range`
 * (13px) ve `.ts-month-weeks__title` (11px) gövdenin `--leading-normal` (1.5)
 * mirasını taşıyordu: 13×1.5=19.5px · 11×1.5=16.5px — İKİSİ DE TAM SAYI DEĞİL.
 * Bu, `.ts-week-nav` kutusunun kendisini (height 44.5) ve altındaki
 * `.ts-month-weeks`'in TEPESİNİ (top 419.5) kesirli yapıyordu — aday #2
 * (`site-detail-tabs`) zincirini düzelttikten SONRA bile puantaj sayfasında
 * kalan İKİNCİ bağımsız kesir kaynağıydı (`puantaj-kilitli-hucre-popover`
 * karesi, x 252/1407 · y 275–499 bandı). Dosyanın kendi F-SUBPX kanonu
 * (satır 164 civarı) için zaten var olan tam-piksel tokenlar kullanıldı
 * (`--leading-timesheet-body: 19px` 13px için · `--leading-timesheet-head:
 * 16px` 11px için) — yeni sayı İCAT EDİLMEDİ, `--leading-normal` DOKUNULMADI.
 *
 * ⚠️ SINIR: `.ts-month-weeks__title` ve `.ts-month-weeks__total` KENDİ
 * yükseklikleri artık tam piksel ama TEPE'leri hâlâ .5'te kalabilir — bu,
 * `.ts-month-weeks`in `align-items: center` ile FARKLI yükseklikteki
 * kardeşleri (liste kutusu 61px'e karşı başlık 16px / toplam rozeti 52px,
 * fark TEK sayı) ortalarken ürettiği bağımsız bir flex-ortalama artefaktıdır
 * — line-height YÖNTEMİYLE düzelmez (kutu boyutu değişikliği gerekir, bu
 * TASARIM kararı kapsam dışı bırakıldı, DUR/RAPOR edildi).
 */
describe("timesheet.css — hafta gezinme + ay-hafta başlığı satır aralığı tam piksel (F-SUBPX-4 aday 2b)", () => {
  it(".ts-week-nav__range 13px için tam-piksel token taşır (--leading-timesheet-body)", () => {
    const body = ruleBody(".ts-week-nav__range");
    expect(body).toMatch(/line-height:\s*var\(--leading-timesheet-body\)\s*;/);
  });

  it(".ts-month-weeks__title 11px için tam-piksel token taşır (--leading-timesheet-head)", () => {
    const body = ruleBody(".ts-month-weeks__title");
    expect(body).toMatch(/line-height:\s*var\(--leading-timesheet-head\)\s*;/);
  });
});
