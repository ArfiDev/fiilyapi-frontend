import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";

import { BoqItemFormModal } from "./BoqItemFormModal";
import {
  useCreateBoqGroup,
  useCreateBoqItem,
  useDeleteBoqItem,
  useUpdateBoqItem,
} from "@/lib/api/hooks/useBoqMutations";
import { BackendError } from "@/lib/api/unwrap";
import type { BoqGroup, BoqItem } from "@/lib/api/hooks/useBoq";

vi.mock("@/lib/api/hooks/useBoqMutations", () => ({
  useCreateBoqGroup: vi.fn(),
  useCreateBoqItem: vi.fn(),
  useDeleteBoqItem: vi.fn(),
  useUpdateBoqItem: vi.fn(),
}));

const SITE_ID = "44444444-4444-4444-4444-444444444444";
const GROUP_1 = "gggggggg-0000-0000-0000-000000000001";
const GROUP_2 = "gggggggg-0000-0000-0000-000000000002";

function item(overrides: Partial<BoqItem> = {}): BoqItem {
  return {
    id: "aaaaaaaa-0000-0000-0000-000000000001",
    code: "01.001",
    description: "Kazı (Makine ile)",
    unit: "m³",
    quantity: "1240.000",
    unit_price: "280.00",
    amount: "347200.00",
    sort_order: 5,
    allocated_quantity: "0.000",
    unallocated_quantity: "1240.000",
    progress_pct: { available: false, value: null, pending_module: "progress_payments" },
    ...overrides,
  };
}

const GROUPS: BoqGroup[] = [
  {
    id: GROUP_1,
    name: "Toprak ve Temel İşleri",
    sort_order: 10,
    group_total: "347200.00",
    items: [item(), item({ id: "aaaaaaaa-0000-0000-0000-000000000002", sort_order: 12 })],
  },
  {
    id: GROUP_2,
    name: "Betonarme İşleri",
    sort_order: 20,
    group_total: "0.00",
    items: [],
  },
];

const createGroup = vi.fn();
const createItem = vi.fn();
const updateItem = vi.fn();
const deleteItem = vi.fn();
const onClose = vi.fn();

function mockMutations() {
  vi.mocked(useCreateBoqGroup).mockReturnValue({
    mutateAsync: createGroup,
    isPending: false,
  } as never);
  vi.mocked(useCreateBoqItem).mockReturnValue({
    mutateAsync: createItem,
    isPending: false,
  } as never);
  vi.mocked(useUpdateBoqItem).mockReturnValue({
    mutateAsync: updateItem,
    isPending: false,
  } as never);
  vi.mocked(useDeleteBoqItem).mockReturnValue({
    mutateAsync: deleteItem,
    isPending: false,
  } as never);
}

function renderCreate(groups: BoqGroup[] = GROUPS) {
  render(
    <BoqItemFormModal
      siteId={SITE_ID}
      groups={groups}
      mode={{ kind: "create" }}
      canDelete
      onClose={onClose}
    />,
  );
}

function renderEdit(mode?: { item: BoqItem; groupId: string; canDelete?: boolean }) {
  render(
    <BoqItemFormModal
      siteId={SITE_ID}
      groups={GROUPS}
      mode={{ kind: "edit", item: mode?.item ?? item(), groupId: mode?.groupId ?? GROUP_1 }}
      canDelete={mode?.canDelete ?? true}
      onClose={onClose}
    />,
  );
}

function setField(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

/** Geçerli bir create formunu doldurur; `skip` verilen alan boş bırakılır. */
function fillValidCreateForm(skip?: string) {
  const values: Record<string, string> = {
    Grup: GROUP_1,
    "Poz No": "01.003",
    "İş Kalemi Tarifi": "Grobeton",
    Birim: "m³",
    Miktar: "10",
    "Birim Fiyat": "100",
  };
  for (const [label, value] of Object.entries(values)) {
    if (label === skip) continue;
    setField(label, value);
  }
}

function save() {
  fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockMutations();
  createGroup.mockResolvedValue({ id: "gggggggg-0000-0000-0000-000000000009" });
  deleteItem.mockResolvedValue(undefined);
  createItem.mockResolvedValue({ id: "new-item" });
  updateItem.mockResolvedValue({ id: "edited-item" });
});

