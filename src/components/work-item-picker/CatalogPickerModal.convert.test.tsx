import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { backendClient } from "@/lib/api/client";
import type { WorkItemRead } from "@/lib/api/models";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";
import { BETON, DEMIR, D_DUV, D_KAB, LAST_EMPTY, LAST_SZL, SIVA } from "@/components/work-item-catalog/work-item-fixtures";

import { CatalogPickerModal, type CatalogPickerModalProps } from "./CatalogPickerModal";
import type { PickerGroup } from "./picker-model";
import { CONVERT_PICKER_TARGET, type ConvertAddBody } from "./picker-target";

const scope = vi.hoisted(() => ({ value: { isRestricted: false, names: [] as string[] } }));

vi.mock("@/lib/api/client", () => ({ backendClient: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn() } }));
vi.mock("@/lib/auth/useDisciplineScope", () => ({ useDisciplineScope: () => scope.value }));

const NEW_GROUP_VALUE = "__new__";

/** Listede BETON (dahil, "KABA İNŞAAT") ve DEMIR (ÇIKARILMIŞ, "İNCE İŞLER") var; SIVA/LAST_* serbest. */
const GROUPS: PickerGroup[] = [
  { id: "g:1", name: "KABA İNŞAAT", sort_order: 0, items: [{ code: BETON.poz_no, catalog_item_id: BETON.id, sort_order: 0 }] },
  { id: "g:2", name: "İNCE İŞLER", sort_order: 1, items: [{ code: DEMIR.poz_no, catalog_item_id: DEMIR.id, sort_order: 0, isExcluded: true }] },
];

const ok = (data: unknown) => ({ data, error: undefined, response: new Response(null, { status: 200 }) }) as never;

function mockCatalog(items: WorkItemRead[]) {
  vi.mocked(backendClient.GET).mockImplementation((async (path: string) => {
    if (path === "/catalog/disciplines") return ok({ items: [D_KAB, D_DUV] });
    if (path === "/catalog/items") return ok({ items });
    throw new Error(`beklenmeyen GET ${path}`);
  }) as never);
}

function renderPicker(over: Partial<CatalogPickerModalProps<ConvertAddBody>> = {}) {
  const props: CatalogPickerModalProps<ConvertAddBody> = {
    target: CONVERT_PICKER_TARGET,
    projectName: "TKL-2026-0014 Rev.2",
    groups: GROUPS,
    onSubmit: vi.fn(),
    onClose: vi.fn(),
    isSubmitting: false,
    submitError: null,
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
const check = (pozNo: string) => within(rowOf(pozNo)).getByRole("checkbox", { name: `${pozNo} seç` });
const quantityOf = (pozNo: string) => within(rowOf(pozNo)).getByLabelText(`${pozNo} miktar`);
const priceOf = (pozNo: string) => within(rowOf(pozNo)).getByLabelText(`${pozNo} birim fiyat`);
const submit = () => screen.getByRole("button", { name: /Kalemi Ekle|^Kalem Ekle$|Ekleniyor/ });
const filler = (count: number): PickerGroup["items"] =>
  Array.from({ length: count }, (_, i) => ({ code: `F-${i}`, catalog_item_id: `fill-${i}`, sort_order: i }));

beforeEach(() => {
  vi.clearAllMocks();
  scope.value = { isRestricted: false, names: [] };
  mockCatalog([BETON, DEMIR, SIVA, LAST_SZL, LAST_EMPTY]);
});

afterEach(() => {
  unsavedRegistry.set("test-cleanup", null);
});

describe("dönüştürme hedefi — kabuk", () => {
  it("başlık, alt metin (bağlamla), kolonlar sekiz (Miktar · Birim fiyat · Tutar), Σ etiketi; manuel ekleme bağlantısı YOK", async () => {
    renderPicker();
    await screen.findByText(SIVA.poz_no);
    expect(screen.getByRole("dialog", { name: "Katalogdan Kalem Ekle" })).toBeInTheDocument();
    expect(screen.getByText("TKL-2026-0014 Rev.2 · İş Kalemi Kataloğu'ndan sözleşmeye kalem ekle")).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "", "Poz No", "Tanım", "Birim", "Ref. fiyat", "Son fiyat", "Miktar", "Birim fiyat", "Tutar",
    ]);
    expect(screen.getByText(/Eklenecek Tutar/)).toBeInTheDocument();
    expect(screen.queryByText(/Katalogda yok mu/)).not.toBeInTheDocument();
  });

  it("🔴 'Listede olanları gizle' varsayılan İŞARETLİ; kaldırınca dahil kalem 'Listede var · KABA İNŞAAT', ÇIKARILMIŞ kalem 'Listede var · İNCE İŞLER'; kutular KAPALI", async () => {
    renderPicker();
    await screen.findByText(SIVA.poz_no);
    expect(screen.queryByText(BETON.poz_no)).not.toBeInTheDocument();
    expect(screen.queryByText(DEMIR.poz_no)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: "Listede olanları gizle" }));
    expect(screen.getByText("Listede var · KABA İNŞAAT")).toBeInTheDocument();
    expect(screen.getByText("Listede var · İNCE İŞLER")).toBeInTheDocument();
    expect(check(BETON.poz_no)).toBeDisabled();
    expect(check(DEMIR.poz_no)).toBeDisabled();
  });
});

