import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { SubcontractorContractCreateView } from "./SubcontractorContractCreateView";
import { REF_PRICE_AMBIGUOUS_DOT } from "@/lib/tr-decimal";
import { useProjects } from "@/lib/api/hooks/useProjects";
import { useSites } from "@/lib/api/hooks/useSites";
import { useSubcontractors } from "@/lib/api/hooks/useSubcontractors";
import { useEmployerContract } from "@/lib/api/hooks/useContract";
import { useSubcontractorContract } from "@/lib/api/hooks/useSubcontractorProgressPayments";
import { useCreateSubcontractor } from "@/lib/api/hooks/useSubcontractorMutations";

/** TKL-F7a · T42 — FSO "Sözleşme Şartları" üç sayı alanı bileşen düzeyinde (gövdeyi yakalar). */
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/sozlesmeler/taseron/yeni",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/auth/useModulePermission", () => ({
  useModulePermission: vi.fn(() => ({ level: "full", canView: true, canWrite: true, canDelete: true })),
}));
vi.mock("@/lib/api/hooks/useProjects", () => ({ useProjects: vi.fn() }));
vi.mock("@/lib/api/hooks/useSites", () => ({ useSites: vi.fn() }));
vi.mock("@/lib/api/hooks/useSubcontractors", () => ({ useSubcontractors: vi.fn() }));
vi.mock("@/lib/api/hooks/useContract", () => ({ useEmployerContract: vi.fn() }));
vi.mock("@/lib/api/hooks/useSubcontractorProgressPayments", () => ({ useSubcontractorContract: vi.fn() }));
vi.mock("@/lib/api/hooks/useSubcontractorMutations", () => ({ useCreateSubcontractor: vi.fn() }));

const createContractMock = vi.fn();
vi.mock("@/lib/api/hooks/useSubcontractorContractMutations", () => ({
  useCreateSubcontractorContract: () => ({ mutate: createContractMock, isPending: false }),
  useUpdateSubcontractorContract: () => ({ mutate: vi.fn(), isPending: false }),
  useLoadSubcontractorContractItemsFromEmployer: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateSubcontractorContractItem: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteSubcontractorContractItem: () => ({ mutate: vi.fn(), isPending: false }),
}));

function query<T>(data: T | undefined) {
  return { data, isLoading: false, isError: false, error: null } as never;
}

const LATE = "Gecikme Cezası (₺/gün)";
const ADVANCE = "Avans Oranı (%)";
const RETAINAGE = "Teminat Kesintisi (%)";

function draftWith(fields: Record<string, string>) {
  render(<SubcontractorContractCreateView />);
  fireEvent.change(screen.getByRole("combobox", { name: "Proje" }), { target: { value: "p-1" } });
  for (const [label, value] of Object.entries(fields)) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
  fireEvent.click(screen.getByRole("button", { name: "Taslak Kaydet" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useProjects).mockReturnValue(query({ items: [{ id: "p-1", name: "Güneşkent" }], counts: {} }));
  vi.mocked(useSites).mockReturnValue(query({ items: [], counts: {}, totals: {} }));
  vi.mocked(useSubcontractors).mockReturnValue(query({ items: [] }));
  vi.mocked(useEmployerContract).mockReturnValue(query(undefined));
  vi.mocked(useSubcontractorContract).mockReturnValue(query(undefined));
  vi.mocked(useCreateSubcontractor).mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
});

describe("FSO Sözleşme Şartları — T30", () => {
  it("üç alan metin girişidir (type=number DEĞİL, inputMode=decimal)", () => {
    render(<SubcontractorContractCreateView />);
    for (const label of [LATE, ADVANCE, RETAINAGE]) {
      const input = screen.getByLabelText(label);
      expect(input).not.toHaveAttribute("type", "number");
      expect(input).toHaveAttribute("inputmode", "decimal");
    }
  });

  it("'1.234,5' → gecikme \"1234.50\"; '12,5' → avans \"12.5\"; '7,5' → teminat \"7.5\"", () => {
    draftWith({ [LATE]: "1.234,5", [ADVANCE]: "12,5", [RETAINAGE]: "7,5" });
    expect(createContractMock).toHaveBeenCalledTimes(1);
    expect(createContractMock.mock.calls[0][0]).toMatchObject({
      late_penalty_daily: "1234.50",
      advance_pct: "12.5",
      retainage_pct: "7.5",
    });
  });

  it.each([LATE, ADVANCE, RETAINAGE])("%s '0.500' → REF_PRICE_AMBIGUOUS_DOT, gövde GİTMEZ", (label) => {
    draftWith({ [label]: "0.500" });
    expect(createContractMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("fso-form-error")).toHaveTextContent(REF_PRICE_AMBIGUOUS_DOT);
  });
});
