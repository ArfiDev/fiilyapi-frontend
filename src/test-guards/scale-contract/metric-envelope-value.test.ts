// @vitest-environment node
//
// TYPE-F1 FAZ 2d (madde 4) — `MetricPlaceholder` ZARFININ İÇ `.value` ALANI
// bekçisi. `mock-scale-contract.test.ts` (Katman 2) `SCALE_TABLE`deki
// `scale !== "not-scale"` satırları doğrular ve zarf satırlarını (`not-scale`)
// BİLEREK atlar — zarfın kendisi ölçekli değildir, İÇİNDEKİ `.value` ölçekli
// olabilir. Bu dosya YALNIZ `innerScale: "percent"` işaretli zarf satırlarının
// `.value`sunu, `scale-assertions.ts`teki AYNI percent kuralıyla (±100/10000
// sınırı + "en az bir değer |v|>1" ÷100 ters ölçek testi) denetler.
//
// Yürüyücü (`schema-walker.ts`) FAZ 2d'de genişletildi: bir alan artık YALNIZ
// ad regex'iyle (`pct|ratio|share|rate|percent|band`) DEĞİL, şemasının
// `MetricPlaceholder`e `$ref` VERMESİYLE de gözlenir — `physical_progress`,
// `margin`, `average_margin` gibi adlar regex'e UYMAZ ama zarf taşır.
//
// NULL KURALI (madde 4): `.value` null/undefined ise o gözlem ATLANIR
// (restricted/pending hâli, ölçek ihlali değil). Bir (schema, field) çiftinin
// TÜM gözlemlerinde `.value` null ise (hiç dolu örnek yoksa) o satır
// "gözlenmemiş" sayılır ve `MOCK_DISI_ENVELOPE`de GEREKÇEYLE yer almalıdır.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import nodePath from "node:path";

import { startMockBackend } from "../../../e2e/mock-backend";
import { SCALE_TABLE, type ScaleRow } from "@/lib/api/scale-table";
import { buildScaleUrls, type JsonGetter, type ScaleUrlEntry } from "./scale-urls";
import { walkResponse, type ObservedValues } from "./schema-walker";
import { checkScaleRow, ENVELOPE_PERCENT_MAX, type ScaleViolation } from "./scale-assertions";
import { schemaKey } from "./openapi-scale-fields";

interface OpenApiOperation {
  responses?: Record<string, { content?: Record<string, { schema?: unknown }> }>;
}
interface OpenApiDoc {
  paths: Record<string, Record<string, OpenApiOperation>>;
  components?: { schemas?: Record<string, unknown> };
}

function loadOpenApi(): OpenApiDoc {
  const file = nodePath.join(process.cwd(), "openapi", "openapi.json");
  return JSON.parse(readFileSync(file, "utf-8")) as OpenApiDoc;
}

function get200Schema(doc: OpenApiDoc, pathTemplate: string): unknown | null {
  const bareTemplate = pathTemplate.replace(/^GET\s+/, "");
  const op = doc.paths[bareTemplate]?.get;
  const schema = op?.responses?.["200"]?.content?.["application/json"]?.schema;
  return schema ?? null;
}

/** Bir `MetricPlaceholder` zarf nesnesinden `.value`i çıkarır — null/undefined ELENİR. */
function extractEnvelopeValue(raw: unknown): unknown | null {
  if (raw === null || typeof raw !== "object") return null;
  const value = (raw as Record<string, unknown>).value;
  return value === null || value === undefined ? null : value;
}

interface MockDisiEnvelopeEntry {
  schema: string;
  field: string;
  reason: string;
}

/**
 * `innerScale: "percent"` satırlarından mock yanıtlarında HİÇ dolu (`.value`
 * null-olmayan) örneği bulunmayanlar, GERÇEK GEREKÇESİYLE. Ölçüldü —
 * `e2e/mock-backend.ts`teki `METRIC_PENDING(...)` çağrıları GREP'lendi (bkz.
 * satır numaraları), UYDURMA gerekçe YOK. Aşağıdaki "KAPSAM" testi her ikisini
 * de (fazladan/eksik satır) doğrular.
 */
