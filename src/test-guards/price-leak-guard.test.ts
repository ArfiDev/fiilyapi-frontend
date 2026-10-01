// @vitest-environment node
//
// TKL-F1.2 · FİYAT SIZINTI BEKÇİLERİ (TKL-F1-PLAN §2.4 / §6).
//
// Referans fiyat YALNIZ çekirdek İş Kalemi Kataloğu ucundan (`/catalog/items`,
// `contracts` kapısı) döner. Planlama (EV / KAT) ucu fiyatsızdır ve `earned_value`
// kapısı fiyat yetkisi VERMEZ. Gizleme backend'dedir; frontend yalnız yansıtır —
// ama KAT tarafına fiyat alanı/okuyucu sızarsa (ya da backend EV şemasına fiyat
// eklerse) `contracts:none` rol fiyatı görür. İki bekçi bunu kilitler:
//   B1 · EV kaynakları fiyat alanını / çekirdek katalog hook'unu / ucunu anmaz.
//   B2 · openapi'de EV katalog şemaları fiyat özelliği TAŞIMAZ (backend gerilemesi).
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { stripComments } from "./_shared/strip-comments";

const SRC_DIR = fileURLToPath(new URL("..", import.meta.url));
const OPENAPI_PATH = path.resolve(SRC_DIR, "../openapi/openapi.json");

/** B1'in taradığı planlama kaynak klasörleri. */
const EV_DIRS = ["components/earned-value", "lib/earned-value"];
/** Yasaklı belirteçler (yorum soyulduktan sonra, kod metninde aranır). */
const FORBIDDEN = ["ref_price", "price_updated_at", "useCatalogItems", "/catalog/items"] as const;

/** Test OLMAYAN `.ts/.tsx/.css` kaynakları. */
function productionSources(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return productionSources(full);
    return /\.(tsx?|css)$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : [];
  });
}

/** Kaynakta geçen yasaklı belirteçler. */
export function forbiddenTokensIn(source: string): string[] {
  const code = stripComments(source);
  return FORBIDDEN.filter((token) => code.includes(token));
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

  for (const dir of EV_DIRS) {
    it(`${dir}/** (test olmayan kaynaklar) fiyat alanı/hook/uç içermez`, () => {
      const files = productionSources(path.join(SRC_DIR, dir));
      expect(files.length).toBeGreaterThan(0);
      const hits = files.flatMap((file) =>
        forbiddenTokensIn(readFileSync(file, "utf8")).map((token) => `${path.relative(SRC_DIR, file)} → ${token}`),
      );
      expect(hits).toEqual([]);
    });
  }
});

interface OpenApiSchema {
  properties?: Record<string, unknown>;
}

function schemas(): Record<string, OpenApiSchema> {
  const spec = JSON.parse(readFileSync(OPENAPI_PATH, "utf8")) as {
    components: { schemas: Record<string, OpenApiSchema> };
  };
  return spec.components.schemas;
}

const EV_CATALOG_SCHEMAS = ["CatalogItemRead", "CatalogItemCreate", "CatalogItemUpdate"] as const;
const PRICE_PROPERTIES = ["ref_price", "price_updated_at"] as const;

describe("B2 · openapi: EV katalog şemaları fiyat özelliği taşımaz", () => {
  it("bekçi GERÇEKTEN ölçüyor: EV şemaları var, çekirdek WorkItemRead fiyatı taşıyor", () => {
    const all = schemas();
    for (const name of EV_CATALOG_SCHEMAS) {
      expect(Object.keys(all[name]?.properties ?? {}), `${name}.properties`).toContain("name");
    }
    expect(Object.keys(all.WorkItemRead?.properties ?? {})).toEqual(expect.arrayContaining([...PRICE_PROPERTIES]));
  });

  for (const name of EV_CATALOG_SCHEMAS) {
    it(`${name} ref_price / price_updated_at TAŞIMAZ`, () => {
      const properties = Object.keys(schemas()[name]?.properties ?? {});
      expect(properties.filter((p) => (PRICE_PROPERTIES as readonly string[]).includes(p))).toEqual([]);
    });
  }
});
