import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { SubcontractorContractItemsTable } from "./SubcontractorContractItemsTable";
import type { SubcontractorContractItemResponse } from "@/lib/api/hooks/useSubcontractorContractMutations";
import { REF_PRICE_AMBIGUOUS_DOT } from "@/lib/tr-decimal";

/** TKL-F7a ek iş · T42 — TSD poz tablosu "Taşeron B.F." hücresi Türkçe (T30). Miktar salt-okunur (girdi YOK). */
function item(id: string, code: string, unitPrice: string | null): SubcontractorContractItemResponse {
  return {
    id,
    contract_id: "sc-1",
    source_contract_item_id: null,
    code,
    description: code,
    unit: "m³",
    quantity: "100.000",
    unit_price: unitPrice,
    sort_order: 0,
    group: null,
    line_total: "0.00",
  } as SubcontractorContractItemResponse;
}

function setup() {
  const onCommitUnitPrice = vi.fn();
  render(
    <SubcontractorContractItemsTable
      items={[item("sci-1", "03.001", "28500.00"), item("sci-2", "03.002", null)]}
      contractTotal="0.00"
      itemsMissingPrice={1}
      employerContractNo={null}
      progressPctByItemId={null}
      progressPendingReason="x"
      isBusy={false}
      errorMessage={null}
      onCommitUnitPrice={onCommitUnitPrice}
      onAddItem={vi.fn()}
    />,
  );
  return { onCommitUnitPrice };
}

const price = (code = "03.001") => screen.getByLabelText(`${code} taşeron birim fiyatı`);
function type(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
}

describe("TSD poz tablosu B.F. hücresi — T30", () => {
  it("sunucu '28500.00' → '28.500,00'; fiyatsız satır boş", () => {
    setup();
    expect(price()).toHaveValue("28.500,00");
    expect(price("03.002")).toHaveValue("");
  });

  it("dokunmadan blur → istek YOK; gösterilen metin aynen geri yazılsa da YOK", () => {
    const { onCommitUnitPrice } = setup();
    fireEvent.blur(price());
    type(price(), "28.500,00");
    type(price(), "28500");
    expect(onCommitUnitPrice).not.toHaveBeenCalled();
  });

  it("'1.234,5' → \"1234.50\"; '3,5' → \"3.50\"", () => {
    const { onCommitUnitPrice } = setup();
    type(price(), "1.234,5");
    expect(onCommitUnitPrice).toHaveBeenLastCalledWith("sci-1", "1234.50");
    type(price("03.002"), "3,5");
    expect(onCommitUnitPrice).toHaveBeenLastCalledWith("sci-2", "3.50");
  });

  it("'28.5' → REF_PRICE_AMBIGUOUS_DOT, istek YOK, hücre sunucu değerine döner", () => {
    const { onCommitUnitPrice } = setup();
    type(price(), "28.5");
    expect(onCommitUnitPrice).not.toHaveBeenCalled();
    expect(screen.getByTestId("tsd-cell-error")).toHaveTextContent(REF_PRICE_AMBIGUOUS_DOT);
    expect(price()).toHaveValue("28.500,00");
  });

  it("boş fiyat hâlâ boş dize gönderir (çağıran null'a çevirir)", () => {
    const { onCommitUnitPrice } = setup();
    type(price(), "");
    expect(onCommitUnitPrice).toHaveBeenCalledWith("sci-1", "");
  });
});
