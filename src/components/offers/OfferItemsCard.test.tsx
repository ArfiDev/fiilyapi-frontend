import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { backendClient } from "@/lib/api/client";
import { useOfferRevision } from "@/lib/api/hooks/useOffers";
import type { OfferItemRead, OfferRevisionRead } from "@/lib/api/hooks/useOffers";
import { D_DUV, D_KAB, LAST_SZL } from "@/components/work-item-catalog/work-item-fixtures";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";

import { OFFER_ID } from "./offer-detail-fixtures";
import {
  BETON,
  DEMIR,
  SIVA,
  makeGroup,
  makeItem,
  makeManualItem,
  makeRevisionWithItems,
  makeUnpricedItem,
} from "./offer-item-fixtures";
import { OfferItemsCard } from "./OfferItemsCard";

const scope = vi.hoisted(() => ({ value: { isRestricted: false, names: [] as string[] } }));
vi.mock("@/lib/api/client", () => ({
  backendClient: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() },
}));
vi.mock("@/lib/auth/useDisciplineScope", () => ({ useDisciplineScope: () => scope.value }));
const tabs = vi.hoisted(() => ({ dispatch: vi.fn() }));
vi.mock("@/lib/workspace-tabs/tabs-store", () => ({ workspaceTabsStore: { dispatch: tabs.dispatch } }));

const REV_NO = 2;
const ITEM_PATH = "/offers/{offer_id}/revisions/{rev_no}/items/{item_id}";
const BULK_PATH = "/offers/{offer_id}/revisions/{rev_no}/items/bulk";
const GROUPS_PATH = "/offers/{offer_id}/revisions/{rev_no}/groups";
const GROUP_PATH = "/offers/{offer_id}/revisions/{rev_no}/groups/{group_id}";
const REVISION_PATH = "/offers/{offer_id}/revisions/{rev_no}";

let revision: OfferRevisionRead;
let queryClient: QueryClient;

const ok = (data: unknown, status = 200) => ({ data, error: undefined, response: new Response(null, { status }) }) as never;
const fail = (status: number, detail: string) =>
  ({ data: undefined, error: { detail }, response: new Response(null, { status }) }) as never;

/** Sahte backend: PATCH gövdesini kalemin alanlarına uygular (hesaplı alanlar test fikstüründe sabit). */
function applyPatch(itemId: string, body: Record<string, unknown>): OfferItemRead {
  const fields: Record<string, string> = {
    quantity: "quantity",
    unit_mhr: "unit_mhr",
    cost_unit_price: "cost_unit_price",
    overhead_pct: "overhead_pct",
    profit_pct: "profit_pct",
    offer_unit_price: "offer_unit_price",
  };
  let updated: OfferItemRead | undefined;
  revision = {
    ...revision,
    groups: revision.groups.map((group) => ({
      ...group,
      items: group.items.map((item) => {
        if (item.id !== itemId) return item;
        const patch = Object.fromEntries(Object.entries(body).filter(([key]) => key in fields));
        const next: OfferItemRead = { ...item, ...patch, priced: (patch.cost_unit_price ?? item.cost_unit_price) !== null };
        updated = next;
        return next;
      }),
    })),
  };
  return updated as OfferItemRead;
}

function mockBackend() {
  vi.mocked(backendClient.GET).mockImplementation((async (path: string) => {
    if (path === REVISION_PATH) return ok(revision);
    if (path === "/catalog/disciplines") return ok({ items: [D_KAB, D_DUV] });
    if (path === "/catalog/items") return ok({ items: [BETON, DEMIR, SIVA, LAST_SZL] });
    throw new Error(`beklenmeyen GET ${path}`);
  }) as never);
  vi.mocked(backendClient.PATCH).mockImplementation((async (path: string, init: { params: { path: { item_id?: string; group_id?: string } }; body: Record<string, unknown> }) => {
    if (path === ITEM_PATH) return ok(applyPatch(init.params.path.item_id as string, init.body));
    if (path === GROUP_PATH) return ok({ id: init.params.path.group_id, name: init.body.name, sort_order: 0 });
    throw new Error(`beklenmeyen PATCH ${path}`);
  }) as never);
  vi.mocked(backendClient.DELETE).mockResolvedValue(ok(undefined, 204));
  vi.mocked(backendClient.POST).mockImplementation((async (path: string) => {
    if (path === GROUPS_PATH) return ok({ id: "g-yeni", name: "Yeni grup", sort_order: 5 }, 201);
    if (path === BULK_PATH) return ok({ items: [] }, 201);
    throw new Error(`beklenmeyen POST ${path}`);
  }) as never);
}

function Harness({ canEdit = true }: { canEdit?: boolean }) {
  const query = useOfferRevision(OFFER_ID, REV_NO);
  if (query.data === undefined) return null;
  return <OfferItemsCard offerId={OFFER_ID} revNo={REV_NO} revision={query.data} canEdit={canEdit} />;
}

async function renderCard(canEdit = true) {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <Harness canEdit={canEdit} />
    </QueryClientProvider>,
  );
  await screen.findByRole("heading", { name: "Teklif kalemleri" });
}

