// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- yanıt gövdesi gezinmesi (emsal: mock-offers.test.ts); şema uyumu `mock-backend-body-contract.test.ts`te. */
//
// 🔴 TKL-F5.1 · SAHTE BACKEND — `POST /offers/{id}/convert` (`e2e/mock-offer-convert.ts`) ↔ backend
// `offers/convert_{router,service,schemas}.py` (origin/main 7249b36). Bu dosya yalnız dönüştürme
// KURALLARINI sürer (hata sırası, Σ yuvarlama, uyarılar, okuma türevleri); proje/sözleşme/şantiye
// YAZIMI ana sahte durumdadır (`mock-offer-convert.backend.test.ts`). Port burada SAHTEDİR ve her
// `createConvertedProject` çağrısını kaydeder → "hata = yazma YOK" bekçisi.
import type { AddressInfo } from "node:net";
import { createServer, type Server } from "node:http";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  emptyOffersState,
  handleOffers,
  type OfferCatalogEntry,
  type OffersState,
} from "../../../e2e/mock-offers";
import type { ConvertedProjectSpec } from "../../../e2e/mock-offer-types";

const ACTOR = { id: "11111111-1111-1111-1111-111111111111", fullName: "Ahmet Yılmaz" };
const EMP_1 = "e0000000-0000-4000-8000-000000000001";
const CAT_A = "ca000000-0000-4000-8000-00000000000a"; // disiplin D1 · a-s 0,85
const CAT_B = "ca000000-0000-4000-8000-00000000000b"; // disiplin D1 · a-s 11,5
const CAT_C = "ca000000-0000-4000-8000-00000000000c"; // disiplin D2 · a-s 0,55
const CAT_Z = "ca000000-0000-4000-8000-0000000000e0"; // disiplin D1 · a-s 0 (yuvasız)
const MISSING_CAT = "ca000000-0000-4000-8000-0000000000ff";
const D1 = "d1000000-0000-4000-8000-000000000001";
const D2 = "d1000000-0000-4000-8000-000000000002";
const MISSING_DISC = "d1000000-0000-4000-8000-0000000000ff";
const MISSING_ID = "99999999-9999-4999-8999-999999999999";
const NOON = "2026-10-02T09:00:00.000Z";

const CATALOG: OfferCatalogEntry[] = [
  { id: CAT_A, pozNo: "KAB-0001", name: "Kalıp", uom: "m²", standardUnitMhr: "0.85", refPrice: "100.00" },
  { id: CAT_B, pozNo: "KAB-0002", name: "Demir", uom: "ton", standardUnitMhr: "11.5", refPrice: null },
  { id: CAT_C, pozNo: "DUV-0001", name: "Tuğla duvar", uom: "m²", standardUnitMhr: "0.55", refPrice: "10.00" },
  { id: CAT_Z, pozNo: "KAB-0003", name: "Yuvasız", uom: "adet", standardUnitMhr: "0", refPrice: null },
];
const DISCIPLINE_OF = new Map<string, string>([[CAT_A, D1], [CAT_B, D1], [CAT_C, D2], [CAT_Z, D1]]);
const EMPLOYERS = [{ id: EMP_1, name: "Güneşkent Gayrimenkul A.Ş." }];

const NOT_WON = "Yalnız son revizyonu kazanılmış (won) olan teklif projeye dönüştürülebilir";
const ALREADY = "Teklif zaten dönüştürüldü";

interface Reply {
  status: number;
  json: Record<string, any>;
}

let server: Server;
let base = "";
let state: OffersState;
let written: ConvertedProjectSpec[] = [];
/** Port tarafındaki "proje kodu kullanımda" kümesi (`projects.code` UQ'su; ana sahtede `state.projects`). */
let takenCodes = new Set<string>();

