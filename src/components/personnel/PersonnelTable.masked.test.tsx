import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSession } from "@/components/shell/SessionProvider";
import { EMPTY_PERSONNEL_HR_FIELDS } from "@/lib/api/hooks/personnel-fixtures";
import type { MeResponse } from "@/lib/auth/types";

import type { PersonnelDeriveItem } from "./personnel-derive";
import { PersonnelTable } from "./PersonnelTable";

vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

function mockSession(hidden: readonly string[]) {
  vi.mocked(useSession).mockReturnValue({
    me: { hidden_fields: hidden } as unknown as MeResponse,
    isLoading: false,
  });
}

const MASKED_ROW = {
  ...EMPTY_PERSONNEL_HR_FIELDS,
  id: "per-1",
  full_name: "Ayşe Demir",
  trade: "Kalıpçı",
  source: "company",
  subcontractor_id: null,
  user_id: null,
  is_active: true,
  wage_type: "daily",
} as unknown as PersonnelDeriveItem;

function renderTable(rows: PersonnelDeriveItem[]) {
  render(<PersonnelTable rows={rows} isLoading={false} isError={false} hasFilter={false} projectNames={{}} />);
}

describe("IZN-F4c.2 · personel listesi — SGK/ücret maskesi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession(["maas_kisisel"]);
  });

  it("SGK ve ücret null + kategori gizli: hücrelerde '—', başlıkta TEK kilit (satırda değil)", () => {
    renderTable([MASKED_ROW, { ...MASKED_ROW, id: "per-2" } as PersonnelDeriveItem]);
    expect(screen.getByTestId("personel-sgk-per-1")).toHaveTextContent("—");
    expect(screen.getByTestId("personel-wage-per-1")).toHaveTextContent("—");
    const head = screen.getAllByRole("columnheader");
    expect(head.flatMap((th) => within(th).queryAllByTestId("hidden-mark"))).toHaveLength(2);
    expect(screen.getAllByTestId("hidden-mark")).toHaveLength(2);
  });

  it("kategori gizli değilse kilit YOK", () => {
    mockSession([]);
    renderTable([MASKED_ROW]);
    expect(screen.queryByTestId("hidden-mark")).toBeNull();
  });

  it("dolu satırda kilit YOK", () => {
    renderTable([{ ...MASKED_ROW, sgk_no: "123", wage_amount: "900.00" } as PersonnelDeriveItem]);
    expect(screen.queryByTestId("hidden-mark")).toBeNull();
    expect(screen.getByTestId("personel-sgk-per-1")).toHaveTextContent("123");
  });
});
