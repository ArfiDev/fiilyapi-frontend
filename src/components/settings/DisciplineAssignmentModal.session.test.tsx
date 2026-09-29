import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { DisciplineAssignmentModal } from "./DisciplineAssignmentModal";
import { backendClient } from "@/lib/api/client";
import type { UserResponse } from "@/lib/api/models";

vi.mock("@/lib/api/client", () => ({ backendClient: { GET: vi.fn(), PUT: vi.fn() } }));

const session = vi.hoisted(() => ({ meId: "u-me", refresh: vi.fn() }));
vi.mock("@/components/shell/SessionProvider", () => ({
  useSession: () => ({ me: { id: session.meId }, isLoading: false, refresh: session.refresh }),
}));

const ok = (data: unknown) => Promise.resolve({ data, error: undefined, response: new Response() });
const CATALOG = [
  { id: "d-cw", code: "CW", name: "Civil Works", color: "#2563eb", sort_order: 0, used_by_item_count: 1, used_by_site_count: 0, user_count: 0, default_contractor_type: "own" },
];

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      {children}
    </QueryClientProvider>
  );
}

async function saveOneChange(userId: string) {
  const user = userEvent.setup();
  render(
    <DisciplineAssignmentModal user={{ id: userId, full_name: "X", title: "Y" } as UserResponse} roleKey="patron" onClose={() => {}} />,
    { wrapper },
  );
  const box = await screen.findByRole("checkbox", { name: /Civil Works/ });
  await waitFor(() => expect(box).toBeEnabled());
  await user.click(box);
  await user.click(screen.getByRole("button", { name: "Kaydet" }));
}

describe("DisciplineAssignmentModal · oturum (me) tazeleme", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(backendClient.GET).mockImplementation(((path: string) =>
      path === "/earned-value/disciplines" ? ok(CATALOG) : ok({ discipline_ids: [] })) as never);
    vi.mocked(backendClient.PUT).mockImplementation((() => ok({ discipline_ids: ["d-cw"] })) as never);
  });

  it("yönetici KENDİ disiplinini kaydedince oturumdaki me tazelenir", async () => {
    await saveOneChange("u-me");
    await waitFor(() => expect(session.refresh).toHaveBeenCalledTimes(1));
  });

  it("BAŞKA kullanıcının atamasında me tazelenmez", async () => {
    await saveOneChange("u-baskasi");
    await waitFor(() => expect(backendClient.PUT).toHaveBeenCalled());
    expect(session.refresh).not.toHaveBeenCalled();
  });

  it("kayıt başarısızsa me tazelenmez", async () => {
    vi.mocked(backendClient.PUT).mockImplementation((() =>
      Promise.resolve({ data: undefined, error: {}, response: new Response(null, { status: 503 }) })) as never);
    await saveOneChange("u-me");
    expect(await screen.findByText("Kaydedilemedi.")).toBeInTheDocument();
    expect(session.refresh).not.toHaveBeenCalled();
  });
});
