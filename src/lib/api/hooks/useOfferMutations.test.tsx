import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider, type QueryKey } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { backendClient } from "@/lib/api/client";

import { CATALOG_ITEMS_QUERY_KEY } from "./catalog-query-keys";
import {
  offerDetailKey,
  offerListKey,
  offerRevisionKey,
  offerSettingsKey,
  offerTemplateKey,
  offerTemplatesKey,
} from "./offer-query-keys";
import {
  useCreateOffer,
  useCreateOfferGroup,
  useCreateOfferItem,
  useCreateOfferItemsBulk,
  useCreateOfferRevision,
  useDeleteOffer,
  useDeleteOfferGroup,
  useDeleteOfferItem,
  useOfferTransition,
  useUpdateOffer,
  useUpdateOfferGroup,
  useUpdateOfferItem,
  useUpdateOfferRevision,
  useUpdateOfferSettings,
} from "./useOfferMutations";

vi.mock("@/lib/api/client", () => ({
  backendClient: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() },
}));

const OFFER = "of-1";
const OTHER = "of-2";
const REV = 0;

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function ok(data: unknown, status = 200) {
  return { data, error: undefined, response: new Response(null, { status }) } as never;
}

/** Her yazma hook'unun tazelediği/tazelemediği anahtarlar — ADLANDIRILMIŞ, tek tablo. */
const KEYS: Record<string, QueryKey> = {
  listAll: offerListKey({}),
  listDraft: offerListKey({ status: "draft" }),
  detailA: offerDetailKey(OFFER),
  revA0: offerRevisionKey(OFFER, 0),
  revA1: offerRevisionKey(OFFER, 1),
  detailB: offerDetailKey(OTHER),
  revB0: offerRevisionKey(OTHER, 0),
  settings: offerSettingsKey(),
  catalog: [CATALOG_ITEMS_QUERY_KEY],
  // TKL-F4.4: şablon listesi YALNIZ şablonlu oluşturmada tazelenir (usage_count); öteki yazmalarda DOKUNULMAZ.
  templates: offerTemplatesKey(),
  templateDetail: offerTemplateKey("tp-1"),
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

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  prime();
});

// ──────────────────────────────────────────────────────────────────────────────────────────
// 🔴 GEÇERSİZLEME KÜMESİ — her mutasyon için TAM küme kilitli. `win` ayrıca katalog son fiyatını
// (TKL kaynağı kazanılan teklifin maliyet B.F.'sinden doğar) tazeler; BAŞKA hiçbiri tazelemez.
// ──────────────────────────────────────────────────────────────────────────────────────────

const LISTS = ["listAll", "listDraft"];
const CONTENT_WRITE = [...LISTS, "detailA", "revA0"].sort(); // revizyon (rev 0) + detay + listeler

/** Render EDİLMİŞ hook: `act` İÇİNDE `renderHook` çağrılamaz (ilk render act bitince olur). */
interface Rendered {
  result: { current: { mutateAsync: (variables: never) => Promise<unknown> } };
}

interface Case {
  name: string;
  setup: () => void;
  render: () => Rendered;
  variables: unknown;
  expectedInvalidated: string[];
}

const hooks = {
  create: () => renderHook(() => useCreateOffer(), { wrapper }),
  update: () => renderHook(() => useUpdateOffer(OFFER), { wrapper }),
  remove: () => renderHook(() => useDeleteOffer(), { wrapper }),
  revision: () => renderHook(() => useUpdateOfferRevision(OFFER, REV), { wrapper }),
  newRevision: () => renderHook(() => useCreateOfferRevision(), { wrapper }),
  groupCreate: () => renderHook(() => useCreateOfferGroup(OFFER, REV), { wrapper }),
  groupUpdate: () => renderHook(() => useUpdateOfferGroup(OFFER, REV), { wrapper }),
  groupDelete: () => renderHook(() => useDeleteOfferGroup(OFFER, REV), { wrapper }),
  itemCreate: () => renderHook(() => useCreateOfferItem(OFFER, REV), { wrapper }),
  itemBulk: () => renderHook(() => useCreateOfferItemsBulk(OFFER, REV), { wrapper }),
  itemUpdate: () => renderHook(() => useUpdateOfferItem(OFFER, REV), { wrapper }),
  itemDelete: () => renderHook(() => useDeleteOfferItem(OFFER, REV), { wrapper }),
  settings: () => renderHook(() => useUpdateOfferSettings(), { wrapper }),
  transition: (action: "send" | "win" | "lose" | "withdraw") =>
    renderHook(() => useOfferTransition(OFFER, REV, action), { wrapper }),
};


