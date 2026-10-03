import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import type { SubcontractorContractItemResponse } from "@/lib/api/hooks/useSubcontractorContractMutations";
import { REF_PRICE_AMBIGUOUS_DOT } from "@/lib/tr-decimal";

import { ContractItemsCard } from "./ContractItemsCard";

/** TKL-F7a · T42 — satır içi miktar + taşeron B.F. hücreleri Türkçe (T30). */
const ITEMS: SubcontractorContractItemResponse[] = [
  {
    id: "sci-1",
    contract_id: "sc-1",
    source_contract_item_id: null,
    code: "03.001",
    description: "Beton",
    unit: "m³",
    quantity: "3200.000",
    unit_price: "28500.00",
    sort_order: 0,
    group: null,
    line_total: "0.00",
  },
  {
    id: "sci-2",
    contract_id: "sc-1",
    source_contract_item_id: null,
    code: "03.002",
    description: "Kalıp",
    unit: "m²",
    quantity: "2.125",
    unit_price: null,
    sort_order: 1,
    group: null,
    line_total: "0.00",
  },
];

function setup() {
  const onCommitItem = vi.fn();
  render(
    <ContractItemsCard
      items={ITEMS}
      contractTotal="0.00"
      itemsMissingPrice={1}
      employerContractNo={null}
      loadNotice={null}
      loadError={null}
      isLoadPending={false}
      isBusy={false}
      loadDisabledReason={null}
      canDelete
      onLoadFromEmployer={vi.fn()}
      onCommitItem={onCommitItem}
      onDeleteItem={vi.fn()}
    />,
  );
  return { onCommitItem };
}

const qty = () => screen.getByLabelText("03.001 miktar");
const price = () => screen.getByLabelText("03.001 taşeron birim fiyatı");

function type(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
}

describe("ContractItemsCard hücreleri — T30 gösterim", () => {
  it("sunucu '3200.000' → '3.200', '28500.00' → '28.500,00', '2.125' → '2,125'", () => {
    setup();
    expect(qty()).toHaveValue("3.200");
    expect(price()).toHaveValue("28.500,00");
    expect(screen.getByLabelText("03.002 miktar")).toHaveValue("2,125");
    expect(screen.getByLabelText("03.002 taşeron birim fiyatı")).toHaveValue("");
  });

  it("hücreler metin girişidir (type=number DEĞİL, inputMode=decimal)", () => {
    setup();
    for (const input of [qty(), price()]) {
      expect(input).not.toHaveAttribute("type", "number");
      expect(input).toHaveAttribute("inputmode", "decimal");
    }
  });

  it("dokunmadan blur → yazma YOK", () => {
    const { onCommitItem } = setup();
    fireEvent.blur(qty());
    fireEvent.blur(price());
    expect(onCommitItem).not.toHaveBeenCalled();
  });

  it("gösterilen metin aynen geri yazılırsa ('3.200' → 3200, 3,2 DEĞİL) yazma YOK", () => {
    const { onCommitItem } = setup();
    type(qty(), "3.200");
    type(price(), "28.500,00");
    expect(onCommitItem).not.toHaveBeenCalled();
  });

  it("aynı değerin başka yazımı ('3200') yazma açmaz", () => {
    const { onCommitItem } = setup();
    type(qty(), "3200");
    expect(onCommitItem).not.toHaveBeenCalled();
  });
});

describe("ContractItemsCard hücreleri — T30 yazma", () => {
  it("miktar '1.234,5' → \"1234.5\"; '3,5' → \"3.5\"", () => {
    const { onCommitItem } = setup();
    type(qty(), "1.234,5");
    expect(onCommitItem).toHaveBeenLastCalledWith("sci-1", { quantity: "1234.5" });
    type(screen.getByLabelText("03.002 miktar"), "3,5");
    expect(onCommitItem).toHaveBeenLastCalledWith("sci-2", { quantity: "3.5" });
  });

  it("fiyat '1.234,5' → \"1234.50\"; '3,5' → \"3.50\"", () => {
    const { onCommitItem } = setup();
    type(price(), "1.234,5");
    expect(onCommitItem).toHaveBeenLastCalledWith("sci-1", { unitPrice: "1234.50" });
    type(screen.getByLabelText("03.002 taşeron birim fiyatı"), "3,5");
    expect(onCommitItem).toHaveBeenLastCalledWith("sci-2", { unitPrice: "3.50" });
  });

  it("miktar '0.500' → REF_PRICE_AMBIGUOUS_DOT, yazma GİTMEZ, hücre sunucu değerine döner", () => {
    const { onCommitItem } = setup();
    type(qty(), "0.500");
    expect(onCommitItem).not.toHaveBeenCalled();
    expect(screen.getByTestId("fso-cell-error")).toHaveTextContent(REF_PRICE_AMBIGUOUS_DOT);
    expect(qty()).toHaveValue("3.200");
  });

  it("fiyat '0.500' ve '1.50' → REF_PRICE_AMBIGUOUS_DOT, yazma GİTMEZ", () => {
    const { onCommitItem } = setup();
    type(price(), "0.500");
    expect(screen.getByTestId("fso-cell-error")).toHaveTextContent(REF_PRICE_AMBIGUOUS_DOT);
    type(price(), "1.50");
    expect(screen.getByTestId("fso-cell-error")).toHaveTextContent(REF_PRICE_AMBIGUOUS_DOT);
    expect(onCommitItem).not.toHaveBeenCalled();
  });

  it("fiyat boşaltılınca hâlâ boş dize gider (null'a çevirme çağıranda)", () => {
    const { onCommitItem } = setup();
    type(price(), "");
    expect(onCommitItem).toHaveBeenCalledWith("sci-1", { unitPrice: "" });
  });
});