const rowOf = (itemId: string) => screen.getByTestId(`oit-row-${itemId}`);
const cell = (itemId: string, label: string) => within(rowOf(itemId)).getByLabelText(new RegExp(`^[^ ]+ ${label}$`));
const calls = (method: "GET" | "PATCH" | "POST" | "DELETE", path: string) =>
  vi.mocked(backendClient[method]).mock.calls.filter((call) => String(call[0]) === path);
const bodyOf = (call: unknown[] | undefined) => (call?.[1] as { body?: Record<string, unknown> } | undefined)?.body;
const pathOf = (call: unknown[] | undefined) => (call?.[1] as { params?: { path?: Record<string, unknown> } } | undefined)?.params?.path;

/** Alana yaz + odağı bırak (blur = kayıt). */
async function typeAndBlur(input: HTMLElement, text: string) {
  await userEvent.clear(input);
  if (text !== "") await userEvent.type(input, text);
  await userEvent.tab();
}

beforeEach(() => {
  vi.clearAllMocks();
  scope.value = { isRestricted: false, names: [] };
  revision = makeRevisionWithItems();
  mockBackend();
});

describe("görünüm (TD:209-274)", () => {
  it("başlık sayaçları, fiyatsız uyarısı, grup başlıkları (kod harfi · ad · n kalem), boş grup metni, lejant", async () => {
    await renderCard();
    expect(screen.getByText("2 kalem · 2 grup")).toBeInTheDocument();
    expect(screen.getByText("1 kalemde fiyat girilmedi")).toBeInTheDocument();
    const group = screen.getByTestId("oit-group-g-a");
    expect(within(group).getByText("A")).toBeInTheDocument();
    expect(within(group).getByText("KABA İNŞAAT")).toBeInTheDocument();
    expect(within(group).getByText("2 kalem")).toBeInTheDocument();
    expect(within(screen.getByTestId("oit-group-g-b")).getByText("B")).toBeInTheDocument();
    expect(screen.getByText(/Bu grupta henüz kalem yok/)).toBeInTheDocument();
    expect(screen.getByText("genel oran")).toBeInTheDocument();
    expect(screen.getByText("kalemde elle değiştirildi")).toBeInTheDocument();
  });

  it("satır hücreleri sunucudan: miktar · A-s · maliyet · gider · kâr · teklif B.F. · tutar", async () => {
    await renderCard();
    expect(cell("it-1", "miktar")).toHaveValue("10");
    expect(cell("it-1", "a-s / birim")).toHaveValue("1,80");
    expect(cell("it-1", "maliyet B\\.F\\.")).toHaveValue("100,00");
    expect(cell("it-1", "gider %")).toHaveValue("12");
    expect(cell("it-1", "kâr %")).toHaveValue("15");
    expect(cell("it-1", "teklif B\\.F\\.")).toHaveValue("128,80");
    expect(within(rowOf("it-1")).getByText("₺1.288,00")).toBeInTheDocument();
    expect(within(rowOf("it-1")).getByText("hesaplanan")).toBeInTheDocument();
  });

  it("grup Σ kayıpsız: a-s · maliyet · tutar (fiyatsız kalem maliyet/tutara girmez, a-s'ye girer)", async () => {
    await renderCard();
    const group = screen.getByTestId("oit-group-g-a");
    expect(within(group).getByText("41,00 a-s")).toBeInTheDocument();
    expect(within(group).getByText("maliyet ₺1.000,00")).toBeInTheDocument();
    expect(within(group).getByText("₺1.288,00")).toBeInTheDocument();
  });

  it("katalog birleşimi: maliyet altında 'Ref ₺… · Son ₺…'; son fiyat varsa o; katalogda olmayan kalemde satır YOK", async () => {
    revision = makeRevisionWithItems([
      makeGroup("g-a", "A", 0, [
        makeItem({ id: "it-1" }),
        makeItem({ id: "it-2", catalog_item_id: LAST_SZL.id, poz_no: LAST_SZL.poz_no, sort_order: 1 }),
        makeItem({ id: "it-3", catalog_item_id: "katalogda-yok", poz_no: "ESKI-1", sort_order: 2 }),
      ]),
    ]);
    await renderCard();
    await within(rowOf("it-1")).findByText("Ref ₺1.250,50");
    expect(within(rowOf("it-1")).getByText("Son —")).toBeInTheDocument();
    expect(within(rowOf("it-2")).getByText("Ref ₺3.350,00")).toBeInTheDocument();
    expect(within(rowOf("it-2")).getByText("Son ₺3.410,00")).toBeInTheDocument();
    expect(within(rowOf("it-3")).queryByText(/^Ref /)).not.toBeInTheDocument();
  });

  it("fiyatsız satır: sarı + uyarı; teklif B.F. KAPALI + 'önce maliyet girin' (SO-4)", async () => {
    await renderCard();
    const row = rowOf("it-2");
    expect(row).toHaveClass("oit-row--missing");
    expect(within(row).getByText("Fiyat girilmedi · tutara dahil değil")).toBeInTheDocument();
    expect(cell("it-2", "teklif B\\.F\\.")).toBeDisabled();
    expect(within(row).getByText("önce maliyet girin")).toBeInTheDocument();
    expect(cell("it-2", "maliyet B\\.F\\.")).toBeEnabled();
  });

  it("A-s katalogdan farklıysa '↺ kat. x' çıkar; aynıysa çıkmaz; kâr/elle B.F. varsa '↺ genel' ve 'elle · kâr %x'", async () => {
    revision = makeRevisionWithItems([
      makeGroup("g-a", "A", 0, [
        makeItem({ id: "it-1" }),
        makeItem({ id: "it-2", unit_mhr: "2.5000", sort_order: 1 }),
        makeManualItem({ id: "it-3", sort_order: 2 }),
      ]),
    ]);
    await renderCard();
    await within(rowOf("it-2")).findByRole("button", { name: /kat\. 1,80/ });
    expect(within(rowOf("it-1")).queryByRole("button", { name: /kat\./ })).not.toBeInTheDocument();
    expect(cell("it-3", "kâr %")).toHaveValue("33,93");
    expect(within(rowOf("it-3")).getByRole("button", { name: /^genel$/ })).toBeInTheDocument();
    expect(within(rowOf("it-3")).getByText("elle · kâr %33,93")).toBeInTheDocument();
    expect(within(rowOf("it-1")).queryByRole("button", { name: /^genel$/ })).not.toBeInTheDocument();
  });

  it("B5 ileri uyum: miktarı null kalem — miktar kutusu boş, tutar '—', çökmez", async () => {
    revision = makeRevisionWithItems([
      makeGroup("g-a", "A", 0, [makeItem({ id: "it-1", quantity: null, customer: { unit_price: "128.80", amount: null } })]),
    ]);
    await renderCard();
    expect(cell("it-1", "miktar")).toHaveValue("");
    expect(within(rowOf("it-1")).getByTestId("oit-amount")).toHaveTextContent("—");
  });

  it("canEdit=false: tüm hücreler ve düğmeler kapalı; silme/grup düğmesi yok", async () => {
    await renderCard(false);
    expect(cell("it-1", "miktar")).toBeDisabled();
    expect(cell("it-1", "kâr %")).toBeDisabled();
    expect(screen.getByRole("button", { name: "+ Katalogdan Ekle" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "+ Grup" })).toBeDisabled();
    expect(within(rowOf("it-1")).getByRole("button", { name: /kalemi sil/ })).toBeDisabled();
  });
});