/** `hooks.X()` act DIŞINDA render edilir (ilk render act bitince olur); burada yalnız çağrı act içindedir. */
async function run(hook: Rendered, variables: unknown): Promise<void> {
  await act(async () => {
    await hook.result.current.mutateAsync(variables as never);
  });
}

const CASES: Case[] = [
  {
    name: "teklif oluştur → yalnız listeler",
    setup: () => vi.mocked(backendClient.POST).mockResolvedValue(ok({ id: OFFER }, 201)),
    render: () => hooks.create(),
    variables: { employer_id: "emp-1", title: "A Blok", price_escalation: "fixed" },
    expectedInvalidated: [...LISTS].sort(),
  },
  {
    name: "künye → detay + listeler (revizyon okuması DEĞİL)",
    setup: () => vi.mocked(backendClient.PATCH).mockResolvedValue(ok({ id: OFFER })),
    render: () => hooks.update(),
    variables: { title: "Yeni" },
    expectedInvalidated: [...LISTS, "detailA"].sort(),
  },
  {
    name: "revizyon koşulları → revizyon + detay + listeler",
    setup: () => vi.mocked(backendClient.PATCH).mockResolvedValue(ok({ rev_no: 0 })),
    render: () => hooks.revision(),
    variables: { vat_pct: "10" },
    expectedInvalidated: CONTENT_WRITE,
  },
  {
    name: "grup oluştur",
    setup: () => vi.mocked(backendClient.POST).mockResolvedValue(ok({ id: "g-1" }, 201)),
    render: () => hooks.groupCreate(),
    variables: { name: "Kaba" },
    expectedInvalidated: CONTENT_WRITE,
  },
  {
    name: "grup güncelle",
    setup: () => vi.mocked(backendClient.PATCH).mockResolvedValue(ok({ id: "g-1" })),
    render: () => hooks.groupUpdate(),
    variables: { groupId: "g-1", body: { name: "İnce" } },
    expectedInvalidated: CONTENT_WRITE,
  },
  {
    name: "grup sil",
    setup: () => vi.mocked(backendClient.DELETE).mockResolvedValue(ok(undefined, 204)),
    render: () => hooks.groupDelete(),
    variables: "g-1",
    expectedInvalidated: CONTENT_WRITE,
  },
  {
    name: "kalem oluştur",
    setup: () => vi.mocked(backendClient.POST).mockResolvedValue(ok({ id: "i-1" }, 201)),
    render: () => hooks.itemCreate(),
    variables: { catalog_item_id: "c-1", group_id: "g-1", quantity: "2" },
    expectedInvalidated: CONTENT_WRITE,
  },
  {
    name: "kalem toplu ekle",
    setup: () => vi.mocked(backendClient.POST).mockResolvedValue(ok({ items: [] }, 201)),
    render: () => hooks.itemBulk(),
    variables: {
        items: [{ catalog_item_id: "c-1", group_id: "g-1", quantity: "2" }],
      },
    expectedInvalidated: CONTENT_WRITE,
  },
  {
    name: "kalem güncelle",
    setup: () => vi.mocked(backendClient.PATCH).mockResolvedValue(ok({ id: "i-1" })),
    render: () => hooks.itemUpdate(),
    variables: { itemId: "i-1", body: { quantity: "3" } },
    expectedInvalidated: CONTENT_WRITE,
  },
  {
    name: "kalem sil",
    setup: () => vi.mocked(backendClient.DELETE).mockResolvedValue(ok(undefined, 204)),
    render: () => hooks.itemDelete(),
    variables: "i-1",
    expectedInvalidated: CONTENT_WRITE,
  },
  {
    name: "gönderildi işaretle (send) → katalog TAZELENMEZ",
    setup: () => vi.mocked(backendClient.POST).mockResolvedValue(ok({ id: OFFER })),
    render: () => hooks.transition("send"),
    variables: undefined,
    expectedInvalidated: CONTENT_WRITE,
  },
  {
    name: "kaybedildi (lose) → katalog TAZELENMEZ",
    setup: () => vi.mocked(backendClient.POST).mockResolvedValue(ok({ id: OFFER })),
    render: () => hooks.transition("lose"),
    variables: { lost_reason: "Fiyat" },
    expectedInvalidated: CONTENT_WRITE,
  },
  {
    name: "vazgeçildi (withdraw) → katalog TAZELENMEZ",
    setup: () => vi.mocked(backendClient.POST).mockResolvedValue(ok({ id: OFFER })),
    render: () => hooks.transition("withdraw"),
    variables: undefined,
    expectedInvalidated: CONTENT_WRITE,
  },
  {
    name: "kazanıldı (win) → TKL son fiyat kaynağı: katalog ayrıca TAZELENİR",
    setup: () => vi.mocked(backendClient.POST).mockResolvedValue(ok({ id: OFFER })),
    render: () => hooks.transition("win"),
    variables: undefined,
    expectedInvalidated: [...CONTENT_WRITE, "catalog"].sort(),
  },
  {
    name: "yeni revizyon → detay + TÜM revizyon okumaları (is_latest değişir) + listeler",
    setup: () => vi.mocked(backendClient.POST).mockResolvedValue(ok({ rev_no: 2 }, 201)),
    render: () => hooks.newRevision(),
    variables: { offerId: OFFER },
    expectedInvalidated: [...LISTS, "detailA", "revA0", "revA1"].sort(),
  },
  {
    name: "ayarlar → yalnız ayar anahtarı",
    setup: () => vi.mocked(backendClient.PUT).mockResolvedValue(ok({ updated_at: "x" })),
    render: () => hooks.settings(),
    variables: {
        default_overhead_pct: "12",
        default_profit_pct: "15",
        default_vat_pct: "20",
        default_validity_days: 30,
        default_payment_terms: "30 gün",
      },
    expectedInvalidated: ["settings"],
  },
];

