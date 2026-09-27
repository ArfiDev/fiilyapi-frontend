import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { StockItemModal } from "./StockItemModal";
import { useCreateStockItem } from "@/lib/api/hooks/useStockMutations";
import { BackendError } from "@/lib/api/unwrap";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";

vi.mock("@/lib/api/hooks/useStockMutations", () => ({ useCreateStockItem: vi.fn() }));

const mutate = vi.fn();
const onClose = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useCreateStockItem).mockReturnValue({
    mutate,
    isPending: false,
  } as unknown as ReturnType<typeof useCreateStockItem>);
});

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(new RegExp(label)), { target: { value } });
}

function submit() {
  fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
}

describe("StockItemModal — S1 türetilmiş diyalog", () => {
  it("gövde POST /stock/items şemasıyla birebirdir (is_active AÇIKÇA verilir)", () => {
    render(<StockItemModal onClose={onClose} />);
    fill("Malzeme Kodu", "SNK-9001");
    fill("Malzeme Adı", "Nervürlü Demir Ø14");
    fireEvent.change(screen.getByLabelText(/Kategori/), { target: { value: "steel" } });
    fill("Birim", "Ton");
    fill("Min Stok", "12");
    submit();

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0][0]).toEqual({
      code: "SNK-9001",
      name: "Nervürlü Demir Ø14",
      category: "steel",
      unit: "Ton",
      is_active: true,
      min_stock: 12,
    });
  });

  it("boş min stok gövdede HİÇ taşınmaz (eşiksiz kart meşrudur)", () => {
    render(<StockItemModal onClose={onClose} />);
    fill("Malzeme Kodu", "ICY-0090");
    fill("Malzeme Adı", "İzolasyon Bandı");
    fill("Birim", "Adet");
    submit();

    expect(mutate.mock.calls[0][0]).not.toHaveProperty("min_stock");
  });

  it("zorunlu alanlar eksikken ağa ÇIKILMAZ", () => {
    render(<StockItemModal onClose={onClose} />);
    submit();
    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByText("Malzeme kodu zorunludur.")).toBeInTheDocument();
  });

  it("negatif min stok reddedilir", () => {
    render(<StockItemModal onClose={onClose} />);
    fill("Malzeme Kodu", "A-1");
    fill("Malzeme Adı", "Test");
    fill("Birim", "Adet");
    fill("Min Stok", "-3");
    submit();
    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByText("Min stok negatif olamaz.")).toBeInTheDocument();
  });

  it("422 kural hatası Türkçe ve GÖRÜNÜR basılır (§4b kanonu)", () => {
    mutate.mockImplementation((_body, options) => {
      options.onError(new BackendError(422, { detail: "Bu kodda bir malzeme zaten var." }));
    });
    render(<StockItemModal onClose={onClose} />);
    fill("Malzeme Kodu", "SNK-0421");
    fill("Malzeme Adı", "Kopya");
    fill("Birim", "Ton");
    submit();

    expect(screen.getByText("Bu kodda bir malzeme zaten var.")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("başarıda diyalog kapanır (listeler hook tarafında tazelenir)", () => {
    mutate.mockImplementation((_body, options) => options.onSuccess());
    render(<StockItemModal onClose={onClose} />);
    fill("Malzeme Kodu", "A-2");
    fill("Malzeme Adı", "Test");
    fill("Birim", "Adet");
    submit();
    expect(onClose).toHaveBeenCalled();
  });

  it("kategori seçenekleri ŞEMA enum'udur ('Boya-Kaplama' yoktur)", () => {
    render(<StockItemModal onClose={onClose} />);
    const options = screen.getAllByRole("option").map((option) => option.textContent);
    expect(options).toEqual([
      "Yapı Malzemesi",
      "Demir-Çelik",
      "Elektrik",
      "Mekanik",
      "İç Yapı",
    ]);
  });
});

describe("StockItemModal — kaydedilmemiş değişiklik kaydı", () => {
  it("açıldı + dokunulmadı → false", () => {
    render(<StockItemModal onClose={onClose} />);
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });

  it("bir alan dolduruldu → true", () => {
    render(<StockItemModal onClose={onClose} />);
    fill("Malzeme Kodu", "SNK-9001");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
  });

  it("başarılı kayıt (onSuccess: onClose) → unmount ile false", () => {
    mutate.mockImplementation((_body, options) => options.onSuccess());
    const { unmount } = render(<StockItemModal onClose={onClose} />);
    fill("Malzeme Kodu", "A-2");
    fill("Malzeme Adı", "Test");
    fill("Birim", "Adet");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
    submit();
    expect(onClose).toHaveBeenCalled();
    unmount();
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });
});