const MOCK_DISI_ENVELOPE: readonly MockDisiEnvelopeEntry[] = [
  {
    schema: "InvestmentCard",
    field: "sales_ratio",
    reason:
      "mock hiç doldurmuyor: backend'de 'sales_ratio' hesaplayan formül YOK (scale-table.ts notu) — P10 kapsamı dışı, alan HER ZAMAN yer tutucu (available:false/value:null) döner (cards.py:51,231, ÖLÇÜLMÜŞ, faz 2d'de doğrulandı).",
  },
  {
    schema: "SectionResponse",
    field: "progress_pct",
    reason: "mock hiç doldurmuyor: e2e/mock-backend.ts:3232 buildSectionListItems() → METRIC_PENDING('progress_payments'), HER zaman.",
  },
  {
    schema: "SiteDetailResponse",
    field: "progress_pct",
    reason: "mock hiç doldurmuyor: e2e/mock-backend.ts:3283 buildSiteDetail() → METRIC_PENDING('progress_payments'), HER zaman.",
  },
  {
    schema: "LandShareCard",
    field: "construction_progress",
    reason: "mock hiç doldurmuyor: e2e/mock-backend.ts:1303 (kat-karşılığı fikstürü) → METRIC_PENDING('progress_payments'), HER zaman.",
  },
  {
    schema: "SiteCard",
    field: "progress_pct",
    reason: "mock hiç doldurmuyor: e2e/mock-backend.ts:8797 (GET /projects/{id}/sites) → METRIC_PENDING('progress_payments'), HER zaman.",
  },
  {
    schema: "BoqItemResponse",
    field: "progress_pct",
    reason: "mock hiç doldurmuyor: e2e/mock-backend.ts:9178 (GET /sites/{id}/boq kalem satırı) → METRIC_PENDING('progress_payments'), HER zaman.",
  },
  {
    schema: "BoqTotals",
    field: "grand_progress_pct",
    reason: "mock hiç doldurmuyor: e2e/mock-backend.ts:9202 (GET /sites/{id}/boq toplamı) → METRIC_PENDING('progress_payments'), HER zaman.",
  },
  {
    schema: "SectionDetailResponse",
    field: "progress_pct",
    reason: "mock hiç doldurmuyor: e2e/mock-backend.ts:9232 (GET /sections/{id}) → METRIC_PENDING('progress_payments'), HER zaman.",
  },
  {
    schema: "DashboardSummaryResponse",
    field: "average_margin",
    reason: "mock hiç doldurmuyor: e2e/mock-backend.ts:8594 ve :8817 (GET /dashboard/summary'nin iki kod yolu) → ikisi de average_margin'i available:false/value:null döner, HER zaman.",
  },
];

