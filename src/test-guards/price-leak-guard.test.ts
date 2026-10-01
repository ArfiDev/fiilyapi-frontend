// @vitest-environment node
//
// TKL-F1.2 · FİYAT SIZINTI BEKÇİLERİ (TKL-F1-PLAN §2.4 / §6).
//
// Referans fiyat YALNIZ çekirdek İş Kalemi Kataloğu ucundan (`/catalog/items`,
// `contracts` kapısı) döner. Planlama (EV / KAT) ucu fiyatsızdır ve `earned_value`
// kapısı fiyat yetkisi VERMEZ. Gizleme backend'dedir; frontend yalnız yansıtır —
// ama KAT tarafına fiyat alanı/okuyucu sızarsa (ya da backend EV şemasına fiyat
// eklerse) `contracts:none` rol fiyatı görür. İki bekçi bunu kilitler:
//   B1 · planlama/KAT kaynakları (components/earned-value, lib/earned-value, catalog-shared,
//        useEv*.ts hook'ları, birim-oran-katalogu rotası) fiyat alanını / çekirdek katalog
//        hook'unu / anahtarını / tip adlarını / ucunu anmaz. TEK istisna: useEv*.ts içindeki
//        çapraz geçersizleme satırları (yalnız anahtar SABİTİ; satır içeriğine kilitli).
//   B2 · openapi'de `/earned-value` altındaki HER yanıt/gövde şeması ($ref kapanışıyla)
//        fiyat özelliği TAŞIMAZ (backend gerilemesi).
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { stripComments } from "./_shared/strip-comments";

const SRC_DIR = fileURLToPath(new URL("..", import.meta.url));
const OPENAPI_PATH = path.resolve(SRC_DIR, "../openapi/openapi.json");

/** B1'in taradığı planlama kaynak klasörleri (SRC_DIR'e göre). */
const SCANNED_DIRS = [
  "components/earned-value",
  "lib/earned-value",
  "components/catalog-shared",
  "app/(app)/planlama/birim-oran-katalogu",
];
/** `lib/api/hooks/` altında taranan EV hook dosyaları (test olmayanlar). */
const HOOKS_DIR = "lib/api/hooks";
const EV_HOOK_FILE = /^useEv.*\.tsx?$/;

/** Yasaklı belirteçler (yorum soyulduktan sonra, kod metninde aranır). */
const FORBIDDEN_TEXT = [
  "ref_price",
  "price_updated_at",
  "useCatalogItems",
  "useCreateCatalogItem",
  "useUpdateCatalogItem",
  "/catalog/items",
  "catalog-items",
  "CATALOG_ITEMS_QUERY_KEY",
] as const;
/** `WorkItemRead` · `WorkItemCreate` · `WorkItemUpdate` … — çekirdek (fiyatlı) tip aileleri. */
const FORBIDDEN_TYPE_FAMILY = /\bWorkItem[A-Za-z]*/;
const TYPE_FAMILY_LABEL = "WorkItem*";

/**
 * İSTİSNA (TEK): KAT yazması çekirdek `catalog-items` ÖNBELLEĞİNİ tazelemek zorundadır
 * (T22: disiplin/kalem yazması poz no'yu yeniden yazar). Bu yalnız anahtar SABİTİNİN
 * kullanımıdır — fiyat alanı/okuyucu/uç değil. Satırlar BİREBİR (kırpılmış) eşleşir; satır
 * değişirse ya da başka bir yere sızarsa bekçi kırmızıdır. Her satır dosyada VAR olmalıdır.
 */
const CROSS_INVALIDATION_ALLOW: Readonly<Record<string, readonly string[]>> = {
  "lib/api/hooks/useEvCatalog.ts": [
    'import { CATALOG_ITEMS_QUERY_KEY, EV_CATALOG_QUERY_KEY, EV_DISCIPLINES_QUERY_KEY } from "./catalog-query-keys";',
    "qc.invalidateQueries({ queryKey: [CATALOG_ITEMS_QUERY_KEY] }),",
  ],
  "lib/api/hooks/useEvDisciplines.ts": [
    "CATALOG_ITEMS_QUERY_KEY,",
    "qc.invalidateQueries({ queryKey: [CATALOG_ITEMS_QUERY_KEY] }),",
  ],
};

/** Test OLMAYAN `.ts/.tsx/.css` kaynakları. */
function productionSources(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return productionSources(full);
    return /\.(tsx?|css)$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : [];
  });
}

function evHookSources(): string[] {
  const dir = path.join(SRC_DIR, HOOKS_DIR);
  return readdirSync(dir)
    .filter((entry) => EV_HOOK_FILE.test(entry) && !/\.test\.tsx?$/.test(entry))
    .map((entry) => path.join(dir, entry));
}

