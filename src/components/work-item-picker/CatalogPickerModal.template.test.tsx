import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { MSG_ITEMS_TOO_MANY } from "@/components/offer-templates/template-content";
import { backendClient } from "@/lib/api/client";
import type { WorkItemRead } from "@/lib/api/models";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";
import { mockVirtualViewport } from "@/components/catalog-shared/virtual-viewport.testkit";
import { BETON, DEMIR, D_DUV, D_KAB, SIVA } from "@/components/work-item-catalog/work-item-fixtures";

import { CatalogPickerModal, type CatalogPickerModalProps } from "./CatalogPickerModal";
import type { PickerGroup } from "./picker-model";
import { TEMPLATE_PICKER_TARGET, type TemplateAddBody } from "./picker-target";

const scope = vi.hoisted(() => ({ value: { isRestricted: false, names: [] as string[] } }));

vi.mock("@/lib/api/client", () => ({ backendClient: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn() } }));
vi.mock("@/lib/auth/useDisciplineScope", () => ({ useDisciplineScope: () => scope.value }));

const NEW_GROUP_VALUE = "__new__";

/** Şablonda BETON var (grup "Betonarme"); DEMIR ve SIVA serbest. */
const GROUPS: PickerGroup[] = [
  { id: "g-1", name: "Betonarme", sort_order: 0, items: [{ code: BETON.poz_no, catalog_item_id: BETON.id, sort_order: 0 }] },
  { id: "g-2", name: "Kalıp", sort_order: 1, items: [] },
];

const ok = (data: unknown) => ({ data, error: undefined, response: new Response(null, { status: 200 }) }) as never;

function mockCatalog(items: WorkItemRead[]) {
  vi.mocked(backendClient.GET).mockImplementation((async (path: string) => {
    if (path === "/catalog/disciplines") return ok({ items: [D_KAB, D_DUV] });
    if (path === "/catalog/items") return ok({ items });
    throw new Error(`beklenmeyen GET ${path}`);
  }) as never);
}

function renderPicker(over: Partial<CatalogPickerModalProps<TemplateAddBody>> = {}) {
  const props: CatalogPickerModalProps<TemplateAddBody> = {
    target: TEMPLATE_PICKER_TARGET,
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
const submit = () => screen.getByRole("button", { name: /Kalemi Ekle|^Kalem Ekle$|Ekleniyor/ });
const filler = (count: number): PickerGroup["items"] =>
  Array.from({ length: count }, (_, i) => ({ code: `F-${i}`, catalog_item_id: `fill-${i}`, sort_order: i }));

beforeEach(() => {
  vi.clearAllMocks();
  scope.value = { isRestricted: false, names: [] };
  mockCatalog([BETON, DEMIR, SIVA]);
});

afterEach(() => {
  unsavedRegistry.set("test-cleanup", null);
});

describe("şablon hedefi — kabuk (selectOnly)", () => {
  it("başlık, alt metin (bağlamsız), bant ve süzgeç etiketi TKL-F4-PLAN §3 metinleri", async () => {
    renderPicker();
    await screen.findByText(DEMIR.poz_no);
    expect(screen.getByRole("dialog", { name: "Katalogdan Kalem Ekle" })).toBeInTheDocument();
    expect(screen.getByText("İş Kalemi Kataloğu'ndan şablona kalem ekle")).toBeInTheDocument();
    expect(screen.getByText(/Şablonda miktar ve fiyat tutulmaz;/).closest("p")).toHaveTextContent(
      "Şablonda miktar ve fiyat tutulmaz; kalem seti ve gruplar saklanır.",
    );
    expect(screen.getByRole("checkbox", { name: "Şablonda olanları gizle" })).toBeChecked();
  });

  it("🔴 Miktar / fiyat / Tutar kolonu YOK; kutu YOK; yalnız katalog bilgisi kolonları", async () => {
    renderPicker();
    await screen.findByText(DEMIR.poz_no);
    const headers = screen.getAllByRole("columnheader").map((header) => header.textContent);
    expect(headers).toEqual(["", "Poz No", "Tanım", "Birim", "Ref. fiyat", "Son fiyat"]);
    expect(within(rowOf(DEMIR.poz_no)).queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByTestId("wip-amount")).not.toBeInTheDocument();
    expect(within(rowOf(DEMIR.poz_no)).getAllByRole("cell")).toHaveLength(6);
  });

  it("🔴 boş durum / bölüm başlığı satırı yeni kolon sayısına yayılır (colSpan 6)", async () => {
    renderPicker();
    await screen.findByText(DEMIR.poz_no);
    const section = screen.getByText("KAB — Kaba İnşaat").closest("td");
    expect(section).toHaveAttribute("colspan", "6");
  });

  it("🔴 'Şablonda olanları gizle' kaldırılınca olan kalem 'Şablonda var · {grup}' + kutu KAPALI", async () => {
    renderPicker();
    await screen.findByText(DEMIR.poz_no);
    expect(screen.queryByText(BETON.poz_no)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: "Şablonda olanları gizle" }));
    expect(screen.getByText("Şablonda var · Betonarme")).toBeInTheDocument();
    expect(check(BETON.poz_no)).toBeDisabled();
  });
});

