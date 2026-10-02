// @vitest-environment node
//
// TKL-F3.7 · TEKLİF PDF — İŞVEREN/İÇ SIZINTI BEKÇİSİ, KATMAN 1 (KAYNAK). TKL-F3-PLAN §5.1 + CEO kuralı.
//
// İşveren çıktısı YALNIZ `customer` nesnelerinden okunur; maliyet, genel gider, kâr, adam-saat ve
// düz iç alanlar (`cost_unit_price`, `offer_unit_price`, `unit_mhr` …) ticari sırdır. Katman 2 (DOM)
// `offer-print-leak-dom-guard.test.tsx`tedir; ikisi birbirini örter: kaynak katmanı "yarın biri
// bu alanı basar" sızıntısını daha render edilmeden, DOM katmanı "alan adı olmadan başka yoldan
// (ör. şablon dizesi, yardımcı) sızar" sızıntısını yakalar.
//
// KAPSAM: `OfferCustomerPrint.tsx`in İTHAL KAPANIŞI (statik · dinamik · yan etkili · yeniden ihraç).
//   a) Kapanıştaki `offer-print/` ve `print-sheet/` dosyaları iç alan adını ve iç etiketlerini İÇERMEZ.
//   b) Kapanış İÇ bileşen/modelini (`*Internal*`) ve izin listesi dışı modülü İTHAL ETMEZ
//      (`@/lib/api/...` tipleri dahil: işveren girdisi YAPISAL dar tiplerdir, API tipine bağlanmaz).
//   c) Hesaplanmış ithal hedefi (şablon dizesi `import(`./x${y}`)`, `require(değişken)`, birleştirilmiş dize)
//      İHLALDİR; hesaplanmış özellik erişimi (`x[["inter","nal"].join("")]`) izin listesi dışında İHLALDİR;
//      iki sabit dizenin `+` ile birleştirilmesi İHLALDİR (parçalanmış iç ad).
//
// 🔴 TKL-F3.6.1 · madde 6: yorum soyma ve ithal çıkarma REGEX değil TypeScript AST ile yapılır. Yorumlar
// ağaçta DÜĞÜM DEĞİLDİR (trivia); dize içindeki `//` veya `/*` kodu YUTMAZ (eski regex yutuyordu: B1).
// Bekçinin kendi kendini sınayan testleri aşağıdadır (sahte dosya sistemi) — her atlatma POZİTİF KONTROLdür.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const SRC_DIR = fileURLToPath(new URL("..", import.meta.url));
const ENTRY = "components/offer-print/OfferCustomerPrint.tsx";
/** İçeriği taranan klasörler (kapanışın bunlara düşen dosyaları). */
const SCANNED_PREFIXES = ["components/offer-print/", "components/print-sheet/"];
/** Kapanışın dışarıdan ithal edebileceği TEK modüller (iç alan taşımayan saf yardımcılar). */
const SAFE_EXTERNAL = [/^react$/, /^@\/lib\/format$/, /^@\/lib\/decimal$/, /^@\/lib\/cx$/, /^@\/lib\/contract-labels$/];
/** İç alan adları + iç etiketler (kod belirteçlerinde, büyük/küçük harf duyarsız). */
const FORBIDDEN =
  /internal|cost_unit_price|overhead|profit|man_hours|unit_mhr|offer_unit_price|\bcost|maliyet|gider|\bgg\b|kâr|a-s\b|adam-saat/i;
const FORBIDDEN_FILE = /internal/i;
const SOURCE_EXT = [".ts", ".tsx"];
const STYLE_OR_ASSET = /\.(css|svg|png)$/;
/** Hesaplanmış ithal hedefinin yer tutucusu (çözülemez → izin listesi dışı sayılır). */
export const COMPUTED_TARGET = "<hesaplanmış>";
/**
 * İşveren kapanışında İZİNLİ hesaplanmış özellik erişimleri (`dosya::ifade`). Sayı-sabiti indeksi (`a[0]`) ve
 * dize-sabiti anahtarı (`x["k"]`, belirteç taramasından geçer) her zaman serbesttir; GERİ KALANI burada tek tek
 * adlandırılmalıdır — yeni erişim eklemek bu listeyi bilerek genişletmektir.
 */
