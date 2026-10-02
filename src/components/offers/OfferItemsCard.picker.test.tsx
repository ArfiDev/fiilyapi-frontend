import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
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
  makeRevisionWithItems,
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

const calls = (method: "GET" | "PATCH" | "POST" | "DELETE", path: string) =>
  vi.mocked(backendClient[method]).mock.calls.filter((call) => String(call[0]) === path);
const bodyOf = (call: unknown[] | undefined) => (call?.[1] as { body?: Record<string, unknown> } | undefined)?.body;

beforeEach(() => {
  vi.clearAllMocks();
  scope.value = { isRestricted: false, names: [] };
  revision = makeRevisionWithItems();
  mockBackend();
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
