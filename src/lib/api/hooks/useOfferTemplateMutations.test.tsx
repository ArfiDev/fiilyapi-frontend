import { describe, it, expect, expectTypeOf, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, type QueryKey, type UseMutationResult } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { backendClient } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

import { offerDetailKey, offerListKey, offerTemplateKey, offerTemplatesKey } from "./offer-query-keys";
import {
  useCopyOfferTemplate,
  useCreateOfferTemplate,
  useCreateTemplateFromOffer,
  useDeleteOfferTemplate,
  useReplaceTemplateContent,
  useSetDefaultTemplate,
  useUpdateOfferTemplate,
  type OfferTemplateContentBody,
  type OfferTemplateCopyBody,
  type OfferTemplateCreateBody,
  type OfferTemplateFromOfferBody,
  type OfferTemplateUpdateBody,
} from "./useOfferTemplateMutations";
import { useOfferTemplates, type OfferTemplateDetail } from "./useOfferTemplates";

vi.mock("@/lib/api/client", () => ({
  backendClient: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() },
}));

const T_A = "tp-a";
const T_B = "tp-b";
const NEW = "tp-new";
const STAMP = "2026-10-02T09:00:00.000000Z";

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function ok(data: unknown, status = 200) {
  return { data, error: undefined, response: new Response(null, { status }) } as never;
}

function detail(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, name: `Şablon ${id}`, groups: [], updated_at: STAMP, ...extra };
}

/** Anahtarlar ADLANDIRILMIŞ tek tablo: şablon listesi, iki şablon detayı + teklif tarafı (dokunulmamalı). */
const KEYS: Record<string, QueryKey> = {
  templates: offerTemplatesKey(),
  tplA: offerTemplateKey(T_A),
  tplB: offerTemplateKey(T_B),
  offerList: offerListKey({}),
  offerDetail: offerDetailKey("of-1"),
};

function prime(): void {
  for (const key of Object.values(KEYS)) client.setQueryData(key, { primed: true });
}

function invalidated(): string[] {
  return Object.entries(KEYS)
    .filter(([, key]) => client.getQueryCache().find({ queryKey: key, exact: true })?.state.isInvalidated === true)
    .map(([name]) => name)
    .sort();
}

function cached(name: string): unknown {
  return client.getQueryData(KEYS[name] as QueryKey);
}

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  prime();
});

interface Rendered {
  result: { current: { mutateAsync: (variables: never) => Promise<unknown> } };
}

async function run(hook: Rendered, variables: unknown): Promise<void> {
  await act(async () => {
    await hook.result.current.mutateAsync(variables as never);
  });
}