describe("dönüştürme hedefi — miktar BOŞ + zorunlu, B.F. önerisi son → ref → boş", () => {
  it("🔴 seçince miktar BOŞ kalır; 'Miktar girin' bantta + düğme KAPALI; miktar yazılınca açılır", async () => {
    renderPicker();
    await screen.findByText(SIVA.poz_no);
    await userEvent.click(check(LAST_EMPTY.poz_no));
    expect(quantityOf(LAST_EMPTY.poz_no)).toHaveValue("");
    expect(screen.getByTestId("wip-band")).toHaveTextContent("Miktar girin");
    expect(submit()).toBeDisabled();
    await userEvent.type(quantityOf(LAST_EMPTY.poz_no), "4");
    expect(submit()).toBeEnabled();
  });

  it("🔴 B.F. önerisi: son fiyat varsa o (3.410,00; ref 3.350,00 DEĞİL), yoksa referans (100,00), ikisi de yoksa boş + 'Birim fiyat girin'", async () => {
    mockCatalog([LAST_SZL, LAST_EMPTY, { ...BETON, id: "i-none", poz_no: "KAB-0900", ref_price: null, last_price: null }]);
    renderPicker({ groups: [] });
    await screen.findByText(LAST_SZL.poz_no);
    await userEvent.click(check(LAST_SZL.poz_no));
    await userEvent.click(check(LAST_EMPTY.poz_no));
    await userEvent.click(check("KAB-0900"));
    expect(priceOf(LAST_SZL.poz_no)).toHaveValue("3.410,00");
    expect(priceOf(LAST_EMPTY.poz_no)).toHaveValue("100,00");
    expect(priceOf("KAB-0900")).toHaveValue("");
    await userEvent.type(quantityOf(LAST_SZL.poz_no), "1");
    await userEvent.type(quantityOf(LAST_EMPTY.poz_no), "1");
    await userEvent.type(quantityOf("KAB-0900"), "1");
    expect(screen.getByTestId("wip-band")).toHaveTextContent("KAB-0900 Beton döküm — Birim fiyat girin");
  });

  it("Σ = Σ miktar × B.F.: 4 × 100,00 = ₺400,00", async () => {
    renderPicker({ groups: [] });
    await screen.findByText(LAST_EMPTY.poz_no);
    await userEvent.type(quantityOf(LAST_EMPTY.poz_no), "4");
    expect(screen.getByTestId("wip-total")).toHaveTextContent("₺400,00");
  });
});