describe("hücre → PATCH (blur; plan §3.2)", () => {
  it("🔴 miktar blur'da {quantity} PATCH'i; yol parametreleri doğru kalem", async () => {
    await renderCard();
    await typeAndBlur(cell("it-1", "miktar"), "25");
    await waitFor(() => expect(calls("PATCH", ITEM_PATH)).toHaveLength(1));
    expect(bodyOf(calls("PATCH", ITEM_PATH)[0])).toEqual({ quantity: "25" });
    expect(pathOf(calls("PATCH", ITEM_PATH)[0])).toEqual({ offer_id: OFFER_ID, rev_no: REV_NO, item_id: "it-1" });
  });

  it("değişmeyen hücre blur'u istek UÇURMAZ; Escape yazımı geri alır", async () => {
    await renderCard();
    await userEvent.click(cell("it-1", "miktar"));
    await userEvent.tab();
    expect(calls("PATCH", ITEM_PATH)).toHaveLength(0);
    await userEvent.type(cell("it-1", "miktar"), "9{Escape}");
    expect(cell("it-1", "miktar")).toHaveValue("10");
    await userEvent.tab();
    expect(calls("PATCH", ITEM_PATH)).toHaveLength(0);
  });

  it("🔴 geçersiz değer istek UÇURMAZ, sebep hücre altında; hücre sunucu değerine döner", async () => {
    await renderCard();
    await typeAndBlur(cell("it-1", "miktar"), "0");
    expect(await within(rowOf("it-1")).findByText("Miktar 0'dan büyük olmalı")).toBeInTheDocument();
    expect(calls("PATCH", ITEM_PATH)).toHaveLength(0);
    expect(cell("it-1", "miktar")).toHaveValue("10");
  });

  it("🔴 kâr yazınca {profit_pct, offer_unit_price: null}; '↺ genel' ikisini null'lar", async () => {
    revision = makeRevisionWithItems([makeGroup("g-a", "A", 0, [makeManualItem({ id: "it-1" })])]);
    await renderCard();
    await typeAndBlur(cell("it-1", "kâr %"), "20");
    await waitFor(() => expect(calls("PATCH", ITEM_PATH)).toHaveLength(1));
    expect(bodyOf(calls("PATCH", ITEM_PATH)[0])).toEqual({ profit_pct: "20", offer_unit_price: null });

    revision = makeRevisionWithItems([makeGroup("g-a", "A", 0, [makeItem({ id: "it-1", profit_pct: "20.00" })])]);
    await act(() => queryClient.invalidateQueries());
    await userEvent.click(await within(rowOf("it-1")).findByRole("button", { name: /^genel$/ }));
    await waitFor(() => expect(calls("PATCH", ITEM_PATH)).toHaveLength(2));
    expect(bodyOf(calls("PATCH", ITEM_PATH)[1])).toEqual({ profit_pct: null, offer_unit_price: null });
  });

  it("'↺ kat.' katalog A-s değerini yazar", async () => {
    revision = makeRevisionWithItems([makeGroup("g-a", "A", 0, [makeItem({ id: "it-1", unit_mhr: "2.5000" })])]);
    await renderCard();
    await userEvent.click(await within(rowOf("it-1")).findByRole("button", { name: /kat\./ }));
    await waitFor(() => expect(calls("PATCH", ITEM_PATH)).toHaveLength(1));
    expect(bodyOf(calls("PATCH", ITEM_PATH)[0])).toEqual({ unit_mhr: "1.8000" });
  });

  it("maliyeti silmek {cost_unit_price: null}; maliyet yazılınca teklif B.F. açılır", async () => {
    await renderCard();
    await typeAndBlur(cell("it-2", "maliyet B\\.F\\."), "250");
    await waitFor(() => expect(calls("PATCH", ITEM_PATH)).toHaveLength(1));
    expect(bodyOf(calls("PATCH", ITEM_PATH)[0])).toEqual({ cost_unit_price: "250" });
    await waitFor(() => expect(cell("it-2", "teklif B\\.F\\.")).toBeEnabled());
    await typeAndBlur(cell("it-1", "maliyet B\\.F\\."), "");
    await waitFor(() => expect(calls("PATCH", ITEM_PATH)).toHaveLength(2));
    expect(bodyOf(calls("PATCH", ITEM_PATH)[1])).toEqual({ cost_unit_price: null });
  });

  it("sunucu hatası (422) metni AYNEN hücre altında basılır, hücre sunucu değerine döner", async () => {
    vi.mocked(backendClient.PATCH).mockResolvedValueOnce(fail(422, "Maliyet boşken elle B.F. verilemez"));
    await renderCard();
    await typeAndBlur(cell("it-1", "teklif B\\.F\\."), "150");
    expect(await within(rowOf("it-1")).findByText("Maliyet boşken elle B.F. verilemez")).toBeInTheDocument();
    expect(cell("it-1", "teklif B\\.F\\.")).toHaveValue("128,80");
  });

  it("409: metin aynen basılır ve revizyon yeniden okunur", async () => {
    vi.mocked(backendClient.PATCH).mockResolvedValueOnce(fail(409, "Revizyon taslak değil; içerik yalnız taslak revizyonda değiştirilebilir."));
    await renderCard();
    const before = calls("GET", REVISION_PATH).length;
    await typeAndBlur(cell("it-1", "miktar"), "5");
    expect(await within(rowOf("it-1")).findByText(/Revizyon taslak değil/)).toBeInTheDocument();
    await waitFor(() => expect(calls("GET", REVISION_PATH).length).toBeGreaterThan(before));
  });
});