beforeEach(async () => {
  written = [];
  takenCodes = new Set();
  state = emptyOffersState([ACTOR], () => new Date(NOON));
  server = createServer((req, res) => {
    const parsed = new URL(req.url ?? "", "http://mock");
    const send = (status: number, body?: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(body === undefined ? "" : JSON.stringify(body));
    };
    const handled = handleOffers(state, {
      method: req.method ?? "GET",
      path: parsed.pathname,
      query: parsed.searchParams,
      send,
      readBody: (handler) => {
        let raw = "";
        req.on("data", (chunk) => (raw += chunk));
        req.on("end", () => handler(JSON.parse(raw || "{}")));
      },
      catalog: () => CATALOG,
      employers: () => EMPLOYERS,
      lastPrices: () => new Map(),
      actor: ACTOR,
      convert: {
        disciplineExists: (id) => id === D1 || id === D2,
        disciplineOfCatalog: (id) => DISCIPLINE_OF.get(id) ?? null,
        projectCodeExists: (code) => takenCodes.has(code),
        createConvertedProject: (spec) => {
          written = [...written, spec];
          return {
            projectId: `0b000000-0000-4000-8000-${String(written.length).padStart(12, "0")}`,
            projectSlug: "a-blok",
            projectCode: spec.project.code ?? `PRJ-2026-${String(written.length).padStart(3, "0")}`,
            siteId: spec.site === null ? null : `5e000000-0000-4000-8000-${String(written.length).padStart(12, "0")}`,
          };
        },
      },
    });
    if (!handled) send(404, { detail: "Not Found" });
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function api(method: string, path: string, body?: unknown): Promise<Reply> {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return { status: response.status, json: text === "" ? {} : (JSON.parse(text) as Record<string, any>) };
}

interface Seeded {
  id: string;
  offerNo: string;
  /** Teklif kalemlerinin kimlikleri (gövdedeki `offer_item_id`). */
  items: Record<string, any>[];
}

/** Grup + kalemlerle teklif kurar ve istenen duruma getirir (varsayılan: kazanılmış). */
async function offer(
  status: "draft" | "sent" | "won" | "lost" = "won",
  over: Record<string, unknown> = {},
  catalogIds: string[] = [CAT_A, CAT_B],
): Promise<Seeded> {
  const created = (await api("POST", "/offers", { employer_id: EMP_1, title: "A Blok", ...over })).json;
  const group = (await api("POST", `/offers/${created.id}/revisions/0/groups`, { name: "Kaba" })).json;
  for (const catalogId of catalogIds) {
    const reply = await api("POST", `/offers/${created.id}/revisions/0/items`, {
      catalog_item_id: catalogId,
      group_id: group.id,
      quantity: "10",
    });
    expect(reply.status, JSON.stringify(reply.json)).toBe(201);
  }
  const actions = { draft: [], sent: ["send"], won: ["send", "win"], lost: ["send", "lose"] }[status];
  for (const action of actions) {
    expect((await api("POST", `/offers/${created.id}/revisions/0/${action}`)).status).toBe(200);
  }
  const revision = (await api("GET", `/offers/${created.id}/revisions/0`)).json;
  return { id: created.id, offerNo: created.offer_no, items: revision.groups.flatMap((g: any) => g.items) };
}

const line = (catalogId: string, code: string, quantity: string, unitPrice: string, extra: Record<string, unknown> = {}) => ({
  catalog_item_id: catalogId,
  code,
  description: `Kalem ${code}`,
  unit: "m²",
  quantity,
  unit_price: unitPrice,
  ...extra,
});

/** Geçerli gövde; `over` üst düzey alanları ezer. */
function body(seeded: Seeded, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    project: { name: "A Blok Projesi", city: "İstanbul", start_date: "2026-11-01", end_date: "2027-10-31" },
    contract: { contract_no: "SZL-2026-01", signature_date: "2026-10-30", has_price_escalation: false },
    groups: [
      {
        name: "Kaba",
        items: [
          line(CAT_A, "A-1", "10", "100.00", { offer_item_id: seeded.items[0]?.id }),
          line(CAT_B, "B-1", "2.5", "40.00", { offer_item_id: seeded.items[1]?.id }),
        ],
      },
    ],
    open_site: false,
    ...over,
  };
}

const convert = (id: string, payload: unknown): Promise<Reply> => api("POST", `/offers/${id}/convert`, payload);

/** Tek grup, verilen satırlar (Σ vektörleri için). */
async function amountOf(lines: Array<[string, string]>, contract: Record<string, unknown> = {}): Promise<string> {
  const seeded = await offer();
  const items = lines.map(([quantity, price], index) => line(CAT_A, `V-${index}`, quantity, price));
  const reply = await convert(seeded.id, body(seeded, {
    groups: [{ name: "Kaba", items }],
    contract: { contract_no: "S", signature_date: "2026-10-30", has_price_escalation: false, ...contract },
  }));
  expect(reply.status, JSON.stringify(reply.json)).toBe(200);
  return (written[written.length - 1] as ConvertedProjectSpec).contract.amount;
}

// ─────────────────────────────────────────────────────────────────────────────── hata sırası

describe("🔴 hata sırası = FastAPI + convert_service.py (404 → 409 zaten → 409 won değil → statik 422 → 404 katalog/disiplin → yaz)", () => {
  it("olmayan teklif → 404 'Teklif bulunamadı'", async () => {
    const seeded = await offer();
    const reply = await convert(MISSING_ID, body(seeded));
    expect(reply).toMatchObject({ status: 404, json: { detail: "Teklif bulunamadı" } });
  });

  it("UUID olmayan kimlik → 422 path (liste biçimi)", async () => {
    const reply = await convert("yok", body(await offer()));
    expect(reply.status).toBe(422);
    expect(reply.json.detail[0].loc).toEqual(["path", "offer_id"]);
  });

  it.each(["draft", "sent", "lost"] as const)("son revizyon %s → 409 won değil (metin AYNEN)", async (status) => {
    const seeded = await offer(status);
    expect(await convert(seeded.id, body(seeded))).toMatchObject({ status: 409, json: { detail: NOT_WON } });
    expect(written).toHaveLength(0);
  });

  it("dönüştürülmüş teklif → 409 'Teklif zaten dönüştürüldü'; ikinci deneme de aynı, hiçbir şey İKİNCİ KEZ yazılmaz", async () => {
    const seeded = await offer();
    expect((await convert(seeded.id, body(seeded))).status).toBe(200);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      expect(await convert(seeded.id, body(seeded))).toMatchObject({ status: 409, json: { detail: ALREADY } });
    }
    expect(written).toHaveLength(1);
  });

  it("🔴 'zaten dönüştürüldü' won-değil kontrolünden ÖNCE gelir (taslak + project_id → ALREADY, NOT_WON değil)", async () => {
    const seeded = await offer("draft");
    state.offers = state.offers.map((entry) => (entry.id === seeded.id ? { ...entry, projectId: MISSING_ID } : entry));
    expect(await convert(seeded.id, body(seeded))).toMatchObject({ status: 409, json: { detail: ALREADY } });
  });

  it("🔴 409'lar statik 422'den ÖNCE: dönüştürülmüş teklife mükerrer-kodlu gövde → yine 409 zaten", async () => {
    const seeded = await offer();
    expect((await convert(seeded.id, body(seeded))).status).toBe(200);
    const dup = body(seeded, { groups: [{ name: "Kaba", items: [line(CAT_A, "X", "1", "1"), line(CAT_B, "X", "1", "1")] }] });
    expect(await convert(seeded.id, dup)).toMatchObject({ status: 409, json: { detail: ALREADY } });
  });

  it("🔴 statik 422 katalog/disiplin 404'ünden ÖNCE: hem mükerrer kod hem olmayan katalog → 422", async () => {
    const seeded = await offer();
    const mixed = body(seeded, { groups: [{ name: "Kaba", items: [line(MISSING_CAT, "X", "1", "1"), line(CAT_B, "X", "1", "1")] }] });
    const reply = await convert(seeded.id, mixed);
    expect(reply.status).toBe(422);
    expect(reply.json.detail).toBe("groups[0].items[1].code: Kalem kodu tekrar ediyor (X)");
  });

  it("katalog 404 disiplin 404'ünden ÖNCE; ikisi de yazmadan önce", async () => {
    const seeded = await offer();
    const both = body(seeded, {
      groups: [{ name: "Kaba", items: [line(MISSING_CAT, "X", "1", "1")] }],
      group_disciplines: { Kaba: MISSING_DISC },
    });
    expect(await convert(seeded.id, both)).toMatchObject({ status: 404, json: { detail: "Katalog iş tipi bulunamadı" } });
    const discOnly = body(seeded, { group_disciplines: { Kaba: MISSING_DISC } });
    expect(await convert(seeded.id, discOnly)).toMatchObject({ status: 404, json: { detail: "Disiplin bulunamadı" } });
    expect(written).toHaveLength(0);
  });

  it("şema 422 (FastAPI liste biçimi) HANDLER'DAN ÖNCE gelir: olmayan teklife eksik gövde → 422, 404 değil", async () => {
    const reply = await convert(MISSING_ID, body(await offer(), { project: { city: "C", start_date: "2026-11-01", end_date: "2026-11-02" } }));
    expect(reply.status).toBe(422);
    expect(Array.isArray(reply.json.detail)).toBe(true);
    expect(reply.json.detail[0]).toMatchObject({ type: "missing", loc: ["body", "project", "name"] });
  });

  it("şema 422: fiyat farkı bayrağı ZORUNLU (varsayılanı sessizce miras bırakılmaz)", async () => {
    const seeded = await offer();
    const reply = await convert(seeded.id, body(seeded, { contract: { contract_no: "S", signature_date: "2026-10-30" } }));
    expect(reply.json.detail[0]).toMatchObject({ type: "missing", loc: ["body", "contract", "has_price_escalation"] });
  });
});

// ──────────────────────────────────────────────────────────────── şema-sonrası model kuralları

describe("pydantic model doğrulayıcıları (liste biçimi, 'Value error, …')", () => {
  it("bitiş < başlangıç → 'project.end_date: Bitiş tarihi başlangıçtan önce olamaz'", async () => {
    const seeded = await offer();
    const reply = await convert(seeded.id, body(seeded, { project: { name: "P", city: "C", start_date: "2026-11-02", end_date: "2026-11-01" } }));
    expect(reply.status).toBe(422);
    expect(reply.json.detail[0]).toMatchObject({
      type: "value_error",
      loc: ["body", "project"],
      msg: "Value error, project.end_date: Bitiş tarihi başlangıçtan önce olamaz",
    });
  });

  it("site_name yalnız open_site açıkken", async () => {
    const seeded = await offer();
    const reply = await convert(seeded.id, body(seeded, { site_name: "A-Blok" }));
    expect(reply.json.detail[0].msg).toBe("Value error, site_name: yalnız open_site açıkken verilebilir");
  });

  it("normalize sonrası çakışan farklı eşleme → 'birden çok eşleme'", async () => {
    const seeded = await offer();
    const reply = await convert(seeded.id, body(seeded, { group_disciplines: { Kaba: D1, " Kaba": D2 } }));
    expect(reply.json.detail[0].msg).toBe("Value error, group_disciplines: «Kaba» için birden çok eşleme var");
  });

  it("2001 kalem → 'groups: en fazla 2000 kalem dönüştürülebilir'; 2000 kabul", async () => {
    const seeded = await offer();
    const many = (count: number) => [{ name: "Kaba", items: Array.from({ length: count }, (_, i) => line(CAT_A, `K-${i}`, "1", "1")) }];
    const over = await convert(seeded.id, body(seeded, { groups: many(2001) }));
    expect(over.json.detail[0].msg).toBe("Value error, groups: en fazla 2000 kalem dönüştürülebilir");
    expect((await convert(seeded.id, body(seeded, { groups: many(2000) }))).status).toBe(200);
  });

  it("boşluk-yalnız ad/kod strip sonrası boş sayılır (string_too_short)", async () => {
    const seeded = await offer();
    const reply = await convert(seeded.id, body(seeded, { groups: [{ name: "Kaba", items: [line(CAT_A, "   ", "1", "1")] }] }));
    expect(reply.json.detail[0]).toMatchObject({ type: "string_too_short", loc: ["body", "groups", 0, "items", 0, "code"] });
  });
});

// ─────────────────────────────────────────────────────────────────────── statik hatalar (tek 422)

describe("statik hatalar: TEK 422, '; ' birleşik, metinler AYNEN", () => {
  async function rejected(over: Record<string, unknown>, expected: string): Promise<void> {
    const seeded = await offer();
    const reply = await convert(seeded.id, body(seeded, over));
    expect(reply.status).toBe(422);
    expect(reply.json.detail).toBe(expected);
    expect(written).toHaveLength(0);
  }

  it("aynı adlı grup (SO-30)", () =>
    rejected({ groups: [{ name: "Kaba", items: [line(CAT_A, "A", "1", "1")] }, { name: "Kaba", items: [line(CAT_B, "B", "1", "1")] }] }, "groups[1].name: Aynı adlı grup var (Kaba)"));

  it("grup adı strip edilerek karşılaştırılır", () =>
    rejected({ groups: [{ name: " Kaba ", items: [line(CAT_A, "A", "1", "1")] }, { name: "Kaba", items: [line(CAT_B, "B", "1", "1")] }] }, "groups[1].name: Aynı adlı grup var (Kaba)"));

  it("kalem kodu tekrar (SO-29) — gruplar ARASI da", () =>
    rejected({ groups: [{ name: "G1", items: [line(CAT_A, "B-01", "1", "1")] }, { name: "G2", items: [line(CAT_B, "B-01", "1", "1")] }] }, "groups[1].items[0].code: Kalem kodu tekrar ediyor (B-01)"));

  it("birden çok hata tek geçişte '; ' ile birleşir (sıra: grup adı, kod, …)", async () => {
    await rejected(
      { groups: [{ name: "G", items: [line(CAT_A, "K", "1", "1"), line(CAT_B, "K", "1", "1")] }, { name: "G", items: [line(CAT_A, "K", "1", "1")] }] },
      "groups[0].items[1].code: Kalem kodu tekrar ediyor (K); groups[1].name: Aynı adlı grup var (G); groups[1].items[0].code: Kalem kodu tekrar ediyor (K)",
    );
  });

  it("offer_item_id teklifin son revizyonunda yok", () =>
    rejected({ groups: [{ name: "Kaba", items: [line(CAT_A, "A", "1", "1", { offer_item_id: MISSING_ID })] }] }, "groups[0].items[0].offer_item_id: Kalem teklifin son revizyonunda bulunamadı"));

  it("offer_item_id katalog bağı gövdedekiyle uyuşmuyor", async () => {
    const seeded = await offer();
    const wrong = body(seeded, { groups: [{ name: "Kaba", items: [line(CAT_C, "A", "1", "1", { offer_item_id: seeded.items[0]?.id })] }] });
    const reply = await convert(seeded.id, wrong);
    expect(reply.json.detail).toBe("groups[0].items[0].offer_item_id: Teklif kaleminin katalog bağı gövdedekiyle uyuşmuyor");
  });

  it("group_disciplines anahtarı gövdede olmayan grup", () =>
    rejected({ group_disciplines: { Yok: D1 } }, "group_disciplines: «Yok» adlı grup gövdede yok"));

  it("fiyat farkı AÇIK + endeks türü yok (teklif sabit) / baz endeks yok → iki hata birleşik", () =>
    rejected(
      { contract: { contract_no: "S", signature_date: "2026-10-30", has_price_escalation: true } },
      "contract.index_type: Fiyat farkı açıkken endeks türü zorunludur; contract.base_index_value: Fiyat farkı açıkken baz endeks zorunludur",
    ));

  it("fiyat farkı KAPALI + endeks alanı verilirse", () =>
    rejected(
      { contract: { contract_no: "S", signature_date: "2026-10-30", has_price_escalation: false, index_type: "ufe", base_index_value: "100" } },
      "contract.index_type: Fiyat farkı kapalıyken verilemez; contract.base_index_value: Fiyat farkı kapalıyken verilemez",
    ));

  it("Σ ≥ 1e16 ve amount yok → 'Kalem toplamı sözleşme bedeli sınırını aşıyor'; amount VARSA kabul", async () => {
    const huge = [{ name: "Kaba", items: [line(CAT_A, "H", "10000", "1000000000000.00")] }]; // 1e16 tam
    await rejected({ groups: huge }, "contract.amount: Kalem toplamı sözleşme bedeli sınırını aşıyor");
    const seeded = await offer();
    const withAmount = body(seeded, {
      groups: huge,
      contract: { contract_no: "S", signature_date: "2026-10-30", has_price_escalation: false, amount: "5.00" },
    });
    expect((await convert(seeded.id, withAmount)).status).toBe(200);
  });
});

// ───────────────────────────────────────────────────────────────────────── Σ bedel yuvarlama

describe("🔴 bedel = Σ SATIR BAŞINA ROUND_HALF_UP(miktar × B.F., 0,01) (backend `_item_total`)", () => {
  it("sınır vektörü 1: yarım kuruş yukarı — 0,005 × 1,00 = 0,01", async () => {
    expect(await amountOf([["0.005", "1.00"]])).toBe("0.01");
  });

  it("sınır vektörü 2: satır başı, toplamda DEĞİL — iki satır 0,004 × 1,00 → 0,00 + 0,00 (toplamda yuvarlansaydı 0,01)", async () => {
    expect(await amountOf([["0.004", "1.00"], ["0.004", "1.00"]])).toBe("0.00");
  });

  it("sınır vektörü 3: iki satır 0,005 × 1,00 → 0,01 + 0,01 = 0,02 (toplamda yuvarlansaydı 0,01)", async () => {
    expect(await amountOf([["0.005", "1.00"], ["0.005", "1.00"]])).toBe("0.02");
  });

  it("sınır vektörü 4: 2,675 × 1,00 → 2,68 · 3,333 × 1,50 (4,9995) → 5,00 · 0,333 × 0,15 (0,04995) → 0,05", async () => {
    expect(await amountOf([["2.675", "1.00"]])).toBe("2.68");
    expect(await amountOf([["3.333", "1.50"]])).toBe("5.00");
    expect(await amountOf([["0.333", "0.15"]])).toBe("0.05");
  });

  it("alttan sınır: 1,001 × 0,50 = 0,5005 → 0,50 (yarım DEĞİL)", async () => {
    expect(await amountOf([["1.001", "0.50"]])).toBe("0.50");
  });

  it("kayan nokta tuzağı: 0,001 × 999999999999,99 = 999999999,99999 → 1000000000,00 (bigint, Number() yok)", async () => {
    expect(await amountOf([["0.001", "999999999999.99"]])).toBe("1000000000.00");
  });

  it("verilen amount Σ'yı EZER ve kuruş ölçeğine kanonlanır", async () => {
    expect(await amountOf([["1", "10.00"]], { amount: "7" })).toBe("7.00");
  });

  it("birden çok grup/kalem Σ'ya girer (grup sırası fark etmez)", async () => {
    const seeded = await offer();
    const reply = await convert(seeded.id, body(seeded, {
      groups: [
        { name: "G1", items: [line(CAT_A, "1", "10", "100.00")] },
        { name: "G2", items: [line(CAT_B, "2", "2.5", "40.00"), line(CAT_C, "3", "0.5", "3.00")] },
      ],
    }));
    expect(reply.status).toBe(200);
    expect(written[0]?.contract.amount).toBe("1101.50");
  });
});

// ─────────────────────────────────────────────────────────────────── yazılan istek (port) + yanıt

describe("yanıt + port isteği", () => {
  it("200: parasız yanıt şekli; kalem sayısı ve sunucu kimlikleri; şantiyesiz → site_id null", async () => {
    const seeded = await offer();
    const reply = await convert(seeded.id, body(seeded));
    expect(reply.status).toBe(200);
    expect(reply.json).toEqual({
      project_id: "0b000000-0000-4000-8000-000000000001",
      project_slug: "a-blok",
      project_code: "PRJ-2026-001",
      site_id: null,
      contract_item_count: 2,
      warnings: [],
    });
  });

  it("sözleşme varsayılanları: KDV revizyondan, avans %20, teminat %5, gecikme cezası boş; sıra = gövde sırası", async () => {
    const seeded = await offer("won", { vat_pct: "18" });
    const reply = await convert(seeded.id, body(seeded));
    expect(reply.status).toBe(200);
    expect(written[0]).toMatchObject({
      offerNo: seeded.offerNo,
      employerId: EMP_1,
      employerName: "Güneşkent Gayrimenkul A.Ş.",
      contract: { vatPct: "18.00", advancePct: "20.00", retainagePct: "5.00", latePenaltyDaily: null, amount: "1100.00", hasPriceEscalation: false, indexType: null, baseIndexValue: null },
      groups: [{ name: "Kaba", items: [{ code: "A-1", quantity: "10.000", unitPrice: "100.00" }, { code: "B-1", quantity: "2.500", unitPrice: "40.00" }] }],
      site: null,
    });
  });

  it("gövdedeki vat/avans/teminat/ceza varsayılanı EZER", async () => {
    const seeded = await offer();
    await convert(seeded.id, body(seeded, { contract: { contract_no: "S", signature_date: "2026-10-30", has_price_escalation: false, vat_pct: "10", advance_pct: "15", retainage_pct: "3", late_penalty_daily: "250" } }));
    expect(written[0]?.contract).toMatchObject({ vatPct: "10.00", advancePct: "15.00", retainagePct: "3.00", latePenaltyDaily: "250.00" });
  });

  it("endeks türü: teklif 'tuik' ise tekliften varsayılan; gövde ezer; açıkken baz endeks zorunlu", async () => {
    const seeded = await offer("won", { price_escalation: "tuik", price_index_type: "tufe" });
    const reply = await convert(seeded.id, body(seeded, { contract: { contract_no: "S", signature_date: "2026-10-30", has_price_escalation: true, base_index_value: "100.5" } }));
    expect(reply.status, JSON.stringify(reply.json)).toBe(200);
    expect(written[0]?.contract).toMatchObject({ hasPriceEscalation: true, indexType: "tufe", baseIndexValue: "100.500" });
    const other = await offer("won", { price_escalation: "tuik", price_index_type: "tufe" });
    await convert(other.id, body(other, { contract: { contract_no: "S", signature_date: "2026-10-30", has_price_escalation: true, base_index_value: "1", index_type: "ufe" } }));
    expect(written[1]?.contract.indexType).toBe("ufe");
  });

  it("proje alanları strip edilir; open_site → şantiye adı (yoksa proje adı)", async () => {
    const seeded = await offer();
    await convert(seeded.id, body(seeded, { project: { name: "  A Blok  ", city: " İstanbul ", start_date: "2026-11-01", end_date: "2026-11-01" }, open_site: true }));
    expect(written[0]?.project).toMatchObject({ name: "A Blok", city: "İstanbul", startDate: "2026-11-01", endDate: "2026-11-01" });
    expect(written[0]?.site).toEqual({ name: "A Blok" });
    const named = await offer();
    await convert(named.id, body(named, { open_site: true, site_name: " Merkez " }));
    expect(written[1]?.site).toEqual({ name: "Merkez" });
  });

  it("yöntem: GET /offers/{id}/convert → 405", async () => {
    expect((await api("GET", `/offers/${MISSING_ID}/convert`)).status).toBe(405);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────── uyarılar

describe("uyarılar (metinler AYNEN)", () => {
  it("şantiyesiz + grup–disiplin eşlemesi → group_disciplines_ignored_without_site; eşleme SAKLANMAZ", async () => {
    const seeded = await offer();
    const reply = await convert(seeded.id, body(seeded, { group_disciplines: { Kaba: D1 } }));
    expect(reply.json.warnings).toEqual([
      { code: "group_disciplines_ignored_without_site", message: "Şantiye açılmadığı için grup–disiplin eşlemesi saklanmadı; Planlama'da eşleyin", group_name: null },
    ]);
  });

  it("şantiyeli + karışık disiplinli + eşlenmemiş grup → mixed_discipline_group (+ group_name)", async () => {
    const seeded = await offer("won", {}, [CAT_A, CAT_C]);
    const mixed = body(seeded, { open_site: true, groups: [{ name: "Karışık", items: [line(CAT_A, "A", "1", "1"), line(CAT_C, "C", "1", "1")] }] });
    const reply = await convert(seeded.id, mixed);
    expect(reply.json.warnings).toEqual([
      {
        code: "mixed_discipline_group",
        message: "Grubun kalemleri birden çok disiplinde; Planlama'da disiplin elle eşlenmeli (eşlenmeden baseline dondurulamaz)",
        group_name: "Karışık",
      },
    ]);
  });

  it("karışık grup elle eşlenmişse (anahtar strip) ya da tek disiplinliyse uyarı YOK", async () => {
    const seeded = await offer("won", {}, [CAT_A, CAT_C]);
    const groups = [{ name: "Karışık", items: [line(CAT_A, "A", "1", "1"), line(CAT_C, "C", "1", "1")] }, { name: "Tek", items: [line(CAT_B, "B", "1", "1")] }];
    const reply = await convert(seeded.id, body(seeded, { open_site: true, groups, group_disciplines: { " Karışık ": D2 } }));
    expect(reply.json.warnings).toEqual([]);
  });

  it("karışık-grup uyarısı ŞANTİYESİZDE yok (yalnız eşleme-yok-sayıldı uyarısı)", async () => {
    const seeded = await offer("won", {}, [CAT_A, CAT_C]);
    const reply = await convert(seeded.id, body(seeded, { groups: [{ name: "Karışık", items: [line(CAT_A, "A", "1", "1"), line(CAT_C, "C", "1", "1")] }] }));
    expect(reply.json.warnings).toEqual([]);
  });

  it("adam-saat yuvası olmayan kalem → no_rate_slot ('{n} kalemde adam-saat oranı yok (sözleşmeden doldurulamaz)'); sıra: karışık grup sonra no_rate_slot", async () => {
    const seeded = await offer("won", {}, [CAT_A]);
    const reply = await convert(seeded.id, body(seeded, {
      groups: [{ name: "G", items: [line(CAT_Z, "Z1", "1", "1"), line(CAT_Z, "Z2", "1", "1"), line(CAT_A, "A", "1", "1")] }],
    }));
    expect(reply.json.warnings).toEqual([{ code: "no_rate_slot", message: "2 kalemde adam-saat oranı yok (sözleşmeden doldurulamaz)", group_name: null }]);
  });

  it("adam-saat TEKLİF KALEMİNDEN okunur: offer_item_id'li kalemin a-s'si yuvadır (katalog standardı 0 olsa da); id'siz kalem katalog standardına düşer", async () => {
    const created = (await api("POST", "/offers", { employer_id: EMP_1, title: "A-s" })).json;
    const group = (await api("POST", `/offers/${created.id}/revisions/0/groups`, { name: "Kaba" })).json;
    const item = (await api("POST", `/offers/${created.id}/revisions/0/items`, { catalog_item_id: CAT_Z, group_id: group.id, quantity: "1", unit_mhr: "2.5" })).json;
    for (const action of ["send", "win"]) await api("POST", `/offers/${created.id}/revisions/0/${action}`);
    const withSource = body({ id: created.id, offerNo: "", items: [item] }, { groups: [{ name: "G", items: [line(CAT_Z, "Z", "1", "1", { offer_item_id: item.id })] }] });
    expect((await convert(created.id, withSource)).json.warnings).toEqual([]);

    const other = await offer("won", {}, [CAT_Z]);
    const without = await convert(other.id, body(other, { groups: [{ name: "G", items: [line(CAT_Z, "Z", "1", "1")] }] }));
    expect(without.json.warnings.map((w: any) => w.code)).toEqual(["no_rate_slot"]);
  });
});

// ──────────────────────────────────────────────────────────────────────────── okuma türevleri

describe("🔴 conversion_state / project_id / won_not_converted_count TÜREV (sabit null/0 DEĞİL)", () => {
  const detail = async (id: string) => (await api("GET", `/offers/${id}`)).json;
  const listed = async (id: string) => ((await api("GET", "/offers")).json.items as any[]).find((item) => item.id === id);
  const wonNotConverted = async () => (await api("GET", "/offers")).json.summary.won_not_converted_count;

  it("kazanılmış + dönüştürülmemiş → won_not_converted (detay + liste + sayaç); dönüştürünce converted + project_id, sayaç düşer", async () => {
    const seeded = await offer();
    expect(await detail(seeded.id)).toMatchObject({ conversion_state: "won_not_converted", project_id: null });
    expect(await listed(seeded.id)).toMatchObject({ conversion_state: "won_not_converted", project_id: null });
    expect(await wonNotConverted()).toBe(1);

    const reply = await convert(seeded.id, body(seeded));
    expect(await detail(seeded.id)).toMatchObject({ conversion_state: "converted", project_id: reply.json.project_id });
    expect(await listed(seeded.id)).toMatchObject({ conversion_state: "converted", project_id: reply.json.project_id });
    expect(await wonNotConverted()).toBe(0);
  });

  it("taslak/gönderilmiş/kaybedilmiş → null; sayaç yalnız kazanılmış+dönüştürülmemişleri sayar", async () => {
    const draft = await offer("draft");
    const sent = await offer("sent");
    const lost = await offer("lost");
    const won = await offer("won");
    for (const entry of [draft, sent, lost]) expect(await detail(entry.id)).toMatchObject({ conversion_state: null, project_id: null });
    expect(await wonNotConverted()).toBe(1);
    await convert(won.id, body(won));
    expect(await wonNotConverted()).toBe(0);
  });

  it("sayaç liste süzgecinden BAĞIMSIZ (status=lost iken de kazanılmış-dönüştürülmemiş sayılır)", async () => {
    await offer("won");
    await offer("lost");
    const filtered = (await api("GET", "/offers?status=lost")).json;
    expect(filtered.summary.won_not_converted_count).toBe(1);
  });

  it("dönüştürme teklif satırına `converted_at` (saat enjekte) yazar", async () => {
    const seeded = await offer();
    const before = (await detail(seeded.id)).updated_at as string;
    expect(before).toBeTruthy();
    await convert(seeded.id, body(seeded));
    expect(state.offers.find((entry) => entry.id === seeded.id)?.convertedAt).toBe(NOON);
  });
});

// ─────────────────────────────────────────────────────────── TKL-B6.8 · yapısal errors[] (convert_service `_Issue`)

describe("🔴 servis doğrulama 422: `errors[]` yapısal loc + `detail` metni AYNEN (backend `_Issue`)", () => {
  it("kalem kodu / grup adı / offer_item_id: loc = ['groups', i, 'items', j, 'code'] …; detail değişmez", async () => {
    const seeded = await offer();
    const reply = await convert(seeded.id, body(seeded, {
      groups: [
        { name: "G", items: [line(CAT_A, "K", "1", "1"), line(CAT_B, "K", "1", "1", { offer_item_id: MISSING_ID })] },
        { name: "G", items: [line(CAT_A, "Z", "1", "1", { offer_item_id: seeded.items[1]?.id })] },
      ],
    }));
    expect(reply.status).toBe(422);
    expect(reply.json.errors).toEqual([
      { loc: ["groups", 0, "items", 1, "code"], message: "Kalem kodu tekrar ediyor (K)" },
      { loc: ["groups", 0, "items", 1, "offer_item_id"], message: "Kalem teklifin son revizyonunda bulunamadı" },
      { loc: ["groups", 1, "name"], message: "Aynı adlı grup var (G)" },
      { loc: ["groups", 1, "items", 0, "offer_item_id"], message: "Teklif kaleminin katalog bağı gövdedekiyle uyuşmuyor" },
    ]);
    expect(reply.json.detail).toBe([
      "groups[0].items[1].code: Kalem kodu tekrar ediyor (K)",
      "groups[0].items[1].offer_item_id: Kalem teklifin son revizyonunda bulunamadı",
      "groups[1].name: Aynı adlı grup var (G)",
      "groups[1].items[0].offer_item_id: Teklif kaleminin katalog bağı gövdedekiyle uyuşmuyor",
    ].join("; "));
  });

  it("group_disciplines → loc ['group_disciplines', ad] (detail etiketi yalnız 'group_disciplines'); fiyat farkı → ['contract', alan]; bedel → ['contract', 'amount']", async () => {
    const seeded = await offer();
    const reply = await convert(seeded.id, body(seeded, {
      group_disciplines: { Olmayan: D1 },
      contract: { contract_no: "S", signature_date: "2026-10-30", has_price_escalation: true },
    }));
    expect(reply.status).toBe(422);
    expect(reply.json.errors).toEqual([
      { loc: ["group_disciplines", "Olmayan"], message: "«Olmayan» adlı grup gövdede yok" },
      { loc: ["contract", "index_type"], message: "Fiyat farkı açıkken endeks türü zorunludur" },
      { loc: ["contract", "base_index_value"], message: "Fiyat farkı açıkken baz endeks zorunludur" },
    ]);
    expect(reply.json.detail).toBe(
      "group_disciplines: «Olmayan» adlı grup gövdede yok; contract.index_type: Fiyat farkı açıkken endeks türü zorunludur; contract.base_index_value: Fiyat farkı açıkken baz endeks zorunludur",
    );
    const closed = await convert(seeded.id, body(seeded, { contract: { contract_no: "S", signature_date: "2026-10-30", has_price_escalation: false, index_type: "ufe", base_index_value: "1" } }));
    expect(closed.json.errors.map((e: any) => e.loc)).toEqual([["contract", "index_type"], ["contract", "base_index_value"]]);
    const huge = await convert(seeded.id, body(seeded, { groups: [{ name: "G", items: [line(CAT_A, "H", "10000", "1000000000000.00")] }] }));
    expect(huge.json.errors).toEqual([{ loc: ["contract", "amount"], message: "Kalem toplamı sözleşme bedeli sınırını aşıyor" }]);
    expect(huge.json.detail).toBe("contract.amount: Kalem toplamı sözleşme bedeli sınırını aşıyor");
  });

  it("şema 422 (FastAPI listesi) `errors` TAŞIMAZ", async () => {
    const seeded = await offer();
    const reply = await convert(seeded.id, { ...body(seeded), contract: undefined });
    expect(reply.status).toBe(422);
    expect(Array.isArray(reply.json.detail)).toBe(true);
    expect(reply.json).not.toHaveProperty("errors");
  });
});

// ─────────────────────────────────────────────────────────────────── TKL-B6.8 · elle proje kodu

describe("🔴 ConvertProject.code: verilirse kullanılır (strip), çakışırsa 409, yoksa sunucu üretir", () => {
  const withCode = (seeded: Seeded, code: unknown) =>
    body(seeded, { project: { name: "A Blok Projesi", city: "İstanbul", start_date: "2026-11-01", end_date: "2027-10-31", code } });

  it("verilen kod (strip) port'a ve yanıta gider; üretilmez", async () => {
    const seeded = await offer();
    const reply = await convert(seeded.id, withCode(seeded, "  OZEL-7  "));
    expect(reply.status, JSON.stringify(reply.json)).toBe(200);
    expect(reply.json.project_code).toBe("OZEL-7");
    expect((written[0] as ConvertedProjectSpec).project.code).toBe("OZEL-7");
  });

  it("kod yok ya da null → port'a null (sunucu PRJ-YYYY-NNN üretir)", async () => {
    const a = await offer();
    expect((await convert(a.id, body(a))).status).toBe(200);
    const b = await offer();
    expect((await convert(b.id, withCode(b, null))).status).toBe(200);
    expect(written.map((spec) => spec.project.code)).toEqual([null, null]);
  });

  it("kullanımdaki kod → 409 'Bu proje kodu zaten kullanılıyor'; HİÇBİR yazma yok, teklif dönüşmemiş", async () => {
    takenCodes.add("OZEL-7");
    const seeded = await offer();
    const reply = await convert(seeded.id, withCode(seeded, "OZEL-7"));
    expect(reply.status).toBe(409);
    expect(reply.json).toEqual({ detail: "Bu proje kodu zaten kullanılıyor" });
    expect(written).toHaveLength(0);
    expect((await api("GET", `/offers/${seeded.id}`)).json.project_id).toBeNull();
  });

  it("sıra: statik 422 ve katalog 404, kod 409'undan ÖNCE", async () => {
    takenCodes.add("OZEL-7");
    const seeded = await offer();
    const dup = body(seeded, {
      project: { name: "A", city: "İ", start_date: "2026-11-01", end_date: "2027-10-31", code: "OZEL-7" },
      groups: [{ name: "G", items: [line(CAT_A, "K", "1", "1"), line(CAT_B, "K", "1", "1")] }],
    });
    expect((await convert(seeded.id, dup)).status).toBe(422);
    const missing = { ...dup, groups: [{ name: "G", items: [line(MISSING_CAT, "K", "1", "1")] }] };
    expect((await convert(seeded.id, missing)).status).toBe(404);
  });

  it("boşluk-yalnız kod strip sonrası boş → şema 422; 51 karakter → şema 422", async () => {
    const seeded = await offer();
    for (const code of ["   ", "x".repeat(51)]) {
      const reply = await convert(seeded.id, withCode(seeded, code));
      expect(reply.status).toBe(422);
      expect(Array.isArray(reply.json.detail)).toBe(true);
    }
  });
});

// ──────────────────────────────────────── TKL-B6.8 · okuma: project / converted_at / converted_by_name / history / conversion

describe("🔴 dönüştürülmüş teklifin okuması: proje künyesi, dönüştürme anı/aktörü, history 'converted', `conversion` süzgeci", () => {
  const detail = async (id: string) => (await api("GET", `/offers/${id}`)).json;
  const listed = async (id: string) => ((await api("GET", "/offers")).json.items as any[]).find((item) => item.id === id);

  it("dönüşmemiş teklif: project/converted_at/converted_by_name null (detay + liste)", async () => {
    const seeded = await offer();
    for (const read of [await detail(seeded.id), await listed(seeded.id)]) {
      expect(read).toMatchObject({ project: null, converted_at: null, converted_by_name: null });
    }
  });

  it("dönüştürünce detay + liste: project {id, code, name, slug}, converted_at, converted_by_name = aktör", async () => {
    const seeded = await offer();
    const reply = await convert(seeded.id, body(seeded));
    const expected = {
      project: { id: reply.json.project_id, code: reply.json.project_code, name: "A Blok Projesi", slug: "a-blok" },
      converted_at: NOON,
      converted_by_name: "Ahmet Yılmaz",
    };
    expect(await detail(seeded.id)).toMatchObject(expected);
    expect(await listed(seeded.id)).toMatchObject(expected);
  });

  it("history: son olay 'converted' (rev_no = kazanılan revizyon, aktör, dönüştürme anı) — aynı anlı 'won'dan SONRA", async () => {
    const seeded = await offer();
    const before = (await detail(seeded.id)).history.map((e: any) => e.kind);
    expect(before).not.toContain("converted");
    await convert(seeded.id, body(seeded));
    const history = (await detail(seeded.id)).history;
    expect(history.map((e: any) => e.kind)).toEqual([...before, "converted"]);
    expect(history[history.length - 1]).toEqual({ at: NOON, kind: "converted", rev_no: 0, user_id: ACTOR.id, user_name: "Ahmet Yılmaz" });
  });

  describe("GET /offers?conversion=", () => {
    async function trio() {
      const converted = await offer("won", { title: "Dönüşen" });
      const pending = await offer("won", { title: "Bekleyen" });
      const lost = await offer("lost", { title: "Kaybedilen" });
      await convert(converted.id, body(converted));
      return { converted, pending, lost };
    }
    const ids = async (query: string) => ((await api("GET", `/offers${query}`)).json.items as any[]).map((item) => item.id);

    it("converted → yalnız project_id dolu; won_not_converted → son revizyon won + project yok (kaybedilen/taslak YOK)", async () => {
      const { converted, pending } = await trio();
      expect(await ids("?conversion=converted")).toEqual([converted.id]);
      expect(await ids("?conversion=won_not_converted")).toEqual([pending.id]);
    });

    it("süzgeç `total`u daraltır, status ile kesişir; özet/kartlar süzgeçten BAĞIMSIZ", async () => {
      await trio();
      const all = (await api("GET", "/offers")).json;
      const filtered = (await api("GET", "/offers?conversion=converted")).json;
      expect(filtered.total).toBe(1);
      expect(filtered.summary).toEqual(all.summary);
      expect(await ids("?conversion=converted&status=lost")).toEqual([]);
    });

    it("tanınmayan değer → 422 (liste biçimi, loc ['query','conversion'])", async () => {
      const reply = await api("GET", "/offers?conversion=bogus");
      expect(reply.status).toBe(422);
      expect(reply.json.detail[0]).toMatchObject({ loc: ["query", "conversion"], input: "bogus" });
    });
  });
});
