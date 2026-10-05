import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ProgressPaymentStatusActions } from "./ProgressPaymentStatusActions";
import { SubcontractorProgressPaymentStatusActions } from "./SubcontractorProgressPaymentStatusActions";
import { useSession } from "@/components/shell/SessionProvider";
import { meFixture, pageGrant } from "@/lib/auth/page-grants.testkit";
import type { ProgressPaymentDetail } from "@/lib/api/hooks/useProgressPayments";
import type { SubcontractorProgressPaymentDetail } from "@/lib/api/hooks/useSubcontractorProgressPayments";

// IZN-F3.2b — hakediş durum eylemlerinin kapıları, hakedişin KENDİ `project_id`si üzerinden PROJE ROLÜNDEN okunur
// (ana rol yalnız kişi o projenin ekibinde değilse geçerli).
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));

const PROJECT = "11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_PROJECT = "22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function session(mainLevel: "view" | "edit", projectLevel: "view" | "edit") {
  vi.mocked(useSession).mockReturnValue({
    me: meFixture({
      pages: {
        "mali.hakedis_isveren": pageGrant(mainLevel),
        "mali.hakedis_taseron": pageGrant(mainLevel),
        "proje.isveren_hakedis": pageGrant(mainLevel),
        "proje.taseron_hakedis": pageGrant(mainLevel),
      },
      projects: [{ project_id: PROJECT, role_key: "site_chief" }],
      rolePages: {
        site_chief: {
          "proje.isveren_hakedis": pageGrant(projectLevel),
          "proje.taseron_hakedis": pageGrant(projectLevel),
        },
      },
    }),
    isLoading: false,
  } as ReturnType<typeof useSession>);
}

function wrap(node: React.ReactElement) {
  return render(<QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>);
}
const employer = (projectId: string) =>
  wrap(<ProgressPaymentStatusActions detail={{ id: "pp-1", status: "draft", project_id: projectId } as ProgressPaymentDetail} />);
const subcontractor = (projectId: string) =>
  wrap(
    <SubcontractorProgressPaymentStatusActions
      detail={{ id: "spp-1", status: "draft", project_id: projectId } as SubcontractorProgressPaymentDetail}
    />,
  );
const submit = () => screen.queryByRole("button", { name: "Onaya Gönder" });

beforeEach(() => vi.clearAllMocks());

describe.each([
  ["işveren", employer],
  ["taşeron", subcontractor],
] as const)("%s hakediş durum eylemleri · proje bağlamı", (_name, renderActions) => {
  it("proje rolü edit → 'Onaya Gönder' var (ana rol yalnız view olsa da)", () => {
    session("view", "edit");
    renderActions(PROJECT);
    expect(submit()).toBeInTheDocument();
  });

  it("proje rolü view → 'Onaya Gönder' YOK (ana rol edit olsa da)", () => {
    session("edit", "view");
    renderActions(PROJECT);
    expect(submit()).toBeNull();
  });

  it("kişi o projenin ekibinde değilse ANA ROL geçerli", () => {
    session("edit", "view");
    renderActions(OTHER_PROJECT);
    expect(submit()).toBeInTheDocument();
  });
});
