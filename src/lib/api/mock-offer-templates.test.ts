// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- yanıt gövdesi gezinmesi: şema uyumu `mock-backend-body-contract.test.ts`te; burada değerler beklenen SABİTLERLE karşılaştırılır (emsal: mock-offers.test.ts). */
//
// 🔴🔴 TEKLİF ŞABLONU SAHTE BACKEND'İ — `e2e/mock-offer-templates.ts` + `mock-offer-create-sources.ts` ↔ backend
// `app/modules/offers/{template_router,template_service,offer_service,offer_seed}.py` (B5.1 + B5.4 iyimser kilit).
//
// Sahte backend HTTP üzerinden sürülür (saat ENJEKTE edilir). Her vaka backend `tests/modules/offers/
// test_templates_api.py` · `test_template_iyimser_kilit.py` · `test_offer_from_template.py` · `test_offer_copy.py`
// kurallarının AYNASIDIR. Metinler backend'den AYNEN (kanıt: template_service.py:55-58, template_schemas.py:24-29,
// offer_schemas.py:104 `COPY_AND_TEMPLATE_EXCLUSIVE`).
import type { AddressInfo } from "node:net";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { startMockBackend } from "../../../e2e/mock-backend";
import { CAT_A, CAT_B, CAT_C, EMP_1, MISSING_CAT, MISSING_ID, STALE, TEMPLATE_MISSING, api, ctx, openServer, closeServer, type Reply } from "./mock-offer-templates.testkit";

beforeEach(openServer);
afterEach(closeServer);

const TPL = "/offers/templates";

async function newTemplate(over: Record<string, unknown> = {}): Promise<any> {
  const reply = await api("POST", TPL, { name: "Kaba İnşaat Şablonu", ...over });
  expect(reply.status, JSON.stringify(reply.json)).toBe(201);
  return reply.json;
}

/** İçerik yaz (doğru `expected_updated_at` ile) → güncel detay. */
async function putContent(template: any, groups: unknown[]): Promise<any> {
  const reply = await api("PUT", `${TPL}/${template.id}/content`, { groups, expected_updated_at: template.updated_at });
  expect(reply.status, JSON.stringify(reply.json)).toBe(200);
  return reply.json;
}

const grp = (name: string, ...catalogIds: string[]) => ({ name, items: catalogIds.map((id) => ({ catalog_item_id: id })) });
const names = (detail: any): string[] => detail.groups.map((g: any) => g.name);
const pozOf = (detail: any): string[][] => detail.groups.map((g: any) => g.items.map((i: any) => i.poz_no));

async function listTemplates(): Promise<any> {
  const reply = await api("GET", TPL);
  expect(reply.status).toBe(200);
  return reply.json;
}
describe("şablon listesi + rota sırası", () => {
  it("GET /offers/templates statik yol: /offers/{offer_id} desenine DÜŞMEZ (422 değil 200) ve zarf {items,total}", async () => {
    const reply = await api("GET", TPL);
    expect(reply.status).toBe(200);
    expect(reply.json).toEqual({ items: [], total: 0 });
  });

  it("sıra: varsayılan ÖNCE, sonra ad (tr-TR: C < Ç, I(ı) < İ, S < Ş)", async () => {
    for (const name of ["Zemin", "Şantiye", "Çatı", "Cadde", "İnşaat", "Işık", "Ağaç"]) await newTemplate({ name });
    const zemin = (await listTemplates()).items.find((item: any) => item.name === "Zemin");
    expect((await api("POST", `${TPL}/${zemin.id}/default`)).status).toBe(200);
    const listed = await listTemplates();
    expect(listed.items.map((item: any) => item.name)).toEqual(["Zemin", "Ağaç", "Cadde", "Çatı", "Işık", "İnşaat", "Şantiye"]);
    expect(listed.total).toBe(7);
  });

  it("liste satırı sayaçları: group_count · item_count · usage_count (bu şablonla oluşmuş teklif sayısı)", async () => {
    const t = await newTemplate({ name: "A" });
    await putContent(t, [grp("Kaba", CAT_A, CAT_B), grp("İnce", CAT_C), grp("Boş")]);
    for (const title of ["T1", "T2"]) {
      const created = await api("POST", "/offers", { employer_id: EMP_1, title, template_id: t.id });
      expect(created.status).toBe(201);
    }
    await api("POST", "/offers", { employer_id: EMP_1, title: "şablonsuz" });
    const row = (await listTemplates()).items[0];
    expect(row).toMatchObject({ name: "A", group_count: 3, item_count: 3, usage_count: 2, is_default: false });
    expect(Object.keys(row).sort()).toEqual(
      ["description", "group_count", "id", "is_default", "item_count", "name", "overhead_pct", "profit_pct", "updated_at", "usage_count"].sort(),
    );
  });
});

