import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { BoqItemFormModal } from "./BoqItemFormModal";
import {
  useCreateBoqGroup,
  useCreateBoqItem,
  useDeleteBoqItem,
  useUpdateBoqItem,
} from "@/lib/api/hooks/useBoqMutations";
import { BackendError } from "@/lib/api/unwrap";
import type { BoqGroup, BoqItem } from "@/lib/api/hooks/useBoq";

/**
 * BOQ-SEC-F T3 — `BoqItemFormModal`in İKİ CANLI KUSURUNUN bekçileri.
 *
 * Ayrı dosyadır: `BoqItemFormModal.test.tsx` zaten 539 satırdır (WORKFLOW §4
 * dosya boyutu kuralı).
 *
 *  - K3: grup yaratıldıktan sonra `groupId` state'i sentinel'de kalıyordu →
 *    ikinci "Kaydet" AYNI ADLI İKİNCİ GRUBU yaratıyordu (backend'de grup adı
 *    tekilliği YOK → sessiz veri kirliliği).
 *  - K4: 409 KOŞULSUZ "poz numarası zaten kullanılıyor" diye eşleniyordu.
 *    Backend bugün ÜÇ ayrı 409 döndürüyor; kullanıcı miktarı düşürmeye
 *    çalıştığında poz numarasına hiç dokunmamışken o metni görüyordu.
 */

vi.mock("@/lib/api/hooks/useBoqMutations", () => ({
  useCreateBoqGroup: vi.fn(),
  useCreateBoqItem: vi.fn(),
  useDeleteBoqItem: vi.fn(),
  useUpdateBoqItem: vi.fn(),
}));

const SITE_ID = "44444444-4444-4444-4444-444444444444";
const GROUP_1 = "gggggggg-0000-0000-0000-000000000001";
const CREATED_GROUP = "gggggggg-0000-0000-0000-000000000009";

// Backend'in GERÇEK Türkçe cümleleri (`app/modules/boq/service.py:49-56`).
const BACKEND_DUPLICATE_CODE = "Bu poz numarası bu şantiyede zaten kullanılıyor";
const BACKEND_QUANTITY_BELOW_ALLOCATED =
  "Poz miktarı bölümlere dağıtılan toplamın altına indirilemez";
const BACKEND_DUPLICATE_SECTION = "Aynı bölüm gövdede birden fazla kez gönderildi";

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
    contract_item_id: null,
    allocated_quantity: "800.000",
    unallocated_quantity: "440.000",
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
    items: [item()],
  },
];

const createGroup = vi.fn();
const createItem = vi.fn();
const updateItem = vi.fn();
const deleteItem = vi.fn();
const onClose = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
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
  createGroup.mockResolvedValue({ id: CREATED_GROUP });
  deleteItem.mockResolvedValue(undefined);
});