describe("🔴 şablon yazmaları: yanıt (TemplateDetailRead) → setQueryData + yalnız liste tazelenir", () => {
  const CREATING = [
    {
      name: "boş şablon (POST /offers/templates)",
      render: () => renderHook(() => useCreateOfferTemplate(), { wrapper }),
      variables: { name: "Yeni" },
      verb: "POST" as const,
      path: "/offers/templates",
    },
    {
      name: "tekliften şablon (POST …/from-offer)",
      render: () => renderHook(() => useCreateTemplateFromOffer(), { wrapper }),
      variables: { offer_id: "of-1", rev_no: 0, name: "Tekliften" },
      verb: "POST" as const,
      path: "/offers/templates/from-offer",
    },
    {
      name: "şablon kopyası (POST …/{id}/copy)",
      render: () => renderHook(() => useCopyOfferTemplate(T_A), { wrapper }),
      variables: { name: "Kopya" },
      verb: "POST" as const,
      path: "/offers/templates/{template_id}/copy",
    },
  ];

  it.each(CREATING)("$name → detay önbelleğe yazılır (yeni id), liste tazelenir; BAŞKA şablon/teklif DOKUNULMAZ", async (c) => {
    const response = detail(NEW, { name: "Sunucu yanıtı" });
    vi.mocked(backendClient[c.verb]).mockResolvedValue(ok(response, 201));
    const hook = c.render();
    await run(hook, c.variables);
    expect(client.getQueryData(offerTemplateKey(NEW))).toEqual(response);
    expect(invalidated()).toEqual(["templates"]);
    expect(cached("tplA")).toEqual({ primed: true });
    expect(cached("tplB")).toEqual({ primed: true });
  });

  it("çağrı sözleşmesi: create/from-offer gövdeyi AYNEN yollar; copy yol parametresi + gövde", async () => {
    vi.mocked(backendClient.POST).mockResolvedValue(ok(detail(NEW), 201));
    await run(renderHook(() => useCreateOfferTemplate(), { wrapper }), { name: "A", overhead_pct: "12", profit_pct: null });
    expect(backendClient.POST).toHaveBeenLastCalledWith("/offers/templates", {
      body: { name: "A", overhead_pct: "12", profit_pct: null },
    });
    await run(renderHook(() => useCreateTemplateFromOffer(), { wrapper }), { offer_id: "o", rev_no: 2, name: "B" });
    expect(backendClient.POST).toHaveBeenLastCalledWith("/offers/templates/from-offer", {
      body: { offer_id: "o", rev_no: 2, name: "B" },
    });
    await run(renderHook(() => useCopyOfferTemplate(T_A), { wrapper }), { name: "C" });
    expect(backendClient.POST).toHaveBeenLastCalledWith("/offers/templates/{template_id}/copy", {
      params: { path: { template_id: T_A } },
      body: { name: "C" },
    });
  });

  it("kopya gövdesiz çağrılabilir (ad sunucuda '<ad> (kopya)'): gövde ALANI hiç gönderilmez", async () => {
    vi.mocked(backendClient.POST).mockResolvedValue(ok(detail(NEW), 201));
    await run(renderHook(() => useCopyOfferTemplate(T_A), { wrapper }), undefined);
    expect(backendClient.POST).toHaveBeenLastCalledWith("/offers/templates/{template_id}/copy", {
      params: { path: { template_id: T_A } },
    });
  });

  it("PATCH künye: yanıt setQueryData + liste; expected_updated_at ÇAĞIRANDAN gelir, hook uydurmaz/değiştirmez", async () => {
    const response = detail(T_A, { name: "Yeni ad", updated_at: "2026-10-02T09:00:01.000000Z" });
    vi.mocked(backendClient.PATCH).mockResolvedValue(ok(response));
    const body = { name: "Yeni ad", description: null, expected_updated_at: STAMP };
    await run(renderHook(() => useUpdateOfferTemplate(T_A), { wrapper }), body);
    expect(backendClient.PATCH).toHaveBeenCalledWith("/offers/templates/{template_id}", {
      params: { path: { template_id: T_A } },
      body,
    });
    expect(cached("tplA")).toEqual(response);
    expect(invalidated()).toEqual(["templates"]);
    expect(cached("tplB")).toEqual({ primed: true });
  });

  it("PATCH is_default:true: eski varsayılanın detayı da değişir → detay ÖN EKİ (tplB dahil) tazelenir; is_default olmayan PATCH'te tplB dokunulmaz", async () => {
    vi.mocked(backendClient.PATCH).mockResolvedValue(ok(detail(T_A, { is_default: true })));
    await run(renderHook(() => useUpdateOfferTemplate(T_A), { wrapper }), { is_default: true, expected_updated_at: STAMP });
    expect(invalidated()).toEqual(["templates", "tplA", "tplB"]);
    prime();
    await run(renderHook(() => useUpdateOfferTemplate(T_A), { wrapper }), { is_default: false, expected_updated_at: STAMP });
    expect(invalidated()).toEqual(["templates"]);
  });

  it("PUT içerik: TAM değiştirme gövdesi AYNEN (grup + kalem sırası + expected_updated_at); yanıt setQueryData + liste", async () => {
    const response = detail(T_A, { group_count: 2, item_count: 3 });
    vi.mocked(backendClient.PUT).mockResolvedValue(ok(response));
    const body = {
      groups: [
        { name: "B", items: [{ catalog_item_id: "c-2" }, { catalog_item_id: "c-1" }] },
        { name: "A", items: [] },
      ],
      expected_updated_at: STAMP,
    };
    await run(renderHook(() => useReplaceTemplateContent(T_A), { wrapper }), body);
    expect(backendClient.PUT).toHaveBeenCalledWith("/offers/templates/{template_id}/content", {
      params: { path: { template_id: T_A } },
      body,
    });
    expect(cached("tplA")).toEqual(response);
    expect(invalidated()).toEqual(["templates"]);
    expect(cached("tplB")).toEqual({ primed: true });
  });

  it("varsayılan yap: liste + TÜM şablon detayları (ön ek; exact DEĞİL); teklif sorguları dokunulmaz", async () => {
    vi.mocked(backendClient.POST).mockResolvedValue(ok(detail(T_A, { is_default: true })));
    await run(renderHook(() => useSetDefaultTemplate(T_A), { wrapper }), undefined);
    expect(backendClient.POST).toHaveBeenCalledWith("/offers/templates/{template_id}/default", {
      params: { path: { template_id: T_A } },
    });
    expect(invalidated()).toEqual(["templates", "tplA", "tplB"]);
    expect(cached("offerList")).toEqual({ primed: true });
  });

  it("🔴 varsayılan yap: yanıt (güncel updated_at) önbelleğe YAZILIR — sıradaki işlem yeni updated_at'le kurulur (TKL-F4.6b O2)", async () => {
    const response = detail(T_A, { is_default: true, updated_at: "2026-10-02T09:00:05.000000Z" });
    vi.mocked(backendClient.POST).mockResolvedValue(ok(response));
    await run(renderHook(() => useSetDefaultTemplate(T_A), { wrapper }), undefined);
    expect(cached("tplA")).toEqual(response);
  });

  it("sil: liste tazelenir + silinen şablonun detayı ÇIKARILIR (yoktur); diğer detay kalır ve tazelenmez", async () => {
    vi.mocked(backendClient.DELETE).mockResolvedValue(ok(undefined, 204));
    await run(renderHook(() => useDeleteOfferTemplate(), { wrapper }), T_A);
    expect(backendClient.DELETE).toHaveBeenCalledWith("/offers/templates/{template_id}", {
      params: { path: { template_id: T_A } },
    });
    expect(client.getQueryCache().find({ queryKey: offerTemplateKey(T_A), exact: true })).toBeUndefined();
    expect(cached("tplB")).toEqual({ primed: true });
    expect(invalidated()).toEqual(["templates"]);
  });

  it("hata önbelleği DOKUNMAZ: 409 (bayat) olduğu gibi fırlar, hiçbir anahtar tazelenmez/yazılmaz", async () => {
    vi.mocked(backendClient.PUT).mockResolvedValue({
      data: undefined,
      error: { detail: "Şablon başka biri tarafından değiştirildi; sayfayı yenileyin" },
      response: new Response(null, { status: 409 }),
    } as never);
    const hook = renderHook(() => useReplaceTemplateContent(T_A), { wrapper });
    await expect(
      act(async () => {
        await hook.result.current.mutateAsync({ groups: [], expected_updated_at: STAMP });
      }),
    ).rejects.toMatchObject({
      status: 409,
      body: { detail: "Şablon başka biri tarafından değiştirildi; sayfayı yenileyin" },
    });
    expect(invalidated()).toEqual([]);
    expect(cached("tplA")).toEqual({ primed: true });
  });

  it("onSuccess söz DÖNDÜRÜR: mutateAsync çözüldüğünde etkin liste sorgusu ZATEN yeniden okunmuştur", async () => {
    vi.mocked(backendClient.GET).mockResolvedValue(ok({ items: [], total: 0 }));
    const list = renderHook(() => useOfferTemplates(), { wrapper });
    await waitFor(() => expect(list.result.current.isSuccess).toBe(true));
    expect(backendClient.GET).toHaveBeenCalledTimes(1);
    vi.mocked(backendClient.POST).mockResolvedValue(ok(detail(NEW), 201));
    await run(renderHook(() => useCreateOfferTemplate(), { wrapper }), { name: "X" });
    expect(backendClient.GET).toHaveBeenCalledTimes(2); // tazeleme settle olmadan dönmedi
  });
});

