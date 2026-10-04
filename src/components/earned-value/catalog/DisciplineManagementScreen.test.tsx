import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { backendClient } from "@/lib/api/client";
import type { AccessLevel } from "@/lib/auth/permissions";

import { DisciplineManagementScreen } from "./DisciplineManagementScreen";
import { BETON, DUV, INC, KAB, mockGets, ok } from "./catalog-test-utils";

vi.mock("@/lib/api/client", () => ({
  backendClient: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() },
}));

let permissionLevel: AccessLevel | undefined = "admin";
vi.mock("@/lib/auth/useModulePermission", () => ({
  useModulePermission: () => ({ level: permissionLevel, canView: true, canWrite: true, canDelete: true }),
}));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DisciplineManagementScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  permissionLevel = "admin";
  mockGets({ disciplines: [KAB, DUV, INC], catalog: [BETON] });
});

describe("NAV-F2 · Disiplin Yönetimi sayfası (M6 liste gövdesi sayfada)", () => {
  it("liste MODALSIZ sayfa gövdesinde; başlık h1", async () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Disiplin Yönetimi" })).toBeInTheDocument();
    const page = screen.getByRole("region", { name: "Disiplinler" });
    expect(await within(page).findByText("Kaba İnşaat")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("'+ Yeni disiplin' → ekle modalı; kayıt sonrası modal kapanır, sayfada bildirim", async () => {
    const user = userEvent.setup();
    vi.mocked(backendClient.POST).mockResolvedValue(ok({ ...INC, id: "d-new", code: "MEK" }, 201));
    renderPage();
    await screen.findByText("Kaba İnşaat");
    await user.click(screen.getByRole("button", { name: "+ Yeni disiplin" }));
    const form = screen.getByRole("dialog", { name: "Disiplin Ekle" });
    await user.type(within(form).getByLabelText("Kod"), "mek");
    await user.type(within(form).getByLabelText("Disiplin adı"), "Mekanik Tesisat");
    await user.click(within(form).getByRole("button", { name: "Kaydet" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(backendClient.POST).toHaveBeenCalledWith("/earned-value/disciplines", expect.anything());
    expect(within(screen.getByRole("region", { name: "Disiplinler" })).getByText("Mekanik Tesisat eklendi")).toBeInTheDocument();
  });

  it("Düzenle → düzenle modalı; Sil (kullanılmayan, admin) → onay modalı", async () => {
    const user = userEvent.setup();
    renderPage();
    const incRow = (await screen.findByText("INC")).closest("tr")!;
    await user.click(within(incRow).getByRole("button", { name: "Düzenle" }));
    expect(screen.getByRole("dialog", { name: "Disiplin Düzenle" })).toBeInTheDocument();
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Vazgeç" }));
    await user.click(within(incRow).getByRole("button", { name: "Sil" }));
    expect(screen.getByRole("dialog", { name: "İnce İşler disiplini silinsin mi?" })).toBeInTheDocument();
  });

  it("izinler Birim Oran Kataloğu ile aynı: full → ekle/düzenle var, Sil YOK; view → salt okunur", async () => {
    permissionLevel = "full";
    const { unmount } = renderPage();
    await screen.findByText("Kaba İnşaat");
    expect(screen.getByRole("button", { name: "+ Yeni disiplin" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sil" })).not.toBeInTheDocument();
    unmount();

    permissionLevel = "view";
    renderPage();
    await screen.findByText("Kaba İnşaat");
    expect(screen.queryByRole("button", { name: "+ Yeni disiplin" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Düzenle" })).not.toBeInTheDocument();
    expect(screen.getByText("Salt okunur · disiplin listesini yalnız tam yetki (full) değiştirir")).toBeInTheDocument();
  });
});