/** Kaynakta geçen yasaklı belirteçler; `allowedLines` (kırpılmış satır eşitliği) sayılmaz. */
export function forbiddenTokensIn(source: string, allowedLines: readonly string[] = []): string[] {
  const lines = stripComments(source)
    .split("\n")
    .filter((line) => !allowedLines.includes(line.trim()));
  const code = lines.join("\n");
  return [
    ...FORBIDDEN_TEXT.filter((token) => code.includes(token)),
    ...(FORBIDDEN_TYPE_FAMILY.test(code) ? [TYPE_FAMILY_LABEL] : []),
  ];
}

describe("B1 · planlama kaynakları fiyat belirteci içermez", () => {
  it("bekçinin kendisi: kodu görür, yorumu saymaz", () => {
    expect(forbiddenTokensIn("const x = item.ref_price;")).toEqual(["ref_price"]);
    expect(forbiddenTokensIn('fetch("/catalog/items"); useCatalogItems(); p.price_updated_at')).toEqual([
      "price_updated_at",
      "useCatalogItems",
      "/catalog/items",
    ]);
    expect(forbiddenTokensIn("// ref_price burada yok\n/* useCatalogItems */ const a = 1;")).toEqual([]);
  });

  it("bekçinin kendisi: düz anahtar, anahtar sabiti, yazma hook'ları ve WorkItem* tipleri", () => {
    expect(forbiddenTokensIn('qc.invalidateQueries({ queryKey: ["catalog-items"] })')).toEqual(["catalog-items"]);
    expect(forbiddenTokensIn("import { CATALOG_ITEMS_QUERY_KEY } from './k';")).toEqual(["CATALOG_ITEMS_QUERY_KEY"]);
    expect(forbiddenTokensIn("useCreateCatalogItem(); useUpdateCatalogItem();")).toEqual([
      "useCreateCatalogItem",
      "useUpdateCatalogItem",
    ]);
    expect(forbiddenTokensIn("let a: WorkItemRead; let b: WorkItemCreate;")).toEqual(["WorkItem*"]);
  });

  it("bekçinin kendisi: izin satırı YALNIZ birebir eşleşen satırı affeder", () => {
    const allowed = ["qc.invalidateQueries({ queryKey: [CATALOG_ITEMS_QUERY_KEY] }),"];
    const line = "    qc.invalidateQueries({ queryKey: [CATALOG_ITEMS_QUERY_KEY] }),";
    expect(forbiddenTokensIn(line, allowed)).toEqual([]);
    expect(forbiddenTokensIn(`${line}\nconst k = CATALOG_ITEMS_QUERY_KEY;`, allowed)).toEqual(["CATALOG_ITEMS_QUERY_KEY"]);
    expect(forbiddenTokensIn(line.replace("}),", "}), x"), allowed)).toEqual(["CATALOG_ITEMS_QUERY_KEY"]);
  });

  for (const dir of SCANNED_DIRS) {
    it(`${dir}/** (test olmayan kaynaklar) fiyat alanı/hook/anahtar/uç/tip içermez`, () => {
      const files = productionSources(path.join(SRC_DIR, dir));
      expect(files.length).toBeGreaterThan(0);
      const hits = files.flatMap((file) =>
        forbiddenTokensIn(readFileSync(file, "utf8")).map((token) => `${path.relative(SRC_DIR, file)} → ${token}`),
      );
      expect(hits).toEqual([]);
    });
  }

  it(`${HOOKS_DIR}/useEv*.ts içinde YALNIZ izinli çapraz geçersizleme satırları`, () => {
    const files = evHookSources();
    expect(files.length).toBeGreaterThanOrEqual(5);
    const hits = files.flatMap((file) => {
      const relative = path.relative(SRC_DIR, file).split(path.sep).join("/");
      return forbiddenTokensIn(readFileSync(file, "utf8"), CROSS_INVALIDATION_ALLOW[relative] ?? []).map(
        (token) => `${relative} → ${token}`,
      );
    });
    expect(hits).toEqual([]);
  });

  it("izin listesi bayatlamaz: her izinli satır dosyada hâlâ VAR (içeriğe kilitli)", () => {
    for (const [relative, lines] of Object.entries(CROSS_INVALIDATION_ALLOW)) {
      const present = stripComments(readFileSync(path.join(SRC_DIR, relative), "utf8"))
        .split("\n")
        .map((line) => line.trim());
      for (const line of lines) expect(present, `${relative}: ${line}`).toContain(line);
    }
  });
});

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
interface OpenApiSpec {
  paths: Record<string, Json>;
  components: { schemas: Record<string, Json> };
}

