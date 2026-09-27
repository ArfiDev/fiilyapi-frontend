// @vitest-environment node
// SEKME-F1.4c BEKÇİSİ: kabuk (`src/components/shell/**`) 23 KB'lık
// `earned-value/settings/planning-settings.css`i ARTIK import ETMEMELİ —
// yalnız `.ev-unsaved-modal*` kuralları taşındığı küçük
// `unsaved-changes-modal.css`i import edebilir.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, it, expect } from "vitest";

const SHELL_ROOT = fileURLToPath(new URL("../", import.meta.url));

function listSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...listSourceFiles(full));
      continue;
    }
    if (/\.(tsx?|jsx?)$/.test(entry) && !/\.test\./.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

// Yalnız gerçek `import "...planning-settings.css"` bildirimini yakalar —
// yorumlardaki serbest metin geçmişi anlatabilir (ör. bu dosyanın taşıma
// gerekçesi), o bir ihlal DEĞİL.
const IMPORT_PATTERN = /import\s+["'][^"']*planning-settings\.css["']/;

describe("shell ağacı: planning-settings.css import etmez", () => {
  it("🔴 BEKÇİ: hiçbir shell kaynak dosyası `planning-settings.css` import etmiyor", () => {
    const offenders = listSourceFiles(SHELL_ROOT).filter((file) =>
      IMPORT_PATTERN.test(readFileSync(file, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
