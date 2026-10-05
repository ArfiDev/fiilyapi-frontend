import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSession } from "@/components/shell/SessionProvider";
import type { ApprovalInboxItem } from "@/lib/api/hooks/useApprovals";
import { meFixture } from "@/lib/auth/page-grants.testkit";

import { ApprovalCard } from "./ApprovalCard";
import { approvalAmountCategories, approvalAmountLabel } from "./approval-labels";

vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/onay-kutusu", useRouter: () => ({ push: vi.fn() }) }));

const PROJECT = "22222222-2222-2222-2222-222222222222";

function session(hidden: Parameters<typeof meFixture>[0]) {
  vi.mocked(useSession).mockReturnValue({ me: meFixture(hidden), isLoading: false } as ReturnType<
    typeof useSession
  >);
}

function maskedItem(over: Partial<ApprovalInboxItem> = {}): ApprovalInboxItem {
  return {
    chain_id: "c1",
    document_type: "progress_payment",
    document_id: "pp-1",
    created_by_name: "Sercan",
    created_at: "2026-07-20T08:52:00Z",
    threshold_snapshot: "500000.00",
    amount_snapshot: null,
    can_decide: false,
    current_step_no: 1,
    steps: [{ step_no: 1, approval_role: "accounting", decided_at: null, decided_by_name: null }],
    title: "Hakediş #1",
    subtitle: null,
    gross_amount: null,
    net_amount: null,
    project_id: PROJECT,
    ...over,
  } as ApprovalInboxItem;
}

function renderCard(item: ApprovalInboxItem) {
  return render(<ApprovalCard item={item} isPending={false} onApprove={vi.fn()} onReject={vi.fn()} />);
}

beforeEach(() => vi.clearAllMocks());

describe("IZN-F4b.2 · onay kutusu kartı tutarı", () => {
  it("null tutar '—' basılır ('₺0' değil); evrak tipinin kategorisi gizliyse kilit ipucu", () => {
    session({ hiddenFields: ["sozlesme_fiyat"] });
    renderCard(maskedItem());
    expect(screen.getByTestId("ok-card-gross")).toHaveTextContent("—");
    expect(screen.getByTestId("ok-card-gross")).not.toHaveTextContent("₺");
    expect(screen.getByTestId("ok-card-net")).toHaveTextContent("—");
    expect(screen.getAllByTestId("hidden-mark")).toHaveLength(2);
  });

  it("başka kategori gizliyse (taşeron hakedişi kartında sozlesme_fiyat) kilit YOK — '—' düz kalır", () => {
    session({ hiddenFields: ["sozlesme_fiyat"] });
    renderCard(maskedItem({ document_type: "subcontractor_progress_payment" }));
    expect(screen.queryByTestId("hidden-mark")).toBeNull();
    expect(screen.getByTestId("ok-card-gross")).toHaveTextContent("—");
  });

  it("proje bağlamı: ana rolde açık, ekip rolünde gizli → kilit var", () => {
    session({
      hiddenFields: [],
      projects: [{ project_id: PROJECT, role_key: "site_chief" }],
      rolePages: { site_chief: {} },
      roleHiddenFields: { site_chief: ["sozlesme_fiyat"] },
    });
    renderCard(maskedItem());
    expect(within(screen.getByTestId("ok-card-gross")).getByTestId("hidden-mark")).toBeInTheDocument();
  });

  it("dolu tutar olduğu gibi gösterilir, kilit yok (FE kendi gizleme kararı vermez)", () => {
    session({ hiddenFields: ["sozlesme_fiyat"] });
    renderCard(maskedItem({ gross_amount: "1240000.00", net_amount: "1016800.00" }));
    expect(screen.getByTestId("ok-card-gross")).toHaveTextContent("1.240.000");
    expect(screen.queryByTestId("hidden-mark")).toBeNull();
  });

  it("etiket yardımcıları: null → '—'; evrak tipi → kategori kümesi", () => {
    expect(approvalAmountLabel(null)).toBe("—");
    expect(approvalAmountCategories("progress_payment")).toContain("sozlesme_fiyat");
    expect(approvalAmountCategories("subcontractor_progress_payment")).toContain("maliyet_kar");
    expect(approvalAmountCategories("purchase_request")).toEqual(["tum_tutarlar"]);
  });
});