describe("dönüştürme hedefi — gönderim (yerel gövde)", () => {
  it("🔴 mevcut gruba onay: gövde {groupId: grup anahtarı, entries} — HTTP alanları YOK, newGroup null", async () => {
    const props = renderPicker();
    await screen.findByText(SIVA.poz_no);
    await userEvent.type(quantityOf(LAST_SZL.poz_no), "12,5");
    await userEvent.click(submit());
    const submission = vi.mocked(props.onSubmit).mock.calls[0]?.[0];
    expect(submission?.newGroup).toBeNull();
    expect(submission?.body).toEqual({ groupId: "g:2", entries: [{ item: LAST_SZL, quantity: "12.5", unitPrice: "3410.00" }] });
    expect(JSON.stringify(submission?.body)).not.toMatch(/offer_item_id|group_id|sort_order/);
  });
});

describe("dönüştürme hedefi — yeni grup (YEREL)", () => {
  it("🔴 grupsuzda '+ Yeni Grup' seçili ve ad 'Yeni grup' ile DOLU", async () => {
    renderPicker({ groups: [] });
    await screen.findByText(SIVA.poz_no);
    expect(screen.getByRole("combobox", { name: "Grup" })).toHaveValue(NEW_GROUP_VALUE);
    expect(screen.getByLabelText("Grup Adı")).toHaveValue("Yeni grup");
  });

  it("🔴 'Yeni grup' zaten varsa varsayılan ad 'Yeni grup 2'", async () => {
    renderPicker({ groups: [{ id: "g:1", name: "Yeni grup", sort_order: 0, items: [] }] });
    await screen.findByText(SIVA.poz_no);
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Grup" }), NEW_GROUP_VALUE);
    expect(screen.getByLabelText("Grup Adı")).toHaveValue("Yeni grup 2");
  });

  it("🔴 yeni grup gönderimi newGroup taşır (body null); açılışta KİRLİ DEĞİL", async () => {
    const props = renderPicker({ groups: [] });
    await screen.findByText(SIVA.poz_no);
    expect(unsavedRegistry.labels()).not.toContain("Katalogdan kalem seçimi");
    await userEvent.type(quantityOf(LAST_EMPTY.poz_no), "2");
    await userEvent.click(submit());
    const submission = vi.mocked(props.onSubmit).mock.calls[0]?.[0];
    expect(submission?.body).toBeNull();
    expect(submission?.newGroup).toEqual({ name: "Yeni grup", sortOrder: 0 });
    expect(submission?.buildBody("ng:0")).toEqual({ groupId: "ng:0", entries: [{ item: LAST_EMPTY, quantity: "2", unitPrice: "100.00" }] });
  });

  it("🔴 mevcut grup adı yazılırsa 'Bu adla grup var' + düğme KAPALI; farklı ad açar", async () => {
    renderPicker();
    await screen.findByText(SIVA.poz_no);
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Grup" }), NEW_GROUP_VALUE);
    await userEvent.type(quantityOf(LAST_EMPTY.poz_no), "2");
    const name = screen.getByLabelText("Grup Adı");
    await userEvent.clear(name);
    await userEvent.type(name, "İNCE İŞLER");
    expect(screen.getByTestId("wip-band")).toHaveTextContent("Bu adla grup var");
    expect(submit()).toBeDisabled();
    await userEvent.type(name, " 2");
    expect(submit()).toBeEnabled();
  });
});

describe("dönüştürme hedefi — tavan (2000 − dahil kalem; tek seferde 200 sınırı YOK)", () => {
  it("🔴 dahil kalem 1999 iken ikinci kalem 'En fazla 2000 kalem dönüştürülebilir' + KAPALI; ÇIKARILMIŞ satırlar sayılmaz", async () => {
    renderPicker({ groups: [{ id: "g:1", name: "A", sort_order: 0, items: filler(1999) }] });
    await screen.findByText(SIVA.poz_no);
    await userEvent.type(quantityOf(LAST_EMPTY.poz_no), "1");
    expect(submit()).toBeEnabled();
    await userEvent.type(quantityOf(LAST_SZL.poz_no), "1");
    expect(screen.getByTestId("wip-band")).toHaveTextContent("En fazla 2000 kalem dönüştürülebilir");
    expect(submit()).toBeDisabled();
  });

  it("dahil 1998 + çıkarılmış 500: iki kalem (toplam 2000) seçilebilir", async () => {
    const outOfList = Array.from({ length: 500 }, (_, i) => ({ code: `X-${i}`, catalog_item_id: `x-${i}`, sort_order: i, isExcluded: true }));
    renderPicker({ groups: [{ id: "g:1", name: "A", sort_order: 0, items: filler(1998) }, { id: "g:2", name: "B", sort_order: 1, items: outOfList }] });
    await screen.findByText(SIVA.poz_no);
    await userEvent.type(quantityOf(LAST_EMPTY.poz_no), "1");
    await userEvent.type(quantityOf(LAST_SZL.poz_no), "1");
    expect(submit()).toBeEnabled();
  });
});

