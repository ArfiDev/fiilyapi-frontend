import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { backendClient } from "@/lib/api/client";
import { CATALOG_ITEMS_QUERY_KEY } from "@/lib/api/hooks/catalog-query-keys";
import {
  CONTRACT_DISTRIBUTION_QUERY_KEY,
  EMPLOYER_CONTRACT_ITEMS_QUERY_KEY,
  EMPLOYER_CONTRACT_QUERY_KEY,
  type EmployerContractItemsResponse,
} from "@/lib/api/hooks/useContract";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";
import { D_DUV, D_KAB, LAST_SZL, SIVA } from "@/components/work-item-catalog/work-item-fixtures";

import { EmployerCatalogPickerHost, type EmployerCatalogPickerHostProps } from "./EmployerCatalogPickerHost";

vi.mock("@/lib/api/client", () => ({ backendClient: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn() } }));
vi.mock("@/lib/auth/useDisciplineScope", () => ({ useDisciplineScope: () => ({ isRestricted: false, names: [] }) }));

type Groups = EmployerContractItemsResponse["groups"];

const GROUPS_PATH = "/projects/{project_id}/contract/groups";
const BULK_PATH = "/projects/{project_id}/contract/items/bulk";
const CONFLICT = "Bu poz numarası bu sözleşmede zaten kullanılıyor: KAB-0101";

const GROUPS = [
  {
    id: "g-1",
    name: "KABA İNŞAAT",
    sort_order: 1,
    items: [
      { id: "c-1", code: "X-1", description: "x", unit: "m³", quantity: "1", unit_price: "1", sort_order: 4, catalog_item_id: null },
    ],
  },
] as unknown as Groups;
const NO_GROUPS = [] as unknown as Groups;

const res = (status: number) => new Response(null, { status });
const ok = (data: unknown, status = 200) => ({ data, error: undefined, response: res(status) }) as never;
const fail = (status: number, detail: string) => ({ data: undefined, error: { detail }, response: res(status) }) as never;

type PostResult = (path: string, init: { body: unknown }) => unknown;
function mockPosts(handler: PostResult) {
  vi.mocked(backendClient.POST).mockImplementation(((path: string, init: { body: unknown }) =>
    Promise.resolve(handler(path, init))) as never);
}
const createdGroup = (body: unknown) => ok({ id: "g-new", ...(body as object) }, 201);
const allPosts = () => vi.mocked(backendClient.POST).mock.calls as unknown as [string, ...unknown[]][];
const postsTo = (path: string) => allPosts().filter(([p]) => p === path);

function renderHost(over: Partial<EmployerCatalogPickerHostProps> = {}) {
  const props: EmployerCatalogPickerHostProps = {
    projectId: "p-1",
    projectName: "Gökova Konutları",
    groups: GROUPS,
    onClose: vi.fn(),
    onManualAdd: vi.fn(),
    onAdded: vi.fn(),
    ...over,
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const tree = (next: EmployerCatalogPickerHostProps) => (
    <QueryClientProvider client={client}>
      <EmployerCatalogPickerHost {...next} />
    </QueryClientProvider>
  );
  const view = render(tree(props));
  return { ...props, invalidate, rerenderWith: (next: Partial<EmployerCatalogPickerHostProps>) => view.rerender(tree({ ...props, ...next })) };
}

const rowOf = (pozNo: string) => screen.getByText(pozNo).closest("tr") as HTMLElement;
const quantityOf = (pozNo: string) => within(rowOf(pozNo)).getByLabelText(`${pozNo} miktar`);
const priceOf = (pozNo: string) => within(rowOf(pozNo)).getByLabelText(`${pozNo} birim fiyat`);
const boxOf = (pozNo: string) => within(rowOf(pozNo)).getByRole("checkbox", { name: `${pozNo} seç` });
const submitButton = () => screen.getByRole("button", { name: /Pozu Ekle|^Poz Ekle$|Ekleniyor/ });
const keysOf = (spy: { mock: { calls: unknown[][] } }) =>
  spy.mock.calls.map(([filters]) => (filters as { queryKey: unknown[] }).queryKey);

async function pickTwo(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByText(SIVA.poz_no);
  await user.type(quantityOf(LAST_SZL.poz_no), "480");
  await user.clear(priceOf(LAST_SZL.poz_no));
  await user.type(priceOf(LAST_SZL.poz_no), "3.320,00");
  await user.type(quantityOf(SIVA.poz_no), "12,5");
  await user.type(priceOf(SIVA.poz_no), "100,5");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(backendClient.GET).mockImplementation((async (path: string) => {
    if (path === "/catalog/disciplines") return ok({ items: [D_KAB, D_DUV] });
    if (path === "/catalog/items") return ok({ items: [SIVA, LAST_SZL] });
    throw new Error(`beklenmeyen GET ${path}`);
  }) as never);
});

afterEach(() => {
  unsavedRegistry.set("test-cleanup", null);
});