function loadSpec(): OpenApiSpec {
  return JSON.parse(readFileSync(OPENAPI_PATH, "utf8")) as OpenApiSpec;
}

const PRICE_PROPERTIES = ["ref_price", "price_updated_at"] as const;
const EV_PATH_MARKER = "/earned-value";
const SCHEMA_REF_PREFIX = "#/components/schemas/";

/**
 * `roots`tan ($ref kapanışıyla) erişilen şemalarda fiyat özelliği arar; bulduklarını
 * `şema.özellik` olarak döner. Düğüm gezgini keyfi derinlikte (properties, items, allOf/anyOf/
 * oneOf, additionalProperties, parametreler …) çalışır; döngü `visited` ile kesilir.
 */
export function priceHitsReachableFrom(spec: OpenApiSpec, roots: Record<string, Json>): { hits: string[]; reached: string[] } {
  const visited = new Set<string>();
  const hits: string[] = [];

  function walk(node: Json, label: string): void {
    if (Array.isArray(node)) return node.forEach((child) => walk(child, label));
    if (node === null || typeof node !== "object") return;
    const ref = node.$ref;
    if (typeof ref === "string" && ref.startsWith(SCHEMA_REF_PREFIX)) {
      const name = ref.slice(SCHEMA_REF_PREFIX.length);
      if (!visited.has(name)) {
        visited.add(name);
        walk(spec.components.schemas[name] ?? null, name);
      }
    }
    const properties = node.properties;
    if (properties !== null && typeof properties === "object" && !Array.isArray(properties)) {
      for (const property of PRICE_PROPERTIES) {
        if (property in properties) hits.push(`${label}.${property}`);
      }
    }
    for (const [key, child] of Object.entries(node)) if (key !== "$ref") walk(child, label);
  }

  for (const [route, item] of Object.entries(roots)) walk(item, route);
  return { hits, reached: [...visited].sort() };
}

function evRoots(spec: OpenApiSpec): Record<string, Json> {
  return Object.fromEntries(Object.entries(spec.paths).filter(([route]) => route.includes(EV_PATH_MARKER)));
}

describe("B2 · openapi: /earned-value altındaki HİÇBİR yanıt/gövde şeması fiyat özelliği taşımaz", () => {
  it("bekçinin kendisi: $ref kapanışıyla DERİNDEKİ fiyat özelliğini bulur, döngüde takılmaz", () => {
    const spec: OpenApiSpec = {
      paths: { "/earned-value/x": { get: { responses: { "200": { content: { "application/json": { schema: { $ref: "#/components/schemas/A" } } } } } } } },
      components: {
        schemas: {
          A: { type: "object", properties: { items: { type: "array", items: { $ref: "#/components/schemas/B" } } } },
          B: { allOf: [{ $ref: "#/components/schemas/C" }, { $ref: "#/components/schemas/A" }] },
          C: { type: "object", properties: { id: { type: "string" }, ref_price: { type: "string" } } },
        },
      },
    };
    const found = priceHitsReachableFrom(spec, evRoots(spec));
    expect(found.hits).toEqual(["C.ref_price"]);
    expect(found.reached).toEqual(["A", "B", "C"]);
    spec.components.schemas.C = { type: "object", properties: { id: { type: "string" } } };
    expect(priceHitsReachableFrom(spec, evRoots(spec)).hits).toEqual([]);
  });

  it("bekçi GERÇEKTEN ölçüyor: EV yolları var, KAT şemaları erişilir, çekirdek WorkItemRead erişilMEZ ama fiyatı taşır", () => {
    const spec = loadSpec();
    const roots = evRoots(spec);
    expect(Object.keys(roots).length).toBeGreaterThanOrEqual(10);
    const { reached } = priceHitsReachableFrom(spec, roots);
    expect(reached).toEqual(expect.arrayContaining(["CatalogItemRead", "CatalogItemCreate", "CatalogItemUpdate", "ItemOut"]));
    expect(reached).not.toContain("WorkItemRead");
    const core = priceHitsReachableFrom(spec, { "/catalog/items": spec.paths["/catalog/items"] ?? null });
    expect(core.hits).toEqual(expect.arrayContaining(["WorkItemRead.ref_price", "WorkItemRead.price_updated_at"]));
  });

  it("EV yanıt/gövde şemalarının hiçbirinde ref_price / price_updated_at YOK", () => {
    const spec = loadSpec();
    expect(priceHitsReachableFrom(spec, evRoots(spec)).hits).toEqual([]);
  });
});