describe("boş şablon oluştur (POST /offers/templates)", () => {
  it("201 + detay: boş gruplar, varsayılan DEĞİL, oranlar DB ölçeğinde, ad kırpılır, fiyat/miktar alanı YOK", async () => {
    const t = await newTemplate({ name: "  Kaba  ", description: "Açıklama", overhead_pct: "12", profit_pct: 15.5 });
    expect(t).toMatchObject({
      name: "Kaba",
      description: "Açıklama",
      overhead_pct: "12.00",
      profit_pct: "15.50",
      is_default: false,
      group_count: 0,
      item_count: 0,
      usage_count: 0,
      groups: [],
    });
    expect(t.created_at).toBeTruthy();
    expect(t.updated_at).toBeTruthy();
    expect(Object.keys(t).sort()).toEqual(
      ["created_at", "description", "group_count", "groups", "id", "is_default", "item_count", "name", "overhead_pct", "profit_pct", "updated_at", "usage_count"].sort(),
    );
  });

  it("oran/açıklama verilmezse null", async () => {
    const t = await newTemplate();
    expect(t).toMatchObject({ description: null, overhead_pct: null, profit_pct: null });
  });

  it.each([
    [{ name: "" }, "string_too_short"],
    [{ name: "   " }, "string_too_short"],
    [{ name: "x".repeat(81) }, "string_too_long"],
    [{ name: "A", overhead_pct: "101" }, "less_than_equal"],
    [{ name: "A", ekstra: 1 }, "extra_forbidden"],
    [{}, "missing"],
  ] as const)("geçersiz gövde %j → 422 detay dizisi (%s)", async (body, type) => {
    const reply = await api("POST", TPL, body);
    expect(reply.status).toBe(422);
    expect(reply.json.detail[0].type).toBe(type);
  });
});

describe("404 + yol doğrulaması", () => {
  it.each([
    ["GET", ""],
    ["PATCH", ""],
    ["PUT", "/content"],
    ["POST", "/default"],
    ["POST", "/copy"],
    ["DELETE", ""],
  ] as const)("%s …/{olmayan id}%s → 404 'Teklif şablonu bulunamadı'", async (method, tail) => {
    const body =
      method === "PATCH"
        ? { name: "x", expected_updated_at: "2026-10-02T09:00:00Z" }
        : method === "PUT"
          ? { groups: [], expected_updated_at: "2026-10-02T09:00:00Z" }
          : undefined;
    const reply = await api(method, `${TPL}/${MISSING_ID}${tail}`, body);
    expect(reply.status).toBe(404);
    expect(reply.json).toEqual({ detail: TEMPLATE_MISSING });
  });

  it("UUID olmayan id → 422 (yol doğrulaması), 404 değil", async () => {
    const reply = await api("GET", `${TPL}/yok`);
    expect(reply.status).toBe(422);
    expect(reply.json.detail[0]).toMatchObject({ type: "uuid_parsing", loc: ["path", "template_id"] });
  });

  it("yol/yöntem uyuşmazlığı: 405 / 404", async () => {
    const t = await newTemplate();
    expect((await api("PUT", TPL)).status).toBe(405);
    expect((await api("GET", `${TPL}/${t.id}/content`)).status).toBe(405);
    expect((await api("GET", `${TPL}/${t.id}/yok`)).status).toBe(404);
  });
});