describe("EmployerCatalogPickerHost · mevcut gruba toplu ekleme (TKL-F2.4 §2.2)", () => {
  it("🔴 N poz = TEK bulk isteği (N istek DEĞİL), gövde seçiciden aynen; grup açılmaz", async () => {
    const user = userEvent.setup();
    mockPosts(() => ok({ items: [] }, 201));
    renderHost();
    await pickTwo(user);
    await user.click(submitButton());

    await waitFor(() => expect(postsTo(BULK_PATH)).toHaveLength(1));
    expect(vi.mocked(backendClient.POST)).toHaveBeenCalledTimes(1);
    expect(postsTo(GROUPS_PATH)).toHaveLength(0);
    const call = postsTo(BULK_PATH)[0] as unknown as [string, { params: unknown; body: { items: unknown[] } }];
    expect(call[1].params).toEqual({ path: { project_id: "p-1" } });
    expect(call[1].body.items).toEqual([
      { group_id: "g-1", code: "DUV-0001", description: "İç sıva", unit: "m²", quantity: "12.5", unit_price: "100.50", sort_order: 5, catalog_item_id: SIVA.id },
      { group_id: "g-1", code: "KAB-0101", description: "Kalıp işçiliği", unit: "m³", quantity: "480", unit_price: "3320.00", sort_order: 6, catalog_item_id: LAST_SZL.id },
    ]);
  });

  it("başarıda önbellek TAZELENİR (4 anahtar) → onAdded(2) ve seçici kapanır", async () => {
    const user = userEvent.setup();
    mockPosts(() => ok({ items: [] }, 201));
    const props = renderHost();
    await pickTwo(user);
    await user.click(submitButton());

    await waitFor(() => expect(props.onAdded).toHaveBeenCalledWith(2));
    expect(props.onClose).toHaveBeenCalledTimes(1);
    const keys = keysOf(props.invalidate);
    expect(keys).toContainEqual([EMPLOYER_CONTRACT_ITEMS_QUERY_KEY, "p-1"]);
    expect(keys).toContainEqual([CONTRACT_DISTRIBUTION_QUERY_KEY, "p-1"]);
    expect(keys).toContainEqual([EMPLOYER_CONTRACT_QUERY_KEY, "p-1"]);
    expect(keys).toContainEqual([CATALOG_ITEMS_QUERY_KEY]);
  });

  it("gönderilirken düğme 'Ekleniyor…' kilitli; çift tıklama İKİNCİ istek atmaz", async () => {
    const user = userEvent.setup();
    let release: (value: unknown) => void = () => undefined;
    vi.mocked(backendClient.POST).mockImplementation((() => new Promise((resolve) => (release = resolve))) as never);
    renderHost();
    await pickTwo(user);
    await user.dblClick(submitButton());

    expect(screen.getByRole("button", { name: "Ekleniyor…" })).toBeDisabled();
    expect(postsTo(BULK_PATH)).toHaveLength(1);
    release(ok({ items: [] }, 201));
  });

  it("'Elle poz ekle' köprüsü onManualAdd'i çağırır (gönderim yok)", async () => {
    const user = userEvent.setup();
    const props = renderHost();
    await screen.findByText(SIVA.poz_no);
    await user.click(screen.getByRole("button", { name: "Katalogda yok mu? Elle poz ekle" }));
    expect(props.onManualAdd).toHaveBeenCalledTimes(1);
    expect(backendClient.POST).not.toHaveBeenCalled();
  });
});

