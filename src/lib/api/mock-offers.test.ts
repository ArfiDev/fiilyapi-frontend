// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- yanıt gövdesi gezinmesi: sahte backend yanıtlarının ŞEMA uyumu ayrıca `mock-backend-body-contract.test.ts` şema gezginiyle (zorunlu/fazla alan, tür) doğrulanır; burada değerler beklenen SABİTLERLE karşılaştırılır. Emsal: StockEntryForm.test.tsx */
//
// 🔴🔴 TEKLİF SAHTE BACKEND'İ — `e2e/mock-offers.ts` ↔ backend `app/modules/offers/**` davranışı.
//
// Bu dosya sahte backend'i HTTP üzerinden sürer (saat ENJEKTE edilir: yıl başı / gün sınırı),
// backend `tests/modules/offers/test_*_api.py` vakalarının AYNASIDIR ve her biri bir kuralı
// bekçiler: durum makinesi, hata metinleri (backend'den AYNEN), numara sayacı, hep-ya-hiç toplu
// ekleme, `cost_unit_price` üç hâli, silme kuralı, yeni revizyon kopyası, SO-1/2/4/9/10/12,
// liste özeti, gövde şema kapısı. Hesap ayrıntıları `mock-offer-calc.test.ts`tedir.
import type { AddressInfo } from "node:net";
import { createServer, type Server } from "node:http";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  emptyOffersState,
  handleOffers,
  OFFER_MESSAGES,
  tklLastPrices,
  type OfferCatalogEntry,
  type OffersState,
} from "../../../e2e/mock-offers";
import { startMockBackend } from "../../../e2e/mock-backend";

const ACTOR = { id: "11111111-1111-1111-1111-111111111111", fullName: "Ahmet Yılmaz" };
const EMP_1 = "e0000000-0000-4000-8000-000000000001";
const EMP_2 = "e0000000-0000-4000-8000-000000000002";
const CAT_A = "ca000000-0000-4000-8000-00000000000a"; // referans 100,00 · a-s 0,85
const CAT_B = "ca000000-0000-4000-8000-00000000000b"; // referanssız
const CAT_C = "ca000000-0000-4000-8000-00000000000c"; // referans 10,00
const MISSING = "ca000000-0000-4000-8000-0000000000ff";

const CATALOG: OfferCatalogEntry[] = [
  { id: CAT_A, pozNo: "KAB-0001", sourceCode: "15.100.1001", name: "Kalıp", uom: "m²", standardUnitMhr: "0.85", refPrice: "100.00" },
  { id: CAT_B, pozNo: "KAB-0002", sourceCode: "15.150.1003", name: "Demir", uom: "ton", standardUnitMhr: "11.5", refPrice: null },
  { id: CAT_C, pozNo: "DUV-0001", sourceCode: null, name: "Tuğla duvar", uom: "m²", standardUnitMhr: "0.55", refPrice: "10.00" },
];
const EMPLOYERS = [
  { id: EMP_1, name: "Güneşkent Gayrimenkul A.Ş." },
  { id: EMP_2, name: "Çelik Holding A.Ş." },
];

/** 2026-10-02 12:00 İstanbul. */
const NOON = "2026-10-02T09:00:00.000Z";

interface Reply {
  status: number;
  json: Record<string, any>;
}

let server: Server;
let base = "";
let state: OffersState;
let now = new Date(NOON);
let external = new Map<string, { price: string }>(); // HK/SZL benzeri harici son fiyat