function setField(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function save() {
  fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
}

function renderCreate() {
  render(
    <BoqItemFormModal
      siteId={SITE_ID}
      projectId="55555555-5555-5555-5555-555555555555"
      groups={GROUPS}
      mode={{ kind: "create" }}
      canDelete
      onClose={onClose}
    />,
  );
}

function renderEdit() {
  render(
    <BoqItemFormModal
      siteId={SITE_ID}
      projectId="55555555-5555-5555-5555-555555555555"
      groups={GROUPS}
      mode={{ kind: "edit", item: item(), groupId: GROUP_1 }}
      canDelete
      onClose={onClose}
    />,
  );
}

describe("BoqItemFormModal · K3 iki adımlı yazmada tekrar denemesi", () => {
  it("kalem isteği patlayıp KULLANICI TEKRAR KAYDET'e bastığında İKİNCİ GRUP YARATILMAZ", async () => {
    createItem.mockRejectedValue(new BackendError(500, { detail: "sunucu hatası" }));
    renderCreate();

    // "+ Yeni Grup" seçilir, ad girilir, form doldurulur.
    setField("Grup", "__new__");
    setField("Grup Adı", "Betonarme İşleri");
    setField("Poz No", "01.003");
    setField("İş Kalemi Tarifi", "Grobeton");
    setField("Birim", "m³");
    setField("Miktar", "10");
    setField("Birim Fiyat", "100");

    save();
    await waitFor(() => expect(createItem).toHaveBeenCalledTimes(1));
    expect(createGroup).toHaveBeenCalledTimes(1);

    // Modal AÇIK kaldı (hata basıldı, form kapanmadı) → kullanıcı yine basar.
    save();
    await waitFor(() => expect(createItem).toHaveBeenCalledTimes(2));

    // 🔴 BEKÇİ: grup isteği HÂLÂ bir kez. Kusur geri gelirse burası 2 olur ve
    // canlıda aynı adlı ikinci bir grup doğar (backend adı tekil TUTMAZ).
    expect(createGroup).toHaveBeenCalledTimes(1);
  });

  it("ikinci deneme kalemi YENİ YARATILAN grubun altına gönderir", async () => {
    createItem.mockRejectedValueOnce(new BackendError(500, { detail: "sunucu hatası" }));
    createItem.mockResolvedValueOnce({ id: "new-item" });
    renderCreate();

    setField("Grup", "__new__");
    setField("Grup Adı", "Betonarme İşleri");
    setField("Poz No", "01.003");
    setField("İş Kalemi Tarifi", "Grobeton");
    setField("Birim", "m³");
    setField("Miktar", "10");
    setField("Birim Fiyat", "100");

    save();
    await waitFor(() => expect(createItem).toHaveBeenCalledTimes(1));
    save();
    await waitFor(() => expect(createItem).toHaveBeenCalledTimes(2));

    // Sentinel gövdeye SIZAMAZ: her iki istekte de gerçek grup kimliği gider.
    for (const call of createItem.mock.calls) {
      expect(call[0].group_id).toBe(CREATED_GROUP);
    }
  });

  it("grup yaratma başarılıysa seçici artık sentinel'de DEĞİLDİR (Grup Adı alanı kapanır)", async () => {
    createItem.mockRejectedValue(new BackendError(500, { detail: "sunucu hatası" }));
    renderCreate();

    setField("Grup", "__new__");
    setField("Grup Adı", "Betonarme İşleri");
    setField("Poz No", "01.003");
    setField("İş Kalemi Tarifi", "Grobeton");
    setField("Birim", "m³");
    setField("Miktar", "10");
    setField("Birim Fiyat", "100");
    save();

    // DOM kanıtı (F-IZN kanonu: durum değişimi DOM'dan okunur, dolaylı değil):
    // sentinel seçiliyken görünen "Grup Adı" alanı artık YOKTUR.
    await waitFor(() => expect(screen.queryByLabelText("Grup Adı")).not.toBeInTheDocument());
  });
});

describe("BoqItemFormModal · K4 409 ayrımı", () => {
  it("kota düşürme 409'unda BACKEND'İN cümlesi basılır, poz numarası YALANI basılmaz", async () => {
    updateItem.mockRejectedValue(
      new BackendError(409, { detail: BACKEND_QUANTITY_BELOW_ALLOCATED }),
    );
    renderEdit();

    setField("Miktar", "100");
    save();

    await waitFor(() =>
      expect(screen.getByText(BACKEND_QUANTITY_BELOW_ALLOCATED)).toBeInTheDocument(),
    );
    // 🔴 Asıl bekçi: alakasız metin EKRANDA OLMAMALI.
    expect(screen.queryByText(/poz numarası/i)).not.toBeInTheDocument();
  });

  it("poz kodu çakışması 409'unda backend'in kendi cümlesi basılır", async () => {
    createItem.mockRejectedValue(new BackendError(409, { detail: BACKEND_DUPLICATE_CODE }));
    renderCreate();

    setField("Grup", GROUP_1);
    setField("Poz No", "01.001");
    setField("İş Kalemi Tarifi", "Grobeton");
    setField("Birim", "m³");
    setField("Miktar", "10");
    setField("Birim Fiyat", "100");
    save();

    await waitFor(() => expect(screen.getByText(BACKEND_DUPLICATE_CODE)).toBeInTheDocument());
  });

  it("gövdesiz 409'da poz kodu metni YEDEK olarak kalır (sessiz genel hata yok)", async () => {
    updateItem.mockRejectedValue(new BackendError(409, null));
    renderEdit();

    setField("Miktar", "100");
    save();

    await waitFor(() => expect(screen.getByText(/poz numarası/i)).toBeInTheDocument());
  });

  it("422 aynı-bölüm hatası da backend cümlesiyle basılır", async () => {
    updateItem.mockRejectedValue(new BackendError(422, { detail: BACKEND_DUPLICATE_SECTION }));
    renderEdit();

    setField("Miktar", "100");
    save();

    await waitFor(() => expect(screen.getByText(BACKEND_DUPLICATE_SECTION)).toBeInTheDocument());
  });
});
