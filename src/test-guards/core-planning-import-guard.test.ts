// @vitest-environment node
//
// DET-1.3 · §2.7 MODÜLERLİK BEKÇİSİ — çekirdek günlük modülleri planlama
// (earned-value) kodunu İTHAL ETMEZ.
//
// KÖK KURAL (PLANLAMA-SPEC §2.7): planlama modülü müşteride kurulu değilse
// günlük ekranı ve günlük kayıt detayı bugünkü gibi çalışmalıdır. İki yüzey
// planlamayla YALNIZ uzantı yuvası tipleriyle konuşur
// (`site-diary/diary-extension.ts` · `site-diary-detail/detail-extension.ts`);
// yuvayı dolduran adaptör `components/earned-value/**` altındadır.
//
// Bu kural önceden YALNIZ yorumlarda yazılıydı (ölçüldü: DET-1.3 öncesi
// `src/` altında §2.7 import bekçisi YOKTU). Bekçi kaynak METNİNİ tarar:
// yorumlar soyulur, `import … from "…"` / `import("…")` / `require("…")`
// hedefleri planlama yollarına karşı denetlenir.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC_DIR = fileURLToPath(new URL("..", import.meta.url));
// TKL-F1.3 · fiyatlı İş Kalemi Kataloğu (`contracts` kapısı) ve onun KAT ile paylaştığı
// saf parçalar da çekirdektir: planlama (EV) ithali yasak (TKL-F1-PLAN §2.5).
const CORE_DIRS = [
  "components/site-diary",
  "components/site-diary-detail",
  "components/work-item-catalog",
  "components/catalog-shared",
];

/** Planlama modülünün yolları: bileşenleri, saf kütüphanesi ve `useEv*` sorguları. */
const PLANNING_IMPORT = /^@\/(components\/earned-value(\/|$)|lib\/earned-value(\/|$)|lib\/api\/hooks\/useEv)/;
const IMPORT_TARGET = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s+)["']([^"']+)["']/gm;

function productionSources(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return productionSources(full);
    return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : [];
  });
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Dosyanın planlama yollarına giden ithalleri. */
export function planningImportsIn(source: string): string[] {
  const code = stripComments(source);
  return [...code.matchAll(IMPORT_TARGET)].map((match) => match[1]).filter((target) => PLANNING_IMPORT.test(target));
}

describe("§2.7 bekçisinin kendisi", () => {
  it("statik, dinamik ve yan etkili ithali görür; yorumdaki yolu saymaz", () => {
    const source = [
      'import { PfBadge } from "@/components/earned-value/diary/PfBadge";',
      'import type { EvDayView } from "@/lib/api/models";',
      'const m = await import("@/lib/earned-value");',
      'import "@/components/earned-value/diary/diary-progress.css";',
      'import { useEvDay } from "@/lib/api/hooks/useEvDay";',
      '// import { x } from "@/components/earned-value/common/state";',
      'import { formatDateDots } from "@/lib/format";',
    ].join("\n");

    expect(planningImportsIn(source)).toEqual([
      "@/components/earned-value/diary/PfBadge",
      "@/lib/earned-value",
      "@/components/earned-value/diary/diary-progress.css",
      "@/lib/api/hooks/useEvDay",
    ]);
  });
});

describe("§2.7 — çekirdek modüller (günlük + katalog) planlamayı ithal etmez", () => {
  for (const dir of CORE_DIRS) {
    it(`${dir}/** planlama yolu ithal etmez`, () => {
      const files = productionSources(path.join(SRC_DIR, dir));
      expect(files.length).toBeGreaterThan(0);
      const hits = files.flatMap((file) =>
        planningImportsIn(readFileSync(file, "utf8")).map((target) => `${path.relative(SRC_DIR, file)} → ${target}`),
      );
      expect(hits).toEqual([]);
    });
  }
});
