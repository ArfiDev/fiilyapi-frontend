import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import MakinePage from "./page";
import { useSession } from "@/components/shell/SessionProvider";
import { useEquipment } from "@/lib/api/hooks/useEquipment";
import { useEquipmentSummary } from "@/lib/api/hooks/useEquipmentSummary";
import { usePersonnel } from "@/lib/api/hooks/usePersonnel";
import { useSiteOptions } from "@/lib/api/hooks/useSiteOptions";
import { meFixture } from "@/lib/auth/page-grants.testkit";

// F-MK T2 · `/makine` gerçek rota eklenince [...slug] catch-all bu segment
// için devre dışı kalır — bu test sayfanın ComingSoon YERİNE gerçek M1
// ekipman ızgarasını bastığını doğrular.

vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/api/hooks/useEquipment", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useEquipment")>()),
  useEquipment: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useEquipmentSummary", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useEquipmentSummary")>()),
  useEquipmentSummary: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useSiteOptions", () => ({ useSiteOptions: vi.fn() }));
vi.mock("@/lib/api/hooks/usePersonnel", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/usePersonnel")>()),
  usePersonnel: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useSession).mockReturnValue({
    me: meFixture(),
    isLoading: false,
  } as ReturnType<typeof useSession>);
  vi.mocked(useEquipment).mockReturnValue({
    data: { items: [], total: 0, limit: 200, offset: 0 },
    isLoading: false,
    isError: false,
    error: null,
  } as unknown as ReturnType<typeof useEquipment>);
  vi.mocked(useEquipmentSummary).mockReturnValue({
    data: {
      working: 0,
      broken: 0,
      maintenance: 0,
      idle: 0,
      monthly_cost: "0.00",
      monthly_cost_unknown_count: 0,
    },
    isLoading: false,
    isError: false,
    error: null,
  } as unknown as ReturnType<typeof useEquipmentSummary>);
  vi.mocked(useSiteOptions).mockReturnValue({ options: [], isLoading: false, isError: false });
  vi.mocked(usePersonnel).mockReturnValue({
    data: { items: [], total: 0, limit: 200, offset: 0 },
    isLoading: false,
    isError: false,
    error: null,
  } as unknown as ReturnType<typeof usePersonnel>);
});

describe("/makine sayfası", () => {
  it("M1 ekipman ızgarasını basar, ComingSoon'a DÜŞMEZ", () => {
    render(<MakinePage />);
    expect(screen.getByRole("heading", { name: "Makine & Ekipman" })).toBeInTheDocument();
    expect(screen.queryByText("Bu modül yakında eklenecek.")).not.toBeInTheDocument();
  });
});
