import { expect, type Page, type Route } from "@playwright/test";

import { FIXED_NOW } from "./earned-value-helpers";
import {
  createOffersState,
  emptyOffersState,
  handleOffers,
  type OfferCatalogEntry,
  type OffersPort,
  type OffersState,
} from "./mock-offers";

// TKL-F3.8 · TEKLİF HAZIRLAMA SAHTE SUNUCUSU — MOCK'A YAZMAZ.
//
// Mock backend TÜM spec dosyalarında paylaşılan tek sunucudur ve `fullyParallel` koşar: `POST /offers`
// vb. mock durumunu KALICI değiştirir (liste kareleri 7 teklif sayar). Bu yardımcı `/offers*` isteklerinin
// HEPSİNİ `page.route` ile yakalar ve `mock-offers.ts` ikizini (`handleOffers`) bu sayfaya ÖZEL bir
// `OffersState` üzerinde koşturur: durum zinciri (numara, revizyon kopyası, hesap, 409/422 metinleri)
// gerçek ikizden gelir, paylaşılan mock'a hiçbir yazma gitmez. Katalog/işveren GET'ten OKUNUR.
//
// Gövdeler kaydedilir (`createBodies`, `patchCalls`, `bulkBodies`, `transitionCalls`) — spec'ler
// "ekran ne gönderdi" iddiasını buradan yapar.
//
// ⚠️ `*.spec.ts` DEĞİLDİR. ⚠️ Yol kalıbı REGEX: glob `offers*` alt yolları (`/offers/{id}`) eşlemez.
// ⚠️ Giriş YAPILDIKTAN SONRA kurulur (katalog/işveren okuması oturum çerezi ister).

const BACKEND_PREFIX = "/api/backend";
const OFFERS_ROUTE = /\/api\/backend\/offers(\/|\?|$)/;
const ACTOR = { id: "11111111-1111-1111-1111-111111111111", fullName: "Ahmet Yılmaz" } as const;
const TRANSITION_ACTIONS = new Set(["send", "win", "lose", "withdraw"]);
const NO_CONTENT = 204;
const INVALID_JSON_STATUS = 422;

type Json = Record<string, unknown>;

export interface FakeCall {
  readonly method: string;
  readonly path: string;
  readonly body: Json | null;
}

export interface FakeOffersServer {
  /** `POST /offers` gövdeleri (sırayla). */
  readonly createBodies: Json[];
  /** Her `PATCH` (teklif, revizyon, kalem, grup) — yol + gövde. */
  readonly patchCalls: FakeCall[];
  /** `POST …/items/bulk` gövdeleri. */
  readonly bulkBodies: Json[];
  /** `POST …/{send|win|lose|withdraw}` çağrıları; `lose` gövdesi `body`de. */
  readonly transitionCalls: Array<{ action: string; path: string; body: Json | null }>;
  /** Her yazma isteği (sırayla) — "şu ucu ÇAĞIRMADI" iddiaları için. */
  readonly calls: FakeCall[];
  /** Sahte durumun canlı görünümü (yalnız okuma; spec iddiaları için). */
  state(): OffersState;
}

export interface FakeOffersOptions {
  /** `false` → tohumsuz BOŞ liste (teklif-liste-bos karesi). Varsayılan `true` (7 tohum teklif). */
  readonly seeded?: boolean;
}

interface CatalogRead {
  readonly entries: OfferCatalogEntry[];
  readonly lastPrices: Map<string, { price: string }>;
}

async function readJson(page: Page, path: string): Promise<Json> {
  const response = await page.request.get(`${BACKEND_PREFIX}${path}`);
  expect(response.ok(), `${path} okunamadı`).toBe(true);
  return (await response.json()) as Json;
}