describe("PUT …/content — TAM değiştirme, sıra = gövde sırası", () => {
  it("gruplar ve kalemler GÖVDE SIRASIYLA (alfabetik DEĞİL) sıralanır; sort_order = dizin; aynı katalog kalemi iki kez ve boş grup serbest", async () => {
    const t = await newTemplate();
    const out = await putContent(t, [grp("Z son", CAT_C, CAT_A), grp("A ilk", CAT_B, CAT_B), grp("Boş")]);
    expect(names(out)).toEqual(["Z son", "A ilk", "Boş"]);
    expect(pozOf(out)).toEqual([["DUV-0001", "KAB-0001"], ["KAB-0002", "KAB-0002"], []]);
    expect(out.groups.map((g: any) => g.sort_order)).toEqual([0, 1, 2]);
    expect(out.groups[0].items.map((i: any) => i.sort_order)).toEqual([0, 1]);
    expect(out).toMatchObject({ group_count: 3, item_count: 4 });
    expect(out.groups[0].items[0]).toMatchObject({ catalog_item_id: CAT_C, poz_no: "DUV-0001", description: "Tuğla duvar", unit: "m²" });
    expect(Object.keys(out.groups[0].items[0]).sort()).toEqual(["catalog_item_id", "description", "id", "poz_no", "sort_order", "unit"]);
    expect((await api("GET", `${TPL}/${t.id}`)).json).toEqual(out);
  });

  it("ikinci PUT ESKİ içeriği TAMAMEN siler (birleştirme DEĞİL)", async () => {
    const t = await newTemplate();
    const first = await putContent(t, [grp("Eski", CAT_A, CAT_B)]);
    const second = await putContent(first, [grp("Yeni", CAT_C)]);
    expect(names(second)).toEqual(["Yeni"]);
    expect(pozOf(second)).toEqual([["DUV-0001"]]);
    const cleared = await putContent(second, []);
    expect(cleared.groups).toEqual([]);
    expect(cleared).toMatchObject({ group_count: 0, item_count: 0 });
  });

  it("tavan SINIRI: tam 100 grup ve tam 1000 kalem geçer", async () => {
    const t = await newTemplate();
    const hundred = await putContent(t, Array.from({ length: 100 }, (_, i) => grp(`G${i}`)));
    expect(hundred.group_count).toBe(100);
    const thousand = await putContent(hundred, [grp("Tek", ...Array.from({ length: 1000 }, () => CAT_A))]);
    expect(thousand.item_count).toBe(1000);
  });

  it("101 grup → 422 (şema: too_long, loc body.groups); içerik DEĞİŞMEZ", async () => {
    const t = await putContent(await newTemplate(), [grp("Var", CAT_A)]);
    const reply = await api("PUT", `${TPL}/${t.id}/content`, {
      groups: Array.from({ length: 101 }, (_, i) => grp(`G${i}`)),
      expected_updated_at: t.updated_at,
    });
    expect(reply.status).toBe(422);
    expect(reply.json.detail[0]).toMatchObject({
      type: "too_long",
      loc: ["body", "groups"],
      msg: "List should have at most 100 items after validation, not 101",
    });
    expect(names((await api("GET", `${TPL}/${t.id}`)).json)).toEqual(["Var"]);
  });

  it("1001 kalem → 422 value_error 'Şablonda en fazla 1000 kalem olabilir' (backend metni AYNEN); içerik DEĞİŞMEZ", async () => {
    const t = await putContent(await newTemplate(), [grp("Var", CAT_A)]);
    const reply = await api("PUT", `${TPL}/${t.id}/content`, {
      groups: [grp("A", ...Array.from({ length: 600 }, () => CAT_A)), grp("B", ...Array.from({ length: 401 }, () => CAT_B))],
      expected_updated_at: t.updated_at,
    });
    expect(reply.status).toBe(422);
    expect(reply.json.detail[0]).toMatchObject({
      type: "value_error",
      loc: ["body", "groups"],
      msg: "Value error, Şablonda en fazla 1000 kalem olabilir",
    });
    expect((await api("GET", `${TPL}/${t.id}`)).json.item_count).toBe(1);
  });

  it("katalog id yok → 404 'Katalog iş tipi bulunamadı'; hep-ya-hiç: içerik ve updated_at DEĞİŞMEZ", async () => {
    const t = await putContent(await newTemplate(), [grp("Var", CAT_A)]);
    const reply = await api("PUT", `${TPL}/${t.id}/content`, {
      groups: [grp("Yeni", CAT_B), grp("Kötü", MISSING_CAT)],
      expected_updated_at: t.updated_at,
    });
    expect(reply.status).toBe(404);
    expect(reply.json).toEqual({ detail: "Katalog iş tipi bulunamadı" });
    const after = (await api("GET", `${TPL}/${t.id}`)).json;
    expect(names(after)).toEqual(["Var"]);
    expect(after.updated_at).toBe(t.updated_at);
  });

  it.each([
    [{ groups: [{ name: "", items: [] }] }, "string_too_short"],
    [{ groups: [{ name: "G", items: [{ catalog_item_id: "x" }] }] }, "uuid_parsing"],
    [{ groups: [{ name: "G", items: [{ catalog_item_id: CAT_A, quantity: 3 }] }] }, "extra_forbidden"],
    [{ groups: "x" }, "list_type"],
  ] as const)("geçersiz gövde %j → 422 (%s)", async (body, type) => {
    const t = await newTemplate();
    const reply = await api("PUT", `${TPL}/${t.id}/content`, { ...body, expected_updated_at: t.updated_at });
    expect(reply.status).toBe(422);
    expect(reply.json.detail[0].type).toBe(type);
  });
});