describe("satır başına tek uçuş (plan §3.2)", () => {
  function deferredPatch() {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const original = vi.mocked(backendClient.PATCH).getMockImplementation();
    vi.mocked(backendClient.PATCH).mockImplementationOnce((async (...args: unknown[]) => {
      await gate;
      return (original as (...a: unknown[]) => unknown)(...args);
    }) as never);
    return release;
  }

  it("🔴 aynı satırda ikinci blur SIRAYA girer: ilk istek bitmeden ikinci uçmaz, sonra sırayla uçar", async () => {
    const release = deferredPatch();
    await renderCard();
    await typeAndBlur(cell("it-1", "miktar"), "25");
    await waitFor(() => expect(calls("PATCH", ITEM_PATH)).toHaveLength(1));
    await typeAndBlur(cell("it-1", "maliyet B\\.F\\."), "200");
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(calls("PATCH", ITEM_PATH)).toHaveLength(1);
    await act(async () => release());
    await waitFor(() => expect(calls("PATCH", ITEM_PATH)).toHaveLength(2));
    expect(calls("PATCH", ITEM_PATH).map((call) => bodyOf(call))).toEqual([{ quantity: "25" }, { cost_unit_price: "200" }]);
  });

  it("FARKLI satır sıraya girmez: aynı anda paralel uçar", async () => {
    const release = deferredPatch();
    await renderCard();
    await typeAndBlur(cell("it-1", "miktar"), "25");
    await waitFor(() => expect(calls("PATCH", ITEM_PATH)).toHaveLength(1));
    await typeAndBlur(cell("it-2", "miktar"), "7");
    await waitFor(() => expect(calls("PATCH", ITEM_PATH)).toHaveLength(2));
    await act(async () => release());
  });

  it("ilk istek bitince hücre SUNUCU değerini gösterir; aynı alana eski değeri geri yazmak GERÇEK değişikliktir (noop DEĞİL)", async () => {
    const release = deferredPatch();
    await renderCard();
    await typeAndBlur(cell("it-1", "miktar"), "25");
    await waitFor(() => expect(calls("PATCH", ITEM_PATH)).toHaveLength(1));
    // İlk istek uçuştayken hücre kilitli; sunucu 25'e ulaşınca "10" yazmak GERÇEK bir değişikliktir.
    await act(async () => release());
    await waitFor(() => expect(cell("it-1", "miktar")).toHaveValue("25"));
    await typeAndBlur(cell("it-1", "miktar"), "10");
    await waitFor(() => expect(calls("PATCH", ITEM_PATH)).toHaveLength(2));
    expect(bodyOf(calls("PATCH", ITEM_PATH)[1])).toEqual({ quantity: "10" });
  });
});