const ALLOWED_COMPUTED_ACCESS = new Set([
  "components/offer-print/print-model.ts::pages[lastIndex]",
  "components/offer-print/print-model.ts::clusters[clusters.length - 1]",
  "components/offer-print/print-model.ts::KIND_LABELS[kind]",
  "components/offer-print/print-model.ts::PRICE_INDEX_TYPE_LABELS[revision.price_index_type as PriceIndexType]",
  "components/print-sheet/paginate.ts::clusters[clusters.length - 1]",
]);

function parse(source: string, fileName: string): ts.SourceFile {
  const kind = fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, kind);
}

function walk(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}

const isStaticString = (node: ts.Node): node is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral =>
  ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);

function targetOf(argument: ts.Node | undefined): string {
  return argument !== undefined && isStaticString(argument) ? argument.text : COMPUTED_TARGET;
}

/** Statik/dinamik ithal, `require`, yeniden ihraç, `import x = require()` ve `import("x")` TİP düğümleri. */
export function importTargets(source: string, fileName = "x.tsx"): string[] {
  const targets: string[] = [];
  walk(parse(source, fileName), (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier !== undefined) {
      targets.push(targetOf(node.moduleSpecifier));
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      targets.push(targetOf(node.moduleReference.expression));
    } else if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (callee.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(callee) && callee.text === "require")) {
        targets.push(targetOf(node.arguments[0]));
      }
    } else if (ts.isImportTypeNode(node)) {
      targets.push(ts.isLiteralTypeNode(node.argument) ? targetOf(node.argument.literal) : COMPUTED_TARGET);
    }
  });
  return targets;
}

/** Yaprak düğümler = belirteçler (kimlik · sabit dize · şablon parçası · JSX metni); yorumlar düğüm DEĞİLDİR. */
function leafTokens(sf: ts.SourceFile): ts.Node[] {
  const leaves: ts.Node[] = [];
  walk(sf, (node) => {
    let hasChild = false;
    ts.forEachChild(node, () => {
      hasChild = true;
      return true;
    });
    if (!hasChild && node.kind !== ts.SyntaxKind.EndOfFileToken) leaves.push(node);
  });
  return leaves;
}

const lineOf = (sf: ts.SourceFile, node: ts.Node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

export function forbiddenHits(source: string, fileName = "x.tsx"): string[] {
  const sf = parse(source, fileName);
  return leafTokens(sf).flatMap((node) => {
    const text = node.getText(sf);
    return FORBIDDEN.test(text) ? [`satır ${lineOf(sf, node)}: ${text.trim().slice(0, 80)}`] : [];
  });
}

/** Hesaplanmış özellik erişimi (izin listesi dışı) + iki sabit dizenin `+` ile birleştirilmesi. */
export function structuralHits(rel: string, source: string): string[] {
  const sf = parse(source, rel);
  const hits: string[] = [];
  walk(sf, (node) => {
    if (ts.isElementAccessExpression(node)) {
      const key = node.argumentExpression;
      const isLiteral = ts.isNumericLiteral(key) || isStaticString(key);
      if (!isLiteral && !ALLOWED_COMPUTED_ACCESS.has(`${rel}::${node.getText(sf)}`)) {
        hits.push(`satır ${lineOf(sf, node)}: hesaplanmış özellik erişimi ${node.getText(sf).slice(0, 80)}`);
      }
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.PlusToken &&
      isStaticString(node.left) &&
      isStaticString(node.right)
    ) {
      hits.push(`satır ${lineOf(sf, node)}: birleştirilmiş sabit dize ${node.getText(sf).slice(0, 80)}`);
    }
  });
  return hits;
}

type Reader = (rel: string) => string | null;

/** İthal hedefi → kaynak dosya (kökten bağıl); çözülemezse `null`. */
function resolveLocal(fromRel: string, target: string, read: Reader): string | null {
  const base = target.startsWith("@/")
    ? target.slice(2)
    : target.startsWith(".")
      ? path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), target))
      : null;
  if (base === null) return null;
  const candidates = [...SOURCE_EXT.map((ext) => base + ext), ...SOURCE_EXT.map((ext) => `${base}/index${ext}`)];
  return candidates.find((candidate) => read(candidate) !== null) ?? null;
}