beforeEach(async () => {
  now = new Date(NOON);
  external = new Map();
  state = emptyOffersState([ACTOR], () => now);
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
      lastPrices: () => {
        const merged = new Map(external);
        for (const [id, row] of tklLastPrices(state)) if (!merged.has(id)) merged.set(id, { price: row.price });
        return merged;
      },
      actor: ACTOR,
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

const rev = (id: string, no = 0) => `/offers/${id}/revisions/${no}`;

async function createOffer(over: Record<string, unknown> = {}): Promise<Record<string, any>> {
  const reply = await api("POST", "/offers", { employer_id: EMP_1, title: "A Blok Kaba İnşaat", ...over });
  expect(reply.status, JSON.stringify(reply.json)).toBe(201);
  return reply.json;
}

async function createGroup(offerId: string, name = "Kaba", revNo = 0): Promise<Record<string, any>> {
  const reply = await api("POST", `${rev(offerId, revNo)}/groups`, { name });
  expect(reply.status, JSON.stringify(reply.json)).toBe(201);
  return reply.json;
}

async function createItem(
  offerId: string,
  groupId: string,
  catalogId = CAT_A,
  over: Record<string, unknown> = {},
  revNo = 0,
): Promise<Record<string, any>> {
  const reply = await api("POST", `${rev(offerId, revNo)}/items`, {
    catalog_item_id: catalogId,
    group_id: groupId,
    quantity: "1",
    ...over,
  });
  expect(reply.status, JSON.stringify(reply.json)).toBe(201);
  return reply.json;
}

async function revisionOf(offerId: string, revNo = 0): Promise<Record<string, any>> {
  const reply = await api("GET", rev(offerId, revNo));
  expect(reply.status).toBe(200);
  return reply.json;
}

const allItems = (revision: Record<string, any>): Array<Record<string, any>> =>
  revision.groups.flatMap((group: Record<string, any>) => group.items);

/** Revizyonu istenen duruma getirir (gönderim için bir fiyatsız kalem eklenir). */
async function toStatus(offerId: string, status: "draft" | "sent" | "won" | "lost" | "withdrawn", revNo = 0): Promise<void> {
  const path: Record<string, string[]> = {
    draft: [],
    sent: ["send"],
    won: ["send", "win"],
    lost: ["send", "lose"],
    withdrawn: ["withdraw"],
  };
  if (path[status]?.includes("send") && allItems(await revisionOf(offerId, revNo)).length === 0) {
    const group = await createGroup(offerId, "G", revNo);
    await createItem(offerId, group.id, CAT_B, {}, revNo);
  }
  for (const action of path[status] ?? []) {
    const reply = await api("POST", `${rev(offerId, revNo)}/${action}`);
    expect(reply.status, JSON.stringify(reply.json)).toBe(200);
  }
}

const YEAR = "2026";

// ──────────────────────────────────────────────────────────────────────────── numara sayacı

describe("🔴 numara: TKL-YYYY-NNNN, yıl = oluşturulma anı (İstanbul), sayaç monoton (SO-7)", () => {
  it("ardışık numara ve Rev.0 taslak (ayardan kopya)", async () => {
    const first = await createOffer();
    const second = await createOffer({ title: "İkinci" });
    expect(first.offer_no).toBe(`TKL-${YEAR}-0001`);
    expect(second.offer_no).toBe(`TKL-${YEAR}-0002`);
    expect(first.status).toBe("draft");
    expect(first.latest_rev_no).toBe(0);
    const revision = await revisionOf(first.id);
    expect(revision).toMatchObject({
      status: "draft",
      is_latest: true,
      is_editable: true,
      overhead_pct: "12.00",
      profit_pct: "15.00",
      vat_pct: "20.00",
      validity_days: 30,
      payment_terms: "Ödeme aylık hakedişle, 30 gün vadeli",
      price_escalation: "fixed",
      price_index_type: null,
      offer_date: "2026-10-02",
      valid_until: "2026-11-01",
    });
  });

  it("silinen teklifin numarası TEKRAR KULLANILMAZ", async () => {
    await createOffer();
    const last = await createOffer({ title: "Silinecek" });
    expect((await api("DELETE", `/offers/${last.id}`)).status).toBe(204);
    expect((await createOffer({ title: "Sonraki" })).offer_no).toBe(`TKL-${YEAR}-0003`);
  });

  it("reddedilen oluşturma (olmayan işveren 404) numara HARCAMAZ", async () => {
    const rejected = await api("POST", "/offers", { employer_id: MISSING, title: "X" });
    expect(rejected.status).toBe(404);
    expect(rejected.json.detail).toBe(OFFER_MESSAGES.employerMissing);
    expect((await createOffer()).offer_no).toBe(`TKL-${YEAR}-0001`);
  });

  it("yıl başında sıfırlanır — sınır İstanbul gece yarısı (UTC 21:00), UTC yılı DEĞİL", async () => {
    now = new Date("2026-12-31T20:59:59.000Z"); // İstanbul 23:59:59
    expect((await createOffer()).offer_no).toBe("TKL-2026-0001");
    now = new Date("2026-12-31T21:00:00.000Z"); // İstanbul 01.01.2027 00:00
    expect((await createOffer({ title: "Yeni yıl" })).offer_no).toBe("TKL-2027-0001");
    expect((await createOffer({ title: "Yeni yıl 2" })).offer_no).toBe("TKL-2027-0002");
    now = new Date("2026-12-31T22:00:00.000Z");
    expect((await createOffer({ title: "Eski yıl sayacı sürer" })).offer_no).toBe("TKL-2027-0003");
  });

  it("4 hane EN AZ genişliktir: 9999'dan sonra TKL-2026-10000 (budanmaz) ve liste SAYISAL sıralanır", async () => {
    state.counters = { 2026: 9998 };
    const a = await createOffer({ title: "9999" });
    const b = await createOffer({ title: "10000" });
    expect([a.offer_no, b.offer_no]).toEqual(["TKL-2026-9999", "TKL-2026-10000"]);
    const list = await api("GET", "/offers");
    expect(list.json.items.map((row: any) => row.offer_no)).toEqual(["TKL-2026-10000", "TKL-2026-9999"]);
  });

  it("teklif tarihi verilmezse BUGÜN (İstanbul günü)", async () => {
    now = new Date("2026-10-02T21:30:00.000Z"); // İstanbul 03.10.2026 00:30
    const offer = await createOffer();
    expect((await revisionOf(offer.id)).offer_date).toBe("2026-10-03");
  });
});

// ─────────────────────────────────────────────────────────────────────────── oluşturma / künye

describe("oluştur · künye · koşullar", () => {
  it("koşullar AYARDAN kopyalanır, gövde ezer; açık null ödeme koşulu BOŞ bırakır", async () => {
    const custom = await createOffer({ validity_days: 45, overhead_pct: "10", vat_pct: "10", payment_terms: "Peşin" });
    expect(await revisionOf(custom.id)).toMatchObject({ validity_days: 45, overhead_pct: "10.00", profit_pct: "15.00", vat_pct: "10.00", payment_terms: "Peşin" });
    const empty = await createOffer({ payment_terms: null });
    expect((await revisionOf(empty.id)).payment_terms).toBeNull();
  });

  it.each([
    [{ title: "" }],
    [{ title: "   " }],
    [{ title: "x".repeat(201) }],
    [{ overhead_pct: "100.01" }],
    [{ profit_pct: "1000" }],
    [{ vat_pct: "-1" }],
    [{ validity_days: 0 }],
    [{ validity_days: 366 }],
    [{ delivery_days: -1 }],
    [{ price_escalation: "tuik" }], // endeks türü zorunlu
    [{ price_escalation: "fixed", price_index_type: "ufe" }], // sabitte endeks yok
    [{ price_escalation: "bilinmeyen" }],
    [{ para_birimi: "USD" }],
    [{ offer_no: "TKL-1" }],
    [{ offer_date: "1999-12-31" }],
    [{ offer_date: "3000-01-01" }],
    [{ overhead_pct: "12.345" }], // 2 hane
  ])("geçersiz gövde 422 %j", async (over) => {
    const reply = await api("POST", "/offers", { employer_id: EMP_1, title: "T", ...over });
    expect(reply.status, JSON.stringify(reply.json)).toBe(422);
  });

  it("künye taslakta değişir; işveren adı ANLIK GÖRÜNTÜ güncellenir, numara değişmez", async () => {
    const offer = await createOffer({ scope_summary: "eski" });
    const reply = await api("PATCH", `/offers/${offer.id}`, { title: "Yeni iş", scope_summary: null, employer_id: EMP_2 });
    expect(reply.status).toBe(200);
    expect(reply.json).toMatchObject({ title: "Yeni iş", scope_summary: null, employer_id: EMP_2, employer_name: "Çelik Holding A.Ş.", offer_no: offer.offer_no });
  });

  it("künye: gönderilmişte 409, olmayan işveren/teklif 404, null başlık 422, bilinmeyen alan 422", async () => {
    const offer = await createOffer();
    expect((await api("PATCH", `/offers/${offer.id}`, { employer_id: MISSING })).status).toBe(404);
    expect((await api("PATCH", `/offers/${MISSING}`, { title: "x" })).status).toBe(404);
    const nullTitle = await api("PATCH", `/offers/${offer.id}`, { title: null });
    expect(nullTitle.status).toBe(422);
    expect(JSON.stringify(nullTitle.json)).toContain("Alan boşaltılamaz");
    expect((await api("PATCH", `/offers/${offer.id}`, { offer_no: "x" })).status).toBe(422);
    await toStatus(offer.id, "sent");
    const locked = await api("PATCH", `/offers/${offer.id}`, { title: "Yeni" });
    expect(locked.status).toBe(409);
    expect(locked.json.detail).toBe(OFFER_MESSAGES.notDraft);
  });

  it("koşullar taslakta değişir; fiyat farkı TÜİK ⇒ endeks türü zorunlu, sabite geçince endeks KENDİLİĞİNDEN düşer", async () => {
    const offer = await createOffer();
    const url = rev(offer.id);
    expect((await api("PATCH", url, { price_escalation: "tuik" })).json.detail).toBe(OFFER_MESSAGES.indexRequired);
    const ok = await api("PATCH", url, { price_escalation: "tuik", price_index_type: "ufe" });
    expect(ok.status).toBe(200);
    expect(ok.json.price_index_type).toBe("ufe");
    expect((await api("PATCH", url, { price_index_type: null })).status).toBe(422);
    const fixed = await api("PATCH", url, { price_escalation: "fixed" });
    expect(fixed.json.price_index_type).toBeNull();
    expect((await api("PATCH", url, { price_index_type: "ufe" })).json.detail).toBe(OFFER_MESSAGES.indexNotAllowed);
  });

  it.each([
    [{ offer_date: null }],
    [{ validity_days: null }],
    [{ overhead_pct: null }],
    [{ profit_pct: null }],
    [{ vat_pct: null }],
    [{ price_escalation: null }],
    [{ validity_days: 0 }],
    [{ overhead_pct: "101" }],
    [{ offer_unit_price: "1" }],
  ])("koşul PATCH geçersiz gövde 422 %j", async (govde) => {
    const offer = await createOffer();
    expect((await api("PATCH", rev(offer.id), govde)).status).toBe(422);
  });

  it("koşullar değişince toplamlar YENİDEN hesaplanır (GG/kâr/KDV)", async () => {
    const offer = await createOffer();
    const group = await createGroup(offer.id);
    await createItem(offer.id, group.id, CAT_A, { cost_unit_price: "100.00" });
    expect((await revisionOf(offer.id)).totals.customer).toEqual({ net: "128.80", vat: "25.76", gross: "154.56" });
    const changed = await api("PATCH", rev(offer.id), { overhead_pct: "0", profit_pct: "0", vat_pct: "10" });
    expect(changed.json.totals.customer).toEqual({ net: "100.00", vat: "10.00", gross: "110.00" });
  });

  it("gönderilmiş revizyonda koşul PATCH 409; teklif yalnız taslakta değişir", async () => {
    const offer = await createOffer();
    await toStatus(offer.id, "sent");
    expect((await api("PATCH", rev(offer.id), { notes: "x" })).status).toBe(409);
  });
});

// ─────────────────────────────────────────────────────────────────────────── durum makinesi

const STATUSES = ["draft", "sent", "won", "lost", "withdrawn"] as const;
const ACTIONS = ["send", "win", "lose", "withdraw"] as const;
const ALLOWED: Record<string, Record<string, string>> = {
  draft: { send: "sent", withdraw: "withdrawn" },
  sent: { win: "won", lose: "lost", withdraw: "withdrawn" },
  won: {},
  lost: {},
  withdrawn: {},
};
const STATUS_TEXT: Record<string, string> = {
  draft: "taslak",
  sent: "gönderilmiş",
  won: "kazanılmış",
  lost: "kaybedilmiş",
  withdrawn: "vazgeçilmiş",
};

describe("🔴 durum makinesi (T16/T31, SO-1/SO-2) — TÜM durum × eylem çiftleri", () => {
  const pairs = STATUSES.flatMap((status) => ACTIONS.map((action) => [status, action] as const));

  it.each(pairs)("%s → %s", async (status, action) => {
    const offer = await createOffer();
    await toStatus(offer.id, status);
    if (status === "draft" && action === "send") {
      // Gönderimin kendisi sınanıyor: kalemsiz send 422'dir (SO-9) — önce bir (fiyatsız) kalem eklenir.
      await createItem(offer.id, (await createGroup(offer.id)).id, CAT_B);
    }
    const reply = await api("POST", `${rev(offer.id)}/${action}`);
    const target = ALLOWED[status]?.[action];
    const after = (await api("GET", `/offers/${offer.id}`)).json.revisions[0].status;
    if (target === undefined) {
      expect(reply.status, reply.json.detail).toBe(409);
      expect(reply.json.detail).toBe(`Revizyon ${STATUS_TEXT[status]} durumda; bu işlem yapılamaz`);
      expect(after).toBe(status); // reddedilen geçiş HİÇBİR şey değiştirmedi
    } else {
      expect(reply.status, JSON.stringify(reply.json)).toBe(200);
      expect(reply.json.status).toBe(target);
      expect(after).toBe(target);
    }
  });

  it("taslaktan doğrudan kazanma YOK (409, metinle)", async () => {
    const offer = await createOffer();
    const reply = await api("POST", `${rev(offer.id)}/win`);
    expect(reply.status).toBe(409);
    expect(reply.json.detail).toBe("Revizyon taslak durumda; bu işlem yapılamaz");
  });

  it("geçiş damgaları ve kullanıcı: vazgeçme taslaktan sent_at YAZMAZ, gönderilmişten sent_at KORUNUR", async () => {
    const draft = await createOffer();
    await api("POST", `${rev(draft.id)}/withdraw`);
    const fromDraft = await revisionOf(draft.id);
    expect(fromDraft.withdrawn_at).not.toBeNull();
    expect(fromDraft.sent_at).toBeNull();

    const sent = await createOffer({ title: "Gönderilmiş" });
    await toStatus(sent.id, "sent");
    await api("POST", `${rev(sent.id)}/withdraw`);
    const fromSent = await revisionOf(sent.id);
    expect(fromSent.sent_at).not.toBeNull();
    expect(fromSent.withdrawn_at).not.toBeNull();
    expect((await api("GET", `/offers/${sent.id}`)).json.history.map((e: any) => e.kind)).toEqual(["opened", "sent", "withdrawn"]);
  });

  it("SO-1: vazgeçilmiş (withdrawn) SON durumdur — yeni revizyon 409", async () => {
    const offer = await createOffer();
    await toStatus(offer.id, "withdrawn");
    const reply = await api("POST", `/offers/${offer.id}/revisions`);
    expect(reply.status).toBe(409);
    expect(reply.json.detail).toBe(OFFER_MESSAGES.newRevisionNotAllowed);
  });

  it("geçişler YALNIZ son revizyonda: eski revizyon 409, olmayan revizyon 404, olmayan teklif 404", async () => {
    const offer = await createOffer();
    await toStatus(offer.id, "sent");
    expect((await api("POST", `/offers/${offer.id}/revisions`)).status).toBe(201);
    for (const action of ["win", "lose", "withdraw"]) {
      const reply = await api("POST", `${rev(offer.id, 0)}/${action}`);
      expect(reply.status, action).toBe(409);
      expect(reply.json.detail).toBe(OFFER_MESSAGES.notLatest);
    }
    expect((await revisionOf(offer.id, 0)).status).toBe("sent");
    expect((await api("POST", `${rev(offer.id, 7)}/send`)).status).toBe(404);
    expect((await api("POST", `${rev(MISSING, 0)}/send`)).status).toBe(404);
  });

  it("SO-9/SO-17: kalemsiz send 422 'Teklifte kalem yok'; BOŞ grup kalem sayılmaz; fiyatsız tek kalemle 200", async () => {
    const offer = await createOffer();
    const bare = await api("POST", `${rev(offer.id)}/send`);
    expect(bare.status).toBe(422);
    expect(bare.json.detail).toBe(OFFER_MESSAGES.noItemsToSend);
    const group = await createGroup(offer.id);
    expect((await api("POST", `${rev(offer.id)}/send`)).status).toBe(422);
    expect((await revisionOf(offer.id)).status).toBe("draft"); // durum değişmedi
    await createItem(offer.id, group.id, CAT_B); // referanssız → fiyatsız
    expect((await api("POST", `${rev(offer.id)}/send`)).status).toBe(200);
  });

  it("lose gövdesi isteğe bağlı: neden + kazanan tutar; gövdesiz/boş gövde alanları BOŞ", async () => {
    const withBody = await createOffer();
    await toStatus(withBody.id, "sent");
    const lost = await api("POST", `${rev(withBody.id)}/lose`, { lost_reason: "  Fiyat yüksek  ", winning_amount: "1250000.5" });
    expect(lost.status).toBe(200);
    expect(lost.json.revisions[0]).toMatchObject({ lost_reason: "Fiyat yüksek", winning_amount: "1250000.50", status: "lost" });

    const bare = await createOffer({ title: "Gövdesiz" });
    await toStatus(bare.id, "sent");
    await api("POST", `${rev(bare.id)}/lose`);
    expect((await api("GET", `/offers/${bare.id}`)).json.revisions[0]).toMatchObject({ lost_reason: null, winning_amount: null });

    const blank = await createOffer({ title: "Boş neden" });
    await toStatus(blank.id, "sent");
    await api("POST", `${rev(blank.id)}/lose`, { lost_reason: "   " });
    expect((await api("GET", `/offers/${blank.id}`)).json.revisions[0].lost_reason).toBeNull();
  });

  it.each([[{ winning_amount: "-1" }], [{ winning_amount: "1.234" }], [{ lost_reason: "x".repeat(2001) }], [{ x: 1 }]])(
    "lose geçersiz gövde 422 ve durum DEĞİŞMEZ %j",
    async (govde) => {
      const offer = await createOffer();
      await toStatus(offer.id, "sent");
      expect((await api("POST", `${rev(offer.id)}/lose`, govde)).status).toBe(422);
      expect((await revisionOf(offer.id)).status).toBe("sent");
    },
  );

  it("geçmiş olayları sıralı: açılış + damgalar, kişi adı çözülür; durum = SON revizyonun durumu", async () => {
    const offer = await createOffer();
    await toStatus(offer.id, "lost");
    await api("POST", `/offers/${offer.id}/revisions`);
    await api("POST", `${rev(offer.id, 1)}/send`);
    await api("POST", `${rev(offer.id, 1)}/win`);
    const detail = (await api("GET", `/offers/${offer.id}`)).json;
    expect(detail.history.map((e: any) => [e.rev_no, e.kind])).toEqual([[0, "opened"], [0, "sent"], [0, "lost"], [1, "opened"], [1, "sent"], [1, "won"]]);
    expect(detail.history.every((e: any) => e.user_name === "Ahmet Yılmaz" && e.user_id === ACTOR.id)).toBe(true);
    expect(detail).toMatchObject({ status: "won", latest_rev_no: 1, prepared_by_name: "Ahmet Yılmaz" });
    expect(detail.revisions.map((r: any) => [r.rev_no, r.status])).toEqual([[0, "lost"], [1, "won"]]);
  });
});

// ──────────────────────────────────────────────────────────────────────────── yeni revizyon

describe("🔴 yeni revizyon (SO-10): önceki revizyonun KOPYASI", () => {
  it("sent'ten 201 + tam kopya (koşullar, oranlar, gruplar, kalemler, elle B.F.); tarih BUGÜN; neden/kazanan tutar kopyalanmaz", async () => {
    const offer = await createOffer({ overhead_pct: "10", payment_terms: "Peşin", delivery_days: 90, notes: "Not" });
    const group = await createGroup(offer.id, "Kaba");
    await createItem(offer.id, group.id, CAT_A, { quantity: "10", cost_unit_price: "100.00", offer_unit_price: "140.00", profit_pct: "5" });
    await toStatus(offer.id, "sent");
    now = new Date("2026-10-20T09:00:00.000Z");

    const created = await api("POST", `/offers/${offer.id}/revisions`);
    expect(created.status).toBe(201);
    const copy = created.json;
    expect(copy).toMatchObject({ rev_no: 1, status: "draft", is_latest: true, is_editable: true, overhead_pct: "10.00", payment_terms: "Peşin", delivery_days: 90, notes: "Not", offer_date: "2026-10-20", lost_reason: null, winning_amount: null, sent_at: null });
    expect(copy.groups.map((g: any) => g.name)).toEqual(["Kaba"]);
    const [item] = allItems(copy);
    expect(item).toMatchObject({ quantity: "10.000", cost_unit_price: "100.00", offer_unit_price: "140.00", profit_pct: "5.00", poz_no: "KAB-0001" });
    expect(item.id).not.toBe(allItems(await revisionOf(offer.id, 0))[0]?.id); // yeni kimlikler
    expect(copy.totals.customer).toEqual((await revisionOf(offer.id, 0)).totals.customer);
    expect((await revisionOf(offer.id, 0)).is_latest).toBe(false);
  });

  it("lost'tan açılır ve neden/kazanan tutar YENİ revizyona KOPYALANMAZ", async () => {
    const offer = await createOffer();
    await toStatus(offer.id, "sent");
    await api("POST", `${rev(offer.id)}/lose`, { lost_reason: "Fiyat", winning_amount: "100.00" });
    const created = await api("POST", `/offers/${offer.id}/revisions`);
    expect(created.status).toBe(201);
    expect(created.json).toMatchObject({ lost_reason: null, winning_amount: null, lost_at: null });
    expect((await revisionOf(offer.id, 0)).lost_reason).toBe("Fiyat"); // eskisi dokunulmadı
  });

  it.each(["draft", "won", "withdrawn"] as const)("%s revizyondan 409", async (status) => {
    const offer = await createOffer();
    await toStatus(offer.id, status);
    const reply = await api("POST", `/offers/${offer.id}/revisions`);
    expect(reply.status).toBe(409);
    expect(reply.json.detail).toBe(OFFER_MESSAGES.newRevisionNotAllowed);
  });

  it("ikinci taslak açılamaz; rev_no ardışık; kopya BAĞIMSIZ (yeni revizyon değişince eskisi değişmez)", async () => {
    const offer = await createOffer();
    const group = await createGroup(offer.id);
    await createItem(offer.id, group.id, CAT_A, { cost_unit_price: "100.00" });
    await toStatus(offer.id, "sent");
    expect((await api("POST", `/offers/${offer.id}/revisions`)).json.rev_no).toBe(1);
    expect((await api("POST", `/offers/${offer.id}/revisions`)).status).toBe(409); // Rev.1 taslak
    const [copyItem] = allItems(await revisionOf(offer.id, 1));
    expect((await api("PATCH", `${rev(offer.id, 1)}/items/${copyItem?.id}`, { cost_unit_price: "200.00" })).status).toBe(200);
    expect(allItems(await revisionOf(offer.id, 0))[0]?.cost_unit_price).toBe("100.00");
  });
});

// ──────────────────────────────────────────────────────────────────── içerik yazımı taslak kapısı

describe("🔴 içerik yazımı: yalnız SON revizyon + taslak (aksi 409)", () => {
  async function writes(offerId: string, groupId: string, itemId: string, revNo = 0): Promise<Record<string, number>> {
    const url = rev(offerId, revNo);
    const body = { catalog_item_id: CAT_A, group_id: groupId, quantity: "1" };
    const replies = {
      kosul: await api("PATCH", url, { notes: "x" }),
      grupEkle: await api("POST", `${url}/groups`, { name: "Y" }),
      grupPatch: await api("PATCH", `${url}/groups/${groupId}`, { name: "Y" }),
      grupSil: await api("DELETE", `${url}/groups/${groupId}`),
      kalemEkle: await api("POST", `${url}/items`, body),
      kalemToplu: await api("POST", `${url}/items/bulk`, { items: [body] }),
      kalemPatch: await api("PATCH", `${url}/items/${itemId}`, { quantity: "2" }),
      kalemSil: await api("DELETE", `${url}/items/${itemId}`),
    };
    return Object.fromEntries(Object.entries(replies).map(([name, reply]) => [name, reply.status]));
  }

  it.each(["sent", "won", "lost", "withdrawn"] as const)("%s revizyonda sekiz yazımın HEPSİ 409 ve hiçbir şey değişmez", async (status) => {
    const offer = await createOffer();
    const group = await createGroup(offer.id);
    const item = await createItem(offer.id, group.id);
    await toStatus(offer.id, status);
    const result = await writes(offer.id, group.id, item.id);
    expect(Object.values(result)).toEqual(Array(8).fill(409));
    const detail = await api("PATCH", rev(offer.id), { notes: "x" });
    expect(detail.json.detail).toBe(OFFER_MESSAGES.notDraft);
    const revision = await revisionOf(offer.id);
    expect(allItems(revision)).toHaveLength(1);
    expect(revision.groups[0].name).toBe("Kaba");
  });

  it("son OLMAYAN revizyona yazım 409 (metin: yalnız en son revizyon); yeni taslak revizyona yazılır", async () => {
    const offer = await createOffer();
    const group = await createGroup(offer.id);
    const item = await createItem(offer.id, group.id);
    await toStatus(offer.id, "sent");
    await api("POST", `/offers/${offer.id}/revisions`);
    const old = await writes(offer.id, group.id, item.id, 0);
    expect(Object.values(old)).toEqual(Array(8).fill(409));
    expect((await api("PATCH", rev(offer.id, 0), { notes: "x" })).json.detail).toBe(OFFER_MESSAGES.notLatest);
    const [copyItem] = allItems(await revisionOf(offer.id, 1));
    expect((await api("PATCH", `${rev(offer.id, 1)}/items/${copyItem?.id}`, { quantity: "5" })).status).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────── grup + kalem

describe("kalem: katalogdan kopya, SO-6/T38 `cost_unit_price` üç hâli, SO-4", () => {
  async function fresh(): Promise<{ offerId: string; groupId: string }> {
    const offer = await createOffer();
    return { offerId: offer.id, groupId: (await createGroup(offer.id)).id };
  }

  it("poz no / ad / birim / adam-saat katalogdan KOPYALANIR; sıra grupta ardışık; DB ölçeğinde sayılar", async () => {
    const { offerId, groupId } = await fresh();
    const first = await createItem(offerId, groupId, CAT_A, { quantity: "12.5" });
    const second = await createItem(offerId, groupId, CAT_C);
    expect(first).toMatchObject({ poz_no: "KAB-0001", description: "Kalıp", unit: "m²", unit_mhr: "0.8500", quantity: "12.500", sort_order: 0 });
    expect(second.sort_order).toBe(1);
    expect(first.internal.man_hours).toBe("10.6250000"); // 12,500 x 0,8500 (7 ondalık, calc.py ölçeği)
  });

  it("alan YOK → SON FİYAT referanstan ÖNCE gelir; yoksa REFERANS; ikisi de yoksa BOŞ (fiyatsız)", async () => {
    const { offerId, groupId } = await fresh();
    external.set(CAT_A, { price: "77.5" });
    expect((await createItem(offerId, groupId, CAT_A)).cost_unit_price).toBe("77.50"); // son 77,5 > ref 100
    expect((await createItem(offerId, groupId, CAT_C)).cost_unit_price).toBe("10.00"); // son yok → ref
    const none = await createItem(offerId, groupId, CAT_B); // ikisi de yok
    expect(none.cost_unit_price).toBeNull();
    expect(none).toMatchObject({ priced: false, customer: null });
  });

  it("AÇIK null → son fiyat ve referansa RAĞMEN BOŞ kalır; değer önerinin ÜSTÜNE yazar; '0' bir değerdir", async () => {
    const { offerId, groupId } = await fresh();
    external.set(CAT_A, { price: "77.50" });
    const empty = await createItem(offerId, groupId, CAT_A, { cost_unit_price: null });
    expect(empty).toMatchObject({ cost_unit_price: null, priced: false });
    expect((await createItem(offerId, groupId, CAT_A, { cost_unit_price: "50.00" })).cost_unit_price).toBe("50.00");
    const zero = await createItem(offerId, groupId, CAT_A, { cost_unit_price: "0" });
    expect(zero).toMatchObject({ cost_unit_price: "0.00", priced: true });
  });

  it("toplu: kalem başına doğru dal (öneri / açık null / değer)", async () => {
    const { offerId, groupId } = await fresh();
    external.set(CAT_A, { price: "77.50" });
    const reply = await api("POST", `${rev(offerId)}/items/bulk`, {
      items: [
        { catalog_item_id: CAT_A, group_id: groupId, quantity: "1" },
        { catalog_item_id: CAT_A, group_id: groupId, quantity: "1", cost_unit_price: null },
        { catalog_item_id: CAT_C, group_id: groupId, quantity: "1", cost_unit_price: "9.99" },
      ],
    });
    expect(reply.status, JSON.stringify(reply.json)).toBe(201);
    expect(reply.json.items.map((i: any) => i.cost_unit_price)).toEqual(["77.50", null, "9.99"]);
    expect(reply.json.items.map((i: any) => i.sort_order)).toEqual([0, 1, 2]);
  });

  it("katalog yok 404 ('Katalog iş tipi bulunamadı'); catalog_item_id zorunlu 422; miktar 0 / negatif / 4 ondalık 422", async () => {
    const { offerId, groupId } = await fresh();
    const url = `${rev(offerId)}/items`;
    const missing = await api("POST", url, { catalog_item_id: MISSING, group_id: groupId, quantity: "1" });
    expect([missing.status, missing.json.detail]).toEqual([404, OFFER_MESSAGES.catalogMissing]);
    expect((await api("POST", url, { group_id: groupId, quantity: "1" })).status).toBe(422);
    for (const quantity of ["0", "-1", "1.0001", "1000000000.001"]) {
      expect((await api("POST", url, { catalog_item_id: CAT_A, group_id: groupId, quantity })).status, quantity).toBe(422);
    }
  });

  it("grup: bilinmeyen 404, başka teklifin grubu 422 ('Grup bu revizyona ait değil')", async () => {
    const { offerId } = await fresh();
    const other = await createOffer({ title: "Başka" });
    const foreign = await createGroup(other.id, "B");
    const url = `${rev(offerId)}/items`;
    const unknown = await api("POST", url, { catalog_item_id: CAT_A, group_id: MISSING, quantity: "1" });
    expect([unknown.status, unknown.json.detail]).toEqual([404, OFFER_MESSAGES.groupMissing]);
    const alien = await api("POST", url, { catalog_item_id: CAT_A, group_id: foreign.id, quantity: "1" });
    expect([alien.status, alien.json.detail]).toEqual([422, OFFER_MESSAGES.groupForeign]);
  });

  it("SO-4: maliyet boşken elle B.F. 422 (PATCH + ekleme); açık null maliyet + elle B.F. 422; ref varsa öneri maliyeti doldurur", async () => {
    const { offerId, groupId } = await fresh();
    const noCost = await createItem(offerId, groupId, CAT_B);
    const patch = await api("PATCH", `${rev(offerId)}/items/${noCost.id}`, { offer_unit_price: "10.00" });
    expect(patch.status).toBe(422);
    expect(patch.json.detail).toBe("Maliyet birim fiyatı boşken elle teklif birim fiyatı girilemez");
    expect(allItems(await revisionOf(offerId))[0]?.offer_unit_price).toBeNull(); // reddedilen yazma hiçbir şey değiştirmedi

    const body = { catalog_item_id: CAT_A, group_id: groupId, quantity: "1", cost_unit_price: null, offer_unit_price: "10.00" };
    expect((await api("POST", `${rev(offerId)}/items`, body)).status).toBe(422);
    const suggest = { catalog_item_id: CAT_A, group_id: groupId, quantity: "1", offer_unit_price: "10.00" };
    const ok = await api("POST", `${rev(offerId)}/items`, suggest); // ref 100 → maliyet dolar
    expect(ok.status).toBe(201);
    expect(ok.json.customer.unit_price).toBe("10.00");
  });

  it("SO-4 birleşik durum: yalnız cost_unit_price:null ama elle B.F. kayıtta duruyor → 422; ikisi birlikte null → 200 fiyatsız", async () => {
    const { offerId, groupId } = await fresh();
    const item = await createItem(offerId, groupId, CAT_A, { cost_unit_price: "100.00", offer_unit_price: "150.00" });
    const url = `${rev(offerId)}/items/${item.id}`;
    expect((await api("PATCH", url, { cost_unit_price: null })).status).toBe(422);
    const kept = allItems(await revisionOf(offerId))[0];
    expect([kept?.cost_unit_price, kept?.offer_unit_price]).toEqual(["100.00", "150.00"]);
    const both = await api("PATCH", url, { cost_unit_price: null, offer_unit_price: null });
    expect(both.status).toBe(200);
    expect(both.json.priced).toBe(false);
  });

  it("PATCH: oran null → revizyon geneli; elle B.F. null → kilit kalkar; kalem değeri revizyonu EZER", async () => {
    const { offerId, groupId } = await fresh();
    const item = await createItem(offerId, groupId, CAT_A, { cost_unit_price: "100.00", overhead_pct: "0", profit_pct: "0" });
    expect(item.customer.unit_price).toBe("100.00");
    const url = `${rev(offerId)}/items/${item.id}`;
    const general = await api("PATCH", url, { overhead_pct: null, profit_pct: null });
    expect(general.json.customer.unit_price).toBe("128.80");
    expect(general.json.overhead_pct).toBeNull();
    expect((await api("PATCH", url, { offer_unit_price: "200.00" })).json.customer.unit_price).toBe("200.00");
    expect((await api("PATCH", url, { offer_unit_price: null })).json.customer.unit_price).toBe("128.80");
  });

  it("PATCH: katalog alanları DEĞİŞTİRİLEMEZ (açık 422, alan adıyla); NOT NULL alanlara null 422; geçersiz değerler 422", async () => {
    const { offerId, groupId } = await fresh();
    const item = await createItem(offerId, groupId, CAT_A, { cost_unit_price: "100.00" });
    const url = `${rev(offerId)}/items/${item.id}`;
    for (const field of ["catalog_item_id", "poz_no", "description", "unit"]) {
      const reply = await api("PATCH", url, { [field]: "X" });
      expect(reply.status, field).toBe(422);
      expect(JSON.stringify(reply.json)).toContain(`${field}: katalogdan gelen alan değiştirilemez`);
    }
    for (const govde of [{ quantity: null }, { unit_mhr: null }, { group_id: null }, { sort_order: null }, { quantity: "0" }, { unit_mhr: "0" }, { sort_order: -1 }, { overhead_pct: "100.01" }, { profit_pct: "1000" }, { cost_unit_price: "-0.01" }]) {
      expect((await api("PATCH", url, govde)).status, JSON.stringify(govde)).toBe(422);
    }
  });

  it("PATCH: grup taşıma; başka teklifin grubu 422; olmayan/başka tekliflerin kalemi 404", async () => {
    const { offerId, groupId } = await fresh();
    const second = await createGroup(offerId, "İnce");
    const item = await createItem(offerId, groupId, CAT_A, { cost_unit_price: "10.00" });
    const url = `${rev(offerId)}/items/${item.id}`;
    const moved = await api("PATCH", url, { group_id: second.id });
    expect(moved.json.group_id).toBe(second.id);
    const other = await createOffer({ title: "Baska" });
    const otherGroup = await createGroup(other.id, "B");
    expect((await api("PATCH", url, { group_id: otherGroup.id })).status).toBe(422);
    const otherItem = await createItem(other.id, otherGroup.id, CAT_A, { cost_unit_price: "1.00" });
    expect((await api("PATCH", `${rev(offerId)}/items/${otherItem.id}`, { quantity: "2" })).status).toBe(404);
    expect((await api("PATCH", `${rev(offerId)}/items/${MISSING}`, { quantity: "2" })).status).toBe(404);
  });

  it("grup silme kalemlerle birlikte; kalem silme; olmayan grup/kalem 404; grup PATCH boş ad/null 422", async () => {
    const { offerId, groupId } = await fresh();
    const item = await createItem(offerId, groupId, CAT_A);
    const url = rev(offerId);
    expect((await api("PATCH", `${url}/groups/${groupId}`, { name: "" })).status).toBe(422);
    expect((await api("PATCH", `${url}/groups/${groupId}`, { name: null })).status).toBe(422);
    expect((await api("PATCH", `${url}/groups/${groupId}`, { sort_order: null })).status).toBe(422);
    expect((await api("PATCH", `${url}/groups/${groupId}`, { name: "Yeni ad", sort_order: 5 })).json).toMatchObject({ name: "Yeni ad", sort_order: 5 });
    expect((await api("DELETE", `${url}/items/${item.id}`)).status).toBe(204);
    expect((await api("DELETE", `${url}/items/${item.id}`)).status).toBe(404);
    const second = await createItem(offerId, groupId, CAT_A);
    expect((await api("DELETE", `${url}/groups/${groupId}`)).status).toBe(204);
    expect((await api("DELETE", `${url}/groups/${groupId}`)).status).toBe(404);
    expect((await api("DELETE", `${url}/items/${second.id}`)).status).toBe(404); // kaskad
    expect((await revisionOf(offerId)).groups).toEqual([]);
  });
});

describe("🔴 F4.2 miktarsız kalem (SO-21/SO-24): mock = backend B6", () => {
  async function fresh(): Promise<{ offerId: string; groupId: string }> {
    const offer = await createOffer();
    return { offerId: offer.id, groupId: (await createGroup(offer.id)).id };
  }

  it("quantity YOK ya da null → 201, miktar null; tutar/maliyet/adam-saat null; B.F. fiyatlıda VAR", async () => {
    const { offerId, groupId } = await fresh();
    const absent = await api("POST", `${rev(offerId)}/items`, { catalog_item_id: CAT_A, group_id: groupId, cost_unit_price: "100" });
    expect(absent.status, JSON.stringify(absent.json)).toBe(201);
    expect(absent.json).toMatchObject({ quantity: null, priced: true });
    expect(absent.json.customer.amount).toBeNull();
    expect(absent.json.customer.unit_price).not.toBeNull();
    expect(absent.json.internal).toMatchObject({ man_hours: null, cost: null, overhead: null, profit: null });
    const explicit = await createItem(offerId, groupId, CAT_C, { quantity: null });
    expect(explicit.quantity).toBeNull();
  });

  it("🔴 kalem okumasında `quantified` = miktar dolu mu (kimlik kovası); sayaçla tutarlı", async () => {
    const { offerId, groupId } = await fresh();
    const filled = await createItem(offerId, groupId, CAT_A, { quantity: "2", cost_unit_price: "100" });
    const empty = await createItem(offerId, groupId, CAT_C, { quantity: null, cost_unit_price: "100" });
    expect(filled.quantified).toBe(true);
    expect(empty.quantified).toBe(false);
    const revision = await revisionOf(offerId);
    const flags = allItems(revision).map((item) => item.quantified);
    expect(flags.filter((flag) => flag === false)).toHaveLength(revision.totals.unquantified_count);
    const patched = await api("PATCH", `${rev(offerId)}/items/${empty.id}`, { quantity: "3" });
    expect(patched.json.quantified).toBe(true);
  });

  it("toplamlara GİRMEZ; unquantified_count revizyon + özet + liste satırında; unpriced_count bağımsız", async () => {
    const { offerId, groupId } = await fresh();
    await createItem(offerId, groupId, CAT_A, { quantity: "2", cost_unit_price: "100" });
    await createItem(offerId, groupId, CAT_C, { quantity: null, cost_unit_price: "100" });
    await createItem(offerId, groupId, CAT_B, { quantity: null, cost_unit_price: null }); // hem fiyatsız hem miktarsız
    const revision = await revisionOf(offerId);
    expect(revision.totals.customer.net).toBe("257.60"); // yalnız dolu kalem: 2 x 128,80
    expect(revision.totals.unquantified_count).toBe(2);
    expect(revision.totals.unpriced_count).toBe(1);
    expect(revision.totals.internal.man_hours).toBe("1.7000000"); // yalnız miktarlı kalem (2 x 0,85)
    const detail = await api("GET", `/offers/${offerId}`);
    expect(detail.json.revisions[0].unquantified_count).toBe(2);
    const list = await api("GET", "/offers");
    expect(list.json.items.find((row: Record<string, any>) => row.id === offerId).unquantified_count).toBe(2);
  });

  it("PATCH quantity:null 422 (SO-24); dolu miktar yazılınca tutar belirir, sayaç düşer", async () => {
    const { offerId, groupId } = await fresh();
    const item = await createItem(offerId, groupId, CAT_A, { quantity: null, cost_unit_price: "100" });
    expect((await api("PATCH", `${rev(offerId)}/items/${item.id}`, { quantity: null })).status).toBe(422);
    const filled = await api("PATCH", `${rev(offerId)}/items/${item.id}`, { quantity: "3" });
    expect(filled.status, JSON.stringify(filled.json)).toBe(200);
    expect(filled.json.customer.amount).toBe("386.40");
    expect((await revisionOf(offerId)).totals.unquantified_count).toBe(0);
  });

  it("🔴 send: miktarsız kalem varken 422 'Miktarı girilmemiş kalem var'; durum DEĞİŞMEZ; miktar girilince 200", async () => {
    const { offerId, groupId } = await fresh();
    const item = await createItem(offerId, groupId, CAT_A, { quantity: null, cost_unit_price: "100" });
    const blocked = await api("POST", `${rev(offerId)}/send`);
    expect(blocked.status).toBe(422);
    expect(blocked.json.detail).toBe("Miktarı girilmemiş kalem var");
    expect((await revisionOf(offerId)).status).toBe("draft");
    await api("PATCH", `${rev(offerId)}/items/${item.id}`, { quantity: "1" });
    expect((await api("POST", `${rev(offerId)}/send`)).status).toBe(200);
  });

  it("kalemsiz send hâlâ 'Teklifte kalem yok' (miktarsız denetimi ondan SONRA)", async () => {
    const offer = await createOffer();
    expect((await api("POST", `${rev(offer.id)}/send`)).json.detail).toBe(OFFER_MESSAGES.noItemsToSend);
  });
});

describe("🔴 toplu ekleme HEP-YA-HİÇ (1–200)", () => {
  async function fresh(): Promise<{ offerId: string; groupId: string }> {
    const offer = await createOffer();
    return { offerId: offer.id, groupId: (await createGroup(offer.id)).id };
  }
  const entry = (groupId: string, over: Record<string, unknown> = {}) => ({ catalog_item_id: CAT_A, group_id: groupId, quantity: "1", ...over });

  it("201 kalem → 422 (too_long) ve HİÇBİRİ yazılmaz; sınırlar 1 ve 200 kabul", async () => {
    const { offerId, groupId } = await fresh();
    const url = `${rev(offerId)}/items/bulk`;
    const tooMany = await api("POST", url, { items: Array.from({ length: 201 }, () => entry(groupId)) });
    expect(tooMany.status).toBe(422);
    expect(tooMany.json.detail[0]).toMatchObject({ type: "too_long", loc: ["body", "items"] });
    expect(allItems(await revisionOf(offerId))).toHaveLength(0);
    expect((await api("POST", url, { items: [] })).json.detail[0].type).toBe("too_short");
    expect((await api("POST", url, { items: [entry(groupId)] })).status).toBe(201);
    const max = await api("POST", url, { items: Array.from({ length: 200 }, () => entry(groupId)) });
    expect(max.status).toBe(201);
    expect(allItems(await revisionOf(offerId))).toHaveLength(201);
  });

  it("katalog yok → 404 ve hiçbiri yazılmaz", async () => {
    const { offerId, groupId } = await fresh();
    const reply = await api("POST", `${rev(offerId)}/items/bulk`, { items: [entry(groupId), entry(groupId, { catalog_item_id: MISSING }), entry(groupId)] });
    expect(reply.status).toBe(404);
    expect(allItems(await revisionOf(offerId))).toHaveLength(0);
  });

  it("bilinmeyen grup 404 — kalem sırası mesajda; SO-4 ihlali 422 'Kalem N: …' ve hiçbiri yazılmaz", async () => {
    const { offerId, groupId } = await fresh();
    const url = `${rev(offerId)}/items/bulk`;
    const unknown = await api("POST", url, { items: [entry(groupId), entry(MISSING)] });
    expect([unknown.status, unknown.json.detail]).toEqual([404, `Kalem 2: ${OFFER_MESSAGES.groupMissing}`]);
    const so4 = await api("POST", url, { items: [entry(groupId), entry(groupId, { cost_unit_price: null, offer_unit_price: "10.00" })] });
    expect(so4.status).toBe(422);
    expect(so4.json.detail).toBe("Kalem 2: Maliyet birim fiyatı boşken elle teklif birim fiyatı girilemez");
    expect(allItems(await revisionOf(offerId))).toHaveLength(0);
  });

  it("gövde-içi alan hatasında loc kalem sırasını taşır (['body','items',i,alan])", async () => {
    const { offerId, groupId } = await fresh();
    const reply = await api("POST", `${rev(offerId)}/items/bulk`, { items: [entry(groupId), entry(groupId, { quantity: "0" })] });
    expect(reply.status).toBe(422);
    expect(reply.json.detail[0].loc).toEqual(["body", "items", 1, "quantity"]);
    expect(allItems(await revisionOf(offerId))).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────── silme

describe("🔴 silme: yalnız TEK revizyonlu TASLAK (numara tekrar kullanılmaz)", () => {
  it("tek revizyonlu taslak → 204; grup ve kalemler birlikte gider; sonra 404", async () => {
    const offer = await createOffer();
    const group = await createGroup(offer.id);
    await createItem(offer.id, group.id);
    expect((await api("DELETE", `/offers/${offer.id}`)).status).toBe(204);
    expect((await api("GET", `/offers/${offer.id}`)).status).toBe(404);
    expect(state.groups).toHaveLength(0);
    expect(state.items).toHaveLength(0);
    expect(state.revisions).toHaveLength(0);
  });

  it.each(["sent", "won", "lost", "withdrawn"] as const)("%s teklif silinemez (409)", async (status) => {
    const offer = await createOffer();
    await toStatus(offer.id, status);
    const reply = await api("DELETE", `/offers/${offer.id}`);
    expect([reply.status, reply.json.detail]).toEqual([409, OFFER_MESSAGES.deleteNotAllowed]);
  });

  it("birden çok revizyonlu teklif, son revizyon taslak olsa bile silinemez", async () => {
    const offer = await createOffer();
    await toStatus(offer.id, "sent");
    await api("POST", `/offers/${offer.id}/revisions`);
    expect((await api("DELETE", `/offers/${offer.id}`)).status).toBe(409);
  });
});

// ───────────────────────────────────────────────────────────────────────── liste + özet

describe("liste + özet kartları (SO-12)", () => {
  it("satır alanları ve tutarlar: fiyatsız sayısı, KDV hariç/dahil", async () => {
    const offer = await createOffer();
    const group = await createGroup(offer.id);
    await createItem(offer.id, group.id, CAT_A, { cost_unit_price: "100.00" });
    await createItem(offer.id, group.id, CAT_B);
    const [row] = (await api("GET", "/offers")).json.items;
    expect(row).toMatchObject({ offer_no: `TKL-${YEAR}-0001`, rev_no: 0, status: "draft", net: "128.80", gross: "154.56", unpriced_count: 1, employer_name: "Güneşkent Gayrimenkul A.Ş.", valid_until: "2026-11-01" });
  });

  it("boş liste: sıfırlar ve win_rate null", async () => {
    const reply = await api("GET", "/offers");
    expect(reply.json.items).toEqual([]);
    expect(reply.json.summary.win_rate).toBeNull();
    expect(reply.json.summary.expired_count).toBe(0);
    expect(reply.json.summary.by_status.map((s: any) => [s.status, s.count, s.net])).toEqual([["draft", 0, "0"], ["sent", 0, "0"], ["won", 0, "0"], ["lost", 0, "0"], ["withdrawn", 0, "0"]]);
  });

  it("liste SON revizyonun durumunu/tutarını gösterir", async () => {
    const offer = await createOffer();
    const group = await createGroup(offer.id);
    await createItem(offer.id, group.id, CAT_A, { cost_unit_price: "100.00" });
    await toStatus(offer.id, "lost");
    await api("POST", `/offers/${offer.id}/revisions`);
    const [row] = (await api("GET", "/offers")).json.items;
    expect([row.rev_no, row.status]).toEqual([1, "draft"]);
  });

  it("özet status süzgecinden BAĞIMSIZ; net toplamları ve kazanma oranı (kazanılan/(kazanılan+kaybedilen))", async () => {
    const make = async (title: string, status: "draft" | "sent" | "won" | "lost", cost: string) => {
      const offer = await createOffer({ title });
      const group = await createGroup(offer.id);
      await createItem(offer.id, group.id, CAT_A, { cost_unit_price: cost });
      await toStatus(offer.id, status);
    };
    await make("Taslak", "draft", "100.00");
    await make("Gönderildi", "sent", "200.00");
    await make("Kazanıldı", "won", "100.00");
    await make("Kaybedildi 1", "lost", "100.00");
    await make("Kaybedildi 2", "lost", "100.00");
    const all = (await api("GET", "/offers")).json;
    const filtered = (await api("GET", "/offers?status=sent")).json;
    expect(filtered.items).toHaveLength(1);
    expect(filtered.total).toBe(1);
    expect(filtered.summary).toEqual(all.summary); // özet süzgeçten bağımsız
    const by = Object.fromEntries(all.summary.by_status.map((s: any) => [s.status, [s.count, s.net]]));
    expect(by).toMatchObject({ draft: [1, "128.80"], sent: [1, "257.60"], won: [1, "128.80"], lost: [2, "257.60"], withdrawn: [0, "0"] });
    expect(all.summary.win_rate).toBe("33.33"); // 1 / (1 + 2)
  });

  it("süresi geçti: yalnız sent + valid_until < bugün (İstanbul günü); sınır günü GEÇMEMİŞ", async () => {
    const offer = await createOffer({ offer_date: "2026-09-02", validity_days: 30 }); // valid_until 2026-10-02
    await toStatus(offer.id, "sent");
    expect((await api("GET", "/offers")).json.summary.expired_count).toBe(0); // bugün 02.10 → geçmemiş
    now = new Date("2026-10-02T21:00:00.000Z"); // İstanbul 03.10 00:00
    expect((await api("GET", "/offers")).json.summary.expired_count).toBe(1);
    const draft = await createOffer({ offer_date: "2026-01-01", title: "Taslak eski" });
    void draft; // taslak süresi geçmiş sayılmaz
    expect((await api("GET", "/offers")).json.summary.expired_count).toBe(1);
  });

  it("süzgeçler: q (no / iş adı / işveren), işveren, tarih aralığı (dahil-dahil) ve özete de uygulanır", async () => {
    await createOffer({ title: "Kaba İnşaat", offer_date: "2026-03-01" });
    await createOffer({ title: "Tesisat 100%", employer_id: EMP_2, offer_date: "2026-04-15" });
    expect((await api("GET", "/offers?q=kaba")).json.total).toBe(1);
    expect((await api("GET", "/offers?q=%C3%87elik")).json.total).toBe(1); // işveren adı
    expect((await api("GET", `/offers?q=${YEAR}-0002`)).json.total).toBe(1); // numara
    expect((await api("GET", "/offers?q=_")).json.total).toBe(0); // LIKE joker DEĞİL, metin (`_` hepsini eşleştirmez)
    expect((await api("GET", "/offers?q=100%25")).json.total).toBe(1);
    expect((await api("GET", `/offers?employer_id=${EMP_2}`)).json.total).toBe(1);
    expect((await api("GET", "/offers?offer_date_from=2026-03-01&offer_date_to=2026-03-01")).json.total).toBe(1);
    const range = (await api("GET", "/offers?offer_date_from=2026-04-01")).json;
    expect(range.total).toBe(1);
    expect(range.summary.by_status.find((s: any) => s.status === "draft").count).toBe(1); // özet tarih süzgecine uyar
    const backwards = await api("GET", "/offers?offer_date_from=2026-05-01&offer_date_to=2026-04-01");
    expect([backwards.status, backwards.json.detail]).toEqual([422, OFFER_MESSAGES.dateRange]);
  });

  it("sayfalama: limit/offset/toplam; geçersiz status 422", async () => {
    for (let n = 0; n < 5; n += 1) await createOffer({ title: `T${n}` });
    const page = (await api("GET", "/offers?limit=2&offset=1")).json;
    expect([page.items.length, page.total, page.limit, page.offset]).toEqual([2, 5, 2, 1]);
    expect(page.items.map((row: any) => row.offer_no)).toEqual([`TKL-${YEAR}-0004`, `TKL-${YEAR}-0003`]);
    expect((await api("GET", "/offers?status=bilinmeyen")).status).toBe(422);
  });
});

// ─────────────────────────────────────────────────────────────────────── ayarlar + sözleşme

describe("ayarlar · gövde şema kapısı · yol", () => {
  it("GET varsayılanlar; PUT TAM değiştirir ve mevcut teklifleri DEĞİŞTİRMEZ, yeniler kopyalar", async () => {
    const before = await createOffer();
    const current = await api("GET", "/offers/settings");
    expect(current.json).toMatchObject({ default_overhead_pct: "12.00", default_profit_pct: "15.00", default_vat_pct: "20.00", default_validity_days: 30 });
    const put = await api("PUT", "/offers/settings", { default_overhead_pct: "10", default_profit_pct: "20.5", default_vat_pct: "10", default_validity_days: 60, default_payment_terms: "  Peşin  " });
    expect(put.status).toBe(200);
    expect(put.json).toMatchObject({ default_overhead_pct: "10.00", default_profit_pct: "20.50", default_vat_pct: "10.00", default_validity_days: 60, default_payment_terms: "Peşin" });
    expect((await revisionOf(before.id)).overhead_pct).toBe("12.00");
    const after = await createOffer({ title: "Yeni" });
    expect(await revisionOf(after.id)).toMatchObject({ overhead_pct: "10.00", validity_days: 60, payment_terms: "Peşin" });
  });

  it.each([
    [{ default_profit_pct: "1000" }],
    [{ default_overhead_pct: "100.01" }],
    [{ default_validity_days: 0 }],
    [{ default_payment_terms: "" }],
    [{ default_payment_terms: "   " }],
    [{ extra: 1 }],
  ])("PUT geçersiz 422 %j", async (over) => {
    const body = { default_overhead_pct: "12", default_profit_pct: "15", default_vat_pct: "20", default_validity_days: 30, default_payment_terms: "x", ...over };
    expect((await api("PUT", "/offers/settings", body)).status).toBe(422);
  });

  it("PUT eksik alan 422 'Field required' (tam değiştirme)", async () => {
    const reply = await api("PUT", "/offers/settings", { default_overhead_pct: "12" });
    expect(reply.json.detail[0]).toMatchObject({ type: "missing", msg: "Field required" });
  });

  it("/offers/settings LİTERAL yol {offer_id}den ÖNCE çözülür", async () => {
    expect((await api("GET", "/offers/settings")).status).toBe(200);
    const bad = await api("GET", "/offers/not-a-uuid");
    expect(bad.status).toBe(422);
    expect(bad.json.detail[0]).toMatchObject({ type: "uuid_parsing", loc: ["path", "offer_id"] });
  });

  it("rev_no yol parametresi: tamsayı değil 422, negatif 422, aşırı büyük 422", async () => {
    const offer = await createOffer();
    for (const bad of ["x", "-1", "100001"]) expect((await api("GET", `/offers/${offer.id}/revisions/${bad}`)).status, bad).toBe(422);
    expect((await api("GET", `/offers/${offer.id}/revisions/3`)).status).toBe(404);
  });

  it("ondalık gövde: sayı da metin de kabul (anyOf), hane/aralık ihlali FastAPI decimal_* türüyle", async () => {
    const offer = await createOffer();
    const group = await createGroup(offer.id);
    const url = `${rev(offer.id)}/items`;
    const base = { catalog_item_id: CAT_A, group_id: group.id };
    expect((await api("POST", url, { ...base, quantity: 2.5, cost_unit_price: 10 })).status).toBe(201);
    const places = await api("POST", url, { ...base, quantity: "1", cost_unit_price: "10.005" });
    expect(places.json.detail[0]).toMatchObject({ type: "decimal_max_places", loc: ["body", "cost_unit_price"] });
    const whole = await api("POST", url, { ...base, quantity: "123456789012.5" });
    expect(whole.json.detail[0].type).toBe("decimal_whole_digits");
    const bound = await api("POST", url, { ...base, quantity: "1", cost_unit_price: "1000000000000.01" });
    expect(bound.json.detail[0].type).toBe("less_than_equal");
    expect((await api("POST", url, { ...base, quantity: "abc" })).json.detail[0].type).toBe("decimal_parsing");
    expect((await api("POST", url, { ...base, quantity: "1", extra: 1 })).json.detail[0].type).toBe("extra_forbidden");
  });
});

// ────────────────────────────────────────────────────────────────────────── hesap entegrasyonu

describe("hesap ikizi entegrasyonu: sunucu yanıtı calc.py değerleriyle", () => {
  it("c100 g12 k15 q10 → 128,80 / 1288,00 / maliyet 1000 / GG 120 / kâr 168; toplam, KDV ve genel kâr %", async () => {
    const offer = await createOffer();
    const group = await createGroup(offer.id);
    const item = await createItem(offer.id, group.id, CAT_A, { quantity: "10", cost_unit_price: "100.00" });
    expect(item.customer).toEqual({ unit_price: "128.80", amount: "1288.00" });
    expect(item.internal).toMatchObject({ cost: "1000.00", overhead: "120.00", profit: "168.00", profit_pct: "15.00" });
    const revision = await revisionOf(offer.id);
    expect(revision.totals.customer).toEqual({ net: "1288.00", vat: "257.60", gross: "1545.60" });
    expect(revision.totals.internal).toMatchObject({ cost: "1000.00", overhead: "120.00", profit: "168.00", profit_pct: "15.00" });
    expect(revision.totals.unpriced_count).toBe(0);
  });

  it("elle B.F.: türev kâr % + maliyet+GG+kâr=tutar; fiyatsız toplama GİRMEZ ama adam-saati girer", async () => {
    const offer = await createOffer();
    const group = await createGroup(offer.id);
    await createItem(offer.id, group.id, CAT_A, { quantity: "2", cost_unit_price: "100.00", offer_unit_price: "140.00" });
    await createItem(offer.id, group.id, CAT_B, { quantity: "4" }); // fiyatsız, 4 x 11,5 = 46 a-s
    const revision = await revisionOf(offer.id);
    const [priced, unpriced] = allItems(revision);
    expect(priced.internal.profit_pct).toBe("25.00");
    expect(priced.customer.amount).toBe("280.00");
    expect(unpriced).toMatchObject({ priced: false, customer: null });
    expect(revision.totals.customer.net).toBe("280.00");
    expect(revision.totals.unpriced_count).toBe(1);
    expect(revision.totals.internal.man_hours).toBe("47.7000000"); // 2 x 0,85 + 4 x 11,5 (fiyatsız DAHİL)
  });

  it("revizyon sıralaması: grup sırası → kalem sırası → poz no", async () => {
    const offer = await createOffer();
    const second = await createGroup(offer.id, "İkinci");
    const first = await createGroup(offer.id, "Birinci");
    await api("PATCH", `${rev(offer.id)}/groups/${first.id}`, { sort_order: -0 });
    await api("PATCH", `${rev(offer.id)}/groups/${second.id}`, { sort_order: 9 });
    await createItem(offer.id, second.id, CAT_A);
    await createItem(offer.id, first.id, CAT_C);
    expect((await revisionOf(offer.id)).groups.map((g: any) => g.name)).toEqual(["Birinci", "İkinci"]);
  });
});

// ───────────────────────────────────────────────────────────── TKL katalog son fiyat kaynağı

describe("🔴 TKL katalog son fiyatı (T29/T33, SO-16/SO-18) — `tklLastPrices`", () => {
  async function offerWith(costs: Array<string | null>, status: "draft" | "sent" | "won" | "lost" | "withdrawn", title = "T"): Promise<Record<string, any>> {
    const offer = await createOffer({ title });
    const group = await createGroup(offer.id);
    for (const cost of costs) await createItem(offer.id, group.id, CAT_A, { cost_unit_price: cost, offer_unit_price: cost === null ? undefined : "999.00" });
    await toStatus(offer.id, status);
    return offer;
  }

  it.each(["draft", "sent", "lost", "withdrawn"] as const)("%s revizyon kaynak OLMAZ", async (status) => {
    await offerWith(["50.00"], status);
    expect(tklLastPrices(state).size).toBe(0);
  });

  it("kazanılan revizyon kaynak olur: fiyat = MALİYET B.F. (teklif B.F. 999 DEĞİL), etiket 'TKL-… Rev.0', belge id = TEKLİF id", async () => {
    const offer = await offerWith(["50.00"], "won");
    const price = tklLastPrices(state).get(CAT_A);
    expect(price).toMatchObject({ price: "50.00", docNo: `${offer.offer_no} Rev.0`, docId: offer.id });
    expect(price?.at).toBe((await revisionOf(offer.id)).won_at);
  });

  it("maliyeti boş kalem kaynak olmaz (dolu kardeşi olur); aynı revizyonda iki kalem → EN YÜKSEK maliyet", async () => {
    await offerWith([null], "won");
    expect(tklLastPrices(state).size).toBe(0);
    await offerWith([null, "30.00", "120.00", "90.00"], "won", "İkinci");
    expect(tklLastPrices(state).get(CAT_A)?.price).toBe("120.00");
  });

  it("iki kazanılan teklif: en yeni won_at kazanır; EŞİTLİKTE küçük teklif no kazanır (kazanma sırasından bağımsız)", async () => {
    const a = await offerWith(["100.00"], "won", "A");
    const b = await offerWith(["130.00"], "won", "B");
    const stamp = (id: string, at: string) => {
      state.revisions = state.revisions.map((r) => (r.offerId === id ? { ...r, wonAt: at } : r));
    };
    stamp(a.id, "2026-05-10T09:00:00.000Z");
    stamp(b.id, "2026-05-01T09:00:00.000Z");
    expect(tklLastPrices(state).get(CAT_A)).toMatchObject({ price: "100.00", docId: a.id });
    stamp(b.id, "2026-05-10T09:00:00.000Z"); // eşit zaman
    expect(tklLastPrices(state).get(CAT_A)).toMatchObject({ price: "100.00", docId: a.id }); // TKL-…-0001 < …-0002
    stamp(a.id, "2026-05-01T09:00:00.000Z");
    expect(tklLastPrices(state).get(CAT_A)).toMatchObject({ price: "130.00", docId: b.id });
  });

  it("SO-6 uçtan uca: kazanılan teklifin maliyeti yeni tekliflerde ÖN DOLDURULUR (son fiyat referansı ezer)", async () => {
    await offerWith(["77.50"], "won");
    const next = await createOffer({ title: "İkinci" });
    const group = await createGroup(next.id);
    expect((await createItem(next.id, group.id, CAT_A)).cost_unit_price).toBe("77.50"); // ref 100'ü ezer
  });

  it("yeni revizyonlu teklifte yalnız KAZANILAN revizyon kaynaktır (kaybedilen Rev.0 değil)", async () => {
    const offer = await offerWith(["70.00"], "lost");
    expect(tklLastPrices(state).size).toBe(0);
    await api("POST", `/offers/${offer.id}/revisions`);
    await api("POST", `${rev(offer.id, 1)}/send`);
    await api("POST", `${rev(offer.id, 1)}/win`);
    expect(tklLastPrices(state).get(CAT_A)).toMatchObject({ price: "70.00", docNo: `${offer.offer_no} Rev.1` });
  });
});

// ──────────────────────────────────────────── gerçek mock-backend: yönlendirme + tohum + katalog

describe("🔴 mock-backend entegrasyonu: tek giriş noktası, tohum, katalog son fiyatı", () => {
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
    return { status: response.status, json: text === "" ? {} : (JSON.parse(text) as Record<string, any>) };
  }

  it("Bearer yoksa 401 (genel kapı teklif uçlarından ÖNCE)", async () => {
    const response = await fetch(`${url}/offers`);
    expect(response.status).toBe(401);
  });

  it("tohum: her durumdan teklif, kartlar dolu, 'süresi geçti' ve kazanma oranı var", async () => {
    const list = (await call("GET", "/offers")).json;
    const byStatus = Object.fromEntries(list.summary.by_status.map((s: any) => [s.status, s.count]));
    expect(byStatus).toEqual({ draft: 2, sent: 2, won: 1, lost: 1, withdrawn: 1 });
    expect(list.summary.expired_count).toBeGreaterThanOrEqual(1);
    expect(list.summary.win_rate).toBe("50.00");
    expect(list.items[0].offer_no).toBe("TKL-2026-0007");
  });

  it("tohumlu kazanılan teklif katalog son fiyatını DEĞİŞTİRMEZ (Kalıp/Demir hâlâ SZL)", async () => {
    const items = (await call("GET", "/catalog/items")).json.items;
    for (const name of ["Kalıp", "Demir"]) {
      // Mevcut kaynak (HK ya da SZL) KORUNUR — TKL kazanılan tohum teklifle önüne GEÇMEZ.
      expect(["HK", "SZL"], name).toContain(items.find((item: any) => item.name === name).last_price.source);
    }
    expect(items.some((item: any) => item.last_price?.source === "TKL")).toBe(false);
  });

  it("yeni teklif: grup + katalogdan kalem (öneri) + gönder + kazan → /catalog/items'ta TKL son fiyatı; send/lose etkilemez", async () => {
    const catalog = async () => (await call("GET", "/catalog/items")).json.items as Array<Record<string, any>>;
    const concrete = (await catalog()).find((item) => item.name === "Beton döküm") as Record<string, any>;
    expect(concrete.last_price).toBeNull(); // başlangıç: kaynaksız
    const offerNo = async (): Promise<string> => (await call("GET", "/offers")).json.items[0].offer_no;

    const created = (await call("POST", "/offers", { employer_id: "emp-1", title: "Beton işi" })).json;
    expect(created.offer_no).toBe("TKL-2026-0008");
    const group = (await call("POST", `/offers/${created.id}/revisions/0/groups`, { name: "Beton" })).json;
    const item = (await call("POST", `/offers/${created.id}/revisions/0/items`, { catalog_item_id: concrete.id, group_id: group.id, quantity: "10" })).json;
    expect(item.cost_unit_price).toBe(concrete.ref_price); // öneri: son fiyat yok → referans
    await call("PATCH", `/offers/${created.id}/revisions/0/items/${item.id}`, { cost_unit_price: "2300.00" });

    await call("POST", `/offers/${created.id}/revisions/0/send`);
    expect((await catalog()).find((entry) => entry.name === "Beton döküm")?.last_price).toBeNull(); // gönderilmiş kaynak DEĞİL
    await call("POST", `/offers/${created.id}/revisions/0/win`);
    const after = (await catalog()).find((entry) => entry.name === "Beton döküm")?.last_price;
    expect(after).toMatchObject({ price: "2300.00", source: "TKL", doc_no: `${await offerNo()} Rev.0`, doc_id: created.id });

    // SO-6 uçtan uca: yeni teklifte aynı kalem artık kazanılan maliyetle ön dolar
    const next = (await call("POST", "/offers", { employer_id: "emp-2", title: "İkinci beton işi" })).json;
    const nextGroup = (await call("POST", `/offers/${next.id}/revisions/0/groups`, { name: "Beton" })).json;
    const suggested = (await call("POST", `/offers/${next.id}/revisions/0/items`, { catalog_item_id: concrete.id, group_id: nextGroup.id, quantity: "1" })).json;
    expect(suggested.cost_unit_price).toBe("2300.00");
  });

  it("gövde şema kapısı canlı mock'ta: bilinmeyen alan 422, geçersiz JSON 422", async () => {
    const extra = await call("POST", "/offers", { employer_id: "emp-1", title: "T", x: 1 });
    expect(extra.status).toBe(422);
    const raw = await fetch(`${url}/offers`, { method: "POST", headers: { authorization: "Bearer t", "content-type": "application/json" }, body: "{" });
    expect(raw.status).toBe(422);
  });
});