describe("kalem / grup yazmaları", () => {
  it("× onaysız DELETE (mockup birebir); farklı kalem kimliği", async () => {
    await renderCard();
    await userEvent.click(within(rowOf("it-2")).getByRole("button", { name: /kalemi sil/ }));
    await waitFor(() => expect(calls("DELETE", ITEM_PATH)).toHaveLength(1));
    expect(pathOf(calls("DELETE", ITEM_PATH)[0])).toEqual({ offer_id: OFFER_ID, rev_no: REV_NO, item_id: "it-2" });
  });

  it("'+ Grup' → POST {name: 'Yeni grup'}", async () => {
    await renderCard();
    await userEvent.click(screen.getByRole("button", { name: "+ Grup" }));
    await waitFor(() => expect(calls("POST", GROUPS_PATH)).toHaveLength(1));
    expect(bodyOf(calls("POST", GROUPS_PATH)[0])).toEqual({ name: "Yeni grup" });
  });

  it("grup adı tıkla-düzenle: blur'da PATCH {name}; değişmezse istek yok; boş ad istek UÇURMAZ", async () => {
    await renderCard();
    await userEvent.click(within(screen.getByTestId("oit-group-g-a")).getByRole("button", { name: "KABA İNŞAAT" }));
    const input = screen.getByRole("textbox", { name: "Grup adı" });
    await userEvent.clear(input);
    await userEvent.type(input, "YAPI");
    await userEvent.tab();
    await waitFor(() => expect(calls("PATCH", GROUP_PATH)).toHaveLength(1));
    expect(bodyOf(calls("PATCH", GROUP_PATH)[0])).toEqual({ name: "YAPI" });
    expect(pathOf(calls("PATCH", GROUP_PATH)[0])).toMatchObject({ group_id: "g-a" });

    await userEvent.click(within(screen.getByTestId("oit-group-g-b")).getByRole("button", { name: "İNCE İŞLER" }));
    await userEvent.clear(screen.getByRole("textbox", { name: "Grup adı" }));
    await userEvent.tab();
    expect(calls("PATCH", GROUP_PATH)).toHaveLength(1);
  });

  it("grup silme YALNIZ boş grupta: dolu grupta düğme yok; boşta DELETE", async () => {
    await renderCard();
    expect(within(screen.getByTestId("oit-group-g-a")).queryByRole("button", { name: /grubunu sil/ })).not.toBeInTheDocument();
    await userEvent.click(within(screen.getByTestId("oit-group-g-b")).getByRole("button", { name: /grubunu sil/ }));
    await waitFor(() => expect(calls("DELETE", GROUP_PATH)).toHaveLength(1));
    expect(pathOf(calls("DELETE", GROUP_PATH)[0])).toMatchObject({ group_id: "g-b" });
  });
});

