import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { SubcontractorItemFormModal } from "./SubcontractorItemFormModal";
import { SUBCONTRACTOR_ITEM_TEXT as TEXT } from "./constants";
import { REF_PRICE_AMBIGUOUS_DOT } from "@/lib/tr-decimal";
import { useCreateSubcontractorContractItem } from "@/lib/api/hooks/useSubcontractorContractMutations";

/**
 * TKL-F7a · T42 — taşeron kalem modalı sayı girişleri Türkçe (T30): nokta = binlik, virgül = ondalık,
 * belirsiz nokta REDDEDİLİR, gövdeye nokta-ondalık METİN gider (`Number()` turu YOK).
 */
vi.mock("@/lib/api/hooks/useSubcontractorContractMutations", () => ({
  useCreateSubcontractorContractItem: vi.fn(),
}));

const createItem = vi.fn();

function renderModal() {
  return render(
    <SubcontractorItemFormModal
      contractId="cccccccc-0000-0000-0000-000000000001"
      items={[]}
      contractTotal="0.00"
      itemsMissingPrice={0}
      onClose={vi.fn()}
    />,
  );
}

function fillText() {
  fireEvent.change(screen.getByLabelText(TEXT.code), { target: { value: "03.012" } });
  fireEvent.change(screen.getByLabelText(TEXT.description), { target: { value: "Perde" } });
  fireEvent.change(screen.getByLabelText(TEXT.unit), { target: { value: "m³" } });
}

function submitWith(quantity: string, unitPrice: string) {
  fillText();
  fireEvent.change(screen.getByLabelText(TEXT.quantity), { target: { value: quantity } });
  fireEvent.change(screen.getByLabelText(TEXT.unitPrice), { target: { value: unitPrice } });
  fireEvent.click(screen.getByRole("button", { name: TEXT.submit }));
}

beforeEach(() => {
  vi.clearAllMocks();
  createItem.mockResolvedValue({});
  vi.mocked(useCreateSubcontractorContractItem).mockReturnValue({
    mutateAsync: createItem,
    isPending: false,
  } as never);
});

describe("TAŞ kalem modalı — T30 (miktar + birim fiyat)", () => {
  it("miktar ve fiyat metin girişidir (type=number DEĞİL, inputMode=decimal)", () => {
    renderModal();
    for (const label of [TEXT.quantity, TEXT.unitPrice]) {
      const input = screen.getByLabelText(label);
      expect(input).not.toHaveAttribute("type", "number");
      expect(input).toHaveAttribute("inputmode", "decimal");
    }
  });

  it("Miktar '1.234,5' → gövdede \"1234.5\"; Birim Fiyat '1.234,5' → \"1234.50\"", async () => {
    renderModal();
    submitWith("1.234,5", "1.234,5");
    await waitFor(() => expect(createItem).toHaveBeenCalledTimes(1));
    expect(createItem.mock.calls[0][0]).toMatchObject({ quantity: "1234.5", unit_price: "1234.50" });
  });

  it("'3,5' → miktar gövdede \"3.5\"", async () => {
    renderModal();
    submitWith("3,5", "");
    await waitFor(() => expect(createItem).toHaveBeenCalledTimes(1));
    expect(createItem.mock.calls[0][0]).toMatchObject({ quantity: "3.5", unit_price: null });
  });

  it("Miktar '0.500' → REF_PRICE_AMBIGUOUS_DOT, gövde GİTMEZ", async () => {
    renderModal();
    submitWith("0.500", "10");
    await waitFor(() => expect(screen.getByTestId("tsi-error")).toHaveTextContent(REF_PRICE_AMBIGUOUS_DOT));
    expect(createItem).not.toHaveBeenCalled();
  });

  it("Birim Fiyat '0.500' → REF_PRICE_AMBIGUOUS_DOT, gövde GİTMEZ", async () => {
    renderModal();
    submitWith("10", "0.500");
    await waitFor(() => expect(screen.getByTestId("tsi-error")).toHaveTextContent(REF_PRICE_AMBIGUOUS_DOT));
    expect(createItem).not.toHaveBeenCalled();
  });

  it("Birim Fiyat '1.50' ve Miktar '28.5' belirsiz → reddedilir", async () => {
    renderModal();
    submitWith("10", "1.50");
    await waitFor(() => expect(screen.getByTestId("tsi-error")).toHaveTextContent(REF_PRICE_AMBIGUOUS_DOT));
    fireEvent.change(screen.getByLabelText(TEXT.unitPrice), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText(TEXT.quantity), { target: { value: "28.5" } });
    fireEvent.click(screen.getByRole("button", { name: TEXT.submit }));
    await waitFor(() => expect(screen.getByTestId("tsi-error")).toHaveTextContent(REF_PRICE_AMBIGUOUS_DOT));
    expect(createItem).not.toHaveBeenCalled();
  });

  it("birim fiyat negatifse reddedilir (mevcut kural korunur), 2'den fazla ondalık reddedilir", async () => {
    renderModal();
    submitWith("10", "-5");
    await waitFor(() => expect(screen.getByTestId("tsi-error")).toHaveTextContent("negatif"));
    fireEvent.change(screen.getByLabelText(TEXT.unitPrice), { target: { value: "5,123" } });
    fireEvent.click(screen.getByRole("button", { name: TEXT.submit }));
    await waitFor(() => expect(screen.getByTestId("tsi-error")).toHaveTextContent("En fazla 2 ondalık"));
    expect(createItem).not.toHaveBeenCalled();
  });

  it("önizleme T30 ile okunmuş değerlerden hesaplanır ('2' × '1.234,50')", () => {
    renderModal();
    fireEvent.change(screen.getByLabelText(TEXT.quantity), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText(TEXT.unitPrice), { target: { value: "1.234,50" } });
    expect(screen.getByTestId("tsi-line-total")).toHaveTextContent("2.469");
  });

  // TKL-F7a son tur — "Fiyatsız" YALNIZ fiyat alanı gerçekten boşken; okunamayan girdi nötr "—" gösterir.
  it("(a) fiyat geçerli, miktar belirsiz ('28.5') → önizleme 'Fiyatsız' DEMEZ, '—' der", () => {
    renderModal();
    fireEvent.change(screen.getByLabelText(TEXT.quantity), { target: { value: "28.5" } });
    fireEvent.change(screen.getByLabelText(TEXT.unitPrice), { target: { value: "10" } });
    const total = screen.getByTestId("tsi-line-total");
    expect(total).toHaveTextContent(/^—$/);
    expect(total).not.toHaveTextContent("Fiyatsız");
  });

  it("(b) fiyat belirsiz ('28.5') → önizleme '—'; fiyat alanı dolu olduğundan fiyatsız uyarısı/rozeti yok", () => {
    renderModal();
    fireEvent.change(screen.getByLabelText(TEXT.quantity), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText(TEXT.unitPrice), { target: { value: "28.5" } });
    const total = screen.getByTestId("tsi-line-total");
    expect(total).toHaveTextContent(/^—$/);
    expect(total).not.toHaveTextContent("Fiyatsız");
    expect(screen.queryByTestId("tsi-unpriced-warning")).not.toBeInTheDocument();
  });

  it("fiyat alanı BOŞKEN mevcut '— Fiyatsız' gösterimi korunur", () => {
    renderModal();
    fireEvent.change(screen.getByLabelText(TEXT.quantity), { target: { value: "10" } });
    expect(screen.getByTestId("tsi-line-total")).toHaveTextContent("— Fiyatsız");
    expect(screen.getByTestId("tsi-unpriced-warning")).toBeInTheDocument();
  });
});