describe("İYİMSER KİLİT (TKL-B5.4): expected_updated_at", () => {
  it("expected_updated_at ALANI zorunlu (PATCH ve PUT): yok → 422 missing; tz'siz → 422", async () => {
    const t = await newTemplate();
    const patch = await api("PATCH", `${TPL}/${t.id}`, { name: "X" });
    expect(patch.status).toBe(422);
    expect(patch.json.detail[0]).toMatchObject({ type: "missing", loc: ["body", "expected_updated_at"] });
    const put = await api("PUT", `${TPL}/${t.id}/content`, { groups: [] });
    expect(put.status).toBe(422);
    expect(put.json.detail[0]).toMatchObject({ type: "missing", loc: ["body", "expected_updated_at"] });
    const naive = await api("PUT", `${TPL}/${t.id}/content`, { groups: [], expected_updated_at: "2026-10-02T09:00:00" });
    expect(naive.status).toBe(422);
    expect(naive.json.detail[0]).toMatchObject({ type: "timezone_aware", loc: ["body", "expected_updated_at"] });
  });

  it("bayat expected → PUT 409 (metin AYNEN) ve içerik DEĞİŞMEZ", async () => {
    const t = await newTemplate();
    const first = await putContent(t, [grp("Birinci", CAT_A)]);
    const stale = await api("PUT", `${TPL}/${t.id}/content`, { groups: [grp("Ezici", CAT_B)], expected_updated_at: t.updated_at });
    expect(stale.status).toBe(409);
    expect(stale.json).toEqual({ detail: STALE });
    const after = (await api("GET", `${TPL}/${t.id}`)).json;
    expect(names(after)).toEqual(["Birinci"]);
    expect(after.updated_at).toBe(first.updated_at);
  });

  it("bayat expected → PATCH 409 ve künye DEĞİŞMEZ", async () => {
    const t = await newTemplate({ name: "A" });
    const renamed = await api("PATCH", `${TPL}/${t.id}`, { name: "B", expected_updated_at: t.updated_at });
    expect(renamed.status).toBe(200);
    const stale = await api("PATCH", `${TPL}/${t.id}`, { name: "Ezici", expected_updated_at: t.updated_at });
    expect(stale.status).toBe(409);
    expect(stale.json).toEqual({ detail: STALE });
    expect((await api("GET", `${TPL}/${t.id}`)).json.name).toBe("B");
  });

  it("409'dan sonra GÜNCEL expected ile yeniden deneme BAŞARILI olur", async () => {
    const t = await newTemplate();
    const winner = await putContent(t, [grp("Kazanan", CAT_A)]);
    expect((await api("PUT", `${TPL}/${t.id}/content`, { groups: [grp("Geç")], expected_updated_at: t.updated_at })).status).toBe(409);
    const fresh = (await api("GET", `${TPL}/${t.id}`)).json;
    const retry = await api("PUT", `${TPL}/${t.id}/content`, { groups: [grp("Geç", CAT_B)], expected_updated_at: fresh.updated_at });
    expect(retry.status).toBe(200);
    expect(names(retry.json)).toEqual(["Geç"]);
    expect(retry.json.updated_at).not.toBe(winner.updated_at);
  });

  it("updated_at MONOTON: saat DONDURULMUŞ (aynı ms) olsa bile her yazma KESİN ileri taşır; JSON gidiş-dönüş metni aynen kabul edilir", async () => {
    let current = await newTemplate({ name: "M" });
    const seen = [current.updated_at];
    const writes: Array<(t: any) => Promise<Reply>> = [
      (t) => api("PATCH", `${TPL}/${t.id}`, { name: "M2", expected_updated_at: t.updated_at }),
      (t) => api("PUT", `${TPL}/${t.id}/content`, { groups: [grp("G", CAT_A)], expected_updated_at: t.updated_at }),
      (t) => api("PATCH", `${TPL}/${t.id}`, { description: "d", expected_updated_at: t.updated_at }),
      (t) => api("PUT", `${TPL}/${t.id}/content`, { groups: [], expected_updated_at: t.updated_at }),
    ];
    for (const write of writes) {
      const reply = await write(current);
      expect(reply.status, JSON.stringify(reply.json)).toBe(200);
      seen.push(reply.json.updated_at);
      current = reply.json;
    }
    const stamps = seen.map((value) => Date.parse(value.replace(/(\.\d{3})\d*/, "$1")));
    expect(new Set(seen).size).toBe(seen.length); // metin düzeyinde hepsi FARKLI
    for (let i = 1; i < seen.length; i += 1) {
      expect(seen[i] > (seen[i - 1] as string), `${seen[i - 1]} → ${seen[i]}`).toBe(true);
      expect(stamps[i]).toBeGreaterThanOrEqual(stamps[i - 1] as number);
    }
  });

  it("saat ilerlerse updated_at saati izler (gerçek zaman damgası); +00:00 biçimli expected da kabul edilir", async () => {
    const t = await newTemplate();
    ctx.now = new Date("2026-10-02T09:30:00.000Z");
    const out = await api("PATCH", `${TPL}/${t.id}`, { name: "Yeni", expected_updated_at: t.updated_at.replace("Z", "+00:00") });
    expect(out.status).toBe(200);
    expect(out.json.updated_at.startsWith("2026-10-02T09:30:00.000")).toBe(true);
  });

  it("değişiklik YOKSA PATCH updated_at'i ilerletmez ama kontrol yine yapılır (bayat → 409)", async () => {
    const t = await newTemplate({ name: "A" });
    const same = await api("PATCH", `${TPL}/${t.id}`, { name: "A", expected_updated_at: t.updated_at });
    expect(same.status).toBe(200);
    expect(same.json.updated_at).toBe(t.updated_at);
    const stale = await api("PATCH", `${TPL}/${t.id}`, { name: "A", expected_updated_at: "2020-01-01T00:00:00Z" });
    expect(stale.status).toBe(409);
  });
});