export interface Closure {
  files: string[];
  violations: string[];
}

/** `entry`nin ithal kapanışı + ihlaller (iç dosya ithali · izin dışı/hesaplanmış modül · taranan dosyada iç ad ya da yapısal atlatma). */
export function analyzeClosure(entry: string, read: Reader): Closure {
  const files: string[] = [];
  const violations: string[] = [];
  const queue = [entry];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const rel = queue.pop()!;
    if (seen.has(rel)) continue;
    seen.add(rel);
    const source = read(rel);
    if (source === null) {
      violations.push(`${rel}: okunamadı`);
      continue;
    }
    files.push(rel);
    if (FORBIDDEN_FILE.test(path.posix.basename(rel))) violations.push(`${rel}: iç dosya kapanışta`);
    if (SCANNED_PREFIXES.some((prefix) => rel.startsWith(prefix))) {
      for (const hit of forbiddenHits(source, rel)) violations.push(`${rel} → ${hit}`);
      for (const hit of structuralHits(rel, source)) violations.push(`${rel} → ${hit}`);
    }
    for (const target of importTargets(source, rel)) {
      if (target === COMPUTED_TARGET) {
        violations.push(`${rel} → ${target}: hesaplanmış ithal hedefi (izin listesi dışı)`);
        continue;
      }
      if (STYLE_OR_ASSET.test(target) || SAFE_EXTERNAL.some((pattern) => pattern.test(target))) continue;
      const local = resolveLocal(rel, target, read);
      if (local !== null && (SCANNED_PREFIXES.some((prefix) => local.startsWith(prefix)) || FORBIDDEN_FILE.test(local))) {
        queue.push(local);
      } else {
        violations.push(`${rel} → ${target}: izin listesi dışı modül`);
      }
    }
  }
  return { files, violations };
}

const diskReader: Reader = (rel) => {
  const full = path.join(SRC_DIR, rel);
  return existsSync(full) ? readFileSync(full, "utf8") : null;
};

describe("işveren yazdırma kaynağı — iç alan adı ve iç ithal YOK (gerçek kaynak)", () => {
  const closure = analyzeClosure(ENTRY, diskReader);

  it("pozitif kontrol: kapanış işveren modelini, paylaşılan modeli ve kiti içerir (boş tarama sahte-yeşili YOK)", () => {
    expect(closure.files).toEqual(
      expect.arrayContaining([
        ENTRY,
        "components/offer-print/print-model-customer.ts",
        "components/offer-print/print-model.ts",
        "components/print-sheet/PrintSheet.tsx",
      ]),
    );
  });

  it("kapanıştaki hiçbir dosya iç alan/etiket anmaz; iç dosya, izin dışı ve hesaplanmış ithal/erişim YOK", () => {
    expect(closure.violations).toEqual([]);
  });

  it("izin listesindeki hesaplanmış erişimlerin HEPSİ gerçekte var (bayat izin satırı kalmaz)", () => {
    const seenAccess = new Set<string>();
    for (const rel of closure.files) {
      const sf = parse(diskReader(rel)!, rel);
      walk(sf, (node) => {
        if (ts.isElementAccessExpression(node)) seenAccess.add(`${rel}::${node.getText(sf)}`);
      });
    }
    for (const allowed of ALLOWED_COMPUTED_ACCESS) expect(seenAccess).toContain(allowed);
  });
});