async function readCatalog(page: Page): Promise<CatalogRead> {
  const items = ((await readJson(page, "/catalog/items")).items ?? []) as Json[];
  const lastPrices = new Map<string, { price: string }>();
  const entries = items.map((item): OfferCatalogEntry => {
    const last = item.last_price as { price?: string } | null | undefined;
    if (last?.price !== undefined) lastPrices.set(String(item.id), { price: last.price });
    return {
      id: String(item.id),
      pozNo: String(item.poz_no),
      name: String(item.name),
      uom: String(item.uom),
      standardUnitMhr: String(item.standard_unit_mhr),
      refPrice: item.ref_price === null || item.ref_price === undefined ? null : String(item.ref_price),
    };
  });
  return { entries, lastPrices };
}

async function readEmployers(page: Page): Promise<Array<{ id: string; name: string }>> {
  const items = ((await readJson(page, "/employers?active_only=false")).items ?? []) as Json[];
  return items.map((item) => ({ id: String(item.id), name: String(item.name) }));
}

/** Playwright isteği → `OffersPort` + yakalanan yanıt. `handleOffers` eşzamanlı çalışır. */
function toPort(
  route: Route,
  context: { catalog: CatalogRead; employers: Array<{ id: string; name: string }> },
  captured: { status: number; body: unknown; rawBody: Json | null },
): OffersPort {
  const request = route.request();
  const url = new URL(request.url());
  return {
    method: request.method(),
    path: url.pathname.slice(BACKEND_PREFIX.length),
    query: url.searchParams,
    send: (status, body) => {
      captured.status = status;
      captured.body = body;
    },
    readBody: (handler) => {
      const text = request.postData();
      let parsed: Json = {};
      try {
        parsed = text === null || text === "" ? {} : (JSON.parse(text) as Json);
      } catch {
        captured.status = INVALID_JSON_STATUS;
        captured.body = { detail: "JSON decode error" };
        return;
      }
      captured.rawBody = parsed;
      handler(parsed);
    },
    catalog: () => context.catalog.entries,
    employers: () => context.employers,
    lastPrices: () => context.catalog.lastPrices,
    actor: ACTOR,
  };
}

/** Yazma yolu mu, hangi türden? Kayıt için. */
function transitionActionOf(path: string): string | null {
  const last = path.split("/").pop() ?? "";
  return TRANSITION_ACTIONS.has(last) ? last : null;
}

function record(server: FakeOffersServer, port: OffersPort, body: Json | null): void {
  const { method, path } = port;
  if (method === "GET") return;
  server.calls.push({ method, path, body });
  if (method === "PATCH") server.patchCalls.push({ method, path, body });
  if (method === "POST" && path === "/offers" && body !== null) server.createBodies.push(body);
  if (method === "POST" && path.endsWith("/items/bulk") && body !== null) server.bulkBodies.push(body);
  const action = method === "POST" ? transitionActionOf(path) : null;
  if (action !== null) server.transitionCalls.push({ action, path, body });
}

/**
 * `/offers*` isteklerinin HEPSİNİ sayfaya özel sahte duruma yönlendirir. Giriş yapıldıktan SONRA,
 * navigasyondan ÖNCE çağrılır.
 */
export async function installFakeOffersServer(page: Page, options: FakeOffersOptions = {}): Promise<FakeOffersServer> {
  const { seeded = true } = options;
  const catalog = await readCatalog(page);
  const employers = await readEmployers(page);
  const clock = () => new Date(FIXED_NOW);
  const users = [{ ...ACTOR }];
  const state: OffersState = seeded
    ? createOffersState({ catalog: catalog.entries, employers, users, clock })
    : emptyOffersState(users, clock);

  const server: FakeOffersServer = {
    createBodies: [],
    patchCalls: [],
    bulkBodies: [],
    transitionCalls: [],
    calls: [],
    state: () => state,
  };

  await page.route(OFFERS_ROUTE, async (route) => {
    const captured = { status: 0, body: undefined as unknown, rawBody: null as Json | null };
    const port = toPort(route, { catalog, employers }, captured);
    const handled = handleOffers(state, port);
    if (!handled || captured.status === 0) return route.fallback();
    record(server, port, captured.rawBody);
    if (captured.status === NO_CONTENT) return route.fulfill({ status: NO_CONTENT });
    return route.fulfill({
      status: captured.status,
      contentType: "application/json",
      body: JSON.stringify(captured.body ?? {}),
    });
  });
  return server;
}
