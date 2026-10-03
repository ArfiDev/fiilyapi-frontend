import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import type { SubcontractorContractItemResponse } from "@/lib/api/hooks/useSubcontractorContractMutations";

import { ContractItemsCard, type ContractItemsCardProps } from "./ContractItemsCard";
import { ADD_ITEM_PENDING_REASON, FSO_TEXT } from "./constants";

const ITEMS: SubcontractorContractItemResponse[] = [
  {
    id: "sci-1",
    contract_id: "sc-1",
    source_contract_item_id: "eci-1",
    code: "03.001",
    description: "Kat Döşemesi Betonu C25/30",
    unit: "m³",
    quantity: "1200.000",
    unit_price: "1200.00",
    sort_order: 0,
    group: { id: "g-a", name: "A — Betonarme İşleri" },
    line_total: "1440000.00",
  },
  {
    id: "sci-2",
    contract_id: "sc-1",
    source_contract_item_id: "eci-2",
    code: "03.002",
    description: "Kolon Betonu C30/37",
    unit: "m³",
    quantity: "340.000",
    // Fiyatı GİRİLMEMİŞ satır — `0` değil, `null`.
    unit_price: null,
    sort_order: 1,
    group: { id: "g-a", name: "A — Betonarme İşleri" },
    line_total: "0.00",
  },
];

function setup(overrides: Partial<ContractItemsCardProps> = {}) {
  const onCommitItem = vi.fn();
  const onDeleteItem = vi.fn();
  const onLoadFromEmployer = vi.fn();
  render(
    <ContractItemsCard
      items={ITEMS}
      contractTotal="1440000.00"
      itemsMissingPrice={1}
      employerContractNo="SZL-2025-001"
      loadNotice={null}
      loadError={null}
      isLoadPending={false}
      isBusy={false}
      loadDisabledReason={null}
      canDelete={true}
      onLoadFromEmployer={onLoadFromEmployer}
      onCommitItem={onCommitItem}
      onDeleteItem={onDeleteItem}
      {...overrides}
    />,
  );
  return { onCommitItem, onDeleteItem, onLoadFromEmployer };
}

describe("ContractItemsCard — mockup 112-187", () => {
  it("yedi kolonu ve grup başlığını basar", () => {
    setup();
    for (const header of ["Poz No", "Poz Adı", "Birim", "Miktar", "Toplam Bedel"]) {
      expect(screen.getByRole("columnheader", { name: header })).toBeInTheDocument();
    }
    expect(screen.getByRole("columnheader", { name: /Taşeron B\.F\./ })).toBeInTheDocument();
    expect(screen.getByText("A — Betonarme İşleri")).toBeInTheDocument();
  });

  it("115 · kaynak rozetini işveren sözleşme no'suyla basar", () => {
    setup();
    expect(screen.getByTestId("fso-items-source")).toHaveTextContent("SZL-2025-001'den yüklendi");
  });

  it("180-184 · toplam TEK KAYNAK `contract_total`tir", () => {
    setup();
    // 1.440.000 — istemci satırları yeniden toplamaz.
    expect(screen.getByTestId("fso-items-total")).toHaveTextContent("1.440.000");
  });
});