describe("dönüş/gövde tip sözleşmesi (expectTypeOf)", () => {
  type Schemas = components["schemas"];
  type M<TVars> = UseMutationResult<OfferTemplateDetail, Error, TVars>;

  it("hook dönüşleri TemplateDetailRead (DeepScale) döner; değişkenler sözleşme gövdeleri", () => {
    expectTypeOf(useCreateOfferTemplate).returns.toEqualTypeOf<M<OfferTemplateCreateBody>>();
    expectTypeOf(useCreateTemplateFromOffer).returns.toEqualTypeOf<M<OfferTemplateFromOfferBody>>();
    expectTypeOf(useCopyOfferTemplate).returns.toEqualTypeOf<M<OfferTemplateCopyBody | undefined>>();
    expectTypeOf(useUpdateOfferTemplate).returns.toEqualTypeOf<M<OfferTemplateUpdateBody>>();
    expectTypeOf(useReplaceTemplateContent).returns.toEqualTypeOf<M<OfferTemplateContentBody>>();
    expectTypeOf(useSetDefaultTemplate).returns.toEqualTypeOf<M<void>>();
    expectTypeOf(useDeleteOfferTemplate).returns.toEqualTypeOf<UseMutationResult<void, Error, string>>();
  });

  it("gövde tipleri openapi şemalarından türer (DeepScale<TemplateX>)", () => {
    expectTypeOf<OfferTemplateCreateBody>().toEqualTypeOf<DeepScale<Schemas["TemplateCreate"]>>();
    expectTypeOf<OfferTemplateFromOfferBody>().toEqualTypeOf<DeepScale<Schemas["TemplateFromOffer"]>>();
    expectTypeOf<OfferTemplateCopyBody>().toEqualTypeOf<DeepScale<Schemas["TemplateCopy"]>>();
    expectTypeOf<OfferTemplateUpdateBody>().toEqualTypeOf<DeepScale<Schemas["TemplateUpdate"]>>();
    expectTypeOf<OfferTemplateContentBody>().toEqualTypeOf<DeepScale<Schemas["TemplateContentReplace"]>>();
  });

  it("expected_updated_at PATCH ve PUT gövdesinde ZORUNLUDUR (çağıran verir); copy/create'te YOK", () => {
    expectTypeOf<OfferTemplateUpdateBody["expected_updated_at"]>().toEqualTypeOf<string>();
    expectTypeOf<OfferTemplateContentBody["expected_updated_at"]>().toEqualTypeOf<string>();
    expectTypeOf<OfferTemplateCreateBody>().not.toHaveProperty("expected_updated_at");
    // @ts-expect-error — zorunlu alan eksik: derleme hatası (iyimser kilit atlanamaz)
    const missing: OfferTemplateUpdateBody = { name: "x" };
    expect(missing).toBeDefined();
  });
});