describe("metric-envelope-value · TYPE-F1 FAZ 2d (madde 4) — zarf .value percent bekçisi", () => {
  let close: () => Promise<void>;
  let baseUrl: string;
  let bearer = "";
  let scaleUrls: { entries: ScaleUrlEntry[]; skipped: { path: string; reason: string }[] };
  const observedGlobal: ObservedValues = new Map();
  const doc = loadOpenApi();

  const percentEnvelopeRows: readonly ScaleRow[] = SCALE_TABLE.filter(
    (row) => row.scale === "not-scale" && row.innerScale === "percent",
  );

  const jsonGet: (url: string) => Promise<{ status: number; body: unknown }> = async (url) => {
    const res = await fetch(`${baseUrl}${url}`, {
      headers: bearer ? { authorization: `Bearer ${bearer}` } : undefined,
    });
    const text = await res.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { status: res.status, body };
  };

  beforeAll(async () => {
    const mock = startMockBackend(0);
    close = mock.close;
    const address = mock.server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;

    const loginRes = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "test", password: "test" }),
    });
    const login = (await loginRes.json()) as { access_token: string };
    bearer = login.access_token;

    scaleUrls = await buildScaleUrls(jsonGet as JsonGetter);

    for (const entry of scaleUrls.entries) {
      const schema = get200Schema(doc, entry.path);
      if (!schema) continue;
      const { body } = await jsonGet(entry.url);
      const observed = walkResponse(schema as never, body, doc as never);
      for (const [key, values] of observed) {
        const list = observedGlobal.get(key);
        if (list) list.push(...values);
        else observedGlobal.set(key, [...values]);
      }
    }
  }, 20_000);

  afterAll(async () => {
    await close();
  });

  it("innerScale:percent zarflarının .value'su GERÇEKTEN gözlenir (en az bir dolu örnek)", () => {
    // Sağlık kontrolü: yürüyücü genişlemesi çalışmıyorsa (regresyon) bu 0 kalır.
    const anyObserved = percentEnvelopeRows.some((row) => {
      const raws = observedGlobal.get(schemaKey(row.schema, row.field)) ?? [];
      return raws.some((r) => extractEnvelopeValue(r) !== null);
    });
    expect(anyObserved).toBe(true);
  });

  it("innerScale:percent zarflarının .value'sunda ölçek ihlali yok (percent kuralı)", () => {
    const violations: ScaleViolation[] = percentEnvelopeRows.flatMap((row) => {
      const raws = observedGlobal.get(schemaKey(row.schema, row.field)) ?? [];
      const values = raws.map(extractEnvelopeValue).filter((v) => v !== null);
      if (values.length === 0) return [];
      // Satırı GEÇİCİ olarak "percent" gibi denetle — kendisi "not-scale"
      // (zarfın DIŞ alanı ölçeksizdir), iç `.value`si `innerScale` ile
      // percent işaretli. `checkScaleRow` AYNI ÷100 ters-ölçek testini
      // UYGULAR, ama üst sınır GENEL `percentAbove100Ok`nin 10000'i DEĞİL —
      // lider+CEO kararı (2026-09-27): zarflarda özel `ENVELOPE_PERCENT_MAX`
      // (1000) kullanılır, bkz. `scale-assertions.ts` gerekçe yorumu. Düz
      // percent alanlarının (mock-scale-contract.test.ts) sınırı ETKİLENMEZ.
      const syntheticRow: ScaleRow = { ...row, scale: "percent" };
      return checkScaleRow(
        syntheticRow,
        values,
        "(bkz. scale-urls.ts · SCALE_URLS, zarf .value)",
        undefined,
        ENVELOPE_PERCENT_MAX,
      );
    });
    expect(violations.map((v) => v.message)).toEqual([]);
  });

  it("KAPSAM: innerScale:percent satırları == .value gözlenen ∪ MOCK_DISI_ENVELOPE (iki yön)", () => {
    const tracked = new Set(percentEnvelopeRows.map((row) => schemaKey(row.schema, row.field)));
    const observedNonNullKeys = new Set(
      percentEnvelopeRows
        .filter((row) => {
          const raws = observedGlobal.get(schemaKey(row.schema, row.field)) ?? [];
          return raws.some((r) => extractEnvelopeValue(r) !== null);
        })
        .map((row) => schemaKey(row.schema, row.field)),
    );
    const excused = new Set(MOCK_DISI_ENVELOPE.map((e) => schemaKey(e.schema, e.field)));

    const uncovered = [...tracked].filter((k) => !observedNonNullKeys.has(k) && !excused.has(k));
    expect(
      uncovered,
      "innerScale:percent ama .value hiç dolu gözlenmemiş VE MOCK_DISI_ENVELOPE'ta da yok",
    ).toEqual([]);

    const staleExcuses = MOCK_DISI_ENVELOPE.filter((e) => {
      const key = schemaKey(e.schema, e.field);
      return observedNonNullKeys.has(key) || !tracked.has(key);
    }).map(
      (e) =>
        `${schemaKey(e.schema, e.field)} (dolu gözlendi: ${observedNonNullKeys.has(schemaKey(e.schema, e.field))})`,
    );
    expect(staleExcuses, "MOCK_DISI_ENVELOPE'ta bayat/gereksiz satır").toEqual([]);
  });

  it("ÖLÇÜM (rapor): innerScale:percent zarf sayısı, kaçı dolu gözlendi, kaçı MOCK_DISI", () => {
    const total = percentEnvelopeRows.length;
    const observedCount = percentEnvelopeRows.filter((row) => {
      const raws = observedGlobal.get(schemaKey(row.schema, row.field)) ?? [];
      return raws.some((r) => extractEnvelopeValue(r) !== null);
    }).length;

    console.log(
      `[TYPE-F1 2d] innerScale:percent zarf sayısı: ${total} · dolu .value gözlenen: ${observedCount} · MOCK_DISI_ENVELOPE: ${MOCK_DISI_ENVELOPE.length}`,
    );
    expect(total).toBeGreaterThan(0);
  });
});