describe("TKL-F3.6.1 madde 5 — boş grup '×': önbelleğe DEĞİL taze veriye göre karar", () => {
  const GROUP_HAS_ITEMS = "Grupta kalem var; önce kalemleri silin";
  const withItemInB = () =>
    makeRevisionWithItems([
      makeGroup("g-a", "KABA İNŞAAT", 0, [makeItem({ id: "it-1" }), makeUnpricedItem({ id: "it-2", sort_order: 1 })]),
      makeGroup("g-b", "İNCE İŞLER", 1, [makeItem({ id: "it-3", poz_no: "KAB-0003" })]),
    ]);

  it("🔴 önbellek 'boş' ama sunucuda artık kalem var → DELETE ATILMAZ (kaskad silme yok), mesaj + tablo tazelenir", async () => {
    await renderCard();
    revision = withItemInB(); // başkası gruba kalem ekledi; ekran henüz bilmiyor
    await userEvent.click(within(screen.getByTestId("oit-group-g-b")).getByRole("button", { name: /grubunu sil/ }));
    expect(await screen.findByText(GROUP_HAS_ITEMS)).toBeInTheDocument();
    expect(calls("DELETE", GROUP_PATH)).toHaveLength(0);
    await waitFor(() => expect(within(screen.getByTestId("oit-group-g-b")).getByText("1 kalem")).toBeInTheDocument());
    expect(rowOf("it-3")).toBeInTheDocument();
  });

  it("🔴 DELETE 409 (backend metni) → metin AYNEN görünür ve revizyon tazelenir", async () => {
    vi.mocked(backendClient.DELETE).mockResolvedValue(fail(409, GROUP_HAS_ITEMS));
    await renderCard();
    const before = calls("GET", REVISION_PATH).length;
    await userEvent.click(within(screen.getByTestId("oit-group-g-b")).getByRole("button", { name: /grubunu sil/ }));
    expect(await screen.findByText(GROUP_HAS_ITEMS)).toBeInTheDocument();
    expect(calls("DELETE", GROUP_PATH)).toHaveLength(1);
    await waitFor(() => expect(calls("GET", REVISION_PATH).length).toBeGreaterThanOrEqual(before + 2));
  });

  it("DELETE 404 (grup zaten silinmiş) → revizyon tazelenir", async () => {
    vi.mocked(backendClient.DELETE).mockResolvedValue(fail(404, "Grup bulunamadı"));
    await renderCard();
    const before = calls("GET", REVISION_PATH).length;
    await userEvent.click(within(screen.getByTestId("oit-group-g-b")).getByRole("button", { name: /grubunu sil/ }));
    expect(await screen.findByText("Grup bulunamadı")).toBeInTheDocument();
    await waitFor(() => expect(calls("GET", REVISION_PATH).length).toBeGreaterThanOrEqual(before + 2));
  });

  it("grup adı PATCH 409/404 da revizyonu tazeler", async () => {
    vi.mocked(backendClient.PATCH).mockResolvedValueOnce(fail(404, "Grup bulunamadı"));
    await renderCard();
    const before = calls("GET", REVISION_PATH).length;
    await userEvent.click(within(screen.getByTestId("oit-group-g-a")).getByRole("button", { name: "KABA İNŞAAT" }));
    const input = screen.getByRole("textbox", { name: "Grup adı" });
    await userEvent.clear(input);
    await userEvent.type(input, "YAPI");
    await userEvent.tab();
    await waitFor(() => expect(calls("GET", REVISION_PATH).length).toBeGreaterThan(before));
  });
});

describe("TKL-F3.6.1 madde 7 — 404 tazeler · 403 → AccessDenied (SO-19)", () => {
  const DENIED = "Bu alana yetkiniz yok";

  it("🔴 kalem PATCH 404 → revizyon yeniden okunur", async () => {
    vi.mocked(backendClient.PATCH).mockResolvedValueOnce(fail(404, "Kalem bulunamadı"));
    await renderCard();
    const before = calls("GET", REVISION_PATH).length;
    await typeAndBlur(cell("it-1", "miktar"), "5");
    expect(await within(rowOf("it-1")).findByText("Kalem bulunamadı")).toBeInTheDocument();
    await waitFor(() => expect(calls("GET", REVISION_PATH).length).toBeGreaterThan(before));
  });

  it("🔴 kalem DELETE 404 → revizyon yeniden okunur", async () => {
    vi.mocked(backendClient.DELETE).mockResolvedValue(fail(404, "Kalem bulunamadı"));
    await renderCard();
    const before = calls("GET", REVISION_PATH).length;
    await userEvent.click(within(rowOf("it-2")).getByRole("button", { name: /kalemi sil/ }));
    expect(await within(rowOf("it-2")).findByText("Kalem bulunamadı")).toBeInTheDocument();
    await waitFor(() => expect(calls("GET", REVISION_PATH).length).toBeGreaterThan(before));
  });

  it("🔴 kalem PATCH 403 → AccessDenied", async () => {
    vi.mocked(backendClient.PATCH).mockResolvedValueOnce(fail(403, "Yetkiniz yok"));
    await renderCard();
    await typeAndBlur(cell("it-1", "miktar"), "5");
    expect(await screen.findByText(DENIED)).toBeInTheDocument();
  });

  it("🔴 kalem DELETE 403 → AccessDenied", async () => {
    vi.mocked(backendClient.DELETE).mockResolvedValue(fail(403, "Yetkiniz yok"));
    await renderCard();
    await userEvent.click(within(rowOf("it-2")).getByRole("button", { name: /kalemi sil/ }));
    expect(await screen.findByText(DENIED)).toBeInTheDocument();
  });

  it("🔴 grup yazımı (+ Grup POST) 403 → AccessDenied", async () => {
    vi.mocked(backendClient.POST).mockResolvedValue(fail(403, "Yetkiniz yok"));
    await renderCard();
    await userEvent.click(screen.getByRole("button", { name: "+ Grup" }));
    expect(await screen.findByText(DENIED)).toBeInTheDocument();
  });

  it("🔴 seçici bulk 403 → AccessDenied", async () => {
    vi.mocked(backendClient.POST).mockResolvedValue(fail(403, "Yetkiniz yok"));
    await renderCard();
    await userEvent.click(screen.getByRole("button", { name: "+ Katalogdan Ekle" }));
    const dialog = await screen.findByRole("dialog", { name: "Katalogdan Kalem Ekle" });
    await within(dialog).findByText(SIVA.poz_no);
    await userEvent.type(within(within(dialog).getByText(LAST_SZL.poz_no).closest("tr") as HTMLElement).getByLabelText(`${LAST_SZL.poz_no} miktar`), "3");
    await userEvent.click(within(dialog).getByRole("button", { name: /Kalemi Ekle/ }));
    expect(await screen.findByText(DENIED)).toBeInTheDocument();
  });
});