describe("EmployerCatalogPickerHost · hata → metin (§2.5), seçim KORUNUR (hep-ya-hiç)", () => {
  it("🔴 409 → backend metni bantta AYNEN; seçici AÇIK; seçim/miktar korunur; kalem + katalog sorgusu tazelenir", async () => {
    const user = userEvent.setup();
    mockPosts(() => fail(409, CONFLICT));
    const props = renderHost();
    await pickTwo(user);
    await user.click(submitButton());

    await waitFor(() => expect(screen.getByTestId("wip-band")).toHaveTextContent(CONFLICT));
    expect(props.onClose).not.toHaveBeenCalled();
    expect(props.onAdded).not.toHaveBeenCalled();
    expect(boxOf(LAST_SZL.poz_no)).toBeChecked();
    expect(quantityOf(LAST_SZL.poz_no)).toHaveValue("480");
    expect(quantityOf(SIVA.poz_no)).toHaveValue("12,5");
    expect(submitButton()).toBeEnabled();
    const keys = keysOf(props.invalidate);
    expect(keys).toContainEqual([EMPLOYER_CONTRACT_ITEMS_QUERY_KEY, "p-1"]);
    expect(keys).toContainEqual([CATALOG_ITEMS_QUERY_KEY]);
  });

  it("422 grup / 404 katalog metinleri de AYNEN basılır", async () => {
    const user = userEvent.setup();
    mockPosts(() => fail(422, "Poz grubu bu sözleşmeye ait değil"));
    renderHost();
    await pickTwo(user);
    await user.click(submitButton());
    await waitFor(() => expect(screen.getByTestId("wip-band")).toHaveTextContent("Poz grubu bu sözleşmeye ait değil"));
  });

  it("5xx → 'Beklenmeyen bir hata oluştu.'; OTOMATİK YENİDEN DENEME YOK (idempotans yok)", async () => {
    const user = userEvent.setup();
    vi.mocked(backendClient.POST).mockResolvedValue({ data: undefined, error: undefined, response: res(500) } as never);
    renderHost();
    await pickTwo(user);
    await user.click(submitButton());

    await waitFor(() => expect(screen.getByTestId("wip-band")).toHaveTextContent("Beklenmeyen bir hata oluştu."));
    expect(postsTo(BULK_PATH)).toHaveLength(1);
  });

  it("hata sonrası yeniden gönderim bandı temizler ve başarıda kapanır", async () => {
    const user = userEvent.setup();
    let attempt = 0;
    mockPosts(() => (++attempt === 1 ? fail(409, CONFLICT) : ok({ items: [] }, 201)));
    const props = renderHost();
    await pickTwo(user);
    await user.click(submitButton());
    await waitFor(() => expect(screen.getByTestId("wip-band")).toHaveTextContent(CONFLICT));
    await user.click(submitButton());
    await waitFor(() => expect(props.onAdded).toHaveBeenCalledWith(2));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});

describe("EmployerCatalogPickerHost · yeni grup iki adımı (§2.2-4)", () => {
  async function fillNewGroup(user: ReturnType<typeof userEvent.setup>) {
    await pickTwo(user);
    await user.type(screen.getByLabelText("Grup Adı"), " KABA İNŞAAT ");
  }

  it("grupsuz sözleşme: ÖNCE grup (ad kırpılmış, sort_order 0), SONRA bulk yeni grup kimliğiyle", async () => {
    const user = userEvent.setup();
    mockPosts((path, init) => (path === GROUPS_PATH ? createdGroup(init.body) : ok({ items: [] }, 201)));
    const props = renderHost({ groups: NO_GROUPS });
    await fillNewGroup(user);
    await user.click(submitButton());

    await waitFor(() => expect(props.onAdded).toHaveBeenCalledWith(2));
    const order = allPosts().map(([path]) => path);
    expect(order).toEqual([GROUPS_PATH, BULK_PATH]);
    expect((postsTo(GROUPS_PATH)[0] as unknown as [string, { body: unknown }])[1].body).toEqual({ name: "KABA İNŞAAT", sort_order: 0 });
    const bulk = (postsTo(BULK_PATH)[0] as unknown as [string, { body: { items: { group_id: string; sort_order: number }[] } }])[1].body;
    expect(bulk.items.map((item) => item.group_id)).toEqual(["g-new", "g-new"]);
    expect(bulk.items.map((item) => item.sort_order)).toEqual([0, 1]);
  });

  it("🔴 grup açıldı + bulk düştü → ikinci denemede grup TEKRAR AÇILMAZ, aynı grup kimliğiyle yeniden bulk", async () => {
    const user = userEvent.setup();
    let bulkAttempt = 0;
    mockPosts((path, init) => {
      if (path === GROUPS_PATH) return createdGroup(init.body);
      return ++bulkAttempt === 1 ? fail(409, CONFLICT) : ok({ items: [] }, 201);
    });
    const props = renderHost({ groups: NO_GROUPS });
    await fillNewGroup(user);
    await user.click(submitButton());
    await waitFor(() => expect(screen.getByTestId("wip-band")).toHaveTextContent(CONFLICT));
    expect((screen.getByLabelText("Grup") as HTMLSelectElement).value).toBe("g-new");
    expect(screen.getByRole("option", { name: "KABA İNŞAAT" })).toBeInTheDocument();

    await user.click(submitButton());
    await waitFor(() => expect(props.onAdded).toHaveBeenCalledWith(2));
    expect(postsTo(GROUPS_PATH)).toHaveLength(1);
    expect(postsTo(BULK_PATH)).toHaveLength(2);
    const retry = (postsTo(BULK_PATH)[1] as unknown as [string, { body: { items: { group_id: string }[] } }])[1].body;
    expect(retry.items.every((item) => item.group_id === "g-new")).toBe(true);
  });

  it("grup açma düşerse bulk HİÇ gitmez; hata bantta aynen, seçim korunur", async () => {
    const user = userEvent.setup();
    mockPosts(() => fail(422, "Grup adı geçersiz"));
    const props = renderHost({ groups: NO_GROUPS });
    await fillNewGroup(user);
    await user.click(submitButton());

    await waitFor(() => expect(screen.getByTestId("wip-band")).toHaveTextContent("Grup adı geçersiz"));
    expect(postsTo(BULK_PATH)).toHaveLength(0);
    expect(props.onClose).not.toHaveBeenCalled();
    expect(boxOf(LAST_SZL.poz_no)).toBeChecked();
  });
});