describe("🔴 geçersizleme kümesi (her mutasyon için TAM küme)", () => {
  it.each(CASES)("$name", async ({ setup, render, variables, expectedInvalidated }) => {
    setup();
    const hook = render();
    await act(async () => {
      await hook.result.current.mutateAsync(variables as never);
    });
    expect(invalidated()).toEqual(expectedInvalidated);
  });

  it("yalnız `win` katalog son fiyatını tazeler (dört geçişin kümesi)", async () => {
    const tazeleyenler: string[] = [];
    for (const action of ["send", "win", "lose", "withdraw"] as const) {
      client.clear();
      prime();
      vi.mocked(backendClient.POST).mockResolvedValue(ok({ id: OFFER }));
      const hook = hooks.transition(action);
      await act(async () => {
        await hook.result.current.mutateAsync(undefined);
      });
      if (invalidated().includes("catalog")) tazeleyenler.push(action);
    }
    expect(tazeleyenler).toEqual(["win"]);
  });

  it("taslak sil → listeler tazelenir, silinen teklifin detay/revizyon sorguları ÇIKARILIR, diğer teklif dokunulmaz", async () => {
    vi.mocked(backendClient.DELETE).mockResolvedValue(ok(undefined, 204));
    await run(hooks.remove(), OFFER);
    expect(invalidated()).toEqual([...LISTS].sort());
    const cache = client.getQueryCache();
    expect(cache.find({ queryKey: KEYS.detailA, exact: true })).toBeUndefined();
    expect(cache.find({ queryKey: KEYS.revA0, exact: true })).toBeUndefined();
    expect(cache.find({ queryKey: KEYS.revA1, exact: true })).toBeUndefined();
    expect(cache.find({ queryKey: KEYS.detailB, exact: true })).toBeDefined();
    expect(cache.find({ queryKey: KEYS.revB0, exact: true })).toBeDefined();
  });

  it("başka teklifin sorguları HİÇBİR yazmada tazelenmez", async () => {
    vi.mocked(backendClient.PATCH).mockResolvedValue(ok({ id: "i-1" }));
    await run(hooks.itemUpdate(), { itemId: "i-1", body: { quantity: "3" } });
    expect(invalidated()).not.toContain("detailB");
    expect(invalidated()).not.toContain("revB0");
  });
});