describe("PATCH — künye (null = temizle) ve is_default", () => {
  it("null açıklama/oranları TEMİZLER; gönderilmeyen alan dokunulmaz", async () => {
    const t = await newTemplate({ description: "d", overhead_pct: "10", profit_pct: "20" });
    const out = await api("PATCH", `${TPL}/${t.id}`, { description: null, overhead_pct: null, expected_updated_at: t.updated_at });
    expect(out.status).toBe(200);
    expect(out.json).toMatchObject({ description: null, overhead_pct: null, profit_pct: "20.00", name: "Kaba İnşaat Şablonu" });
  });

  it("ad / is_default AÇIK null → 422 (NOT NULL); is_default:true varsayılan yapar", async () => {
    const t = await newTemplate();
    for (const body of [{ name: null }, { is_default: null }]) {
      const reply = await api("PATCH", `${TPL}/${t.id}`, { ...body, expected_updated_at: t.updated_at });
      expect(reply.status).toBe(422);
      expect(reply.json.detail[0]).toMatchObject({ type: "value_error", msg: "Value error, Alan boşaltılamaz; değiştirmemek için gövdeden çıkarın." });
    }
    const out = await api("PATCH", `${TPL}/${t.id}`, { is_default: true, expected_updated_at: t.updated_at });
    expect(out.json.is_default).toBe(true);
  });
});

