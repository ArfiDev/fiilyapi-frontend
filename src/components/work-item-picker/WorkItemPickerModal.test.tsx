import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { backendClient } from "@/lib/api/client";
import type { EmployerContractItemsResponse } from "@/lib/api/hooks/useContract";
import type { WorkItemRead } from "@/lib/api/models";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";
import {
  BETON,
  DEMIR,
  D_DUV,
  D_KAB,
  LAST_MASKED,
  LAST_SZL,
  SIVA,
} from "@/components/work-item-catalog/work-item-fixtures";

import { WorkItemPickerModal, type WorkItemPickerModalProps } from "./WorkItemPickerModal";

const scope = vi.hoisted(() => ({ value: { isRestricted: false, names: [] as string[] } }));

vi.mock("@/lib/api/client", () => ({ backendClient: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn() } }));
vi.mock("@/lib/auth/useDisciplineScope", () => ({ useDisciplineScope: () => scope.value }));

type Groups = EmployerContractItemsResponse["groups"];

const NEW_GROUP_VALUE = "__new__";
const NO_GROUPS = [] as unknown as Groups;

function contractItem(over: { id: string; code: string; catalog_item_id: string | null; sort_order?: number }) {
  return { description: "x", unit: "m³", quantity: "1", unit_price: "1", sort_order: 0, ...over };
}

/** Sözleşmede BETON katalogdan bağlı (kodu özel), DEMIR'in poz no'su başka kalemde. */
const GROUPS = [
  {
    id: "g-1",
    name: "KABA İNŞAAT",
    sort_order: 1,
    items: [
      contractItem({ id: "c-1", code: "ÖZEL-1", catalog_item_id: BETON.id, sort_order: 5 }),
      contractItem({ id: "c-2", code: DEMIR.poz_no, catalog_item_id: null, sort_order: 6 }),
    ],
  },
  { id: "g-2", name: "İNCE İŞLER", sort_order: 2, items: [contractItem({ id: "c-3", code: "X-1", catalog_item_id: null, sort_order: 2 })] },
] as unknown as Groups;

const ok = (data: unknown, status = 200) => ({ data, error: undefined, response: new Response(null, { status }) }) as never;
const fail = (status: number, detail: string) =>
  ({ data: undefined, error: { detail }, response: new Response(null, { status }) }) as never;

function mockCatalog(items: WorkItemRead[], itemsResult?: unknown) {
  vi.mocked(backendClient.GET).mockImplementation((async (path: string) => {
    if (path === "/catalog/disciplines") return ok({ items: [D_KAB, D_DUV] });
    if (path === "/catalog/items") return itemsResult ?? ok({ items });
    throw new Error(`beklenmeyen GET ${path}`);
  }) as never);
}

function renderPicker(over: Partial<WorkItemPickerModalProps> = {}) {
  const props: WorkItemPickerModalProps = {
    projectName: "Gökova Konutları",
    groups: GROUPS,
    onSubmit: vi.fn(),
    onClose: vi.fn(),
    isSubmitting: false,
    submitError: null,
    ...over,
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <WorkItemPickerModal {...props} />
    </QueryClientProvider>,
  );
  const rerenderWith = (next: Partial<WorkItemPickerModalProps>) =>
    view.rerender(
      <QueryClientProvider client={client}>
        <WorkItemPickerModal {...props} {...next} />
      </QueryClientProvider>,
    );
  return { ...props, rerenderWith };
}

async function ready(pozNo = SIVA.poz_no) {
  await screen.findByText(pozNo);
}

/** Son fiyatı olmayan, yalnız referans fiyatı olan kalem. */
const REF_ONLY: WorkItemRead = { ...SIVA, id: "i-ref", poz_no: "DUV-0002", name: "Ref kalemi", ref_price: "450.50" };

const rowOf = (pozNo: string) => screen.getByText(pozNo).closest("tr") as HTMLElement;
const quantityOf = (pozNo: string) => within(rowOf(pozNo)).getByLabelText(`${pozNo} miktar`);
const priceOf = (pozNo: string) => within(rowOf(pozNo)).getByLabelText(`${pozNo} birim fiyat`);
const boxOf = (pozNo: string) => within(rowOf(pozNo)).getByRole("checkbox", { name: `${pozNo} seç` });
const submitButton = () => screen.getByRole("button", { name: /Pozu Ekle|^Poz Ekle$|Ekleniyor/ });

