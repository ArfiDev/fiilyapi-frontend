import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { backendClient } from "@/lib/api/client";
import { offerTemplateKey } from "@/lib/api/hooks/offer-query-keys";
import { useOfferTemplate, useOfferTemplates, type OfferTemplateDetail } from "@/lib/api/hooks/useOfferTemplates";

import { addGroup, editRemoveItem, editRenameGroup } from "./template-content";
import { makeTemplateDetail, makeTemplateGroup } from "./template-fixtures";
import { useTemplateContentEditor } from "./useTemplateContentEditor";

vi.mock("@/lib/api/client", () => ({
  backendClient: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() },
}));

const ID = "tpl-1";
const STALE = "Şablon başka biri tarafından değiştirildi; sayfayı yenileyin";
let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function ok(data: unknown) {
  return { data, error: undefined, response: new Response(null, { status: 200 }) } as never;
}
function fail(status: number, detail: string) {
  return { data: undefined, error: { detail }, response: new Response(null, { status }) } as never;
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const DETAIL0 = makeTemplateDetail({ id: ID, updated_at: "T0", groups: [makeTemplateGroup("Betonarme", ["c1", "c2", "c3", "c4"])] });

/** Sunucu benzetimi: PUT gövdesinden yeni detay üretir, updated_at'i ilerletir. */
function serverDetail(body: { groups: { name: string; items?: { catalog_item_id: string }[] }[] }, stamp: string): OfferTemplateDetail {
  return makeTemplateDetail({
    id: ID,
    updated_at: stamp,
    groups: body.groups.map((g) => makeTemplateGroup(g.name, (g.items ?? []).map((i) => i.catalog_item_id))),
  });
}

function putBody(call: number): { groups: { name: string; items: { catalog_item_id: string }[] }[]; expected_updated_at: string } {
  const args = vi.mocked(backendClient.PUT).mock.calls[call]?.[1] as { body: never } | undefined;
  return args?.body as never;
}
function patchBody(call: number): Record<string, unknown> {
  const args = vi.mocked(backendClient.PATCH).mock.calls[call]?.[1] as { body: never } | undefined;
  return args?.body as never;
}

function renderEditor() {
  client.setQueryData(offerTemplateKey(ID), DETAIL0);
  return renderHook(
    () => ({
      editor: useTemplateContentEditor(ID),
      // Gözlemciler: 409'da "tazelenir" iddiası GET ile ölçülür.
      detail: useOfferTemplate(ID),
      list: useOfferTemplates(),
    }),
    { wrapper },
  );
}

function getCalls(path: string): number {
  return vi.mocked(backendClient.GET).mock.calls.filter((call) => String(call[0]) === path).length;
}

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
  vi.mocked(backendClient.GET).mockImplementation((async (path: string) => {
    if (path === "/offers/templates") return ok({ items: [], total: 0 });
    return ok(DETAIL0);
  }) as never);
});

describe("tek uçuş + sıra (bayat taban = veri kaybı)", () => {
  it("iki hızlı işlem: ikinci PUT birinci YANITIN grupları + updated_at'ini taşır; birincisi bitmeden ikinci gitmez", async () => {
    const first = deferred<unknown>();
    vi.mocked(backendClient.PUT)
      .mockImplementationOnce((() => first.promise) as never)
      .mockImplementationOnce((async (_path: string, init: { body: never }) => ok(serverDetail(init.body, "T2"))) as never);
    const { result } = renderEditor();
    await waitFor(() => expect(result.current.detail.data).toBeDefined());

    let p1!: Promise<void>;
    let p2!: Promise<void>;
    act(() => {
      p1 = result.current.editor.edit(editRemoveItem("Betonarme", "c1"));
      p2 = result.current.editor.edit(editRemoveItem("Betonarme", "c4"));
    });
    await waitFor(() => expect(backendClient.PUT).toHaveBeenCalledTimes(1));
    expect(putBody(0).expected_updated_at).toBe("T0");
    expect(putBody(0).groups[0]?.items.map((i) => i.catalog_item_id)).toEqual(["c2", "c3", "c4"]);

    // Birinci uçuştayken ikinci GİTMEZ.
    await new Promise((r) => setTimeout(r, 20));
    expect(backendClient.PUT).toHaveBeenCalledTimes(1);

    await act(async () => {
      first.resolve(ok(serverDetail(putBody(0), "T1")));
      await Promise.all([p1, p2]);
    });
    expect(backendClient.PUT).toHaveBeenCalledTimes(2);
    expect(putBody(1).expected_updated_at).toBe("T1");
    expect(putBody(1).groups[0]?.items.map((i) => i.catalog_item_id)).toEqual(["c2", "c3"]);
    expect(client.getQueryData<OfferTemplateDetail>(offerTemplateKey(ID))?.updated_at).toBe("T2");
  });

  it("ad PATCH'i de AYNI sıradan geçer: bekleyen PUT'un yanıtındaki updated_at'i taşır (ayrı yol bayat gönderirdi)", async () => {
    const first = deferred<unknown>();
    vi.mocked(backendClient.PUT).mockImplementationOnce((() => first.promise) as never);
    vi.mocked(backendClient.PATCH).mockImplementationOnce((async () => ok(makeTemplateDetail({ id: ID, name: "Yeni ad", updated_at: "T2" }))) as never);
    const { result } = renderEditor();
    await waitFor(() => expect(result.current.detail.data).toBeDefined());

    let p1!: Promise<void>;
    let p2!: Promise<void>;
    act(() => {
      p1 = result.current.editor.edit(addGroup("Cephe"));
      p2 = result.current.editor.patch({ name: "Yeni ad" });
    });
    await waitFor(() => expect(backendClient.PUT).toHaveBeenCalledTimes(1));
    expect(backendClient.PATCH).not.toHaveBeenCalled();

    await act(async () => {
      first.resolve(ok(serverDetail(putBody(0), "T1")));
      await Promise.all([p1, p2]);
    });
    expect(patchBody(0)).toEqual({ name: "Yeni ad", expected_updated_at: "T1" });
  });

  it("PATCH'ten sonraki içerik işlemi PATCH yanıtının updated_at'ini taşır", async () => {
    vi.mocked(backendClient.PATCH).mockImplementationOnce((async () => ok(makeTemplateDetail({ id: ID, updated_at: "T1", groups: DETAIL0.groups }))) as never);
    vi.mocked(backendClient.PUT).mockImplementationOnce((async (_p: string, init: { body: never }) => ok(serverDetail(init.body, "T2"))) as never);
    const { result } = renderEditor();
    await waitFor(() => expect(result.current.detail.data).toBeDefined());
    await act(async () => {
      await Promise.all([result.current.editor.patch({ name: "X" }), result.current.editor.edit(addGroup("Cephe"))]);
    });
    expect(putBody(0).expected_updated_at).toBe("T1");
  });
});

