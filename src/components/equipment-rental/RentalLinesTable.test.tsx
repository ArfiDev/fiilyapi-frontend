import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { RentalLinesTable } from "./RentalLinesTable";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";
import type {
  RentalInvoiceDetailResponse,
  RentalInvoiceLineResponse,
} from "@/lib/api/hooks/useEquipmentRentalInvoices";

function line(overrides: Partial<RentalInvoiceLineResponse> = {}): RentalInvoiceLineResponse {
  return {
    id: "line-1",
    equipment_id: "eq-1",
    equipment_name: "Tower Crane TC-48",
    equipment_brand: "Liebherr",
    equipment_plate_no: null,
    line_kind: "rented",
    worked_hours: "160.00",
    invoiced_hours: "160.00",
    hours_variance: "0.00",
    variance_status: "match",
    rate_amount: "250.00",
    effective_rate_amount: "250.00",
    our_amount: "40000.00",
    breakdown_hours: "0.00",
    breakdown_amount: null,
    site_id: "site-1",
    site_name: "Güneşkent A-Blok",
    ...overrides,
  } as RentalInvoiceLineResponse;
}

const DETAIL: RentalInvoiceDetailResponse = {
  id: "rental-2",
  status: "draft",
  supplier_id: "sup-1",
  supplier_name: "Kiralama A.Ş.",
  invoice_no: "F-1",
  invoice_amount: "40000.00",
  period_year: 2026,
  period_month: 7,
  site_id: null,
  rate_period: "monthly",
  lines: [line()],
  site_distribution: [],
  totals: {
    excluded_breakdown_amount: "0.00",
    excluded_breakdown_unknown_count: 0,
    invoice_amount: "40000.00",
    our_total: "40000.00",
    our_total_unknown_count: 0,
    owned_total: "0.00",
    owned_total_unknown_count: 0,
    payable_total: "40000.00",
    vat_amount: "8000.00",
    vat_rate: "20.00",
  },
} as unknown as RentalInvoiceDetailResponse;

function renderTable(overrides: Partial<Parameters<typeof RentalLinesTable>[0]> = {}) {
  return render(
    <RentalLinesTable
      detail={DETAIL}
      isEditable
      isSaving={false}
      onSaveLine={vi.fn()}
      {...overrides}
    />,
  );
}

/**
 * SEKME-F1.3b (ek) · `RentalLinesTable`in satır-içi hücresi merkezi kayda
 * bağlanma bekçisi. `PayrollLineRow` emsali: odak çıkışında ANINDA kaydeden
 * hücrede de yazım ile blur arasında kısa bir "kaydedilmemiş" pencere vardır.
 */
describe("RentalLinesTable — kaydedilmemiş değişiklik kaydı", () => {
  it("yüklendi, dokunulmadı → temiz", () => {
    renderTable();
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });

  it("hücre değiştirildi (blur ATILMADI) → kirli", () => {
    renderTable();
    fireEvent.change(screen.getByTestId("makine-kira-rate_amount"), { target: { value: "300" } });
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
  });

  it("kaydetme başarılı olup `value` prop'u yeni değere gelince → temiz", () => {
    const { rerender } = renderTable();
    fireEvent.change(screen.getByTestId("makine-kira-rate_amount"), { target: { value: "300" } });
    expect(unsavedRegistry.hasUnsaved()).toBe(true);

    const updatedDetail = {
      ...DETAIL,
      lines: [line({ rate_amount: "300", effective_rate_amount: "300" })],
    } as unknown as RentalInvoiceDetailResponse;
    rerender(
      <RentalLinesTable detail={updatedDetail} isEditable isSaving={false} onSaveLine={vi.fn()} />,
    );
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });
});
