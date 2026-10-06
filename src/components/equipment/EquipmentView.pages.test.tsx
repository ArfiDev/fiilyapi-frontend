import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { EquipmentView } from "./EquipmentView";
import { useEquipment, type EquipmentResponse } from "@/lib/api/hooks/useEquipment";
import { useEquipmentSummary } from "@/lib/api/hooks/useEquipmentSummary";
import { usePersonnel } from "@/lib/api/hooks/usePersonnel";
import { useSiteOptions } from "@/lib/api/hooks/useSiteOptions";
import { useSession } from "@/components/shell/SessionProvider";
import { meFixture, pageGrant } from "@/lib/auth/page-grants.testkit";

// IZN-F2.y — "+ Ekipman Ekle" ve kartlardaki "Düzenle" saha.makine_* Düzenler kapısından karar verir
// (POST/PATCH /equipment = backend saha.makine_ekipman Düzenler; IZN-F5b-A). Görüntüleme DEĞİŞMEZ.
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
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));

const EQUIPMENT = {
  id: "eq-1",
  name: "Tower Crane TC-48",
  category: "crane",
  brand: "Liebherr",
  ownership: "owned",
  rate_amount: "3200.00",
  rate_period: "daily",
  site_id: null,
  operator_id: null,
  status: "idle",
  is_active: true,
} as unknown as EquipmentResponse;

function queryStub<T>(data: T) {
  return { data, isLoading: false, isError: false, error: null } as never;
}

function session(me: ReturnType<typeof meFixture>) {
  vi.mocked(useSession).mockReturnValue({ me, isLoading: false } as ReturnType<typeof useSession>);
}

const ADD = "+ Ekipman Ekle";
const EDIT_LINK = "makine-card-edit-link";
// Modül izni görmeye yeter; yazma kararı sayfa izninden gelir.
const VIEW_MODULE = { equipment: "view" };

describe("EquipmentView · sayfa izni kapısı (IZN-F2.y)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useEquipment).mockReturnValue(
      queryStub({ items: [EQUIPMENT], total: 1, limit: 200, offset: 0 }),
    );
    vi.mocked(useEquipmentSummary).mockReturnValue(queryStub({ working: 0, broken: 0, maintenance: 0, idle: 1, monthly_cost: "0", monthly_cost_unknown_count: 0 }));
    vi.mocked(useSiteOptions).mockReturnValue({ options: [], isLoading: false, isError: false });
    vi.mocked(usePersonnel).mockReturnValue(queryStub({ items: [], total: 0, limit: 200, offset: 0 }));
  });

  it("saha.makine_ekipman Düzenler → '+ Ekipman Ekle' ve 'Düzenle' var", () => {
    session(meFixture({ pages: { "saha.makine_ekipman": pageGrant("edit") }, permissions: VIEW_MODULE }));
    render(<EquipmentView />);
    expect(screen.getByRole("link", { name: ADD })).toBeInTheDocument();
    expect(screen.getByTestId(EDIT_LINK)).toBeInTheDocument();
  });

  it("yalnız KARDEŞ sayfalar (çalışma/yakıt/kira) Düzenler, ekipman Görür → düğme ve 'Düzenle' YOK (IZN-F5b-A)", () => {
    session(
      meFixture({
        pages: {
          "saha.makine_ekipman": pageGrant("view"),
          "saha.makine_calisma": pageGrant("edit"),
          "saha.makine_yakit": pageGrant("edit"),
          "saha.makine_kira": pageGrant("edit"),
        },
        permissions: VIEW_MODULE,
      }),
    );
    render(<EquipmentView />);
    expect(screen.queryByRole("link", { name: ADD })).toBeNull();
    expect(screen.queryByTestId(EDIT_LINK)).toBeNull();
  });

  it("saha.makine_ekipman Görür → '+ Ekipman Ekle' ve 'Düzenle' YOK, liste görünür", () => {
    session(
      meFixture({ pages: { "saha.makine_ekipman": pageGrant("view", true) }, permissions: { equipment: "full" } }),
    );
    render(<EquipmentView />);
    expect(screen.queryByRole("link", { name: ADD })).toBeNull();
    expect(screen.queryByTestId(EDIT_LINK)).toBeNull();
    expect(screen.getByText("Tower Crane TC-48")).toBeInTheDocument();
  });

  it("pages boş → bugünkü davranış: düğme ve 'Düzenle' var", () => {
    session(meFixture({ pages: {}, permissions: VIEW_MODULE }));
    render(<EquipmentView />);
    expect(screen.getByRole("link", { name: ADD })).toBeInTheDocument();
    expect(screen.getByTestId(EDIT_LINK)).toBeInTheDocument();
  });

  it("sistem yöneticisi: grant none olsa da düğme var", () => {
    session(
      meFixture({ pages: { "saha.makine_ekipman": pageGrant("none") }, isSystemAdmin: true, permissions: VIEW_MODULE }),
    );
    render(<EquipmentView />);
    expect(screen.getByRole("link", { name: ADD })).toBeInTheDocument();
  });
});