beforeEach(() => {
  vi.clearAllMocks();
  scope.value = { isRestricted: false, names: [] };
  mockCatalog([BETON, DEMIR, SIVA, LAST_SZL, LAST_MASKED]);
});

afterEach(() => {
  unsavedRegistry.set("test-cleanup", null);
});

describe("kabuk ve metinler (§1.4, §6 varsayılanları)", () => {
  it("başlık, alt metin, bilgi bandı, arama yer tutucusu, sayaç", async () => {
    renderPicker();
    await ready();
    expect(screen.getByRole("dialog", { name: "Katalogdan Poz Ekle" })).toBeInTheDocument();
    expect(
      screen.getByText("Gökova Konutları · İş Kalemi Kataloğu'ndan işveren sözleşmesine poz ekle"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Poz no, tanım ve birim katalogdan kopyalanır\./)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Poz no veya tanımda ara...")).toBeInTheDocument();
    expect(screen.getByTestId("wip-count")).toHaveTextContent("0 poz seçili · 3 poz listede");
  });

  it("9 kolon (PS kolon sayısı korunur) ve hiçbir yerde role=alert yok", async () => {
    renderPicker();
    await ready();
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toHaveLength(9);
    expect(headers.slice(1)).toEqual(["Poz No", "Tanım", "Birim", "Ref. fiyat", "Son fiyat", "Miktar", "Birim fiyat", "Tutar"]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("disiplin başlık satırları 'KOD — Ad'; alt satırda 'KOD · Disiplin'", async () => {
    renderPicker();
    await ready();
    expect(screen.getByText("KAB — Kaba İnşaat")).toBeInTheDocument();
    expect(screen.getByText("DUV — Duvar & Sıva")).toBeInTheDocument();
    expect(within(rowOf("DUV-0001")).getByText("DUV · Duvar & Sıva")).toBeInTheDocument();
  });
});

describe("yükleme / hata / boş hâller (§1.6)", () => {
  it("yüklenirken 'Yükleniyor…'", async () => {
    vi.mocked(backendClient.GET).mockImplementation((() => new Promise(() => undefined)) as never);
    renderPicker();
    expect(await screen.findByText("Yükleniyor…")).toBeInTheDocument();
  });

  it("hata → 'İş kalemi kataloğu yüklenemedi'; 403 → yetki metni", async () => {
    mockCatalog([], fail(500, "boom"));
    renderPicker();
    expect(await screen.findByText("İş kalemi kataloğu yüklenemedi")).toBeInTheDocument();
  });

  it("403 → 'Kataloğu görme yetkiniz yok.'", async () => {
    mockCatalog([], fail(403, "Yetkisiz işlem"));
    renderPicker();
    expect(await screen.findByText("Kataloğu görme yetkiniz yok.")).toBeInTheDocument();
  });

  it("katalog boş → ÜS-F2-24 metni + katalog ekranı bağlantısı", async () => {
    mockCatalog([]);
    renderPicker();
    expect(
      await screen.findByText(
        (_, element) =>
          element?.tagName === "TD" &&
          element.textContent === "İş kalemi kataloğu boş — önce Planlama › İş Kalemi Kataloğu'ndan kalem ekleyin.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "İş Kalemi Kataloğu" })).toHaveAttribute("href", "/planlama/is-kalemi-katalogu");
  });

  it("kısıtlı kullanıcı + boş liste → RestrictedEmptyNotice", async () => {
    scope.value = { isRestricted: true, names: ["Kaba İnşaat"] };
    mockCatalog([]);
    renderPicker();
    expect(await screen.findByTestId("restricted-empty-notice")).toBeInTheDocument();
  });

  it("süzgece uyan yoksa 'Süzgece uyan poz yok.'", async () => {
    const user = userEvent.setup();
    renderPicker();
    await ready();
    await user.type(screen.getByPlaceholderText("Poz no veya tanımda ara..."), "zzzz");
    expect(screen.getByText("Süzgece uyan poz yok.")).toBeInTheDocument();
  });
});

describe("süzgeçler", () => {
  it("'Sözleşmede olanları gizle' İŞARETLİ açılır: bağlı ve kod çakışmalı satırlar yok", async () => {
    renderPicker();
    await ready();
    expect(screen.getByRole("checkbox", { name: "Sözleşmede olanları gizle" })).toBeChecked();
    expect(screen.queryByText(BETON.poz_no)).not.toBeInTheDocument();
    expect(screen.queryByText(DEMIR.poz_no)).not.toBeInTheDocument();
  });

  it("işaret kalkınca satırlar soluk + kutu kapalı + gerekçe metni (bağlı: grup adı)", async () => {
    const user = userEvent.setup();
    renderPicker();
    await ready();
    await user.click(screen.getByRole("checkbox", { name: "Sözleşmede olanları gizle" }));
    expect(boxOf(BETON.poz_no)).toBeDisabled();
    expect(within(rowOf(BETON.poz_no)).getByText("Sözleşmede var · KABA İNŞAAT")).toBeInTheDocument();
    expect(boxOf(DEMIR.poz_no)).toBeDisabled();
    expect(
      within(rowOf(DEMIR.poz_no)).getByText("Bu poz no sözleşmede başka bir kalemde kullanılıyor"),
    ).toBeInTheDocument();
    expect(quantityOf(BETON.poz_no)).toBeDisabled();
    expect(boxOf(SIVA.poz_no)).toBeEnabled();
  });

  it("arama tr-TR: 'İÇ SIVA' bulur, ASCII 'IC SIVA' bulmaz (İ→i, I→ı)", async () => {
    const user = userEvent.setup();
    renderPicker();
    await ready();
    const search = screen.getByPlaceholderText("Poz no veya tanımda ara...");
    await user.type(search, "İÇ SIVA");
    expect(screen.getByText(SIVA.poz_no)).toBeInTheDocument();
    expect(screen.queryByText(LAST_SZL.poz_no)).not.toBeInTheDocument();
    await user.clear(search);
    await user.type(search, "IC SIVA");
    expect(screen.queryByText(SIVA.poz_no)).not.toBeInTheDocument();
  });

  it("disiplin süzgeci (Select) yalnız o disiplini gösterir; sayaç güncellenir", async () => {
    const user = userEvent.setup();
    renderPicker();
    await ready();
    await user.selectOptions(screen.getByLabelText("Disiplin"), D_DUV.id);
    expect(screen.getByText(SIVA.poz_no)).toBeInTheDocument();
    expect(screen.queryByText(LAST_SZL.poz_no)).not.toBeInTheDocument();
    expect(screen.getByTestId("wip-count")).toHaveTextContent("0 poz seçili · 1 poz listede");
  });
});

describe("seçim ve para girişi (§1.5)", () => {
  it("miktar yazmak satırı OTOMATİK seçer; B.F. önerisi son fiyat (TR biçimi); tutar ve altbilgi güncellenir", async () => {
    const user = userEvent.setup();
    renderPicker();
    await ready();
    await user.type(quantityOf(LAST_SZL.poz_no), "2");
    expect(boxOf(LAST_SZL.poz_no)).toBeChecked();
    expect(priceOf(LAST_SZL.poz_no)).toHaveValue("3.410,00");
    expect(within(rowOf(LAST_SZL.poz_no)).getByTestId("wip-amount")).toHaveTextContent("6.820,00");
    expect(screen.getByTestId("wip-selected")).toHaveTextContent("1");
    expect(screen.getByTestId("wip-total")).toHaveTextContent("₺6.820,00");
    expect(submitButton()).toHaveTextContent("1 Pozu Ekle");
  });

  it("son fiyat yoksa referans fiyat önerilir (seçilince kutu dolar, kullanıcı değiştirebilir)", async () => {
    mockCatalog([REF_ONLY]);
    const user = userEvent.setup();
    renderPicker();
    await ready(REF_ONLY.poz_no);
    expect(priceOf(REF_ONLY.poz_no)).toHaveValue("");
    await user.click(boxOf(REF_ONLY.poz_no));
    expect(priceOf(REF_ONLY.poz_no)).toHaveValue("450,50");
    await user.clear(priceOf(REF_ONLY.poz_no));
    await user.type(priceOf(REF_ONLY.poz_no), "460");
    expect(priceOf(REF_ONLY.poz_no)).toHaveValue("460");
  });

  it("maskeli (limited) kalemde öneri BOŞ; kullanıcı fiyat yazarsa Σ gösterilir", async () => {
    const user = userEvent.setup();
    renderPicker();
    await ready();
    expect(within(rowOf(LAST_MASKED.poz_no)).getAllByText("—").length).toBeGreaterThan(0);
    await user.type(quantityOf(LAST_MASKED.poz_no), "3");
    expect(priceOf(LAST_MASKED.poz_no)).toHaveValue("");
    await user.type(priceOf(LAST_MASKED.poz_no), "10,50");
    expect(screen.getByTestId("wip-total")).toHaveTextContent("₺31,50");
  });

  it("kutuyu kaldırınca gövdeden düşer, yazılan değerler kalır", async () => {
    const user = userEvent.setup();
    const props = renderPicker();
    await ready();
    await user.type(quantityOf(LAST_SZL.poz_no), "2");
    await user.click(boxOf(LAST_SZL.poz_no));
    expect(boxOf(LAST_SZL.poz_no)).not.toBeChecked();
    expect(quantityOf(LAST_SZL.poz_no)).toHaveValue("2");
    expect(submitButton()).toBeDisabled();
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it("belirsiz '1.5': satır hatası + altbilgi bandı + düğme KAPALI (sessiz yanlış okuma yok)", async () => {
    const user = userEvent.setup();
    renderPicker();
    await ready();
    await user.type(quantityOf(LAST_SZL.poz_no), "1.5");
    expect(within(rowOf(LAST_SZL.poz_no)).getByText("Ondalık için virgül kullanın (ör. 28,50)")).toBeInTheDocument();
    const band = screen.getByTestId("wip-band");
    expect(band).toHaveTextContent("1 pozda eksik ya da hatalı değer var");
    expect(band).toHaveTextContent("KAB-0101 Kalıp işçiliği — Ondalık için virgül kullanın (ör. 28,50)");
    expect(submitButton()).toBeDisabled();
  });

  it("'1.500' miktar 1500 okunur (binlik), tutar buna göre", async () => {
    const user = userEvent.setup();
    renderPicker();
    await ready();
    await user.type(quantityOf(LAST_SZL.poz_no), "1.500");
    await user.clear(priceOf(LAST_SZL.poz_no));
    await user.type(priceOf(LAST_SZL.poz_no), "2");
    expect(screen.getByTestId("wip-total")).toHaveTextContent("₺3.000,00");
  });

  it("seçili satırda boş B.F. → 'Birim fiyat girin' ve düğme kapalı", async () => {
    const user = userEvent.setup();
    renderPicker();
    await ready();
    await user.type(quantityOf(SIVA.poz_no), "4");
    expect(within(rowOf(SIVA.poz_no)).getByText("Birim fiyat girin")).toBeInTheDocument();
    expect(submitButton()).toBeDisabled();
  });

  it("başlık kutusu YALNIZ görünen + seçilebilir satırları seçer; kısmi seçimde indeterminate", async () => {
    const user = userEvent.setup();
    renderPicker();
    await ready();
    await user.click(screen.getByRole("checkbox", { name: "Sözleşmede olanları gizle" })); // 5 satır görünür, 2'si kapalı
    const header = screen.getByRole("checkbox", { name: "Görünen pozların tümünü seç" }) as HTMLInputElement;
    expect(header.indeterminate).toBe(false);
    await user.click(header);
    expect(boxOf(BETON.poz_no)).not.toBeChecked();
    expect(boxOf(DEMIR.poz_no)).not.toBeChecked();
    expect(boxOf(SIVA.poz_no)).toBeChecked();
    expect(boxOf(LAST_SZL.poz_no)).toBeChecked();
    expect(header).toBeChecked();
    await user.click(boxOf(SIVA.poz_no));
    expect(header.indeterminate).toBe(true);
    await user.click(header); // kısmi → hepsini seç
    expect(boxOf(SIVA.poz_no)).toBeChecked();
    await user.click(header); // hepsi seçili → bırak
    expect(boxOf(SIVA.poz_no)).not.toBeChecked();
    expect(boxOf(LAST_SZL.poz_no)).not.toBeChecked();
  });

  it("başlık kutusu SÜZÜLMÜŞ (görünmeyen) satırlara dokunmaz", async () => {
    const user = userEvent.setup();
    renderPicker();
    await ready();
    await user.selectOptions(screen.getByLabelText("Disiplin"), D_DUV.id);
    await user.click(screen.getByRole("checkbox", { name: "Görünen pozların tümünü seç" }));
    await user.selectOptions(screen.getByLabelText("Disiplin"), "");
    expect(boxOf(SIVA.poz_no)).toBeChecked();
    expect(boxOf(LAST_SZL.poz_no)).not.toBeChecked();
  });

  it("200 tavanı: aşınca bant + düğme KAPALI", async () => {
    const many = Array.from({ length: 201 }, (_, i) => ({
      ...SIVA,
      id: `m-${i}`,
      poz_no: `DUV-${String(i + 100).padStart(4, "0")}`,
      name: `Kalem ${i}`,
    }));
    mockCatalog(many);
    const user = userEvent.setup();
    renderPicker();
    await screen.findByText("DUV-0100");
    await user.click(screen.getByRole("checkbox", { name: "Görünen pozların tümünü seç" }));
    expect(screen.getByTestId("wip-band")).toHaveTextContent("Tek seferde en fazla 200 poz eklenebilir");
    expect(submitButton()).toBeDisabled();
  });
});

describe("gönderim — onSubmit'e gövde (§2.3)", () => {
  async function fillOne(user: ReturnType<typeof userEvent.setup>) {
    await user.type(quantityOf(LAST_SZL.poz_no), "480");
    await user.clear(priceOf(LAST_SZL.poz_no));
    await user.type(priceOf(LAST_SZL.poz_no), "3.320,00");
  }

  it("mevcut grup (VARSAYILAN: sort_order en büyük = son grup): TEK gövde, kayıpsız metin, ardışık sıra", async () => {
    const user = userEvent.setup();
    const props = renderPicker();
    await ready();
    expect((screen.getByLabelText("Grup") as HTMLSelectElement).value).toBe("g-2");
    await fillOne(user);
    await user.type(quantityOf(SIVA.poz_no), "12,5");
    await user.type(priceOf(SIVA.poz_no), "100,5");
    await user.click(submitButton());
    expect(props.onSubmit).toHaveBeenCalledTimes(1);
    const submission = vi.mocked(props.onSubmit).mock.calls[0]?.[0];
    expect(submission?.count).toBe(2);
    expect(submission?.newGroup).toBeNull();
    // poz no sırası: DUV-0001 (SIVA) önce, KAB-0101 sonra; taban = g-2'deki en büyük sort_order (2) + 1
    expect(submission?.body).toEqual({
      items: [
        {
          group_id: "g-2",
          code: "DUV-0001",
          description: "İç sıva",
          unit: "m²",
          quantity: "12.5",
          unit_price: "100.50",
          sort_order: 3,
          catalog_item_id: SIVA.id,
        },
        {
          group_id: "g-2",
          code: "KAB-0101",
          description: "Kalıp işçiliği",
          unit: "m³",
          quantity: "480",
          unit_price: "3320.00",
          sort_order: 4,
          catalog_item_id: LAST_SZL.id,
        },
      ],
    });
  });

  it("başka grup seçilince gövde o gruba gider ve sıra o grubun sonundan başlar", async () => {
    const user = userEvent.setup();
    const props = renderPicker();
    await ready();
    await user.selectOptions(screen.getByLabelText("Grup"), "g-1");
    await fillOne(user);
    await user.click(submitButton());
    const body = vi.mocked(props.onSubmit).mock.calls[0]?.[0].body;
    expect(body?.items[0]?.group_id).toBe("g-1");
    expect(body?.items[0]?.sort_order).toBe(7);
  });

  it("grupsuz sözleşme: '+ Yeni Grup' seçili, ad zorunlu; gönderimde newGroup + buildBody(id)", async () => {
    const user = userEvent.setup();
    const props = renderPicker({ groups: NO_GROUPS });
    await ready();
    expect((screen.getByLabelText("Grup") as HTMLSelectElement).value).toBe(NEW_GROUP_VALUE);
    await fillOne(user);
    expect(submitButton()).toBeDisabled();
    await user.type(screen.getByLabelText("Grup Adı"), "  KABA İNŞAAT ");
    expect(submitButton()).toBeEnabled();
    await user.click(submitButton());
    const submission = vi.mocked(props.onSubmit).mock.calls[0]?.[0];
    expect(submission?.body).toBeNull();
    expect(submission?.newGroup).toEqual({ name: "KABA İNŞAAT", sortOrder: 0 });
    expect(submission?.buildBody("new-id").items[0]).toMatchObject({ group_id: "new-id", sort_order: 0 });
  });

  it("yeni grup açılmış ama bulk düşmüşse (createdGroup) o grup SEÇİLİ kalır, ikinci grup istenmez", async () => {
    const user = userEvent.setup();
    const props = renderPicker({ groups: NO_GROUPS, createdGroup: { id: "g-new", name: "KABA İNŞAAT" } });
    await ready();
    expect((screen.getByLabelText("Grup") as HTMLSelectElement).value).toBe("g-new");
    expect(screen.queryByLabelText("Grup Adı")).not.toBeInTheDocument();
    await fillOne(user);
    await user.click(submitButton());
    expect(vi.mocked(props.onSubmit).mock.calls[0]?.[0].body?.items[0]?.group_id).toBe("g-new");
  });

  it("gönderilirken: düğme 'Ekleniyor…' kapalı, girişler kilitli, Vazgeç kapalı, Esc kapatmaz", async () => {
    const user = userEvent.setup();
    const props = renderPicker({ isSubmitting: true });
    await ready();
    expect(screen.getByRole("button", { name: "Ekleniyor…" })).toBeDisabled();
    expect(quantityOf(LAST_SZL.poz_no)).toBeDisabled();
    expect(boxOf(LAST_SZL.poz_no)).toBeDisabled();
    expect(screen.getByRole("button", { name: "Vazgeç" })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("sunucu hatası (submitError) bantta AYNEN görünür ve yazılan seçim/değerler KORUNUR (hep-ya-hiç)", async () => {
    const message = "Bu poz numarası bu sözleşmede zaten kullanılıyor: KAB-0101";
    const user = userEvent.setup();
    const { rerenderWith } = renderPicker();
    await ready();
    await user.type(quantityOf(LAST_SZL.poz_no), "2");
    expect(screen.queryByTestId("wip-band")).not.toBeInTheDocument();
    rerenderWith({ submitError: message });
    expect(screen.getByTestId("wip-band")).toHaveTextContent(message);
    expect(boxOf(LAST_SZL.poz_no)).toBeChecked();
    expect(quantityOf(LAST_SZL.poz_no)).toHaveValue("2");
    expect(submitButton()).toBeEnabled();
  });

  it("'Elle poz ekle' bağlantısı verilmişse altbilgide durur ve çağrılır", async () => {
    const user = userEvent.setup();
    const onManualAdd = vi.fn();
    renderPicker({ onManualAdd });
    await ready();
    await user.click(screen.getByRole("button", { name: "Katalogda yok mu? Elle poz ekle" }));
    expect(onManualAdd).toHaveBeenCalledTimes(1);
  });

  it("Vazgeç onClose çağırır", async () => {
    const user = userEvent.setup();
    const props = renderPicker();
    await ready();
    await user.click(screen.getByRole("button", { name: "Vazgeç" }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});

describe("kaydedilmemiş değişiklik (useUnsavedChanges)", () => {
  it("temizken kayıt YOK; seçim/miktar yazılınca 'Katalogdan poz seçimi' kaydı doğar; kapanınca silinir", async () => {
    const user = userEvent.setup();
    renderPicker();
    await ready();
    expect(unsavedRegistry.labels()).not.toContain("Katalogdan poz seçimi");
    await user.type(quantityOf(LAST_SZL.poz_no), "2");
    await waitFor(() => expect(unsavedRegistry.labels()).toContain("Katalogdan poz seçimi"));
  });

  it("bileşen kaldırılınca kayıt silinir", async () => {
    const user = userEvent.setup();
    const client = new QueryClient();
    const { unmount } = render(
      <QueryClientProvider client={client}>
        <WorkItemPickerModal
          groups={GROUPS}
          onSubmit={vi.fn()}
          onClose={vi.fn()}
          isSubmitting={false}
          submitError={null}
        />
      </QueryClientProvider>,
    );
    await ready();
    await user.type(quantityOf(LAST_SZL.poz_no), "2");
    await waitFor(() => expect(unsavedRegistry.labels()).toContain("Katalogdan poz seçimi"));
    unmount();
    expect(unsavedRegistry.labels()).not.toContain("Katalogdan poz seçimi");
  });
});

describe("Son fiyat hücresi yeniden kullanılır (F2.5 LastPriceCell)", () => {
  it("kaynak satırı ve fark yüzdesi seçicide de görünür", async () => {
    renderPicker();
    await ready();
    expect(within(rowOf(LAST_SZL.poz_no)).getByText("Sözleşme · GNK · 12.09")).toBeInTheDocument();
    expect(within(rowOf(LAST_SZL.poz_no)).getByText("+%1,8")).toBeInTheDocument();
  });
});
