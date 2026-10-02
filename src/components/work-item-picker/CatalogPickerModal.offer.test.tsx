import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { backendClient } from "@/lib/api/client";
import type { WorkItemRead } from "@/lib/api/models";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";
import { BETON, DEMIR, D_DUV, D_KAB, SIVA } from "@/components/work-item-catalog/work-item-fixtures";

import { CatalogPickerModal, type CatalogPickerModalProps } from "./CatalogPickerModal";
import type { PickerGroup } from "./picker-model";
import { OFFER_PICKER_TARGET } from "./picker-target";

const scope = vi.hoisted(() => ({ value: { isRestricted: false, names: [] as string[] } }));

vi.mock("@/lib/api/client", () => ({ backendClient: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn() } }));
vi.mock("@/lib/auth/useDisciplineScope", () => ({ useDisciplineScope: () => scope.value }));

type OfferBody = NonNullable<ReturnType<typeof OFFER_PICKER_TARGET.buildBody>>;

const NEW_GROUP_VALUE = "__new__";

/** Teklifte BETON var (grup "KABA İNŞAAT"); DEMIR ve SIVA serbest. */
const GROUPS: PickerGroup[] = [
  { id: "g-1", name: "KABA İNŞAAT", sort_order: 1, items: [{ code: BETON.poz_no, catalog_item_id: BETON.id, sort_order: 5 }] },
  { id: "g-2", name: "İNCE İŞLER", sort_order: 2, items: [] },
];

const ok = (data: unknown) => ({ data, error: undefined, response: new Response(null, { status: 200 }) }) as never;

function mockCatalog(items: WorkItemRead[]) {
  vi.mocked(backendClient.GET).mockImplementation((async (path: string) => {
    if (path === "/catalog/disciplines") return ok({ items: [D_KAB, D_DUV] });
    if (path === "/catalog/items") return ok({ items });
    throw new Error(`beklenmeyen GET ${path}`);
  }) as never);
}

function renderPicker(over: Partial<CatalogPickerModalProps<OfferBody>> = {}) {
  const props: CatalogPickerModalProps<OfferBody> = {
    target: OFFER_PICKER_TARGET,
    projectName: "TKL-2026-0014 Rev.2",
    groups: GROUPS,
    onSubmit: vi.fn(),
    onClose: vi.fn(),
    isSubmitting: false,
    submitError: null,
    onManualAdd: vi.fn(),
    ...over,
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <CatalogPickerModal {...props} />
    </QueryClientProvider>,
  );
  return props;
}

const rowOf = (pozNo: string) => screen.getByText(pozNo).closest("tr") as HTMLElement;
const quantityOf = (pozNo: string) => within(rowOf(pozNo)).getByLabelText(`${pozNo} miktar`);
const priceOf = (pozNo: string) => within(rowOf(pozNo)).getByLabelText(`${pozNo} maliyet B.F.`);
const submit = () => screen.getByRole("button", { name: /Pozu Ekle|^Poz Ekle$|Ekleniyor/ });

beforeEach(() => {
  vi.clearAllMocks();
  scope.value = { isRestricted: false, names: [] };
  mockCatalog([BETON, DEMIR, SIVA]);
});

afterEach(() => {
  unsavedRegistry.set("test-cleanup", null);
});