// ──────────────────────────────────────────────────────────────────────────────────────────
// Uç + gövde: hook gövdeyi OLDUĞU GİBİ taşır (dönüştürme yapmaz).
// ──────────────────────────────────────────────────────────────────────────────────────────

describe("uç yolları ve gövdeler", () => {
  it("POST /offers — gövde aynen", async () => {
    vi.mocked(backendClient.POST).mockResolvedValue(ok({ id: OFFER }, 201));
    const body = { employer_id: "emp-1", title: "A Blok", validity_days: 30, price_escalation: "fixed" as const };
    await run(hooks.create(), body);
    expect(backendClient.POST).toHaveBeenCalledWith("/offers", { body });
  });

  it("PATCH /offers/{id} — künye", async () => {
    vi.mocked(backendClient.PATCH).mockResolvedValue(ok({ id: OFFER }));
    await run(hooks.update(), { scope_summary: null });
    expect(backendClient.PATCH).toHaveBeenCalledWith("/offers/{offer_id}", {
      params: { path: { offer_id: OFFER } },
      body: { scope_summary: null },
    });
  });

  it("PATCH …/revisions/{rev} — koşullar", async () => {
    vi.mocked(backendClient.PATCH).mockResolvedValue(ok({ rev_no: 0 }));
    await run(hooks.revision(), { price_escalation: "tuik", price_index_type: "ufe" });
    expect(backendClient.PATCH).toHaveBeenCalledWith("/offers/{offer_id}/revisions/{rev_no}", {
      params: { path: { offer_id: OFFER, rev_no: REV } },
      body: { price_escalation: "tuik", price_index_type: "ufe" },
    });
  });

  it("POST …/revisions — yeni revizyon (gövdesiz)", async () => {
    vi.mocked(backendClient.POST).mockResolvedValue(ok({ rev_no: 1 }, 201));
    await run(hooks.newRevision(), { offerId: OFFER });
    expect(backendClient.POST).toHaveBeenCalledWith("/offers/{offer_id}/revisions", {
      params: { path: { offer_id: OFFER } },
    });
  });

  it("yeni revizyon: teklif kimliği ÇAĞRI ANINDA — aynı hook iki teklife ardışık, her biri kendi anahtarını tazeler", async () => {
    vi.mocked(backendClient.POST).mockResolvedValue(ok({ rev_no: 1 }, 201));
    const hook = hooks.newRevision();
    await run(hook, { offerId: OFFER });
    expect(invalidated()).toEqual(expect.arrayContaining(["detailA", "revA0", "revA1"]));
    expect(invalidated()).not.toContain("detailB");
    client.clear();
    prime();
    await run(hook, { offerId: OTHER });
    expect(vi.mocked(backendClient.POST).mock.calls).toEqual([
      ["/offers/{offer_id}/revisions", { params: { path: { offer_id: OFFER } } }],
      ["/offers/{offer_id}/revisions", { params: { path: { offer_id: OTHER } } }],
    ]);
    expect(invalidated()).toEqual(expect.arrayContaining(["detailB", "revB0"]));
    expect(invalidated()).not.toContain("detailA");
  });

  it("POST …/{send|win|withdraw} gövdesiz; lose gövdesi aynen, gövdesiz lose gövde GÖNDERMEZ", async () => {
    vi.mocked(backendClient.POST).mockResolvedValue(ok({ id: OFFER }));
    await run(hooks.transition("send"), undefined);
    await run(hooks.transition("win"), undefined);
    await run(hooks.transition("withdraw"), undefined);
    await run(hooks.transition("lose"), { lost_reason: "Fiyat", winning_amount: "1200000.00" });
    await run(hooks.transition("lose"), undefined);
    const path = { params: { path: { offer_id: OFFER, rev_no: REV } } };
    expect(vi.mocked(backendClient.POST).mock.calls).toEqual([
      ["/offers/{offer_id}/revisions/{rev_no}/send", path],
      ["/offers/{offer_id}/revisions/{rev_no}/win", path],
      ["/offers/{offer_id}/revisions/{rev_no}/withdraw", path],
      ["/offers/{offer_id}/revisions/{rev_no}/lose", { ...path, body: { lost_reason: "Fiyat", winning_amount: "1200000.00" } }],
      ["/offers/{offer_id}/revisions/{rev_no}/lose", path],
    ]);
  });

  it("grup POST/PATCH/DELETE yolları", async () => {
    vi.mocked(backendClient.POST).mockResolvedValue(ok({ id: "g-1" }, 201));
    vi.mocked(backendClient.PATCH).mockResolvedValue(ok({ id: "g-1" }));
    vi.mocked(backendClient.DELETE).mockResolvedValue(ok(undefined, 204));
    await run(hooks.groupCreate(), { name: "Yeni grup" });
    await run(hooks.groupUpdate(), { groupId: "g-1", body: { name: "B" } });
    await run(hooks.groupDelete(), "g-1");
    expect(backendClient.POST).toHaveBeenCalledWith("/offers/{offer_id}/revisions/{rev_no}/groups", {
      params: { path: { offer_id: OFFER, rev_no: REV } },
      body: { name: "Yeni grup" },
    });
    expect(backendClient.PATCH).toHaveBeenCalledWith("/offers/{offer_id}/revisions/{rev_no}/groups/{group_id}", {
      params: { path: { offer_id: OFFER, rev_no: REV, group_id: "g-1" } },
      body: { name: "B" },
    });
    expect(backendClient.DELETE).toHaveBeenCalledWith("/offers/{offer_id}/revisions/{rev_no}/groups/{group_id}", {
      params: { path: { offer_id: OFFER, rev_no: REV, group_id: "g-1" } },
    });
  });

  it("kalem POST / bulk / PATCH / DELETE yolları; PATCH'te açık null AYNEN gider (temizleme)", async () => {
    vi.mocked(backendClient.POST).mockResolvedValue(ok({ id: "i-1" }, 201));
    vi.mocked(backendClient.PATCH).mockResolvedValue(ok({ id: "i-1" }));
    vi.mocked(backendClient.DELETE).mockResolvedValue(ok(undefined, 204));
    const created = { catalog_item_id: "c-1", group_id: "g-1", quantity: "2" };
    await run(hooks.itemCreate(), created);
    await run(hooks.itemBulk(), { items: [created] });
    await run(hooks.itemUpdate(), {
        itemId: "i-1",
        body: { profit_pct: "10", offer_unit_price: null },
      });
    await run(hooks.itemDelete(), "i-1");
    const path = { offer_id: OFFER, rev_no: REV };
    expect(backendClient.POST).toHaveBeenCalledWith("/offers/{offer_id}/revisions/{rev_no}/items", {
      params: { path },
      body: created,
    });
    expect(backendClient.POST).toHaveBeenCalledWith("/offers/{offer_id}/revisions/{rev_no}/items/bulk", {
      params: { path },
      body: { items: [created] },
    });
    expect(backendClient.PATCH).toHaveBeenCalledWith("/offers/{offer_id}/revisions/{rev_no}/items/{item_id}", {
      params: { path: { ...path, item_id: "i-1" } },
      body: { profit_pct: "10", offer_unit_price: null },
    });
    expect(backendClient.DELETE).toHaveBeenCalledWith("/offers/{offer_id}/revisions/{rev_no}/items/{item_id}", {
      params: { path: { ...path, item_id: "i-1" } },
    });
  });

  it("kalem create: `cost_unit_price` ALAN YOK / açık null / değer — gövdeye OLDUĞU GİBİ ulaşır", async () => {
    vi.mocked(backendClient.POST).mockResolvedValue(ok({ id: "i-1" }, 201));
    const base = { catalog_item_id: "c-1", group_id: "g-1", quantity: "2" };
    const { result } = renderHook(() => useCreateOfferItem(OFFER, REV), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(base);
      await result.current.mutateAsync({ ...base, cost_unit_price: null });
      await result.current.mutateAsync({ ...base, cost_unit_price: "77.50" });
    });
    const bodies = vi.mocked(backendClient.POST).mock.calls.map(
      (call) => (call[1] as unknown as { body: Record<string, unknown> }).body,
    );
    expect(Object.hasOwn(bodies[0], "cost_unit_price")).toBe(false);
    expect(Object.hasOwn(bodies[1], "cost_unit_price")).toBe(true);
    expect(bodies[1].cost_unit_price).toBeNull();
    expect(bodies[2].cost_unit_price).toBe("77.50");
  });

  it("PUT /offers/settings — tam gövde", async () => {
    vi.mocked(backendClient.PUT).mockResolvedValue(ok({ updated_at: "x" }));
    const body = {
      default_overhead_pct: "12",
      default_profit_pct: "15",
      default_vat_pct: "20",
      default_validity_days: 30,
      default_payment_terms: "30 gün",
    };
    await run(hooks.settings(), body);
    expect(backendClient.PUT).toHaveBeenCalledWith("/offers/settings", { body });
  });

  it("DELETE /offers/{id}", async () => {
    vi.mocked(backendClient.DELETE).mockResolvedValue(ok(undefined, 204));
    await run(hooks.remove(), OFFER);
    expect(backendClient.DELETE).toHaveBeenCalledWith("/offers/{offer_id}", {
      params: { path: { offer_id: OFFER } },
    });
  });

  it("backend hatası (409) BackendError olarak yüzer ve HİÇBİR sorgu tazelenmez", async () => {
    vi.mocked(backendClient.POST).mockResolvedValue({
      data: undefined,
      error: { detail: "Revizyon taslak değil" },
      response: new Response(null, { status: 409 }),
    } as never);
    const { result } = hooks.transition("send");
    act(() => result.current.mutate(undefined));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ status: 409, body: { detail: "Revizyon taslak değil" } });
    expect(invalidated()).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────────────────────────────────────
// TKL-F4.4 · `useCreateOffer` + şablon: `usage_count` (şablon listesi) YALNIZ gövdede `template_id` varken tazelenir.
// ──────────────────────────────────────────────────────────────────────────────────────────

describe("useCreateOffer — şablon kullanım sayacı (usage_count)", () => {
  const BASE = { employer_id: "emp-1", title: "A Blok", price_escalation: "fixed" as const };

  it("template_id VAR → listeler + şablon LİSTESİ tazelenir (§2.1: yalnız liste; şablon detayı önbelleği dokunulmaz)", async () => {
    vi.mocked(backendClient.POST).mockResolvedValue(ok({ id: OFFER }, 201));
    await run(hooks.create(), { ...BASE, template_id: "tp-1" });
    expect(invalidated()).toEqual([...LISTS, "templates"].sort());
  });

  it("template_id YOK → şablon listesi DOKUNULMAZ (yalnız teklif listeleri)", async () => {
    vi.mocked(backendClient.POST).mockResolvedValue(ok({ id: OFFER }, 201));
    await run(hooks.create(), BASE);
    expect(invalidated()).toEqual([...LISTS].sort());
  });

  it("açık template_id: null (kaynak yok) → şablon listesi DOKUNULMAZ", async () => {
    vi.mocked(backendClient.POST).mockResolvedValue(ok({ id: OFFER }, 201));
    await run(hooks.create(), { ...BASE, template_id: null });
    expect(invalidated()).toEqual([...LISTS].sort());
  });

  it("copy_from (kopyadan) → şablon listesi DOKUNULMAZ (template_id miras alınmaz, SO-23)", async () => {
    vi.mocked(backendClient.POST).mockResolvedValue(ok({ id: OFFER }, 201));
    await run(hooks.create(), { copy_from: { offer_id: "of-9", rev_no: 1 }, price_escalation: "fixed" });
    expect(invalidated()).toEqual([...LISTS].sort());
  });

  it("gövde AYNEN yollanır (template_id dahil)", async () => {
    vi.mocked(backendClient.POST).mockResolvedValue(ok({ id: OFFER }, 201));
    await run(hooks.create(), { ...BASE, template_id: "tp-1" });
    expect(backendClient.POST).toHaveBeenCalledWith("/offers", { body: { ...BASE, template_id: "tp-1" } });
  });
});
