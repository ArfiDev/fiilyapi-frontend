import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";

import { SubcontractorItemFormModal } from "./SubcontractorItemFormModal";
import {
  SUBCONTRACTOR_ITEM_TEXT as TEXT,
  UNPRICED_ITEM_WARNING_LEAD,
} from "./constants";
import { BackendError } from "@/lib/api/unwrap";
import { useCreateSubcontractorContractItem } from "@/lib/api/hooks/useSubcontractorContractMutations";
import type { SubcontractorContractItemResponse } from "@/lib/api/hooks/useSubcontractorContractMutations";

vi.mock("@/lib/api/hooks/useSubcontractorContractMutations", () => ({
  useCreateSubcontractorContractItem: vi.fn(),
}));

const CONTRACT_ID = "cccccccc-0000-0000-0000-000000000001";

const ITEMS: SubcontractorContractItemResponse[] = [
  {
    id: "iiiiiiii-0000-0000-0000-000000000001",
    contract_id: CONTRACT_ID,
    source_contract_item_id: null,
    code: "03.011",
    description: "Grobeton",
    unit: "m³",
    quantity: "100.000",
    unit_price: "1200.00",
    sort_order: 5,
    group: null,
    line_total: "120000.00",
  },
];

const createItem = vi.fn();
const onClose = vi.fn();

function renderModal() {
  return render(
    <SubcontractorItemFormModal
      contractId={CONTRACT_ID}
      items={ITEMS}
      contractTotal="3281500.00"
      itemsMissingPrice={0}
      onClose={onClose}
    />,
  );
}

/** Zorunlu alanları doldurur; fiyat bilerek dokunulmaz. */
function fillRequired() {
  fireEvent.change(screen.getByLabelText(TEXT.code), { target: { value: "03.012" } });
  fireEvent.change(screen.getByLabelText(TEXT.description), {
    target: { value: "Perde betonu C30/37" },
  });
  fireEvent.change(screen.getByLabelText(TEXT.unit), { target: { value: "m³" } });
  fireEvent.change(screen.getByLabelText(TEXT.quantity), { target: { value: "1240,5" } }); // TKL-F7a (T30): Türkçe ondalık
}

beforeEach(() => {
  vi.clearAllMocks();
  createItem.mockResolvedValue({});
  vi.mocked(useCreateSubcontractorContractItem).mockReturnValue({
    mutateAsync: createItem,
    isPending: false,
  } as never);
});

