import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { useSession } from "@/components/shell/SessionProvider";
import {
  useContractDistribution,
  useEmployerContract,
  type ContractDistributionResponse,
  type EmployerContractDetail,
} from "@/lib/api/hooks/useContract";
import { useSaveContractDistribution } from "@/lib/api/hooks/useContractMutations";
import { useProject } from "@/lib/api/hooks/useProjects";
import { meFixture, pageGrant } from "@/lib/auth/page-grants.testkit";

import { ContractDistributionView } from "./ContractDistributionView";

// IZN-F5b · madde 7 — PUT /projects/{id}/contract/distribution = CONTRACT_DISTRIBUTION_EDIT (teklif.poz_dagilimi).
vi.mock("@/lib/api/hooks/useContract", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useContract")>()),
  useContractDistribution: vi.fn(),
  useEmployerContract: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useContractMutations", () => ({ useSaveContractDistribution: vi.fn() }));
vi.mock("@/lib/api/hooks/useProjects", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useProjects")>()),
  useProject: vi.fn(),
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/auth/useModulePermission", () => ({
  useModulePermission: () => ({ level: "view", canView: true, canWrite: false, canDelete: false }),
}));

const DISTRIBUTION = {
  sites: [{ id: "s-1", name: "A-Blok" }],
  groups: [
    {
      id: "cg-1",
      name: "A — Betonarme İşleri",
      sort_order: 10,
      items: [
        {
          id: "ci-1",
          code: "03.001",
          source_code: null,
          description: "Kat Döşemesi Betonu",
          unit: "m³",
          quantity: "10.000",
          unit_price: "100.00",
          remaining_quantity: "5.000",
          allocations: [{ site_id: "s-1", quantity: "5.000", boq_item_id: "ci-1" }],
        },
      ],
    },
  ],
  undistributed_item_count: 0,
  undistributed_item_names: [],
  site_summaries: [],
  distributed_item_count: 1,
  total_item_count: 1,
} as unknown as ContractDistributionResponse;

const DETAIL = { project_id: "p-1", contract_no: "SZL-1", amount: "1000.00", employer_name: "X" } as unknown as EmployerContractDetail;
const CELL = "03.001 · A-Blok kotası";

function renderView(me: ReturnType<typeof meFixture>) {
  vi.mocked(useSession).mockReturnValue({ me, isLoading: false } as ReturnType<typeof useSession>);
  vi.mocked(useContractDistribution).mockReturnValue({ data: DISTRIBUTION, isError: false, isLoading: false, error: null } as never);
  vi.mocked(useEmployerContract).mockReturnValue({ data: DETAIL, isError: false, isLoading: false, error: null } as never);
  vi.mocked(useProject).mockReturnValue({ data: { id: "p-1", name: "Proje" }, isError: false, isLoading: false } as never);
  vi.mocked(useSaveContractDistribution).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
  return render(<ContractDistributionView projectId="p-1" />);
}

beforeEach(() => vi.clearAllMocks());

describe("ContractDistributionView · yazma kapısı (IZN-F5b)", () => {
  it("teklif.poz_dagilimi Düzenler → kota hücresi düzenlenebilir", () => {
    renderView(meFixture({ pages: { "teklif.poz_dagilimi": pageGrant("edit") } }));
    expect(screen.getByLabelText(CELL)).toBeEnabled();
  });

  it("yalnız teklif.isveren_sozlesme Düzenler → kota hücresi devre dışı, salt-okunur not var", () => {
    renderView(meFixture({ pages: { "teklif.isveren_sozlesme": pageGrant("edit") } }));
    expect(screen.getByLabelText(CELL)).toBeDisabled();
    expect(screen.getByTestId("cdist-readonly-notice")).toBeInTheDocument();
  });
});