describe("`unit_price` boş = 'girilmedi' (0 DEĞİL)", () => {
  it("fiyatsız satırın Toplam Bedel hücresi 'girilmedi' der", () => {
    setup();
    expect(screen.getByTestId("fso-line-total-03.002")).toHaveTextContent(
      FSO_TEXT.missingPriceLabel,
    );
    expect(screen.getByTestId("fso-line-total-03.002")).not.toHaveTextContent("0");
    expect(screen.getByTestId("fso-line-total-03.001")).toHaveTextContent("1.440.000");
  });

  it("items_missing_price uyarısı GÖRÜNÜR basılır", () => {
    setup({ itemsMissingPrice: 3 });
    expect(screen.getByTestId("fso-missing-price")).toHaveTextContent(
      /3 pozun Taşeron B\.F\. değeri girilmedi/,
    );
  });

  it("uyarı yalnız sayaç sıfırdan büyükken basılır", () => {
    setup({ itemsMissingPrice: 0 });
    expect(screen.queryByTestId("fso-missing-price")).toBeNull();
  });

  it("fiyat hücresi boşaltılınca uca boş dize gider (çağıran `null`a çevirir)", () => {
    const { onCommitItem } = setup();
    const input = screen.getByLabelText("03.001 taşeron birim fiyatı");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(onCommitItem).toHaveBeenCalledWith("sci-1", { unitPrice: "" });
  });

  it("değişmeyen hücre için istek AÇILMAZ", () => {
    const { onCommitItem } = setup();
    const input = screen.getByLabelText("03.001 miktar");
    fireEvent.blur(input);
    expect(onCommitItem).not.toHaveBeenCalled();
  });

  it("miktar boşaltılırsa GÖNDERİLMEZ (şema `quantity > 0` ister)", () => {
    const { onCommitItem } = setup();
    const input = screen.getByLabelText("03.001 miktar");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(onCommitItem).not.toHaveBeenCalled();
  });

  it("miktar değişince kırpılmış değerle gönderilir", () => {
    const { onCommitItem } = setup();
    const input = screen.getByLabelText("03.001 miktar");
    fireEvent.change(input, { target: { value: "1500" } });
    fireEvent.blur(input);
    expect(onCommitItem).toHaveBeenCalledWith("sci-1", { quantity: "1500" });
  });

  // no 328 — `clearDraft` mutasyondan ÖNCE çağrılıyordu; hücre, sunucu
  // yanıtı dönene kadar (item prop TAZELENMEDEN) sunucunun ESKİ değerine bir
  // an için geri dönüyordu (yazdığı değer değil, eski değer flaşlanıyordu).
  it("mutasyon SÜRERKEN (isBusy) hücre kullanıcının yazdığı değeri göstermeye devam eder, ESKİ sunucu değerine dönmez", () => {
    const onCommitItem = vi.fn();
    const { rerender } = render(
      <ContractItemsCard
        items={ITEMS}
        contractTotal="1440000.00"
        itemsMissingPrice={1}
        employerContractNo="SZL-2025-001"
        loadNotice={null}
        loadError={null}
        isLoadPending={false}
        isBusy={false}
        loadDisabledReason={null}
        canDelete={true}
        onLoadFromEmployer={vi.fn()}
        onCommitItem={onCommitItem}
        onDeleteItem={vi.fn()}
      />,
    );
    const input = screen.getByLabelText("03.001 miktar");
    fireEvent.change(input, { target: { value: "1500" } });
    fireEvent.blur(input);
    expect(onCommitItem).toHaveBeenCalledWith("sci-1", { quantity: "1500" });

    // Mutasyon başladı (isBusy=true); sunucu (item prop) HENÜZ tazelenmedi.
    rerender(
      <ContractItemsCard
        items={ITEMS}
        contractTotal="1440000.00"
        itemsMissingPrice={1}
        employerContractNo="SZL-2025-001"
        loadNotice={null}
        loadError={null}
        isLoadPending={false}
        isBusy={true}
        loadDisabledReason={null}
        canDelete={true}
        onLoadFromEmployer={vi.fn()}
        onCommitItem={onCommitItem}
        onDeleteItem={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("03.001 miktar")).toHaveValue("1500"); // TKL-F7a: hücre artık metin girişi (sayı değil)
  });

  it("no 328 · mutasyon SETTLE olunca (isBusy geri false) taslak temizlenir — HATADA sunucu değerine geri döner", () => {
    const onCommitItem = vi.fn();
    const baseProps = {
      items: ITEMS,
      contractTotal: "1440000.00",
      itemsMissingPrice: 1,
      employerContractNo: "SZL-2025-001",
      loadNotice: null,
      loadError: null,
      isLoadPending: false,
      loadDisabledReason: null,
      canDelete: true,
      onLoadFromEmployer: vi.fn(),
      onCommitItem,
      onDeleteItem: vi.fn(),
    };
    const { rerender } = render(<ContractItemsCard {...baseProps} isBusy={false} />);
    const input = screen.getByLabelText("03.001 miktar");
    fireEvent.change(input, { target: { value: "1500" } });
    fireEvent.blur(input);

    rerender(<ContractItemsCard {...baseProps} isBusy={true} />);
    // Mutasyon HATAYLA settle olur — item prop DEĞİŞMEDEN kalır (1200.000).
    rerender(<ContractItemsCard {...baseProps} isBusy={false} />);

    expect(screen.getByLabelText("03.001 miktar")).toHaveValue("1.200"); // TKL-F7a: sunucu "1200.000" Türkçe gösterilir
  });
});

describe("load-from-employer bildirimi ve satır silme", () => {
  it("created/skipped sayıları GÖRÜNÜR basılır — sessiz yutma yok", () => {
    setup({ loadNotice: { created: 4, skipped: 2 } });
    expect(screen.getByTestId("fso-load-notice")).toHaveTextContent(
      "İşveren sözleşmesinden 4 poz eklendi, 2 poz zaten listede olduğu için atlandı.",
    );
  });

  it("yükleme butonu gerekçeliyse devre dışıdır", () => {
    setup({ loadDisabledReason: "Proje seçilmedi" });
    const button = screen.getByRole("button", { name: FSO_TEXT.loadFromEmployer });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", "Proje seçilmedi");
  });

  /**
   * no 331 · silme butonu ESKİDEN onay sormadan doğrudan `onDeleteItem`
   * çağırıyordu (yanlış tıklama = geri dönüşsüz silme). Artık bir onay
   * diyaloğu araya girer; çağrı YALNIZ diyalog onaylanınca gider.
   */
  it("331 · satır silme ÖNCE onay ister; tek tıklama silmez", () => {
    const { onDeleteItem } = setup();
    fireEvent.click(screen.getByRole("button", { name: "03.002 satırını sil" }));
    expect(onDeleteItem).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: /Poz.*Sil|Satırı Sil/i })).toBeInTheDocument();
  });

  it("331 · onay diyaloğunda 'Sil' çağrıyı kalem kimliğiyle yapar", () => {
    const { onDeleteItem } = setup();
    fireEvent.click(screen.getByRole("button", { name: "03.002 satırını sil" }));
    fireEvent.click(screen.getByRole("button", { name: "Sil" }));
    expect(onDeleteItem).toHaveBeenCalledWith("sci-2");
  });

  it("331 · onay diyaloğunda 'Vazgeç' çağrıyı iptal eder", () => {
    const { onDeleteItem } = setup();
    fireEvent.click(screen.getByRole("button", { name: "03.002 satırını sil" }));
    fireEvent.click(screen.getByRole("button", { name: "Vazgeç" }));
    expect(onDeleteItem).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Sil" })).not.toBeInTheDocument();
  });

  // kalan-6 no 319 — silme uçları `contracts:admin` kapısındadır; `canWrite`
  // (full) yeterli değildir, buton `canDelete` ile kapatılmalıdır.
  it("canDelete=false iken satır silme butonu DEVRE DIŞIDIR", () => {
    setup({ canDelete: false });
    expect(screen.getByRole("button", { name: "03.002 satırını sil" })).toBeDisabled();
  });
});

describe("elle poz ekleme — mockup FORMU yok", () => {
  it("116 ve 174'teki iki giriş de SİLİNMEZ, devre dışı + gerekçelidir", () => {
    setup();
    for (const name of [FSO_TEXT.addItem, FSO_TEXT.addItemRow]) {
      const button = screen.getByRole("button", { name });
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute("title", ADD_ITEM_PENDING_REASON);
    }
  });
});