describe("BoqItemFormModal — ortak yapı (spec §7.1)", () => {
  it("create kipinde başlık Yeni İş Kalemi'dir", () => {
    renderCreate();
    expect(screen.getByRole("dialog", { name: "Yeni İş Kalemi" })).toBeInTheDocument();
  });

  it("edit kipinde başlık İş Kalemi Düzenle'dir", () => {
    renderEdit();
    expect(screen.getByRole("dialog", { name: "İş Kalemi Düzenle" })).toBeInTheDocument();
  });

  it("altı alan tablo sütun başlıklarıyla birebir etiketlenir", () => {
    renderCreate();
    for (const label of ["Grup", "Poz No", "İş Kalemi Tarifi", "Birim", "Miktar", "Birim Fiyat"]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  // §7.1.1: mockup'ta karşılığı olmadığı için "Sıra" alanı KOPYALANMAZ
  // (SectionFormModal'dan sızmaması gereken tek alan).
  it("görünür Sıra alanı yoktur", () => {
    renderCreate();
    expect(screen.queryByLabelText("Sıra")).not.toBeInTheDocument();
  });

  // §7.5.1: Sil YALNIZ edit kipinde basılır — create kipinde silinecek kayıt yok.
  it("create kipinde Sil butonu basılmaz", () => {
    renderCreate();
    expect(screen.queryByRole("button", { name: "Sil" })).not.toBeInTheDocument();
  });

  it("alt şeritte Vazgeç ve Kaydet vardır", () => {
    renderCreate();
    expect(screen.getByRole("button", { name: "Vazgeç" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Kaydet" })).toBeInTheDocument();
  });
});

describe("BoqItemFormModal — doğrulama (spec §7.1.4)", () => {
  const CASES: [string, string][] = [
    ["Grup", "Grup seçin."],
    ["Poz No", "Poz No zorunludur."],
    ["İş Kalemi Tarifi", "İş Kalemi Tarifi zorunludur."],
    ["Birim", "Birim zorunludur."],
    ["Miktar", "Miktar sıfırdan büyük olmalıdır."],
    ["Birim Fiyat", "Birim Fiyat negatif olamaz."],
  ];

  it.each(CASES)("%s boşken '%s' basılır", (field, message) => {
    renderCreate();
    fillValidCreateForm(field);
    if (field === "Birim Fiyat") setField("Birim Fiyat", "-1");
    save();
    expect(screen.getByText(message)).toBeInTheDocument();
  });

  it("Kaydet doğrulama geçmeden istek atmaz", () => {
    renderCreate();
    save();
    expect(createItem).not.toHaveBeenCalled();
    expect(createGroup).not.toHaveBeenCalled();
  });

  it("Miktar sıfırken de reddedilir (backend CHECK > 0)", () => {
    renderCreate();
    fillValidCreateForm();
    setField("Miktar", "0");
    save();
    expect(screen.getByText("Miktar sıfırdan büyük olmalıdır.")).toBeInTheDocument();
    expect(createItem).not.toHaveBeenCalled();
  });

  it("ilk hatalı alan odaklanır", () => {
    renderCreate();
    fillValidCreateForm("Poz No");
    save();
    expect(document.activeElement).toBe(screen.getByLabelText("Poz No"));
  });

  it("hiçbir alan doldurulmadıysa odak Grup seçicisine gider", () => {
    renderCreate();
    save();
    expect(document.activeElement).toBe(screen.getByLabelText("Grup"));
  });
});

describe("BoqItemFormModal — create kipi (spec §7.1.2)", () => {
  it("sort_order seçili grubun max sort_order + 1 olarak gönderilir", async () => {
    renderCreate();
    fillValidCreateForm();
    save();
    await waitFor(() => expect(createItem).toHaveBeenCalled());
    expect(createItem).toHaveBeenCalledWith(
      expect.objectContaining({ group_id: GROUP_1, code: "01.003", sort_order: 13 }),
    );
  });

  it("kalemi olmayan gruba eklenen ilk kalemin sort_order'ı 0'dır", async () => {
    renderCreate();
    fillValidCreateForm();
    setField("Grup", GROUP_2);
    save();
    await waitFor(() => expect(createItem).toHaveBeenCalled());
    expect(createItem).toHaveBeenCalledWith(expect.objectContaining({ sort_order: 0 }));
  });

  it("başarıda modal kapanır", async () => {
    renderCreate();
    fillValidCreateForm();
    save();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  // BOQ-SEC-F K4 GOCU: bu test eskiden `detail: "duplicate key value"` gonderip
  // SABIT Turkce cumleyi bekliyordu — yani KUSURU cakiyordu. Backend artik UC
  // ayri 409 donduruyor (kod cakismasi / kota dusurme / tahsis asimi); ekran
  // sunucunun cumlesini OLDUGU GIBI basar. Testin ozgun niyeti korundu (kod
  // cakismasinda dogru cumle basilir), fiksturu GERCEK govdeye cevrildi.
  // Ayrimin kendisi `BoqItemFormModal.conflicts.test.tsx`te caki�lidir.
  it("409 → backend'in poz kodu çakışması cümlesi basılır", async () => {
    createItem.mockRejectedValue(
      new BackendError(409, { detail: "Bu poz numarası bu şantiyede zaten kullanılıyor" }),
    );
    renderCreate();
    fillValidCreateForm();
    save();
    expect(
      await screen.findByText("Bu poz numarası bu şantiyede zaten kullanılıyor"),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("422 gövdesindeki Türkçe mesaj aynen basılır", async () => {
    createItem.mockRejectedValue(new BackendError(422, { detail: "Grup başka bir şantiyeye ait." }));
    renderCreate();
    fillValidCreateForm();
    save();
    expect(await screen.findByText("Grup başka bir şantiyeye ait.")).toBeInTheDocument();
  });
});

describe("BoqItemFormModal — + Yeni Grup (spec §7.3)", () => {
  const NEW_GROUP_OPTION = "__new__";

  it("Grup açılırının son seçeneği + Yeni Grup'tur", () => {
    renderCreate();
    const options = Array.from(screen.getByLabelText("Grup").querySelectorAll("option"));
    expect(options[options.length - 1]).toHaveTextContent("+ Yeni Grup");
  });

  it("+ Yeni Grup seçilince Grup Adı alanı belirir ve boşsa 'Grup adı zorunludur.' der", () => {
    renderCreate();
    expect(screen.queryByLabelText("Grup Adı")).not.toBeInTheDocument();
    setField("Grup", NEW_GROUP_OPTION);
    expect(screen.getByLabelText("Grup Adı")).toBeInTheDocument();
    fillValidCreateForm("Grup");
    save();
    expect(screen.getByText("Grup adı zorunludur.")).toBeInTheDocument();
    expect(createGroup).not.toHaveBeenCalled();
  });

  it("+ Yeni Grup ile kaydetme önce grubu, sonra kalemi POST eder", async () => {
    renderCreate();
    fillValidCreateForm("Grup");
    setField("Grup", NEW_GROUP_OPTION);
    setField("Grup Adı", "Çatı İşleri");
    save();
    await waitFor(() => expect(createItem).toHaveBeenCalled());
    expect(createGroup).toHaveBeenCalledWith({ name: "Çatı İşleri", sort_order: 21 });
    expect(createItem).toHaveBeenCalledWith(
      expect.objectContaining({ group_id: "gggggggg-0000-0000-0000-000000000009", sort_order: 0 }),
    );
    expect(createGroup.mock.invocationCallOrder[0]).toBeLessThan(
      createItem.mock.invocationCallOrder[0],
    );
  });

  it("ikinci istek hata verirse 'Grup oluşturuldu, kalem eklenemedi: …' basılır (sessiz yutma yok)", async () => {
    createItem.mockRejectedValue(new BackendError(500, { detail: "sunucu hatası" }));
    renderCreate();
    fillValidCreateForm("Grup");
    setField("Grup", NEW_GROUP_OPTION);
    setField("Grup Adı", "Çatı İşleri");
    save();
    expect(
      await screen.findByText("Grup oluşturuldu, kalem eklenemedi: sunucu hatası"),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("grup isteği hata verirse kalem POST edilmez", async () => {
    createGroup.mockRejectedValue(new BackendError(403, { detail: "Bu işlem için yetkiniz yok" }));
    renderCreate();
    fillValidCreateForm("Grup");
    setField("Grup", NEW_GROUP_OPTION);
    setField("Grup Adı", "Çatı İşleri");
    save();
    expect(await screen.findByText("Bu işlem için yetkiniz yok")).toBeInTheDocument();
    expect(createItem).not.toHaveBeenCalled();
  });

  // §7.3 son madde: BOQ tamamen boşsa modal doğrudan "+ Yeni Grup" seçili açılır.
  it("groups boşken + Yeni Grup seçili açılır ve Grup Adı görünür", () => {
    renderCreate([]);
    expect(screen.getByLabelText("Grup")).toHaveValue(NEW_GROUP_OPTION);
    expect(screen.getByLabelText("Grup Adı")).toBeInTheDocument();
  });
});

describe("BoqItemFormModal — edit kipi (spec §7.1.2)", () => {
  it("alanlar mode.item'dan dolu açılır", () => {
    renderEdit();
    expect(screen.getByLabelText("Grup")).toHaveValue(GROUP_1);
    expect(screen.getByLabelText("Poz No")).toHaveValue("01.001");
    expect(screen.getByLabelText("İş Kalemi Tarifi")).toHaveValue("Kazı (Makine ile)");
    expect(screen.getByLabelText("Birim")).toHaveValue("m³");
  });

  it("quantity/unit_price string olarak doldurulur, Number'a çevrilip geri yazılmaz", () => {
    renderEdit();
    // `toHaveValue` number input'ta sayıya çevirir; ham DOM değeri okunur ki
    // sondaki sıfırların korunduğu (Decimal hassasiyeti) görülsün.
    expect((screen.getByLabelText("Miktar") as HTMLInputElement).value).toBe("1240.000");
    expect((screen.getByLabelText("Birim Fiyat") as HTMLInputElement).value).toBe("280.00");
  });

  it("PATCH gövdesi yalnız değişen alanı taşır", async () => {
    renderEdit();
    setField("İş Kalemi Tarifi", "Kazı (El ile)");
    save();
    await waitFor(() => expect(updateItem).toHaveBeenCalled());
    expect(updateItem).toHaveBeenCalledWith({
      itemId: "aaaaaaaa-0000-0000-0000-000000000001",
      body: { description: "Kazı (El ile)" },
    });
  });

  it("KAYIT 471: edit kipinde Poz No baştaki/sondaki boşluk TRIM'lenerek gönderilir", async () => {
    renderEdit();
    setField("Poz No", " 01.002 ");
    save();
    await waitFor(() => expect(updateItem).toHaveBeenCalled());
    expect(updateItem).toHaveBeenCalledWith({
      itemId: "aaaaaaaa-0000-0000-0000-000000000001",
      body: { code: "01.002" },
    });
  });

  it("KAYIT 471: yalnız boşluk eklenmiş bir alan (trim sonrası AYNI) DEĞİŞTİ sayılmaz", () => {
    renderEdit();
    setField("Poz No", " 01.001 "); // trim sonrası orijinal kodla AYNI
    save();
    expect(updateItem).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("hiçbir alan değişmediyse istek atılmaz, modal kapanır", () => {
    renderEdit();
    save();
    expect(updateItem).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("sort_order edit kipinde hiç gönderilmez", async () => {
    renderEdit();
    setField("Miktar", "2000");
    save();
    await waitFor(() => expect(updateItem).toHaveBeenCalled());
    expect(updateItem.mock.calls[0][0].body).not.toHaveProperty("sort_order");
  });

  it("group_id değişimi kalemi başka gruba taşır", async () => {
    renderEdit();
    setField("Grup", GROUP_2);
    save();
    await waitFor(() => expect(updateItem).toHaveBeenCalled());
    expect(updateItem.mock.calls[0][0].body).toEqual({ group_id: GROUP_2 });
  });

  // BOQ-SEC-F K4 GOCU (yukaridakiyle ayni gerekce).
  it("edit kipinde de 409 gövdesindeki cümle basılır", async () => {
    updateItem.mockRejectedValue(
      new BackendError(409, { detail: "Bu poz numarası bu şantiyede zaten kullanılıyor" }),
    );
    renderEdit();
    setField("Poz No", "02.001");
    save();
    expect(
      await screen.findByText("Bu poz numarası bu şantiyede zaten kullanılıyor"),
    ).toBeInTheDocument();
  });
});

describe("BoqItemFormModal — Tutar (hesaplanan) önizlemesi (spec §7.1.3)", () => {
  it("Tutar (hesaplanan) miktar × birim fiyattan hesaplanır", () => {
    renderCreate();
    setField("Miktar", "1240");
    setField("Birim Fiyat", "280");
    expect(screen.getByTestId("boq-amount-preview")).toHaveTextContent("347.200");
    expect(screen.getByText("Tutar (hesaplanan)")).toBeInTheDocument();
  });

  it("girdilerden biri boşken önizleme — basar (0 basmaz)", () => {
    renderCreate();
    setField("Miktar", "1240");
    const preview = screen.getByTestId("boq-amount-preview");
    expect(preview).toHaveTextContent("—");
    expect(preview.textContent).not.toContain("0");
  });

  it("önizleme değeri istek gövdesine girmez", async () => {
    renderCreate();
    fillValidCreateForm();
    save();
    await waitFor(() => expect(createItem).toHaveBeenCalled());
    expect(createItem.mock.calls[0][0]).not.toHaveProperty("amount");
  });

  // <Field>/<Input> DEĞİL: forma girmeyen salt-okunur satır (spec §7.1.3).
  it("önizleme bir form kontrolü değildir", () => {
    renderCreate();
    expect(screen.queryByLabelText("Tutar (hesaplanan)")).not.toBeInTheDocument();
  });
});

describe("BoqItemFormModal — kalem silme (F13, spec §7.5)", () => {
  const CONFIRM_TEXT =
    "01.001 — Kazı (Makine ile) kalemi silinecek. Bu işlem geri alınamaz.";

  function clickDelete() {
    fireEvent.click(screen.getByRole("button", { name: "Sil" }));
  }
  function confirmDelete() {
    fireEvent.click(screen.getByRole("button", { name: "Evet, sil" }));
  }

  // §7.5.1: alt şeritte solda, `edit` kipinde.
  it("edit kipinde Sil butonu basılır", () => {
    renderEdit();
    expect(screen.getByRole("button", { name: "Sil" })).toBeInTheDocument();
  });

  // §7.5.6 / §2.5: silme kapısı (yalnız `admin`) kapalıysa çalışmayan buton
  // GÖSTERİLMEZ — `full` seviyeli kullanıcı tıklarsa 403 alırdı.
  it("canDelete false iken Sil butonu DOM'da yok", () => {
    renderEdit({ item: item(), groupId: GROUP_1, canDelete: false });
    expect(screen.queryByRole("button", { name: "Sil" })).not.toBeInTheDocument();
  });

  // §7.5.2: ikinci modal AÇILMAZ — onay aynı diyalogun içinde.
  it("Sil'e basınca aynı modal içinde onay adımına geçilir", () => {
    renderEdit();
    clickDelete();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByText(CONFIRM_TEXT)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Evet, sil" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Vazgeç" })).toBeInTheDocument();
  });

  it("onay adımında form alanları ve Kaydet gizlenir", () => {
    renderEdit();
    clickDelete();
    for (const label of ["Grup", "Poz No", "İş Kalemi Tarifi", "Birim", "Miktar", "Birim Fiyat"]) {
      expect(screen.queryByLabelText(label)).not.toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: "Kaydet" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sil" })).not.toBeInTheDocument();
  });

  // Vazgeç onay adımını iptal eder; DÜZENLEMEYİ değil (yanlışlıkla silmeye
  // basan kullanıcı form verisini kaybetmez).
  it("onay adımında Vazgeç forma geri döner, istek atılmaz", () => {
    renderEdit();
    clickDelete();
    fireEvent.click(screen.getByRole("button", { name: "Vazgeç" }));
    expect(screen.getByLabelText("Poz No")).toBeInTheDocument();
    expect(deleteItem).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Sil tek başına istek atmaz — yalnız onay atar", () => {
    renderEdit();
    clickDelete();
    expect(deleteItem).not.toHaveBeenCalled();
  });

  it("onayda itemId ile DELETE çağrılır ve modal kapanır", async () => {
    renderEdit();
    clickDelete();
    confirmDelete();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(deleteItem).toHaveBeenCalledWith("aaaaaaaa-0000-0000-0000-000000000001");
  });

  it("404 → 'Kalem bulunamadı, listeyi tazeleyin.' basılır, modal açık kalır", async () => {
    deleteItem.mockRejectedValue(new BackendError(404, { detail: "Kayıt bulunamadı" }));
    renderEdit();
    clickDelete();
    confirmDelete();
    expect(await screen.findByText("Kalem bulunamadı, listeyi tazeleyin.")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("403 → backend'in Türkçe gövdesi aynen basılır", async () => {
    deleteItem.mockRejectedValue(new BackendError(403, { detail: "Bu işlem için yetkiniz yok" }));
    renderEdit();
    clickDelete();
    confirmDelete();
    expect(await screen.findByText("Bu işlem için yetkiniz yok")).toBeInTheDocument();
  });

  it("diğer hatalarda 'İş kalemi silinemedi.' basılır", async () => {
    deleteItem.mockRejectedValue(new BackendError(500, null));
    renderEdit();
    clickDelete();
    confirmDelete();
    expect(await screen.findByText("İş kalemi silinemedi.")).toBeInTheDocument();
  });

  // §9.2: onay metni envanter #26 ile birebir; kayıt alanlarından kurulur.
  it("onay metni kalemin code ve description'ından kurulur", () => {
    renderEdit({
      item: item({ code: "02.007", description: "Kalıp Yapımı" }),
      groupId: GROUP_1,
    });
    clickDelete();
    expect(
      screen.getByText("02.007 — Kalıp Yapımı kalemi silinecek. Bu işlem geri alınamaz."),
    ).toBeInTheDocument();
  });
});

/** SEKME-F1.3b · merkezi kayda bağlanma bekçisi. */
describe("BoqItemFormModal — kaydedilmemiş değişiklik kaydı", () => {
  it("açıldı, dokunulmadı → temiz", () => {
    renderCreate();
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });

  it("bir alan değiştirildi → kirli", () => {
    renderCreate();
    setField("Poz No", "01.003");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
  });

  it("başarılı kayıt sonrası (onClose çağrılır, unmount) → temiz", async () => {
    const { unmount } = render(
      <BoqItemFormModal siteId={SITE_ID} groups={GROUPS} mode={{ kind: "create" }} canDelete onClose={onClose} />,
    );
    fillValidCreateForm();
    save();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    unmount();
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });
});
