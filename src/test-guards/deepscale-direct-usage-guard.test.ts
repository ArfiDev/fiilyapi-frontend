// @vitest-environment node
//
// TYPE-F1 FAZ 2c · DeepScale DOĞRUDAN KULLANIM BEKÇİSİ.
//
// Var olmayan bir şema adı (`components["schemas"]["Yok"]`) bu bekçinin işi
// DEĞİL, tsc yakalar. Bekçi yalnız VAR OLAN nesne şemalarının sarılmadan
// kullanımını denetler.
//
// KÖK KURAL (TYPE-F1 emir §1, faz 2a/2c): `components["schemas"][X]` ya da
// `EvSchema[X]` bir NESNE şemasına (enum/skaler DEĞİL) karşılık geliyorsa,
// üretim kodunda bir tip takma adına aktarılırken `DeepScale<...>`den
// GEÇMEK ZORUNDADIR — aksi hâlde o alandaki `fraction`/`percent` alanları
// markasız kalır ve FIX-F1 Kusur 1/2'nin (kesir↔yüzde karışıklığı) yeniden
// açılmasına izin verir.
//
// Bekçi kaynak METNİNİ tarar (yorumlar soyulur, `core-planning-import-guard`
// deseniyle): `components["schemas"]["Name"]` / `EvSchema["Name"]` bir
// `DeepScale<` ÖNEKİ OLMADAN geçiyorsa VE "Name" `schema.d.ts`de bir NESNE
// (obje literal, `{` ile başlıyor) ise KIRMIZI verir. "Name" bir enum/skaler
// (union/string/number literal, `{` ile BAŞLAMIYOR) ise İSTİSNADIR — DeepScale
// nesne-olmayan tipte no-op olduğu için sarmak anlamsız gürültüdür (bkz.
// `scale.ts` `DeepScale<T>` tanımı: `T extends object ? {...} : T`).
//
// İZİNLİ YERLER (bekçi bunları TARAMAZ):
//   1. `src/lib/api/scale.ts`          — DeepScale'in KENDİ tanımı.
//   2. `src/lib/api/schema.d.ts`       — `pnpm gen:api` ÜRETİMİ, elle
//                                        dokunulmaz; ayrıca sınıflandırmanın
//                                        KAYNAĞI burasıdır.
//   3. `**/*.test.ts(x)`               — şema SÖZLEŞME testleri
//                                        (`schema.test.ts`,
//                                        `mock-backend-*.contract.test.ts`,
//                                        component testleri) ham şema
//                                        şeklini test eder, DeepScale'in
//                                        UYGULANDIĞI tipi değil.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC_DIR = fileURLToPath(new URL("..", import.meta.url));
const SCHEMA_FILE = path.join(SRC_DIR, "lib/api/schema.d.ts");

const EXEMPT_FILES = new Set(["lib/api/scale.ts", "lib/api/schema.d.ts"]);

const SCHEMA_REF = /(components\["schemas"\]|EvSchema)\["([A-Za-z0-9_]+)"\]/g;
/** Hemen önünde `DeepScale<` var mı — sondan geriye 10 karakter yeter. */
function isDeepScaleWrapped(source: string, matchIndex: number): boolean {
  return source.slice(Math.max(0, matchIndex - "DeepScale<".length), matchIndex) === "DeepScale<";
}

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

/**
 * `schema.d.ts`teki `Name: {...}` (nesne) tanımlarının kümesi — nesne
 * OLMAYAN (enum/skaler union, ör. `Scope: "all" | "own" | ...;`) adlar
 * bu kümenin DIŞINDA kalır ve DeepScale sarma ZORUNLULUĞUNDAN muaftır.
 */
function objectSchemaNames(schemaSource: string): Set<string> {
  const names = new Set<string>();
  const re = /^\s*([A-Za-z0-9_]+): (.*)$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(schemaSource))) {
    const [, name, rest] = m;
    if (rest.trimStart().startsWith("{")) names.add(name);
  }
  return names;
}

/** Kaynak metindeki SARILMAMIŞ + NESNE-şema referanslarını döner. */
export function unwrappedObjectSchemaRefs(source: string, objectNames: Set<string>): string[] {
  const code = stripComments(source);
  const hits: string[] = [];
  let m: RegExpExecArray | null;
  SCHEMA_REF.lastIndex = 0;
  while ((m = SCHEMA_REF.exec(code))) {
    const name = m[2];
    if (!objectNames.has(name)) continue; // enum/skaler istisna
    if (isDeepScaleWrapped(code, m.index)) continue; // zaten sarılı
    hits.push(name);
  }
  return hits;
}

describe("DeepScale doğrudan kullanım bekçisinin kendisi", () => {
  const objectNames = new Set(["ObjA", "ObjB"]);

  it("sarılmamış nesne-şema referansını yakalar", () => {
    const source = 'export type X = components["schemas"]["ObjA"];';
    expect(unwrappedObjectSchemaRefs(source, objectNames)).toEqual(["ObjA"]);
  });

  it("DeepScale<> ile sarılmış referansı GEÇİRİR", () => {
    const source = 'export type X = DeepScale<components["schemas"]["ObjA"]>;';
    expect(unwrappedObjectSchemaRefs(source, objectNames)).toEqual([]);
  });

  it("enum/skaler (nesne kümesinde OLMAYAN) adı çağırmaz", () => {
    const source = 'export type X = components["schemas"]["Scope"];';
    expect(unwrappedObjectSchemaRefs(source, objectNames)).toEqual([]);
  });

  it("EvSchema[...] biçimini de tarar", () => {
    const source = 'export type X = EvSchema["ObjB"];';
    expect(unwrappedObjectSchemaRefs(source, objectNames)).toEqual(["ObjB"]);
  });

  it("yorumdaki sarılmamış referansı SAYMAZ", () => {
    const source = '// export type X = components["schemas"]["ObjA"];';
    expect(unwrappedObjectSchemaRefs(source, objectNames)).toEqual([]);
  });
});

describe("TYPE-F1 · üretim kodu components[schemas]/EvSchema nesne-şemalarını DeepScale ile sarar", () => {
  it("schema.d.ts okunabiliyor ve en az bir nesne + bir enum adı bulunuyor (bekçinin kendi ölçümü kanıtı)", () => {
    const schemaSource = readFileSync(SCHEMA_FILE, "utf8");
    const objectNames = objectSchemaNames(schemaSource);
    expect(objectNames.size).toBeGreaterThan(100);
    expect(objectNames.has("PageLevel")).toBe(false);
  });

  it("src/** üretim dosyalarında sarılmamış nesne-şema referansı YOKTUR", () => {
    const schemaSource = readFileSync(SCHEMA_FILE, "utf8");
    const objectNames = objectSchemaNames(schemaSource);
    const files = productionSources(SRC_DIR);
    expect(files.length).toBeGreaterThan(500);

    const hits = files.flatMap((file) => {
      const rel = path.relative(SRC_DIR, file);
      const source = readFileSync(file, "utf8");
      return unwrappedObjectSchemaRefs(source, objectNames).map((name) => `${rel} → ${name}`);
    });
    expect(hits).toEqual([]);
  });
});
