// @vitest-environment node
//
// SSR GİZLİ KOPYA BEKÇİSİ (SSR-LOC-F1).
//
// SORUN: Next akış (streaming) SSR'ında `<Suspense>` askıya alınan sayfada React
// içeriği önce `<body>` altında `<div hidden id="S:…">` içine koyar, sonra
// `<main>`e taşır; `goto` sonrası ~270 ms'ye kadar aynı öğe DOM'da İKİ KEZ vardır.
// Playwright `getByTestId` gizli öğeyi de sayar → `page.getByTestId(...)` strict
// mode ihlaliyle patlar (~%25 oranında, throttle 8'de ölçüldü; aralıklı = flaky).
//
// ÖLÇÜM: yalnız 5 rota bunu yapıyor (şantiye altı: stok, puantaj, belgeler,
// gunluk-kayit, gunluk-kayit/planlama). Gizli kopyada data-testid'li öğe YALNIZ
// stok rotasında var ve tam olarak üçü: `santiye-stok-giris-link`,
// `santiye-stok-pending-notice`, `santiye-stok-kpi-strip`.
//
// KANON: `page.locator("main").getByTestId(...)` (ya da `main` kabı üzerinden
// türetilmiş `content.getByTestId(...)`). `getByRole` varsayılan
// `includeHidden: false` olduğu için `display:none` gizli kopyayı saymaz → MUAF.
//
// KAPSAM DIŞI: `.first()` yamaları (yasak; kök neden kabı daraltmaktır).
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

import { stripComments } from "./_shared/strip-comments";

const FRONTEND_DIR = fileURLToPath(new URL("../..", import.meta.url));
const SRC_DIR = path.join(FRONTEND_DIR, "src");
const E2E_DIR = path.join(FRONTEND_DIR, "e2e");
const SITE_ROUTES_DIR = path.join(SRC_DIR, "app/(app)/projeler/[projectId]/santiyeler/[siteId]");

/** Akış SSR'ında gizli kopya üreten (ölçülmüş) rotalar; SITE_ROUTES_DIR'e göre. */
const SSR_STREAMED_SITE_ROUTES = [
  "belgeler/page.tsx",
  "gunluk-kayit/page.tsx",
  "gunluk-kayit/planlama/page.tsx",
  "puantaj/page.tsx",
  "stok/page.tsx",
] as const;

/** Gizli kopyada bulunan data-testid'ler. */
const HIDDEN_COPY_TESTIDS = [
  "santiye-stok-giris-link",
  "santiye-stok-pending-notice",
  "santiye-stok-kpi-strip",
] as const;

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

export interface BareTestIdAccess {
  line: number;
  testId: string;
}

/**
 * `page.getByTestId("<gizli-id>"` ÇIPLAK erişimini bulur (çok satırlı zincir,
 * tek/çift tırnak ve backtick dahil). Kap üzerinden erişim eşleşmez.
 */
export function findBareHiddenTestIdAccess(source: string): BareTestIdAccess[] {
  const ids = HIDDEN_COPY_TESTIDS.join("|");
  const re = new RegExp(`\\bpage\\s*\\.\\s*getByTestId\\(\\s*["'\`](${ids})`, "g");
  return [...source.matchAll(re)].map((match) => ({
    line: source.slice(0, match.index).split("\n").length,
    testId: match[1],
  }));
}

describe("SSR gizli kopya bekçisi", () => {
  it("(a) Suspense'li şantiye sayfaları ölçülmüş rota listesiyle EŞİT", () => {
    const actual = walk(SITE_ROUTES_DIR)
      .filter((file) => path.basename(file) === "page.tsx")
      .filter((file) => /<Suspense\b/.test(stripComments(readFileSync(file, "utf8"))))
      .map((file) => path.relative(SITE_ROUTES_DIR, file).split(path.sep).join("/"))
      .sort();
    expect(
      actual,
      "yeni Suspense'li şantiye sayfası: gizli kopyayı ölç ve listeye/testid listesine ekle",
    ).toEqual([...SSR_STREAMED_SITE_ROUTES].sort());
  });

  it("(b) gizli kopya testid'leri kaynakta GERÇEKTEN var", () => {
    const corpus = walk(SRC_DIR)
      .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    const missing = HIDDEN_COPY_TESTIDS.filter((id) => !corpus.includes(`"${id}"`));
    expect(missing, "testid kaynakta yok (yeniden adlandırıldıysa listeyi güncelle)").toEqual([]);
  });

  it("(c) e2e/ altında gizli kopya testid'ine page.getByTestId ile çıplak erişim YOK", () => {
    const violations = walk(E2E_DIR)
      .filter((file) => file.endsWith(".ts"))
      .flatMap((file) =>
        findBareHiddenTestIdAccess(stripComments(readFileSync(file, "utf8"))).map(
          (hit) => `${path.relative(FRONTEND_DIR, file)}:${hit.line} (${hit.testId})`,
        ),
      );
    expect(violations, 'page.locator("main").getByTestId(...) kullan').toEqual([]);
  });

  it("(d) POZİTİF KONTROL: eşleştirici kötüyü yakalar, iyiyi yakalamaz", () => {
    const id = HIDDEN_COPY_TESTIDS[0];
    const bad = [
      `await page.getByTestId("${id}").click();`,
      `await page.getByTestId('${id}').click();`,
      `await page.getByTestId(\`${id}\`).click();`,
      `await page\n  .getByTestId(\n    "${id}",\n  ).click();`,
    ];
    for (const sample of bad) {
      expect(findBareHiddenTestIdAccess(sample), sample).toHaveLength(1);
    }
    const good = [
      `page.locator("main").getByTestId("${id}")`,
      `content.getByTestId("${id}")`,
      `page.getByTestId("baska-id")`,
    ];
    for (const sample of good) {
      expect(findBareHiddenTestIdAccess(sample), sample).toEqual([]);
    }
  });
});
