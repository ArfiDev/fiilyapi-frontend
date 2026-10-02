import { describe, it, expect, vi, beforeEach, expectTypeOf } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider, type QueryKey } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { backendClient } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { BackendError } from "@/lib/api/unwrap";

import { CATALOG_ITEMS_QUERY_KEY } from "./catalog-query-keys";
import { offerDetailKey, offerListKey, offerRevisionKey } from "./offer-query-keys";
import { CONTRACTS_QUERY_KEY } from "./useContracts";
import { useConvertOffer, type OfferConvertBody, type OfferConvertResponse } from "./useOfferMutations";
import { PROJECT_TIMELINE_QUERY_KEY } from "./useProjectTimeline";
import { PROJECTS_QUERY_KEY } from "./useProjects";

// TKL-F5.1 · plan §2.1: dönüştürme geçersizleme kümesi (başarı = 6, 409 = 2) + tip kontratı.
vi.mock("@/lib/api/client", () => ({
  backendClient: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() },
}));

const OFFER = "of-1";
const OTHER = "of-2";

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const KEYS: Record<string, QueryKey> = {
  listAll: offerListKey({}),
  listWon: offerListKey({ status: "won" }),
  detailA: offerDetailKey(OFFER),
  revA0: offerRevisionKey(OFFER, 0),
  revA1: offerRevisionKey(OFFER, 1),
  detailB: offerDetailKey(OTHER),
  revB0: offerRevisionKey(OTHER, 0),
  projects: [PROJECTS_QUERY_KEY, { q: "x" }],
  timeline: [PROJECT_TIMELINE_QUERY_KEY],
  contracts: [CONTRACTS_QUERY_KEY, { kind: "employer" }],
  catalog: [CATALOG_ITEMS_QUERY_KEY],
  unrelated: ["earned-value-x"],
};

function invalidated(): string[] {
  return Object.entries(KEYS)
    .filter(([, key]) => client.getQueryCache().find({ queryKey: key, exact: true })?.state.isInvalidated === true)
    .map(([name]) => name)
    .sort();
}

const BODY: OfferConvertBody = {
  project: { name: "A Blok", city: "İstanbul", start_date: "2026-11-01", end_date: "2027-10-31" },
  contract: { contract_no: "SZL-1", signature_date: "2026-10-30", has_price_escalation: false },
  groups: [
    {
      name: "Kaba İnşaat",
      items: [
        {
          catalog_item_id: "c1",
          code: "15.001",
          description: "Beton",
          unit: "m3",
          quantity: "10",
          unit_price: "100.00",
        },
      ],
    },
  ],
  open_site: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  for (const key of Object.values(KEYS)) client.setQueryData(key, { primed: true });
});

describe("useConvertOffer", () => {
  it("POST /offers/{id}/convert: gövde AYNEN, yanıt olduğu gibi döner", async () => {
    const response = { project_id: "p1", project_slug: "a-blok", project_code: "PRJ-2026-001", site_id: null, contract_item_count: 1, warnings: [] };
    vi.mocked(backendClient.POST).mockResolvedValue({ data: response, error: undefined, response: new Response(null, { status: 200 }) } as never);
    const { result } = renderHook(() => useConvertOffer(OFFER), { wrapper });
    let out: unknown;
    await act(async () => {
      out = await result.current.mutateAsync(BODY);
    });
    expect(out).toEqual(response);
    expect(backendClient.POST).toHaveBeenCalledWith("/offers/{offer_id}/convert", {
      params: { path: { offer_id: OFFER } },
      body: BODY,
    });
  });

  it("başarı: tam 6 anahtar (detay+revizyonlar ÖN EK · liste · projeler · zaman çizelgesi · sözleşmeler · katalog); başka teklif/ilgisiz dokunulmaz", async () => {
    vi.mocked(backendClient.POST).mockResolvedValue({ data: { project_id: "p1" }, error: undefined, response: new Response(null, { status: 200 }) } as never);
    const { result } = renderHook(() => useConvertOffer(OFFER), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(BODY);
    });
    expect(invalidated()).toEqual(
      ["catalog", "contracts", "detailA", "listAll", "listWon", "projects", "revA0", "revA1", "timeline"].sort(),
    );
  });

  it("yanıt parasız: önbelleğe setQueryData YAZILMAZ (detay önbelleği 'primed' kalır, yalnız bayat işaretlenir)", async () => {
    vi.mocked(backendClient.POST).mockResolvedValue({ data: { project_id: "p1" }, error: undefined, response: new Response(null, { status: 200 }) } as never);
    const { result } = renderHook(() => useConvertOffer(OFFER), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(BODY);
    });
    expect(client.getQueryData(offerDetailKey(OFFER))).toEqual({ primed: true });
  });

  it.each([409])("%i: hata OLDUĞU GİBİ fırlar; yalnız detay(+revizyonlar) ve liste tazelenir (2 küme)", async (status) => {
    vi.mocked(backendClient.POST).mockResolvedValue({
      data: undefined,
      error: { detail: "Teklif zaten dönüştürüldü" },
      response: new Response(null, { status }),
    } as never);
    const { result } = renderHook(() => useConvertOffer(OFFER), { wrapper });
    let caught: unknown;
    await act(async () => {
      caught = await result.current.mutateAsync(BODY).catch((e: unknown) => e);
    });
    expect(caught).toBeInstanceOf(BackendError);
    expect((caught as BackendError).status).toBe(status);
    expect((caught as BackendError).body).toEqual({ detail: "Teklif zaten dönüştürüldü" });
    expect(invalidated()).toEqual(["detailA", "listAll", "listWon", "revA0", "revA1"].sort());
  });

  it.each([403, 404, 422, 500])("%i: hiçbir şey tazelenmez", async (status) => {
    vi.mocked(backendClient.POST).mockResolvedValue({
      data: undefined,
      error: { detail: "x" },
      response: new Response(null, { status }),
    } as never);
    const { result } = renderHook(() => useConvertOffer(OFFER), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(BODY).catch(() => undefined);
    });
    expect(invalidated()).toEqual([]);
  });

  it("tip kontratı: gövde ConvertRequest, yanıt ConvertResponse", () => {
    type Schemas = components["schemas"];
    expectTypeOf<OfferConvertBody["project"]["city"]>().toEqualTypeOf<string>();
    expectTypeOf<OfferConvertBody["open_site"]>().toEqualTypeOf<boolean>();
    expectTypeOf<OfferConvertBody["contract"]["has_price_escalation"]>().toEqualTypeOf<boolean>();
    expectTypeOf<OfferConvertResponse>().toEqualTypeOf<Schemas["ConvertResponse"]>();
    expectTypeOf<OfferConvertResponse["project_id"]>().toEqualTypeOf<string>();
    expectTypeOf<OfferConvertResponse["warnings"][number]["group_name"]>().toEqualTypeOf<string | null | undefined>();
    // Yanıt PARASIZ: tutar alanı YOK.
    expectTypeOf<keyof OfferConvertResponse>().toEqualTypeOf<
      "contract_item_count" | "project_code" | "project_id" | "project_slug" | "site_id" | "warnings"
    >();
  });
});
