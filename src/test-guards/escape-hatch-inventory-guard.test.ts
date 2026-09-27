// @vitest-environment node
//
// TYPE-F1 FAZ 2c · KAÇIŞ ENVANTERİ BEKÇİSİ.
//
// KÖK KURAL: `asPercent` / `asPercentOrNull` / `asFraction` / `asFractionOrNull`
// (`scale.ts` TEK açık kaçış — bkz. oradaki BEDEL NOTU) üretim kodunda YALNIZ
// aşağıdaki GEREKÇELİ envanterdeki yerlerde çağrılabilir. Yeni bir çağrı
// EKLENİRSE ya da envanterdeki biri SİLİNİRSE bu bekçi KIRMIZI verir — kaçışın
// sessizce çoğalması (markasız veri sessizce Fraction/Percent'e boyanması)
// böylece gözden kaçmaz.
//
// Sayım DOSYA BAŞINA yapılır (satır numarası değil — küçük bir düzenleme
// satırları kaydırır ve bekçiyi SAHTE KIRMIZI yapar). Aynı dosyada birden
// fazla kaçış varsa (ör. `ProgressPaymentForm.tsx` 2) toplam sayı eşleşmesi
// yeterli bekçidir; dosya kümesi de (yeni dosya/eksik dosya) ayrıca kontrol
// edilir.
//
// İZİNLİ YERLER (bekçi bunları TARAMAZ): `src/lib/api/scale.ts` (kaçışların
// KENDİ tanımı), `**/*.test.ts(x)`.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC_DIR = fileURLToPath(new URL("..", import.meta.url));
const EXEMPT_FILES = new Set(["lib/api/scale.ts"]);

const ESCAPE_CALL = /\b(asPercent|asPercentOrNull|asFraction|asFractionOrNull)\(/g;

interface EscapeRecord {
  file: string;
  fn: string;
  gerekce: string;
}

/**
 * GEREKÇELİ KAÇIŞ ENVANTERİ (11 kayıt, TYPE-F1 faz 2a/2c ölçümü).
 *
 * Gerekçe sınıfları:
 *   · "toPoints dönüşü"        — Fraction→Percent kanonik ×100 dönüşümü
 *     (`toPoints()` ve aynı deseni yerel olarak tekrarlayan tek-kullanımlık
 *     eşdeğerleri).
 *   · "EvNumber sınırı"        — girdi `EvNumber` (gevşek Decimal-uyumlu
 *     birleşim) sınırında Fraction'a marka'lanır.
 *   · "çift kullanımlı türev"  — aynı sayısal değer HEM numara olarak
 *     (genişlik/ton/karşılaştırma) HEM gösterim için Percent olarak kullanılır.
 *   · "test kesinliği türevi"  — üreten fonksiyon `toBeCloseTo` ile
 *     doğrulanan `number` döndürür (davranış testi bozulmasın diye kaçış
 *     yalnız `formatPercent` SINIRINDA uygulanır).
 *   · "gösterim-amaçlı türev"  — hiçbir API gövdesine yazılmayan, yalnız
 *     ekrana basılan türetilmiş yüzde.
 */
const EXPECTED_ESCAPES: readonly EscapeRecord[] = [
  { file: "lib/earned-value/decimal-input.ts", fn: "toPoints()", gerekce: "toPoints dönüşü" },
  { file: "lib/earned-value/bands.ts", fn: "varianceStatus()", gerekce: "EvNumber sınırı" },
  { file: "lib/earned-value/format.ts", fn: "formatVariancePoints()", gerekce: "EvNumber sınırı" },
  {
    file: "components/earned-value/catalog/catalog-model.ts",
    fn: "shownPoints()",
    gerekce: "EvNumber sınırı",
  },
  {
    file: "components/site-diary/DiarySummaryAccrualTable.tsx",
    fn: "toCompletionPercent()",
    gerekce: "toPoints dönüşü",
  },
  {
    file: "components/contracts/SubcontractorContractItemsTable.tsx",
    fn: "ItemGroup() — Hakediş % hücresi",
    gerekce: "çift kullanımlı türev",
  },
  { file: "components/leaves/leaves-derive.ts", fn: "usageCell()", gerekce: "çift kullanımlı türev" },
  {
    file: "components/financial-statements/IncomeStatementTable.tsx",
    fn: "RatioCell()",
    gerekce: "test kesinliği türevi",
  },
  { file: "components/project-form/BudgetCard.tsx", fn: "BudgetCard()", gerekce: "test kesinliği türevi" },
  {
    file: "components/progress-payments/ProgressPaymentForm.tsx",
    fn: "coefficientPercentLabel() — boş/NaN dalı",
    gerekce: "gösterim-amaçlı türev",
  },
  {
    file: "components/progress-payments/ProgressPaymentForm.tsx",
    fn: "coefficientPercentLabel() — (katsayı−1)×100 dalı",
    gerekce: "gösterim-amaçlı türev",
  },
];

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function productionSources(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (entry === "node_modules") return [];
    if (statSync(full).isDirectory()) return productionSources(full);
    if (!/\.tsx?$/.test(entry)) return [];
    if (/\.test\.tsx?$/.test(entry)) return [];
    const rel = path.relative(SRC_DIR, full);
    if (EXEMPT_FILES.has(rel)) return [];
    return [full];
  });
}

/** Kaynak metindeki kaçış çağrısı SAYISI (yorumlar hariç). */
export function escapeCallCount(source: string): number {
  const code = stripComments(source);
  return [...code.matchAll(ESCAPE_CALL)].length;
}

describe("kaçış envanteri bekçisinin kendisi", () => {
  it("çağrıyı sayar, yorumdakini saymaz", () => {
    const source = [
      'const a = asPercent("1");',
      "// const b = asFraction(x);",
      "const c = asPercentOrNull(y);",
    ].join("\n");
    expect(escapeCallCount(source)).toBe(2);
  });
});

describe("TYPE-F1 · kaçış (asPercent/asFraction ailesi) envanteri GEREKÇELİ listeyle birebir eşit", () => {
  it("beklenen envanter 11 kayıt", () => {
    expect(EXPECTED_ESCAPES.length).toBe(11);
  });

  it("üretim kodundaki kaçış sayısı, dosya başına, GEREKÇELİ envanterle birebir eşleşir", () => {
    const expectedCountByFile = new Map<string, number>();
    for (const { file } of EXPECTED_ESCAPES) {
      expectedCountByFile.set(file, (expectedCountByFile.get(file) ?? 0) + 1);
    }

    const files = productionSources(SRC_DIR);
    const actualCountByFile = new Map<string, number>();
    for (const file of files) {
      const rel = path.relative(SRC_DIR, file);
      const count = escapeCallCount(readFileSync(file, "utf8"));
      if (count > 0) actualCountByFile.set(rel, count);
    }

    const expectedEntries = [...expectedCountByFile.entries()].sort();
    const actualEntries = [...actualCountByFile.entries()].sort();
    expect(actualEntries).toEqual(expectedEntries);

    const actualTotal = [...actualCountByFile.values()].reduce((a, b) => a + b, 0);
    expect(actualTotal).toBe(EXPECTED_ESCAPES.length);
  });
});