describe("TKL-F3.6.1 madde 16 — '↺ kat.' teklif a-s sınırını aşıyorsa kapalı", () => {
  it("🔴 katalog a-s 2.000.000 → düğme PASİF + açıklama; tıklayınca PATCH atılmaz; sığan değerde açık", async () => {
    revision = makeRevisionWithItems([
      makeGroup("g-a", "A", 0, [
        makeItem({ id: "it-1", unit_mhr: "5.0000" }),
        makeItem({ id: "it-2", unit_mhr: "5.0000", catalog_item_id: DEMIR.id, poz_no: "KAB-0002", sort_order: 1 }),
      ]),
    ]);
    vi.mocked(backendClient.GET).mockImplementation((async (path: string) => {
      if (path === REVISION_PATH) return ok(revision);
      if (path === "/catalog/disciplines") return ok({ items: [D_KAB, D_DUV] });
      if (path === "/catalog/items") return ok({ items: [BETON, { ...DEMIR, standard_unit_mhr: "2000000.0000" }, SIVA] });
      throw new Error(`beklenmeyen GET ${path}`);
    }) as never);
    await renderCard();
    const ok1 = await within(rowOf("it-1")).findByRole("button", { name: /kat\. 1,80/ });
    expect(ok1).toBeEnabled();
    const blocked = await within(rowOf("it-2")).findByRole("button", { name: /kat\./ });
    expect(blocked).toBeDisabled();
    expect(blocked).toHaveAttribute("title", "Katalog a-s değeri teklif sınırını aşıyor");
    await userEvent.click(blocked);
    expect(calls("PATCH", ITEM_PATH)).toHaveLength(0);
  });
});

