// @vitest-environment node
//
// TEST-F2 Ajan B — Katman 2 ana bekçisi. `e2e/mock-backend.ts`i GERÇEKTEN
// AYAĞA KALDIRIR (Playwright olmadan, çıplak node http istemcisiyle), openapi
// yol şablonu başına gerçek bir GET atar, yanıtı şema-yönlü yürüyücüyle
// gezer ve SCALE_TABLE'daki (not-scale hariç) satırları doğrular.
//
// Katman 1 (SCALE_TABLE) DOLU (backend tablosu + opus çürütmesi, bkz.
// scale-table.ts başlığı). Bu dosya artık 146 ölçekli satırın (percent 107 ·
// fraction 22 · enum 17) HEPSİNİ gerçek mock yanıtlarına karşı doğrular.
//
// BİLİNEN SINIRLAR
// 1. `percentBelowOneOk` taşıyan 7 alanda ÷100 ters ölçek hatası YAKALANMAZ.
//    Bu alanlar gerçekten küçük oranlardır (damga vergisi %0,759, %1 KDV …).
//    Mock'a yapay kayıt eklemek fikstürü gerçeklikten uzaklaştırdığı için
//    bayrak seçildi (CEO kararı, 2026-09-26). Satırlar scale-table.ts'te.
// 2. `fractionAboveOneOk` alanlarında üst sınır 5. O alandaki mock
//    değerlerinin TÜMÜ < 0,05 olursa ×100 hatası sınırın altında kalır ve
//    YAKALANMAZ. Bugünkü fikstürde completion_ratio 0,06 × 100 = 6,31
//    olduğu için yakalanıyor. Bayraksız fraction alanlarında sınır 1'dir; bu
//    açık orada yok.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { startMockBackend } from "../../../e2e/mock-backend";
import { SCALE_TABLE } from "@/lib/api/scale-table";
import { collectScaleSuspectFields, resolveEnumValues, schemaKey } from "./openapi-scale-fields";
import { buildScaleUrls, MOCK_DISI_STATIC, type JsonGetter, type ScaleUrlEntry } from "./scale-urls";
import { walkResponse, type ObservedValues } from "./schema-walker";
import { checkScaleRow } from "./scale-assertions";
import { readFileSync } from "node:fs";
import nodePath from "node:path";

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
  // `pathTemplate` "GET /x/{id}" biçiminde gelebilir (scale-urls.ts girdi
  // JSON'daki `get_yollari` biçimini korur) — openapi `paths` anahtarı YALNIZ
  // yolu tutar, HTTP metodunu değil.
  const bareTemplate = pathTemplate.replace(/^GET\s+/, "");
  const op = doc.paths[bareTemplate]?.get;
  const schema = op?.responses?.["200"]?.content?.["application/json"]?.schema;
  return schema ?? null;
}

describe("mock-scale-contract · Katman 2 (TEST-F2 Ajan B)", () => {
  let close: () => Promise<void>;
  let baseUrl: string;
  let bearer = "";
  let scaleUrls: { entries: ScaleUrlEntry[]; skipped: { path: string; reason: string }[] };
  const observedGlobal: ObservedValues = new Map();
  const doc = loadOpenApi();

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

    // Mock'un istediği Bearer başlığını ÖLÇ: `/auth/login` yalnız
    // "Bearer " ön ekini kontrol eder (e2e/mock-backend.ts:8404), ama
    // gerçekçi olsun diye login akışını da kullanıyoruz.
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

  it("mock'un istediği Bearer başlığıyla en az bir korumalı uç 200 döner (kimlik ölçümü)", async () => {
    const res = await jsonGet("/auth/me");
    expect(res.status).toBe(200);
  });

  it("Bearer olmadan korumalı uç 401 döner (negatif kontrol — mock gerçekten kimlik istiyor)", async () => {
    const res = await fetch(`${baseUrl}/projects`);
    expect(res.status).toBe(401);
  });

  it("SCALE_TABLE satırları (not-scale hariç) — gözlenen değerlerle ölçek ihlali yok", () => {
    const violations = SCALE_TABLE.filter((row) => row.scale !== "not-scale").flatMap((row) => {
      const key = schemaKey(row.schema, row.field);
      const values = observedGlobal.get(key) ?? [];
      const allowedEnumValues = row.scale === "enum" ? (resolveEnumValues(row.schema, row.field) ?? undefined) : undefined;
      return checkScaleRow(row, values, "(bkz. scale-urls.ts · SCALE_URLS)", allowedEnumValues);
    });
    expect(violations.map((v) => v.message)).toEqual([]);
  });

  it("KAPSAM: tablo (not-scale hariç) == gözlenen ∪ MOCK_DISI_STATIC (iki yön)", () => {
    const scaleTracked = new Set(
      SCALE_TABLE.filter((row) => row.scale !== "not-scale").map((row) => schemaKey(row.schema, row.field)),
    );
    const observedKeys = new Set(observedGlobal.keys());
    const excusedKeys = new Set(MOCK_DISI_STATIC.map((e) => schemaKey(e.schema, e.field)));

    const uncovered = [...scaleTracked].filter((k) => !observedKeys.has(k) && !excusedKeys.has(k));
    expect(uncovered, "tabloda ölçekli ama mock'ta hiç gözlenmemiş VE MOCK_DISI_STATIC'te de olmayan alan").toEqual(
      [],
    );

    // Ters yön: MOCK_DISI_STATIC'te gereksiz (aslında GÖZLENEN ya da tabloda
    // hiç olmayan) bir satır varsa gerekçe bayatlamış demektir.
    const staleExcuses = MOCK_DISI_STATIC.filter((e) => {
      const key = schemaKey(e.schema, e.field);
      return observedKeys.has(key) || !scaleTracked.has(key);
    }).map((e) => `${schemaKey(e.schema, e.field)} (gözlendi: ${observedKeys.has(schemaKey(e.schema, e.field))})`);
    expect(staleExcuses, "MOCK_DISI_STATIC'te bayat/gereksiz satır (artık gözleniyor ya da tabloda yok)").toEqual([]);
  });

  it("ÖLÇÜM (rapor): kaç gerçek GET uç sunuldu, regex kümesinin kaçı gözlendi", () => {
    const allSuspectKeys = collectScaleSuspectFields(doc as never).map((r) => schemaKey(r.schema, r.field));
    const observedCount = allSuspectKeys.filter((k) => observedGlobal.has(k)).length;

    console.log(
      `[TEST-F2/B] gerçek GET uç sayısı: ${scaleUrls.entries.length} · ` +
        `atlanan (skipped) uç sayısı: ${scaleUrls.skipped.length} · ` +
        `regex kümesi (${allSuspectKeys.length}) içinden gözlenen: ${observedCount}`,
    );
    for (const s of scaleUrls.skipped) {
      console.log(`[TEST-F2/B] atlandı: ${s.path} — ${s.reason}`);
    }

    // Sağlık kontrolü: keşif hiç çalışmamışsa (0 uç) bu bekçi anlamsız olurdu.
    expect(scaleUrls.entries.length).toBeGreaterThan(0);
  });
});
