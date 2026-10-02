import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, it, expect, expectTypeOf, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, type UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { backendClient } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

import {
  OFFER_TEMPLATES_QUERY_KEY,
  OFFER_TEMPLATE_QUERY_KEY,
  offerDetailKey,
  offerTemplateKey,
  offerTemplatesKey,
} from "./offer-query-keys";
import {
  useOfferTemplate,
  useOfferTemplates,
  type OfferTemplateDetail,
  type OfferTemplateListResponse,
} from "./useOfferTemplates";

vi.mock("@/lib/api/client", () => ({ backendClient: { GET: vi.fn() } }));

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function ok(data: unknown) {
  return { data, error: undefined, response: new Response(null, { status: 200 }) } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

describe("şablon anahtarları (offer-query-keys)", () => {
  it("biçim: liste ve detay", () => {
    expect(OFFER_TEMPLATES_QUERY_KEY).toBe("offer-templates");
    expect(OFFER_TEMPLATE_QUERY_KEY).toBe("offer-template");
    expect(offerTemplatesKey()).toEqual(["offer-templates"]);
    expect(offerTemplateKey("t-1")).toEqual(["offer-template", "t-1"]);
  });

  it("detay anahtarı tekil ön ekle başlar; liste (çoğul) o ön ekin ALTINDA DEĞİLDİR", () => {
    expect(offerTemplateKey("t-1").slice(0, 1)).toEqual([OFFER_TEMPLATE_QUERY_KEY]);
    expect(offerTemplatesKey()[0]).not.toBe(OFFER_TEMPLATE_QUERY_KEY);
  });

  it("şablon anahtarları teklif anahtarlarıyla ÇAKIŞMAZ (['offer', id] ön eki şablonu tazelemez)", () => {
    expect(offerTemplateKey("t-1")[0]).not.toBe(offerDetailKey("t-1")[0]);
  });
});

describe("useOfferTemplates", () => {
  it("GET /offers/templates; önbellek anahtarı liste anahtarı", async () => {
    vi.mocked(backendClient.GET).mockResolvedValue(ok({ items: [], total: 0 }));
    const { result } = renderHook(() => useOfferTemplates(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(backendClient.GET).toHaveBeenCalledWith("/offers/templates", {});
    expect(client.getQueryData(offerTemplatesKey())).toEqual({ items: [], total: 0 });
  });

  it("403 (R5/T40: kısıtlı kullanıcı) BackendError olarak yüzer", async () => {
    vi.mocked(backendClient.GET).mockResolvedValue({
      data: undefined,
      error: { detail: "forbidden" },
      response: new Response(null, { status: 403 }),
    } as never);
    const { result } = renderHook(() => useOfferTemplates(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ status: 403 });
  });

  it("dönüş tipi sözleşmeden (DeepScale TemplateListResponse)", () => {
    expectTypeOf(useOfferTemplates).returns.toEqualTypeOf<UseQueryResult<OfferTemplateListResponse, Error>>();
    expectTypeOf<OfferTemplateListResponse>().toEqualTypeOf<DeepScale<components["schemas"]["TemplateListResponse"]>>();
  });
});

describe("useOfferTemplate(id)", () => {
  it("GET …/{template_id}: yol parametresi + anahtar", async () => {
    vi.mocked(backendClient.GET).mockResolvedValue(ok({ id: "t-1" }));
    const { result } = renderHook(() => useOfferTemplate("t-1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(backendClient.GET).toHaveBeenCalledWith("/offers/templates/{template_id}", {
      params: { path: { template_id: "t-1" } },
    });
    expect(client.getQueryData(offerTemplateKey("t-1"))).toEqual({ id: "t-1" });
  });

  it.each([null, undefined, ""] as const)("id %j iken sorgu KAPALI: istek ATILMAZ", async (id) => {
    vi.mocked(backendClient.GET).mockResolvedValue(ok({ id: "x" }));
    const { result } = renderHook(() => useOfferTemplate(id), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(backendClient.GET).not.toHaveBeenCalled();
  });

  it("id sonradan gelince sorgu açılır (null → 't-2')", async () => {
    vi.mocked(backendClient.GET).mockResolvedValue(ok({ id: "t-2" }));
    const { result, rerender } = renderHook(({ id }: { id: string | null }) => useOfferTemplate(id), {
      wrapper,
      initialProps: { id: null as string | null },
    });
    expect(backendClient.GET).not.toHaveBeenCalled();
    rerender({ id: "t-2" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(backendClient.GET).toHaveBeenCalledTimes(1);
  });

  it("404 yüzer (silinmiş şablon): BackendError status 404", async () => {
    vi.mocked(backendClient.GET).mockResolvedValue({
      data: undefined,
      error: { detail: "Teklif şablonu bulunamadı" },
      response: new Response(null, { status: 404 }),
    } as never);
    const { result } = renderHook(() => useOfferTemplate("t-9"), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ status: 404 });
  });

  it("dönüş tipi sözleşmeden (DeepScale TemplateDetailRead)", () => {
    expectTypeOf(useOfferTemplate).returns.toEqualTypeOf<UseQueryResult<OfferTemplateDetail, Error>>();
    expectTypeOf(useOfferTemplate).parameter(0).toEqualTypeOf<string | null | undefined>();
  });

  it("skipToken KULLANILMAZ (gözlemci paylaşılan sorgu seçeneklerini ezer); `enabled` kullanılır", () => {
    const file = path.join(process.cwd(), "src/lib/api/hooks/useOfferTemplates.ts");
    const code = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/skipToken/);
    expect(code).toMatch(/enabled:/);
  });
});