describe("teklif hedefi — kabuk (plan §3.1)", () => {
  it("başlık, alt metin (TKL-… Rev.n ile), bant, fiyat kolonu, Σ ve altbilgi bağlantısı teklif metinleri", async () => {
    renderPicker();
    await screen.findByText(DEMIR.poz_no);
    expect(screen.getByRole("dialog", { name: "Katalogdan Kalem Ekle" })).toBeInTheDocument();
    expect(screen.getByText("TKL-2026-0014 Rev.2 · İş Kalemi Kataloğu'ndan teklife kalem ekle")).toBeInTheDocument();
    expect(screen.getByText(/Poz no, tarif, birim ve adam-saat katalogdan kopyalanır\./)).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Maliyet B.F." })).toBeInTheDocument();
    expect(screen.getByText(/Eklenecek maliyet/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Katalogda yok mu? Kataloğa yeni kalem ekle" })).toBeInTheDocument();
  });

  it("🔴 'Teklifte olanları gizle' varsayılan İŞARETLİ; kaldırınca kullanılmış kalem 'Teklifte var · {grup}' + kutu KAPALI", async () => {
    renderPicker();
    await screen.findByText(DEMIR.poz_no);
    const hide = screen.getByRole("checkbox", { name: "Teklifte olanları gizle" });
    expect(hide).toBeChecked();
    expect(screen.queryByText(BETON.poz_no)).not.toBeInTheDocument();
    await userEvent.click(hide);
    expect(screen.getByText("Teklifte var · KABA İNŞAAT")).toBeInTheDocument();
    expect(within(rowOf(BETON.poz_no)).getByRole("checkbox", { name: `${BETON.poz_no} seç` })).toBeDisabled();
  });
});

describe("teklif hedefi — maliyet isteğe bağlı", () => {
  it("🔴 boş maliyetle gönderilebilir (fiyatsız kalem); Σ '— · 1 fiyatsız'", async () => {
    const props = renderPicker();
    await screen.findByText(SIVA.poz_no);
    await userEvent.type(quantityOf(SIVA.poz_no), "3");
    expect(submit()).toBeEnabled();
    expect(screen.getByTestId("wip-total")).toHaveTextContent("— · 1 fiyatsız");
    await userEvent.click(submit());
    const submission = vi.mocked(props.onSubmit).mock.calls[0]?.[0];
    expect(submission?.body?.items[0]).toEqual({
      catalog_item_id: SIVA.id,
      group_id: "g-2",
      quantity: "3",
      sort_order: 0,
    });
  });

  it("🔴 dokunulmamış öneri gövdede YOK; değiştirilen açık değer; silinen açık null", async () => {
    const props = renderPicker();
    await screen.findByText(DEMIR.poz_no);
    await userEvent.type(quantityOf(DEMIR.poz_no), "1");
    expect(priceOf(DEMIR.poz_no)).toHaveValue("28.000,00");
    await userEvent.click(submit());
    const untouched = vi.mocked(props.onSubmit).mock.calls[0]?.[0].body?.items[0] as Record<string, unknown>;
    expect("cost_unit_price" in untouched).toBe(false);

    await userEvent.clear(priceOf(DEMIR.poz_no));
    await userEvent.type(priceOf(DEMIR.poz_no), "30000,50");
    await userEvent.click(submit());
    expect(vi.mocked(props.onSubmit).mock.calls[1]?.[0].body?.items[0]?.cost_unit_price).toBe("30000.50");

    await userEvent.clear(priceOf(DEMIR.poz_no));
    await userEvent.click(submit());
    expect(vi.mocked(props.onSubmit).mock.calls[2]?.[0].body?.items[0]?.cost_unit_price).toBeNull();
  });

  it("hatalı maliyet hâlâ engeller (teklif metniyle)", async () => {
    renderPicker();
    await screen.findByText(DEMIR.poz_no);
    await userEvent.type(quantityOf(DEMIR.poz_no), "1");
    await userEvent.clear(priceOf(DEMIR.poz_no));
    await userEvent.type(priceOf(DEMIR.poz_no), "abc");
    expect(submit()).toBeDisabled();
    expect(within(rowOf(DEMIR.poz_no)).getByText("Maliyet B.F. sayı olmalıdır.")).toBeInTheDocument();
  });
});

describe("teklif hedefi — altbilgi bağlantısı", () => {
  it("🔴 'Kataloğa yeni kalem ekle' seçiciyi KAPATMAZ ve kirli seçimde onay SORMAZ (yeni sekmede açılır)", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const props = renderPicker();
    await screen.findByText(DEMIR.poz_no);
    await userEvent.type(quantityOf(DEMIR.poz_no), "2");
    await userEvent.click(screen.getByRole("button", { name: "Katalogda yok mu? Kataloğa yeni kalem ekle" }));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(props.onManualAdd).toHaveBeenCalledTimes(1);
    expect(props.onClose).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});

describe("teklif hedefi — grup", () => {
  it("🔴 grupsuz revizyonda '+ Yeni Grup': gönderim newGroup + buildBody(grupId) iki adımını taşır", async () => {
    const props = renderPicker({ groups: [] });
    await screen.findByText(DEMIR.poz_no);
    expect(screen.getByRole("combobox", { name: "Grup" })).toHaveValue(NEW_GROUP_VALUE);
    await userEvent.type(screen.getByLabelText("Grup Adı"), "ZEMİN");
    await userEvent.type(quantityOf(DEMIR.poz_no), "2");
    await userEvent.click(submit());
    const submission = vi.mocked(props.onSubmit).mock.calls[0]?.[0];
    expect(submission?.body).toBeNull();
    expect(submission?.newGroup).toEqual({ name: "ZEMİN", sortOrder: 0 });
    const body = submission?.buildBody("g-yeni");
    expect(body?.items[0]).toMatchObject({ catalog_item_id: DEMIR.id, group_id: "g-yeni", quantity: "2", sort_order: 0 });
  });

  it("varsayılan hedef = en büyük sort_order'lı grup; mevcut grupta sıra taban+ardışık", async () => {
    const props = renderPicker({
      groups: [
        { id: "g-1", name: "A", sort_order: 1, items: [{ code: "X", catalog_item_id: "x", sort_order: 4 }] },
        { id: "g-2", name: "B", sort_order: 2, items: [{ code: "Y", catalog_item_id: "y", sort_order: 9 }] },
      ],
    });
    await screen.findByText(DEMIR.poz_no);
    expect(screen.getByRole("combobox", { name: "Grup" })).toHaveValue("g-2");
    await userEvent.type(quantityOf(DEMIR.poz_no), "1");
    await userEvent.click(submit());
    expect(vi.mocked(props.onSubmit).mock.calls[0]?.[0].body?.items[0]?.sort_order).toBe(10);
  });
});
