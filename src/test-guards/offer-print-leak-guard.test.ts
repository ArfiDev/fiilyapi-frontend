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
//   a) Kapanıştaki `offer-print/` ve `print-sheet/` dosyaları (yorumlar soyulur) iç alan adını ve
//      iç etiketlerini İÇERMEZ.
//   b) Kapanış İÇ bileşen/modelini (`*Internal*`) ve izin listesi dışı modülü İTHAL ETMEZ
//      (`@/lib/api/...` tipleri dahil: işveren girdisi YAPISAL dar tiplerdir, API tipine bağlanmaz).
// Bekçinin kendi kendini sınayan testleri aşağıdadır (sahte dosya sistemi).
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { stripComments } from "./_shared/strip-comments";

const SRC_DIR = fileURLToPath(new URL("..", import.meta.url));
const ENTRY = "components/offer-print/OfferCustomerPrint.tsx";
/** İçeriği taranan klasörler (kapanışın bunlara düşen dosyaları). */
const SCANNED_PREFIXES = ["components/offer-print/", "components/print-sheet/"];
/** Kapanışın dışarıdan ithal edebileceği TEK modüller (iç alan taşımayan saf yardımcılar). */
const SAFE_EXTERNAL = [/^react$/, /^@\/lib\/format$/, /^@\/lib\/decimal$/, /^@\/lib\/cx$/, /^@\/lib\/contract-labels$/];
/** İç alan adları + iç etiketler (yorum soyulmuş kodda, büyük/küçük harf duyarsız). */
const FORBIDDEN =
  /internal|cost_unit_price|overhead|profit|man_hours|unit_mhr|offer_unit_price|\bcost|maliyet|gider|\bgg\b|kâr|a-s\b|adam-saat/i;
const FORBIDDEN_FILE = /internal/i;
const IMPORT_TARGET = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s+)["']([^"']+)["']/gm;
const SOURCE_EXT = [".ts", ".tsx"];
const STYLE_OR_ASSET = /\.(css|svg|png)$/;

export function importTargets(source: string): string[] {
  return [...stripComments(source).matchAll(IMPORT_TARGET)].map((match) => match[1]!);
}

export function forbiddenHits(source: string): string[] {
  const code = stripComments(source);
  return code
    .split("\n")
    .flatMap((line, index) => (FORBIDDEN.test(line) ? [`satır ${index + 1}: ${line.trim()}`] : []));
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

/** `entry`nin ithal kapanışı + ihlaller (iç dosya ithali · izin dışı modül · taranan dosyada iç ad). */
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
      for (const hit of forbiddenHits(source)) violations.push(`${rel} → ${hit}`);
    }
    for (const target of importTargets(source)) {
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

  it("kapanıştaki hiçbir dosya iç alan/etiket anmaz; iç dosya ve izin dışı modül ithal edilmez", () => {
    expect(closure.violations).toEqual([]);
  });
});

describe("bekçinin kendisi (sahte dosya sistemi)", () => {
  const fs = (files: Record<string, string>): Reader => (rel) => files[rel] ?? null;
  const ENTRY_FAKE = "components/offer-print/OfferCustomerPrint.tsx";

  it("işveren bileşenine iç alan basılırsa kırmızı", () => {
    const closure = analyzeClosure(ENTRY_FAKE, fs({ [ENTRY_FAKE]: "const x = item.cost_unit_price;" }));
    expect(closure.violations.join("\n")).toContain("cost_unit_price");
  });

  it("iç nesne / iç etiket / adam-saat de yakalanır", () => {
    for (const code of ["item.internal.profit", "const a = 'Genel gider';", "totals.internal.man_hours", "label: 'Maliyet'"]) {
      expect(analyzeClosure(ENTRY_FAKE, fs({ [ENTRY_FAKE]: code })).violations).not.toEqual([]);
    }
  });

  it("iç bileşenden ithal edilirse kırmızı (ithal grafiği)", () => {
    const closure = analyzeClosure(
      ENTRY_FAKE,
      fs({
        [ENTRY_FAKE]: 'import { helper } from "./OfferInternalPrint";',
        "components/offer-print/OfferInternalPrint.tsx": "export const helper = 1;",
      }),
    );
    expect(closure.violations.join("\n")).toContain("iç dosya kapanışta");
  });

  it("yardımcı üzerinden DOLAYLI ithal de yakalanır (A → B → İç)", () => {
    const closure = analyzeClosure(
      ENTRY_FAKE,
      fs({
        [ENTRY_FAKE]: 'import { b } from "./b";',
        "components/offer-print/b.ts": 'export { c } from "./print-model-internal";',
        "components/offer-print/print-model-internal.ts": "export const c = 1;",
      }),
    );
    expect(closure.violations.join("\n")).toContain("iç dosya kapanışta");
  });

  it("izin listesi dışı modül (API tipi / başka ekran) reddedilir", () => {
    const closure = analyzeClosure(
      ENTRY_FAKE,
      fs({
        [ENTRY_FAKE]: 'import type { OfferItemRead } from "@/lib/api/hooks/useOffers"; import { x } from "@/components/offers/offer-status";',
        "lib/api/hooks/useOffers.ts": "export type OfferItemRead = {};",
        "components/offers/offer-status.ts": "export const x = 1;",
      }),
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
      expect(analyzeClosure(ENTRY_FAKE, fs({ [ENTRY_FAKE]: code })).violations.join("\n")).toContain("izin listesi dışı");
    }
  });
});