describe("SubcontractorItemFormModal (TAŞ · Form - Poz Ekle Taseron)", () => {
  it("🔴 birim fiyat boşken FİYATSIZ POZ UYARISINI basar (mockup 143-147)", () => {
    renderModal();
    const warning = screen.getByTestId("tsi-unpriced-warning");
    expect(warning).toHaveTextContent(UNPRICED_ITEM_WARNING_LEAD);
    expect(warning).toHaveTextContent("sözleşme tutarına dâhil edilmez");
    expect(warning).toHaveTextContent("Fiyatı sonra belirleyecekseniz boş bırakabilirsiniz.");
    // Özet rayı da aynı durumu gösterir (167-170).
    expect(screen.getByTestId("tsi-summary-status")).toHaveTextContent(
      TEXT.summaryStatusUnpriced,
    );
  });

  it("fiyat girilince uyarı ve `Fiyatlanmadı` rozeti kalkar", () => {
    renderModal();
    fireEvent.change(screen.getByLabelText(TEXT.unitPrice), { target: { value: "2850" } });
    expect(screen.queryByTestId("tsi-unpriced-warning")).not.toBeInTheDocument();
    expect(screen.queryByTestId("tsi-summary-status")).not.toBeInTheDocument();
  });

  it("🔴 fiyat boşken gövdeye `null` gider ve miktar STRING kalır", async () => {
    renderModal();
    fillRequired();
    fireEvent.click(screen.getByRole("button", { name: TEXT.submit }));

    await waitFor(() => expect(createItem).toHaveBeenCalledTimes(1));
    expect(createItem).toHaveBeenCalledWith({
      code: "03.012",
      description: "Perde betonu C30/37",
      unit: "m³",
      quantity: "1240.5",
      unit_price: null,
      // Mockup'ın "6"sı göstermeliktir: mevcut en büyük sıra (5) + 1.
      sort_order: 6,
    });
  });

  it("zorunlu alan boşken AĞA ÇIKMAZ ve hatayı gösterir", async () => {
    renderModal();
    fireEvent.change(screen.getByLabelText(TEXT.quantity), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: TEXT.submit }));

    await waitFor(() => expect(screen.getByTestId("tsi-error")).toHaveTextContent("Poz No"));
    expect(createItem).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("miktar sıfırken ağa çıkmaz", async () => {
    renderModal();
    fillRequired();
    fireEvent.change(screen.getByLabelText(TEXT.quantity), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: TEXT.submit }));

    await waitFor(() =>
      expect(screen.getByTestId("tsi-error")).toHaveTextContent("sıfırdan büyük"),
    );
    expect(createItem).not.toHaveBeenCalled();
  });

  it("`Kaydettikten sonra yeni poz ekle` işaretliyken diyalog açık kalır ve form boşalır", async () => {
    renderModal();
    fillRequired();
    fireEvent.click(screen.getByRole("button", { name: TEXT.submit }));

    await waitFor(() => expect(screen.getByTestId("tsi-saved")).toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText(TEXT.code)).toHaveValue("");
  });

  it("onay kutusu kaldırılınca kaydetme sonrası diyalog kapanır", async () => {
    renderModal();
    fireEvent.click(screen.getByTestId("tsi-keep-open"));
    fillRequired();
    fireEvent.click(screen.getByRole("button", { name: TEXT.submit }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("sunucu hatası sessizce yutulmaz; diyalog açık kalır", async () => {
    createItem.mockRejectedValue(
      new BackendError(409, { detail: "Bu poz numarası zaten var" }),
    );
    renderModal();
    fillRequired();
    fireEvent.click(screen.getByRole("button", { name: TEXT.submit }));

    await waitFor(() =>
      expect(screen.getByTestId("tsi-error")).toHaveTextContent("Bu poz numarası zaten var"),
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it("`Sözleşme Durumu` sayaçları gerçek veriden gelir (mockup rakamları göstermelik)", () => {
    render(
      <SubcontractorItemFormModal
        contractId={CONTRACT_ID}
        items={ITEMS}
        contractTotal="3281500.00"
        itemsMissingPrice={1}
        onClose={onClose}
      />,
    );
    const stats = screen.getByText(TEXT.contractCard).parentElement;
    expect(stats).toHaveTextContent(`${TEXT.contractItemCount}1`);
    expect(stats).toHaveTextContent(`${TEXT.contractPricedCount}0`);
    expect(stats).toHaveTextContent(`${TEXT.contractUnpricedCount}1`);
  });
});

/** SEKME-F1.3b · merkezi kayda bağlanma bekçisi. */
describe("SubcontractorItemFormModal — kaydedilmemiş değişiklik kaydı", () => {
  it("açıldı, dokunulmadı → temiz", () => {
    renderModal();
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });

  it("bir alan değiştirildi → kirli", () => {
    renderModal();
    fillRequired();
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
  });

  it("keepOpen ile kayıt sonrası (form + taban BİRLİKTE sıfırlanır) → temiz", async () => {
    renderModal();
    fillRequired();
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: TEXT.submit }));
    await waitFor(() => expect(screen.getByTestId("tsi-saved")).toBeInTheDocument());
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });

  it("keepOpen kapalıyken kayıt sonrası (onClose çağrılır, unmount) → temiz", async () => {
    const { unmount } = renderModal();
    fireEvent.click(screen.getByTestId("tsi-keep-open"));
    fillRequired();
    fireEvent.click(screen.getByRole("button", { name: TEXT.submit }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    unmount();
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });
});