describe("katalog seçicisi (F3.6 teklif hedefi)", () => {
  async function openPicker() {
    await userEvent.click(screen.getByRole("button", { name: "+ Katalogdan Ekle" }));
    await screen.findByRole("dialog", { name: "Katalogdan Kalem Ekle" });
  }
  const pickerRow = (pozNo: string) => within(screen.getByRole("dialog")).getByText(pozNo).closest("tr") as HTMLElement;

  beforeEach(() => {
    unsavedRegistry.set("test-cleanup", null);
  });

  it("alt metin 'TKL-… Rev.n'; teklifte olan kalem varsayılan GİZLİ, gösterince 'Teklifte var · {grup}' kapalı", async () => {
    await renderCard();
    await openPicker();
    expect(screen.getByText("TKL-2026-0014 Rev.2 · İş Kalemi Kataloğu'ndan teklife kalem ekle")).toBeInTheDocument();
    const dialog = screen.getByRole("dialog");
    await within(dialog).findByText(SIVA.poz_no);
    expect(within(dialog).queryByText(BETON.poz_no)).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("checkbox", { name: "Teklifte olanları gizle" }));
    // BETON ve DEMIR ikisi de bu teklifte (A grubu): ikisi de gerekçeli + kapalı.
    expect(within(dialog).getAllByText("Teklifte var · KABA İNŞAAT")).toHaveLength(2);
    expect(within(pickerRow(BETON.poz_no)).getByRole("checkbox", { name: `${BETON.poz_no} seç` })).toBeDisabled();
  });

  it("🔴 ekleme TEK bulk isteği: dokunulmamış maliyet gövdede YOK; mevcut gruba (son grup) yazılır", async () => {
    await renderCard();
    await openPicker();
    const dialog = screen.getByRole("dialog");
    await within(dialog).findByText(SIVA.poz_no);
    await userEvent.type(within(pickerRow(LAST_SZL.poz_no)).getByLabelText(`${LAST_SZL.poz_no} miktar`), "3");
    await userEvent.click(within(dialog).getByRole("button", { name: /Kalemi Ekle/ }));
    await waitFor(() => expect(calls("POST", BULK_PATH)).toHaveLength(1));
    expect(calls("POST", GROUPS_PATH)).toHaveLength(0);
    const item = (bodyOf(calls("POST", BULK_PATH)[0]) as { items: Record<string, unknown>[] }).items[0] as Record<string, unknown>;
    expect(item).toEqual({ catalog_item_id: LAST_SZL.id, group_id: "g-b", quantity: "3", sort_order: 0 });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("🔴 grupsuz revizyonda '+ Yeni Grup' İKİ ADIM: önce grup POST, sonra yeni grup kimliğiyle bulk", async () => {
    revision = makeRevisionWithItems([]);
    await renderCard();
    await openPicker();
    const dialog = screen.getByRole("dialog");
    await within(dialog).findByText(SIVA.poz_no);
    await userEvent.type(within(dialog).getByLabelText("Grup Adı"), "ZEMİN");
    await userEvent.type(within(pickerRow(DEMIR.poz_no)).getByLabelText(`${DEMIR.poz_no} miktar`), "2");
    await userEvent.click(within(dialog).getByRole("button", { name: /Kalemi Ekle/ }));
    await waitFor(() => expect(calls("POST", BULK_PATH)).toHaveLength(1));
    expect(bodyOf(calls("POST", GROUPS_PATH)[0])).toEqual({ name: "ZEMİN", sort_order: 0 });
    expect((bodyOf(calls("POST", BULK_PATH)[0]) as { items: Record<string, unknown>[] }).items[0]).toMatchObject({
      group_id: "g-yeni",
      catalog_item_id: DEMIR.id,
    });
  });

  it("bulk düşerse (422) metin AYNEN bantta, seçici AÇIK kalır, açılan grup seçili kalır (ikinci grup açılmaz)", async () => {
    revision = makeRevisionWithItems([]);
    vi.mocked(backendClient.POST).mockImplementation((async (path: string) => {
      if (path === GROUPS_PATH) return ok({ id: "g-yeni", name: "ZEMİN", sort_order: 0 }, 201);
      return fail(422, "Kalem eklenemedi");
    }) as never);
    await renderCard();
    await openPicker();
    const dialog = screen.getByRole("dialog");
    await within(dialog).findByText(SIVA.poz_no);
    await userEvent.type(within(dialog).getByLabelText("Grup Adı"), "ZEMİN");
    await userEvent.type(within(pickerRow(DEMIR.poz_no)).getByLabelText(`${DEMIR.poz_no} miktar`), "2");
    await userEvent.click(within(dialog).getByRole("button", { name: /Kalemi Ekle/ }));
    expect(await within(dialog).findByText("Kalem eklenemedi")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: /Kalemi Ekle/ }));
    await waitFor(() => expect(calls("POST", BULK_PATH)).toHaveLength(2));
    expect(calls("POST", GROUPS_PATH)).toHaveLength(1);
  });

  it("🔴 bulk 409 (revizyon artık taslak değil): seçici KAPANIR, sunucu metni sayfada AYNEN, revizyon yeniden okunur (plan §3.1)", async () => {
    vi.mocked(backendClient.POST).mockResolvedValue(fail(409, "Revizyon taslak değil; içerik yalnız taslak revizyonda değiştirilebilir."));
    await renderCard();
    await openPicker();
    const dialog = screen.getByRole("dialog");
    await within(dialog).findByText(SIVA.poz_no);
    await userEvent.type(within(pickerRow(LAST_SZL.poz_no)).getByLabelText(`${LAST_SZL.poz_no} miktar`), "2");
    const before = calls("GET", REVISION_PATH).length;
    await userEvent.click(within(dialog).getByRole("button", { name: /Kalemi Ekle/ }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByText(/Revizyon taslak değil; içerik yalnız taslak revizyonda/)).toBeInTheDocument();
    await waitFor(() => expect(calls("GET", REVISION_PATH).length).toBeGreaterThan(before));
  });

  it("bulk 422 ise seçici AÇIK kalır (yalnız 409 kapatır) ve revizyon yine tazelenir", async () => {
    vi.mocked(backendClient.POST).mockResolvedValue(fail(422, "Kalem eklenemedi"));
    await renderCard();
    await openPicker();
    const dialog = screen.getByRole("dialog");
    await within(dialog).findByText(SIVA.poz_no);
    await userEvent.type(within(pickerRow(LAST_SZL.poz_no)).getByLabelText(`${LAST_SZL.poz_no} miktar`), "2");
    await userEvent.click(within(dialog).getByRole("button", { name: /Kalemi Ekle/ }));
    expect(await within(dialog).findByText("Kalem eklenemedi")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("'Kataloğa yeni kalem ekle' İş Kalemi Kataloğu'nu YENİ çalışma sekmesinde açar (seçici kapanmaz)", async () => {
    await renderCard();
    await openPicker();
    await userEvent.click(screen.getByRole("button", { name: "Katalogda yok mu? Kataloğa yeni kalem ekle" }));
    expect(tabs.dispatch).toHaveBeenCalledTimes(1);
    expect(tabs.dispatch.mock.calls[0]?.[1]).toMatchObject({ url: "/planlama/is-kalemi-katalogu", background: true });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("seçici açılırken katalog sorgusu tazelenir (yeni eklenen kalem listede görünsün)", async () => {
    await renderCard();
    await openPicker();
    await waitFor(() =>
      expect(vi.mocked(backendClient.GET).mock.calls.filter((call) => call[0] === "/catalog/items").length).toBeGreaterThanOrEqual(2),
    );
  });

  it("yazma yetkisiz: '+ Katalogdan Ekle' kapalı → seçici hiç açılmaz", async () => {
    await renderCard(false);
    expect(screen.getByRole("button", { name: "+ Katalogdan Ekle" })).toBeDisabled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