describe("bekçinin kendisi (sahte dosya sistemi) — her atlatma POZİTİF KONTROLdür", () => {
  const fs = (files: Record<string, string>): Reader => (rel) => files[rel] ?? null;
  const ENTRY_FAKE = "components/offer-print/OfferCustomerPrint.tsx";
  const run = (code: string, extra: Record<string, string> = {}) => analyzeClosure(ENTRY_FAKE, fs({ [ENTRY_FAKE]: code, ...extra }));

  it("işveren bileşenine iç alan basılırsa kırmızı", () => {
    expect(run("const x = item.cost_unit_price;").violations.join("\n")).toContain("cost_unit_price");
  });

  it("iç nesne / iç etiket / adam-saat de yakalanır", () => {
    for (const code of ["item.internal.profit", "const a = 'Genel gider';", "totals.internal.man_hours", "label: 'Maliyet'"]) {
      expect(run(code).violations).not.toEqual([]);
    }
  });

  it("iç bileşenden ithal edilirse kırmızı (ithal grafiği)", () => {
    const closure = run('import { helper } from "./OfferInternalPrint";', {
      "components/offer-print/OfferInternalPrint.tsx": "export const helper = 1;",
    });
    expect(closure.violations.join("\n")).toContain("iç dosya kapanışta");
  });

  it("yardımcı üzerinden DOLAYLI ithal de yakalanır (A → B → İç)", () => {
    const closure = run('import { b } from "./b";', {
      "components/offer-print/b.ts": 'export { c } from "./print-model-internal";',
      "components/offer-print/print-model-internal.ts": "export const c = 1;",
    });
    expect(closure.violations.join("\n")).toContain("iç dosya kapanışta");
  });

  it("izin listesi dışı modül (API tipi / başka ekran) reddedilir", () => {
    const closure = run(
      'import type { OfferItemRead } from "@/lib/api/hooks/useOffers"; import { x } from "@/components/offers/offer-status";',
      {
        "lib/api/hooks/useOffers.ts": "export type OfferItemRead = {};",
        "components/offers/offer-status.ts": "export const x = 1;",
      },
    );
    expect(closure.violations.filter((line) => line.includes("izin listesi dışı"))).toHaveLength(2);
  });

  it("yorumdaki iç ad sayılmaz; temiz kaynak yeşil", () => {
    const code = '// item.internal.cost burada YOK\n/* overhead */\nimport { formatAmount } from "@/lib/format";\nexport const a = formatAmount("1");';
    const closure = analyzeClosure(ENTRY_FAKE, (rel) => (rel === ENTRY_FAKE ? code : rel === "lib/format.ts" ? "export const formatAmount = 1;" : null));
    expect(closure.violations).toEqual([]);
  });

  it("ithal yolu çözülemezse (okunamayan hedef) ihlal sayılır — sessiz atlama YOK", () => {
    for (const code of ['import "./yok";', 'import { a } from "./yok";']) {
      expect(run(code).violations.join("\n")).toContain("izin listesi dışı");
    }
  });

  // ── B1 · yorum soyma atlatması: dize içindeki `//` ve `/*` eski regex'te kodu YUTUYORDU ──────────────
  it("B1: dize içindeki '//' kendisinden sonraki iç alanı GİZLEYEMEZ (AST: dize tek belirteç)", () => {
    expect(run('const u = "http://x"; const c = item.cost_unit_price;').violations.join("\n")).toContain("cost_unit_price");
    expect(run('const u = "a//b", c = totals.internal.profit;').violations.join("\n")).toContain("internal");
  });

  it("B1: dize içindeki '/*' sonraki satırlardaki iç alanı GİZLEYEMEZ", () => {
    const code = 'const open = "/*";\nconst c = item.unit_mhr;\nconst close = "*/";';
    expect(run(code).violations.join("\n")).toContain("unit_mhr");
  });

  it("B1: gerçek yorum hâlâ soyulur (yanlış-pozitif YOK)", () => {
    expect(run('const a = 1; // item.cost_unit_price\n/* totals.internal */ const b = 2;').violations).toEqual([]);
  });

  // ── B2 · şablon dizesiyle dinamik ithal ───────────────────────────────────────────────────────────
  it("B2: şablon dizesi ithal hedefi (import(`./Offer${x}Print`)) İHLAL", () => {
    const code = 'export const load = (x: string) => import(`./Offer${x}Print`);';
    expect(run(code).violations.join("\n")).toContain("hesaplanmış ithal hedefi");
  });

  it("B2: değişkenli / birleştirilmiş dinamik ithal de İHLAL; sabit şablon (yerine koymasız) çözülür", () => {
    expect(run("const m = import(name);").violations.join("\n")).toContain("hesaplanmış ithal hedefi");
    expect(run('const m = import("./Offer" + "Internal");').violations.join("\n")).toContain("birleştirilmiş sabit dize");
    const closure = run("const m = import(`./yok`);");
    expect(closure.violations.join("\n")).toContain("izin listesi dışı modül"); // çözüldü ama okunamadı
  });

  // ── B3 · require ile dolaylı ithal ────────────────────────────────────────────────────────────────
  it("B3: require('./OfferInternalPrint') iç dosyayı kapanışa sokar; require(değişken) İHLAL", () => {
    const closure = run('const m = require("./OfferInternalPrint");', {
      "components/offer-print/OfferInternalPrint.tsx": "export const helper = 1;",
    });
    expect(closure.violations.join("\n")).toContain("iç dosya kapanışta");
    expect(run("const m = require(path);").violations.join("\n")).toContain("hesaplanmış ithal hedefi");
    expect(run('import x = require("./OfferInternalPrint");', {
      "components/offer-print/OfferInternalPrint.tsx": "export {};",
    }).violations.join("\n")).toContain("iç dosya kapanışta");
  });

  it("B3: import-tipi düğümü ve yeniden ihraç da izlenir", () => {
    expect(run('type T = import("./OfferInternalPrint").X;', {
      "components/offer-print/OfferInternalPrint.tsx": "export type X = 1;",
    }).violations.join("\n")).toContain("iç dosya kapanışta");
    expect(run('export * from "./print-model-internal";', {
      "components/offer-print/print-model-internal.ts": "export const c = 1;",
    }).violations.join("\n")).toContain("iç dosya kapanışta");
  });

  // ── B4 · hesaplanmış anahtarla iç alana erişim ────────────────────────────────────────────────────
  it("B4: x[['inter','nal'].join('')] (hesaplanmış anahtar) İHLAL — parçalanmış ad belirteç taramasına YAKALANMAZDI", () => {
    const code = 'export const leak = (x: Record<string, unknown>) => x[["inter", "nal"].join("")];';
    expect(run(code).violations.join("\n")).toContain("hesaplanmış özellik erişimi");
  });

  it("B4: değişkenli indeks ve iki sabit dizenin '+' ile birleşimi İHLAL; sayı/dize-sabiti indeksi ve izinli erişim serbest", () => {
    expect(run("const v = row[key];").violations.join("\n")).toContain("hesaplanmış özellik erişimi");
    expect(run('const k = "inter" + "nal";').violations.join("\n")).toContain("birleştirilmiş sabit dize");
    expect(run("const a = rows[0]; const b = rows[1];").violations).toEqual([]);
    expect(run('const c = labels["Toplam"];').violations).toEqual([]);
    // dize-sabiti anahtarı belirteç taramasından geçer: iç ad yine yakalanır
    expect(run('const c = item["cost_unit_price"];').violations.join("\n")).toContain("cost_unit_price");
  });

  it("B4: izin listesi yalnız (dosya, ifade) çiftiyle — aynı ifade başka dosyada İHLAL", () => {
    const expression = "const k = KIND_LABELS[kind];";
    expect(analyzeClosure(ENTRY_FAKE, fs({ [ENTRY_FAKE]: 'import "./print-model";', "components/offer-print/print-model.ts": expression })).violations).toEqual([]);
    expect(run(expression).violations.join("\n")).toContain("hesaplanmış özellik erişimi");
  });
});