describe("TEK varsayılan", () => {
  async function defaults(): Promise<string[]> {
    return (await listTemplates()).items.filter((item: any) => item.is_default).map((item: any) => item.name);
  }

  it("POST …/default: yeni varsayılan olur, ESKİ varsayılan aynı işlemde düşer (her zaman en çok bir tane)", async () => {
    const a = await newTemplate({ name: "A" });
    const b = await newTemplate({ name: "B" });
    expect((await api("POST", `${TPL}/${a.id}/default`)).json.is_default).toBe(true);
    expect(await defaults()).toEqual(["A"]);
    const out = await api("POST", `${TPL}/${b.id}/default`);
    expect(out.status).toBe(200);
    expect(out.json.is_default).toBe(true);
    expect(await defaults()).toEqual(["B"]);
    expect((await api("GET", `${TPL}/${a.id}`)).json.is_default).toBe(false);
  });

  it("PATCH is_default:true da eski varsayılanı düşürür", async () => {
    const a = await newTemplate({ name: "A" });
    const b = await newTemplate({ name: "B" });
    await api("POST", `${TPL}/${a.id}/default`);
    const fresh = (await api("GET", `${TPL}/${b.id}`)).json;
    await api("PATCH", `${TPL}/${b.id}`, { is_default: true, expected_updated_at: fresh.updated_at });
    expect(await defaults()).toEqual(["B"]);
  });

  it("düşen eski varsayılanın updated_at'i ilerler (bayat sekme onu da yazamaz)", async () => {
    const a = await newTemplate({ name: "A" });
    const b = await newTemplate({ name: "B" });
    const aDefault = (await api("POST", `${TPL}/${a.id}/default`)).json;
    await api("POST", `${TPL}/${b.id}/default`);
    const stale = await api("PATCH", `${TPL}/${a.id}`, { name: "Ezici", expected_updated_at: aDefault.updated_at });
    expect(stale.status).toBe(409);
  });

  it("zaten varsayılan olana tekrar POST default: yazma YOK (updated_at ilerlemez), kontrolsüz 200", async () => {
    const a = await newTemplate({ name: "A" });
    const first = (await api("POST", `${TPL}/${a.id}/default`)).json;
    const again = await api("POST", `${TPL}/${a.id}/default`);
    expect(again.status).toBe(200);
    expect(again.json.updated_at).toBe(first.updated_at);
  });

  it("varsayılanı PATCH is_default:false ile düşürmek mümkündür (varsayılansız hâl); varsayılan silinebilir (SO-25)", async () => {
    const a = await newTemplate({ name: "A" });
    const d = (await api("POST", `${TPL}/${a.id}/default`)).json;
    const off = await api("PATCH", `${TPL}/${a.id}`, { is_default: false, expected_updated_at: d.updated_at });
    expect(off.json.is_default).toBe(false);
    await api("POST", `${TPL}/${a.id}/default`);
    expect((await api("DELETE", `${TPL}/${a.id}`)).status).toBe(204);
    expect(await defaults()).toEqual([]);
  });
});

describe("PATCH gövde tipleri", () => {
  it("is_default boolean değilse → 422 bool_type", async () => {
    const t = await newTemplate();
    const reply = await api("PATCH", `${TPL}/${t.id}`, { is_default: "evet", expected_updated_at: t.updated_at });
    expect(reply.status).toBe(422);
    expect(reply.json.detail[0]).toMatchObject({ type: "bool_type", loc: ["body", "is_default"] });
  });
});

describe("kopya (POST …/copy)", () => {
  it("ad verilmezse '<ad> (kopya)'; kaynak varsayılan olsa da kopya varsayılan DEĞİL; içerik + oranlar kopyalanır, yeni kimlikler", async () => {
    const src = await newTemplate({ name: "Kaba", description: "d", overhead_pct: "9", profit_pct: "11" });
    const filled = await putContent(src, [grp("G1", CAT_A, CAT_B), grp("G2", CAT_C)]);
    await api("POST", `${TPL}/${src.id}/default`);
    const copy = await api("POST", `${TPL}/${src.id}/copy`);
    expect(copy.status).toBe(201);
    expect(copy.json).toMatchObject({ name: "Kaba (kopya)", description: "d", overhead_pct: "9.00", profit_pct: "11.00", is_default: false, usage_count: 0, group_count: 2, item_count: 3 });
    expect(copy.json.id).not.toBe(src.id);
    expect(pozOf(copy.json)).toEqual(pozOf(filled));
    const sourceIds = new Set(filled.groups.flatMap((g: any) => [g.id, ...g.items.map((i: any) => i.id)]));
    for (const g of copy.json.groups) {
      expect(sourceIds.has(g.id)).toBe(false);
      for (const i of g.items) expect(sourceIds.has(i.id)).toBe(false);
    }
    expect((await api("GET", `${TPL}/${src.id}`)).json.is_default).toBe(true); // kaynak varsayılan KALIR
  });

  it("ad verilirse o ad; gövdesiz çağrı da geçerli; uzun ad 80'e kısaltılıp ' (kopya)' eklenir (80'i AŞMAZ)", async () => {
    const src = await newTemplate({ name: "Kaynak" });
    expect((await api("POST", `${TPL}/${src.id}/copy`, { name: "Özel Ad" })).json.name).toBe("Özel Ad");
    const long = await newTemplate({ name: "U".repeat(80) });
    const copy = await api("POST", `${TPL}/${long.id}/copy`);
    expect(copy.status).toBe(201);
    expect(copy.json.name).toBe(`${"U".repeat(72)} (kopya)`);
    expect(copy.json.name).toHaveLength(80);
    expect((await api("POST", `${TPL}/${src.id}/copy`, { name: "" })).status).toBe(422);
  });
});