describe("409 bayat şablon", () => {
  it("bant metni aynen, detay + liste TAZELENİR, kuyruktaki bayat işlemler GÖNDERİLMEZ", async () => {
    const first = deferred<unknown>();
    vi.mocked(backendClient.PUT).mockImplementationOnce((() => first.promise) as never);
    const { result } = renderEditor();
    await waitFor(() => expect(result.current.detail.data).toBeDefined());
    await waitFor(() => expect(result.current.list.data).toBeDefined());
    const detailGets = getCalls("/offers/templates/{template_id}");
    const listGets = getCalls("/offers/templates");

    let p1!: Promise<void>;
    let p2!: Promise<void>;
    act(() => {
      p1 = result.current.editor.edit(addGroup("Cephe"));
      p2 = result.current.editor.edit(addGroup("Tesisat"));
    });
    await waitFor(() => expect(backendClient.PUT).toHaveBeenCalledTimes(1));
    await act(async () => {
      first.resolve(fail(409, STALE));
      await Promise.all([p1, p2]);
    });

    expect(backendClient.PUT).toHaveBeenCalledTimes(1);
    expect(result.current.editor.error).toBe(STALE);
    await waitFor(() => expect(getCalls("/offers/templates/{template_id}")).toBe(detailGets + 1));
    expect(getCalls("/offers/templates")).toBe(listGets + 1);
  });

  it("409'dan SONRA yeni gelen işlem normal çalışır (kuyruk kalıcı kilitlenmez)", async () => {
    vi.mocked(backendClient.PUT)
      .mockImplementationOnce((async () => fail(409, STALE)) as never)
      .mockImplementationOnce((async (_p: string, init: { body: never }) => ok(serverDetail(init.body, "T9"))) as never);
    const { result } = renderEditor();
    await waitFor(() => expect(result.current.detail.data).toBeDefined());
    await act(async () => {
      await result.current.editor.edit(addGroup("Cephe"));
    });
    await act(async () => {
      await result.current.editor.edit(addGroup("Tesisat"));
    });
    expect(backendClient.PUT).toHaveBeenCalledTimes(2);
  });
});

describe("diğer hatalar ve istemci reddi", () => {
  it("500: backend metni bantta, önbellek yeniden okunur", async () => {
    vi.mocked(backendClient.PUT).mockImplementationOnce((async () => fail(404, "Katalog iş tipi bulunamadı")) as never);
    const { result } = renderEditor();
    await waitFor(() => expect(result.current.detail.data).toBeDefined());
    const before = getCalls("/offers/templates/{template_id}");
    await act(async () => {
      await result.current.editor.edit(addGroup("Cephe"));
    });
    expect(result.current.editor.error).toBe("Katalog iş tipi bulunamadı");
    await waitFor(() => expect(getCalls("/offers/templates/{template_id}")).toBe(before + 1));
  });

  it("aynı ad: istek ATILMAZ, bant 'Bu adla grup var'", async () => {
    const { result } = renderEditor();
    await waitFor(() => expect(result.current.detail.data).toBeDefined());
    await act(async () => {
      await result.current.editor.edit(addGroup("Betonarme"));
    });
    expect(backendClient.PUT).not.toHaveBeenCalled();
    expect(result.current.editor.error).toBe("Bu adla grup var");
  });

  it("değişiklik yoksa (kendi adına yeniden adlandırma) istek ATILMAZ", async () => {
    const { result } = renderEditor();
    await waitFor(() => expect(result.current.detail.data).toBeDefined());
    await act(async () => {
      await result.current.editor.edit(editRenameGroup("Betonarme", "Betonarme"));
    });
    expect(backendClient.PUT).not.toHaveBeenCalled();
    expect(result.current.editor.error).toBeNull();
  });

  it("yeni işlem başlayınca eski bant temizlenir", async () => {
    vi.mocked(backendClient.PUT).mockImplementationOnce((async (_p: string, init: { body: never }) => ok(serverDetail(init.body, "T1"))) as never);
    const { result } = renderEditor();
    await waitFor(() => expect(result.current.detail.data).toBeDefined());
    await act(async () => {
      await result.current.editor.edit(addGroup("Betonarme"));
    });
    expect(result.current.editor.error).toBe("Bu adla grup var");
    await act(async () => {
      await result.current.editor.edit(addGroup("Cephe"));
    });
    expect(result.current.editor.error).toBeNull();
  });
});