describe("şablon hedefi — seçim ve altbilgi", () => {
  it("🔴 yalnız onay kutusuyla seçilir: altbilgi Σ yerine 'N kalem seçildi'; 'Eklenecek' toplamı YOK", async () => {
    renderPicker();
    await screen.findByText(DEMIR.poz_no);
    expect(screen.queryByTestId("wip-total")).not.toBeInTheDocument();
    expect(screen.queryByText(/Eklenecek (Tutar|maliyet)/)).not.toBeInTheDocument();
    await userEvent.click(check(DEMIR.poz_no));
    await userEvent.click(check(SIVA.poz_no));
    expect(screen.getByTestId("wip-selected")).toHaveTextContent("2");
    expect(screen.getByText(/kalem seçildi/)).toHaveTextContent("2 kalem seçildi");
    expect(submit()).toHaveTextContent("2 Kalemi Ekle");
  });

  it("🔴 doğrulama YOK: miktar/fiyat girilmeden gönderilebilir; hata bandı çıkmaz", async () => {
    renderPicker();
    await screen.findByText(DEMIR.poz_no);
    await userEvent.click(check(DEMIR.poz_no));
    expect(submit()).toBeEnabled();
    expect(screen.queryByTestId("wip-band")).not.toBeInTheDocument();
  });

  it("🔴 mevcut gruba onay: gövde {groupId, catalogIds} katalog satır sırasında (HTTP gövdesi DEĞİL), newGroup null", async () => {
    const props = renderPicker();
    await screen.findByText(DEMIR.poz_no);
    expect(screen.getByRole("combobox", { name: "Grup" })).toHaveValue("g-2");
    await userEvent.click(check(SIVA.poz_no));
    await userEvent.click(check(DEMIR.poz_no));
    await userEvent.click(submit());
    expect(props.onSubmit).toHaveBeenCalledTimes(1);
    const submission = vi.mocked(props.onSubmit).mock.calls[0]?.[0];
    expect(submission?.count).toBe(2);
    expect(submission?.newGroup).toBeNull();
    expect(submission?.body).toEqual({ groupId: "g-2", catalogIds: [SIVA.id, DEMIR.id] });
  });
});

describe("şablon hedefi — seçim tavanı (1000 − mevcut)", () => {
  it("🔴 tavan AŞILINCA backend metni bantta + düğme KAPALI; tavana kadar açık", async () => {
    renderPicker({ groups: [{ id: "g-1", name: "A", sort_order: 0, items: filler(999) }] });
    await screen.findByText(DEMIR.poz_no);
    await userEvent.click(check(DEMIR.poz_no));
    expect(submit()).toBeEnabled();
    expect(screen.queryByTestId("wip-band")).not.toBeInTheDocument();
    await userEvent.click(check(SIVA.poz_no));
    expect(screen.getByTestId("wip-band")).toHaveTextContent(MSG_ITEMS_TOO_MANY);
    expect(submit()).toBeDisabled();
  });

  it("🔴 sözleşme/teklif 200 tavanı bu hedefte uygulanmaz (şablon 200'den fazla seçilebilir)", async () => {
    const many = Array.from({ length: 201 }, (_, i) => ({ ...DEMIR, id: `m-${i}`, poz_no: `KAB-9${String(i).padStart(3, "0")}` }));
    mockCatalog(many);
    const restoreViewport = mockVirtualViewport(); // 201 satır = sanallaştırma eşiği üstü: jsdom'da pencere yüksekliği taklit edilir
    renderPicker({ groups: [] });
    await screen.findByText("KAB-9000");
    await userEvent.click(screen.getByRole("checkbox", { name: "Görünen kalemlerin tümünü seç" }));
    expect(screen.getByTestId("wip-selected")).toHaveTextContent("201");
    expect(submit()).toBeEnabled();
    restoreViewport();
  });
});

