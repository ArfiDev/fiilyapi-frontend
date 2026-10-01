import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { SubcontractorContractItemsTable } from "./SubcontractorContractItemsTable";
import { EmployerContractItemsTable } from "./EmployerContractItemsTable";
import type { SubcontractorContractItemResponse } from "@/lib/api/hooks/useSubcontractorContractMutations";
import type {
  EmployerContractDetail,
  EmployerContractItemsResponse,
} from "@/lib/api/hooks/useContract";

/**
 * no 51 · `type="number"` hücreleri Türkçe klavyenin virgülünü KABUL ETMEZ —
 * tarayıcı (ve jsdom'un number-input doğrulaması) geçersiz metni SESSİZCE ""a
 * indirger. `SubcontractorContractItemsTable`ın "Taşeron B.F." hücresinde bu,
 * `onBlur`da doğrudan `unit_price: null` YAZILMASI demektir (T7 emsali boş =
 * "girilmedi"). Emsal `ContractDistributionGrid` bu riski `inputMode="decimal"`
 * ile reddetmişti (T1 notu); bu dosya aynı korkuluğu iki kardeş tabloda ölçer.
 */

describe("Taşeron B.F. hücresi — Türkçe virgül SESSİZCE SİLMEZ", () => {
  function renderTable() {
    const onCommitUnitPrice = vi.fn();
    const item = {
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
    } as unknown as SubcontractorContractItemResponse;

    render(
      <SubcontractorContractItemsTable
        items={[item]}
        contractTotal="1440000.00"
        itemsMissingPrice={0}
        employerContractNo={null}
        progressPctByItemId={null}
        progressPendingReason="pending"
        isBusy={false}
        errorMessage={null}
        onCommitUnitPrice={onCommitUnitPrice}
        onAddItem={vi.fn()}
      />,
    );
    return { onCommitUnitPrice };
  }

  it("51 · hücre `inputMode=\"decimal\"` kullanır, `type=\"number\"` DEĞİL", () => {
    renderTable();
    const input = screen.getByLabelText("03.001 taşeron birim fiyatı");
    expect(input).not.toHaveAttribute("type", "number");
    expect(input).toHaveAttribute("inputmode", "decimal");
  });

  it("51 · virgüllü girdi (\"1,5\") tarayıcı tarafından SİLİNMEZ — hücre değeri korunur", () => {
    renderTable();
    const input = screen.getByLabelText("03.001 taşeron birim fiyatı") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "1350,50" } });
    // `type="number"` olsaydı jsdom bunu "" olarak sıfırlardı.
    expect(input.value).toBe("1350,50");
  });
});

describe("İşveren poz tablosu satır-içi hücreleri — Türkçe virgül SESSİZCE SİLMEZ", () => {
  const PROJECT_ID = "pppppppp-0000-0000-0000-000000000001";
  const GROUP_ID = "gggggggg-0000-0000-0000-000000000002";

  const DETAIL = {
    project_id: PROJECT_ID,
    amount: "22400000.00",
    items_total: "1000.00",
    items_total_diff: "0.00",
  } as EmployerContractDetail;

  const DATA: EmployerContractItemsResponse = {
    groups: [
      {
        id: GROUP_ID,
        name: "B — Betonarme İşleri",
        sort_order: 20,
        items: [
          {
            id: "iiiiiiii-0000-0000-0000-000000000001",
            group_id: GROUP_ID,
            code: "03.011",
            description: "Grobeton",
            unit: "m³",
            quantity: "100.000",
            unit_price: "1200.00",
            sort_order: 10,
            distributed_quantity: "40.000",
            remaining_quantity: "60.000",
          },
        ],
      },
    ],
  } as EmployerContractItemsResponse;

  function renderTable() {
    render(
      <EmployerContractItemsTable
        projectId={PROJECT_ID}
        detail={DETAIL}
        isError={false}
        isLoading={false}
        data={DATA}
        onAddItem={vi.fn()}
        onCommitItem={vi.fn()}
        onCreateItem={vi.fn().mockResolvedValue(true)}
        isCreating={false}
        saveError={null}
      />,
    );
  }

  it("51 · birim fiyat hücresi `inputMode=\"decimal\"` kullanır, `type=\"number\"` DEĞİL", () => {
    renderTable();
    const input = screen.getByLabelText("03.011 birim fiyatı");
    expect(input).not.toHaveAttribute("type", "number");
    expect(input).toHaveAttribute("inputmode", "decimal");
  });

  it("51 · miktar hücresi `inputMode=\"decimal\"` kullanır, `type=\"number\"` DEĞİL", () => {
    renderTable();
    const input = screen.getByLabelText("03.011 miktar");
    expect(input).not.toHaveAttribute("type", "number");
    expect(input).toHaveAttribute("inputmode", "decimal");
  });

  it("51 · virgüllü girdi (\"1350,50\") tarayıcı tarafından SİLİNMEZ", () => {
    renderTable();
    const input = screen.getByLabelText("03.011 birim fiyatı") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "1350,50" } });
    expect(input.value).toBe("1350,50");
  });

  it("51 · satır-içi EKLEME taslağındaki fiyat/miktar hücreleri de `inputMode=\"decimal\"`dir", () => {
    renderTable();
    fireEvent.click(screen.getByTestId(`ecd-add-row-${GROUP_ID}`));
    expect(screen.getByLabelText("Yeni poz birim fiyatı")).toHaveAttribute("inputmode", "decimal");
    expect(screen.getByLabelText("Yeni poz miktarı")).toHaveAttribute("inputmode", "decimal");
    expect(screen.getByLabelText("Yeni poz birim fiyatı")).not.toHaveAttribute("type", "number");
    expect(screen.getByLabelText("Yeni poz miktarı")).not.toHaveAttribute("type", "number");
  });
});
