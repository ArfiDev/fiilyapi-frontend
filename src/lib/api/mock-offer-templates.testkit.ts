// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- yanıt gövdesi gezinmesi (emsal: mock-offers.test.ts). */
//
// TKL-F4.4 · şablon/oluşturma-kaynağı sahte backend testlerinin ORTAK donanımı (HTTP sunucu + sabit katalog/işveren + saat).
// İki test dosyası kullanır: `mock-offer-templates.test.ts` (şablon uçları + tohum) ve `mock-offer-create-sources.test.ts`
// (`POST /offers` + `template_id` / `copy_from`). Dosya 800 satırı aşmasın diye ayrıldı.
import type { AddressInfo } from "node:net";
import { createServer, type Server } from "node:http";

import { emptyOffersState, handleOffers, tklLastPrices, type OfferCatalogEntry, type OffersState } from "../../../e2e/mock-offers";

export const ACTOR = { id: "11111111-1111-1111-1111-111111111111", fullName: "Ahmet Yılmaz" };
export const EMP_1 = "e0000000-0000-4000-8000-000000000001";
export const EMP_2 = "e0000000-0000-4000-8000-000000000002";
export const CAT_A = "ca000000-0000-4000-8000-00000000000a"; // referans 100,00 · a-s 0,85
export const CAT_B = "ca000000-0000-4000-8000-00000000000b"; // referanssız · a-s 11,5
export const CAT_C = "ca000000-0000-4000-8000-00000000000c"; // referans 10,00 · a-s 0,55
export const MISSING_CAT = "ca000000-0000-4000-8000-0000000000ff";
export const MISSING_ID = "99999999-9999-4999-8999-999999999999";

export const STALE = "Şablon başka biri tarafından değiştirildi; sayfayı yenileyin";
export const TEMPLATE_MISSING = "Teklif şablonu bulunamadı";

export const CATALOG: OfferCatalogEntry[] = [
  { id: CAT_A, pozNo: "KAB-0001", name: "Kalıp", uom: "m²", standardUnitMhr: "0.85", refPrice: "100.00" },
  { id: CAT_B, pozNo: "KAB-0002", name: "Demir", uom: "ton", standardUnitMhr: "11.5", refPrice: null },
  { id: CAT_C, pozNo: "DUV-0001", name: "Tuğla duvar", uom: "m²", standardUnitMhr: "0.55", refPrice: "10.00" },
];
export const EMPLOYERS = [
  { id: EMP_1, name: "Güneşkent Gayrimenkul A.Ş." },
  { id: EMP_2, name: "Çelik Holding A.Ş." },
];

/** 2026-10-02 12:00 İstanbul. */
export const NOON = "2026-10-02T09:00:00.000Z";

export interface Reply {
  status: number;
  json: any;
}

let server: Server;
let base = "";
let state: OffersState;
/** Test içinden ayarlanır: `ctx.now` (enjekte saat), `ctx.external` (HK/SZL benzeri harici son fiyat). */
export const ctx: { now: Date; external: Map<string, { price: string }> } = { now: new Date(NOON), external: new Map() };

/** Her testten ÖNCE (`beforeEach(openServer)`): taze durum + HTTP sunucu. Bu dosya `vitest` ithal ETMEZ (test-dışı dosya bekçisi). */
export async function openServer(): Promise<void> {
  ctx.now = new Date(NOON);
  ctx.external = new Map();
  state = emptyOffersState([ACTOR], () => ctx.now);
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
        const merged = new Map(ctx.external);
        for (const [id, row] of tklLastPrices(state)) if (!merged.has(id)) merged.set(id, { price: row.price });
        return merged;
      },
      actor: ACTOR,
    });
    if (!handled) send(404, { detail: "Not Found" });
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

/** Her testten SONRA (`afterEach(closeServer)`). */
export async function closeServer(): Promise<void> {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

export async function api(method: string, path: string, body?: unknown): Promise<Reply> {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return { status: response.status, json: text === "" ? {} : JSON.parse(text) };
}