describe("silme (DELETE)", () => {
  it("204; şablon YOK olur (404); ikinci silme 404", async () => {
    const t = await newTemplate();
    expect((await api("DELETE", `${TPL}/${t.id}`)).status).toBe(204);
    expect((await api("GET", `${TPL}/${t.id}`)).status).toBe(404);
    expect((await api("DELETE", `${TPL}/${t.id}`)).status).toBe(404);
    expect((await listTemplates()).total).toBe(0);
  });

  it("bu şablonla oluşmuş teklifler KORUNUR ve template_id NULL olur; başka şablonun teklifi dokunulmaz", async () => {
    const t = await newTemplate({ name: "Silinecek" });
    const other = await newTemplate({ name: "Kalan" });
    await putContent(t, [grp("G", CAT_A)]);
    const kept = (await api("POST", "/offers", { employer_id: EMP_1, title: "Bağlı", template_id: t.id })).json;
    const stays = (await api("POST", "/offers", { employer_id: EMP_1, title: "Başka", template_id: other.id })).json;
    expect(kept.template_id).toBe(t.id);
    expect((await api("DELETE", `${TPL}/${t.id}`)).status).toBe(204);
    const after = await api("GET", `/offers/${kept.id}`);
    expect(after.status).toBe(200);
    expect(after.json.template_id).toBeNull();
    expect((await api("GET", `/offers/${stays.id}`)).json.template_id).toBe(other.id);
    expect((await api("GET", `/offers/${kept.id}/revisions/0`)).json.groups[0].items).toHaveLength(1); // içerik duruyor
  });
});

describe("tekliften şablon (POST …/from-offer)", () => {
  async function sourceOffer(): Promise<any> {
    const offer = (await api("POST", "/offers", { employer_id: EMP_1, title: "Kaynak", overhead_pct: "10", profit_pct: "20" })).json;
    const g1 = (await api("POST", `/offers/${offer.id}/revisions/0/groups`, { name: "Kaba" })).json;
    const g2 = (await api("POST", `/offers/${offer.id}/revisions/0/groups`, { name: "Boş grup" })).json;
    const g3 = (await api("POST", `/offers/${offer.id}/revisions/0/groups`, { name: "İnce" })).json;
    for (const [group, cat] of [[g1, CAT_B], [g1, CAT_A], [g3, CAT_C]] as const) {
      const made = await api("POST", `/offers/${offer.id}/revisions/0/items`, {
        catalog_item_id: cat, group_id: group.id, quantity: "250", cost_unit_price: "77.50", offer_unit_price: "300",
      });
      expect(made.status, JSON.stringify(made.json)).toBe(201);
    }
    void g2;
    return offer;
  }

  it("gruplar + katalog bağları (grup/kalem SIRASIYLA) + revizyon GG/kâr; fiyat/miktar YOK; boş grup taşınır; varsayılan DEĞİL", async () => {
    const offer = await sourceOffer();
    const out = await api("POST", `${TPL}/from-offer`, { offer_id: offer.id, rev_no: 0, name: "Tekliften", description: "kaynak" });
    expect(out.status, JSON.stringify(out.json)).toBe(201);
    expect(out.json).toMatchObject({ name: "Tekliften", description: "kaynak", overhead_pct: "10.00", profit_pct: "20.00", is_default: false, group_count: 3, item_count: 3, usage_count: 0 });
    expect(names(out.json)).toEqual(["Kaba", "Boş grup", "İnce"]);
    expect(out.json.groups[0].items.map((i: any) => i.catalog_item_id)).toEqual([CAT_B, CAT_A]);
    expect(out.json.groups[1].items).toEqual([]);
    expect(JSON.stringify(out.json)).not.toMatch(/quantity|cost_unit_price|offer_unit_price|unit_price/);
    expect((await api("GET", `${TPL}/${out.json.id}`)).json).toEqual(out.json);
  });

  it("teklif yok → 404 'Teklif bulunamadı'; revizyon yok → 404 'Teklif revizyonu bulunamadı'; ad zorunlu → 422", async () => {
    const offer = await sourceOffer();
    const noOffer = await api("POST", `${TPL}/from-offer`, { offer_id: MISSING_ID, rev_no: 0, name: "X" });
    expect(noOffer.status).toBe(404);
    expect(noOffer.json).toEqual({ detail: "Teklif bulunamadı" });
    const noRev = await api("POST", `${TPL}/from-offer`, { offer_id: offer.id, rev_no: 5, name: "X" });
    expect(noRev.status).toBe(404);
    expect(noRev.json).toEqual({ detail: "Teklif revizyonu bulunamadı" });
    expect((await api("POST", `${TPL}/from-offer`, { offer_id: offer.id, rev_no: 0 })).status).toBe(422);
    expect((await listTemplates()).total).toBe(0); // reddedilenler şablon YAZMADI
  });

  it("101 gruplu teklif → 422 düz metin 'Şablonda en fazla 100 grup olabilir' (OfferValidationError); şablon YAZILMAZ", async () => {
    const offer = (await api("POST", "/offers", { employer_id: EMP_1, title: "Dev" })).json;
    for (let i = 0; i < 101; i += 1) {
      expect((await api("POST", `/offers/${offer.id}/revisions/0/groups`, { name: `G${i}` })).status).toBe(201);
    }
    const out = await api("POST", `${TPL}/from-offer`, { offer_id: offer.id, rev_no: 0, name: "Çok" });
    expect(out.status).toBe(422);
    expect(out.json).toEqual({ detail: "Şablonda en fazla 100 grup olabilir" });
    expect((await listTemplates()).total).toBe(0);
  });
});