describe("🔴 F5.4b · hedef yerel grup seçici açıkken kalkarsa", () => {
  const LOCAL: PickerGroup = { id: "ng:1", name: "Yeni grup", sort_order: 2, items: [] };

  function renderWithRerender(groups: PickerGroup[]) {
    const props: CatalogPickerModalProps<ConvertAddBody> = {
      target: CONVERT_PICKER_TARGET, groups, onSubmit: vi.fn(), onClose: vi.fn(), isSubmitting: false, submitError: null,
    };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const tree = (next: PickerGroup[]) => (
      <QueryClientProvider client={client}>
        <CatalogPickerModal<ConvertAddBody> {...props} groups={next} />
      </QueryClientProvider>
    );
    const view = render(tree(groups));
    return { props, rerenderWith: (next: PickerGroup[]) => view.rerender(tree(next)) };
  }

  it("'Seçili grup artık yok' bantta + grup kutusu 'Grup seçin' + düğme KAPALI (sessiz başka gruba yazma YOK)", async () => {
    const { rerenderWith } = renderWithRerender([...GROUPS, LOCAL]);
    await screen.findByText(SIVA.poz_no);
    expect(screen.getByRole("combobox", { name: "Grup" })).toHaveValue("ng:1");
    await userEvent.type(quantityOf(LAST_EMPTY.poz_no), "2");
    expect(submit()).toBeEnabled();
    rerenderWith(GROUPS);
    expect(screen.getByTestId("wip-band")).toHaveTextContent("Seçili grup artık yok");
    expect(screen.getByRole("combobox", { name: "Grup" })).toHaveValue("");
    expect(submit()).toBeDisabled();
  });
});

describe("🔴 F5.4b · yeni grup adı en çok 200 karakter (backend grup adı)", () => {
  it("kutu maxLength 200; programatik 201 karakter → 'En çok 200 karakter' + düğme KAPALI; 200 geçerli", async () => {
    renderPicker({ groups: [] });
    await screen.findByText(SIVA.poz_no);
    await userEvent.type(quantityOf(LAST_EMPTY.poz_no), "2");
    const name = screen.getByLabelText("Grup Adı");
    expect(name).toHaveAttribute("maxlength", "200");
    fireEvent.change(name, { target: { value: "a".repeat(201) } });
    expect(screen.getByTestId("wip-band")).toHaveTextContent("En çok 200 karakter");
    expect(submit()).toBeDisabled();
    fireEvent.change(name, { target: { value: "a".repeat(200) } });
    expect(submit()).toBeEnabled();
  });
});

describe("🔴 F5.4b · Eklenecek Tutar = SATIR BAŞI ROUND_HALF_UP toplamı (tabloyla aynı)", () => {
  it("iki satır 0,005 × 1,00 → ₺0,02 (toplamda yuvarlansaydı ₺0,01)", async () => {
    renderPicker({ groups: [] });
    await screen.findByText(SIVA.poz_no);
    for (const item of [LAST_EMPTY, LAST_SZL]) {
      await userEvent.type(quantityOf(item.poz_no), "0,005");
      await userEvent.clear(priceOf(item.poz_no));
      await userEvent.type(priceOf(item.poz_no), "1,00");
    }
    expect(screen.getByTestId("wip-total")).toHaveTextContent("₺0,02");
  });
});
