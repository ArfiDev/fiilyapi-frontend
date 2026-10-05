import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { backendClient } from "@/lib/api/client";
import { dismissFlashNotice, getFlashNotice } from "@/components/shell/flash-notice";
import { DeleteRecordButton } from "./DeleteRecordButton";

const session = vi.hoisted(() => ({ me: null as { is_system_admin?: boolean } | null }));
const push = vi.hoisted(() => vi.fn());

vi.mock("@/components/shell/SessionProvider", () => ({
  useSession: () => ({ me: session.me, isLoading: false }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/api/client", () => ({ backendClient: { GET: vi.fn(), DELETE: vi.fn() } }));

function renderButton() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DeleteRecordButton kind="section" recordId="sec-uuid" redirectTo="/projeler/p/santiyeler/s" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  dismissFlashNotice();
  session.me = { is_system_admin: true };
});

describe("DeleteRecordButton", () => {
  it("is_system_admin=false iken düğme YOKTUR", () => {
    session.me = { is_system_admin: false };
    renderButton();
    expect(screen.queryByRole("button", { name: "Sil" })).not.toBeInTheDocument();
  });

  it("oturum bilinmezken (me=null) düğme YOKTUR (fail-closed)", () => {
    session.me = null;
    renderButton();
    expect(screen.queryByRole("button", { name: "Sil" })).not.toBeInTheDocument();
  });

  it("bayrak hiç yoksa düğme YOKTUR", () => {
    session.me = {};
    renderButton();
    expect(screen.queryByRole("button", { name: "Sil" })).not.toBeInTheDocument();
  });

  it("is_system_admin=true iken düğme vardır ve pencereyi açar", async () => {
    vi.mocked(backendClient.GET).mockReturnValue(new Promise(() => {}) as never);
    renderButton();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Sil" }));

    expect(await screen.findByRole("dialog", { name: "Bölüm silinsin mi?" })).toBeInTheDocument();
    expect(backendClient.GET).toHaveBeenCalledWith("/admin/silme/{kind}/{record_id}/onizleme", {
      params: { path: { kind: "section", record_id: "sec-uuid" } },
    });
  });

  it("silme başarılı olunca üst listeye yönlendirir ve bildirim bırakır", async () => {
    vi.mocked(backendClient.GET).mockResolvedValue({
      data: {
        kind: "section",
        id: "sec-uuid",
        kind_label: "Bölüm",
        label: "Kat 6–10",
        dependent_count: 0,
        groups: [],
        detached: [],
        journal_entry_count: 0,
        journal_entries: [],
        closed_period_entry_count: 0,
        documents_left_without_entry: [],
        closed_payroll_timesheet_count: 0,
        closed_payroll_periods: [],
        closed_payroll_message: null,
        preview_token: "t",
      },
      error: undefined,
      response: new Response(),
    } as never);
    vi.mocked(backendClient.DELETE).mockResolvedValue({
      data: undefined,
      error: undefined,
      response: new Response(null, { status: 204 }),
    } as never);
    renderButton();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Sil" }));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(dialog.querySelector(".btn--danger")).toBeEnabled());
    await user.click(dialog.querySelector(".btn--danger") as HTMLElement);

    await waitFor(() => expect(push).toHaveBeenCalledWith("/projeler/p/santiyeler/s"));
    expect(getFlashNotice()?.message).toBe("Bölüm silindi: Kat 6–10");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