// ──────────────────────────────────────────── gerçek mock-backend: yönlendirme + tohum (F4.8 kareleri bunlara dayanır)

describe("🔴 mock-backend entegrasyonu: şablon tohumu + tek giriş noktası", () => {
  let backend: ReturnType<typeof startMockBackend>;
  let url = "";

  beforeEach(async () => {
    backend = startMockBackend(0);
    await new Promise<void>((resolve) => backend.server.once("listening", () => resolve()));
    url = `http://127.0.0.1:${(backend.server.address() as AddressInfo).port}`;
  });
  afterEach(async () => {
    await backend.close();
  });

  async function call(method: string, path: string, body?: unknown): Promise<Reply> {
    const response = await fetch(`${url}${path}`, {
      method,
      headers: { authorization: "Bearer t", "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    return { status: response.status, json: text === "" ? {} : JSON.parse(text) };
  }

  it("Bearer yoksa 401; GET /offers/templates statik yol (422/404 DEĞİL)", async () => {
    expect((await fetch(`${url}/offers/templates`)).status).toBe(401);
    expect((await call("GET", "/offers/templates")).status).toBe(200);
  });

  it("tohum: en az 2 şablon, TAM BİR varsayılan (ilk sırada), gruplu/kalemli, sayaçlar dolu, deterministik tarih, tr-TR sıra", async () => {
    const list = (await call("GET", "/offers/templates")).json;
    expect(list.total).toBeGreaterThanOrEqual(2);
    expect(list.items.filter((item: any) => item.is_default)).toHaveLength(1);
    expect(list.items[0].is_default).toBe(true);
    expect(list.items[0]).toMatchObject({ name: "Kaba İnşaat Standart", group_count: 2, item_count: 4, usage_count: 1, overhead_pct: "10.00", profit_pct: "18.00", updated_at: "2026-09-12T10:30:00.000000Z" });
    expect(list.items.map((item: any) => item.name)).toEqual(["Kaba İnşaat Standart", "Elektrik Tesisatı", "İnce İşler — Sıva"]);
    const detail = (await call("GET", `/offers/templates/${list.items[0].id}`)).json;
    expect(detail.groups.map((g: any) => [g.name, g.items.map((i: any) => i.description)])).toEqual([
      ["Betonarme", ["Kalıp", "Demir", "Beton döküm"]],
      ["Duvar", ["Tuğla duvar"]],
    ]);
    expect(detail.created_at).toBe("2026-09-10T08:00:00.000000Z");
  });

  it("tohum teklifi şablonla bağlı (template_id) ve şablonla yeni teklif başlatılabilir (gerçek katalog)", async () => {
    const list = (await call("GET", "/offers/templates")).json;
    const created = (await call("POST", "/offers", { employer_id: "emp-1", title: "Şablondan", template_id: list.items[0].id })).json;
    expect(created.template_id).toBe(list.items[0].id);
    const revision = (await call("GET", `/offers/${created.id}/revisions/0`)).json;
    expect(revision.groups.map((g: any) => g.name)).toEqual(["Betonarme", "Duvar"]);
    expect(revision.overhead_pct).toBe("10.00");
    expect(revision.profit_pct).toBe("18.00");
    expect((await call("GET", "/offers/templates")).json.items[0].usage_count).toBe(2);
  });
});