describe("şablon hedefi — yeni grup", () => {
  it("🔴 grupsuz şablonda '+ Yeni Grup' seçili ve ad 'Yeni grup' ile DOLU; gönderim newGroup taşır, body null", async () => {
    const props = renderPicker({ groups: [] });
    await screen.findByText(DEMIR.poz_no);
    expect(screen.getByRole("combobox", { name: "Grup" })).toHaveValue(NEW_GROUP_VALUE);
    expect(screen.getByLabelText("Grup Adı")).toHaveValue("Yeni grup");
    await userEvent.click(check(DEMIR.poz_no));
    await userEvent.click(submit());
    const submission = vi.mocked(props.onSubmit).mock.calls[0]?.[0];
    expect(submission?.body).toBeNull();
    expect(submission?.newGroup).toEqual({ name: "Yeni grup", sortOrder: 0 });
    expect(submission?.buildBody("")).toEqual({ groupId: "", catalogIds: [DEMIR.id] });
  });

  it("🔴 'Yeni grup' zaten varsa varsayılan ad 'Yeni grup 2' (offer-group-names kuralı)", async () => {
    renderPicker({ groups: [{ id: "g-1", name: "Yeni grup", sort_order: 0, items: [] }] });
    await screen.findByText(DEMIR.poz_no);
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Grup" }), NEW_GROUP_VALUE);
    expect(screen.getByLabelText("Grup Adı")).toHaveValue("Yeni grup 2");
  });

  it("🔴 mevcut bir grubun adı yazılırsa 'Bu adla grup var' + düğme KAPALI; farklı ad açar", async () => {
    renderPicker();
    await screen.findByText(DEMIR.poz_no);
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Grup" }), NEW_GROUP_VALUE);
    await userEvent.click(check(DEMIR.poz_no));
    const name = screen.getByLabelText("Grup Adı");
    await userEvent.clear(name);
    await userEvent.type(name, "Kalıp");
    expect(screen.getByTestId("wip-band")).toHaveTextContent("Bu adla grup var");
    expect(submit()).toBeDisabled();
    await userEvent.type(name, " 2");
    expect(submit()).toBeEnabled();
  });

  it("🔴 ad boşaltılırsa mevcut 'Yeni grup için ad girin' kuralı; seçim yokken bant YOK", async () => {
    renderPicker({ groups: [] });
    await screen.findByText(DEMIR.poz_no);
    await userEvent.clear(screen.getByLabelText("Grup Adı"));
    expect(screen.queryByTestId("wip-band")).not.toBeInTheDocument();
    await userEvent.click(check(DEMIR.poz_no));
    expect(screen.getByTestId("wip-band")).toHaveTextContent("Yeni grup için ad girin");
    expect(submit()).toBeDisabled();
  });
});

describe("şablon hedefi — kaydedilmemiş değişiklik", () => {
  it("🔴 açılışta (varsayılan ad dolu olsa da) KİRLİ DEĞİL; seçim kirletir; kirliyken Vazgeç onay sormaz ama kayıt tutulur", async () => {
    renderPicker({ groups: [] });
    await screen.findByText(DEMIR.poz_no);
    expect(unsavedRegistry.labels()).not.toContain("Katalogdan kalem seçimi");
    await userEvent.click(check(DEMIR.poz_no));
    await waitFor(() => expect(unsavedRegistry.labels()).toContain("Katalogdan kalem seçimi"));
  });

  it("kirli seçimle arka plan tıklaması mevcut onayı sorar (reddedilirse kapanmaz)", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const props = renderPicker();
    await screen.findByText(DEMIR.poz_no);
    await userEvent.click(check(DEMIR.poz_no));
    await userEvent.click(document.querySelector(".modal-overlay") as HTMLElement);
    expect(confirmSpy).toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
