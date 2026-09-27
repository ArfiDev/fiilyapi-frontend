import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";
import { ChartAccountFormModal } from "./ChartAccountFormModal";

vi.mock("@/lib/api/client", () => ({
  backendClient: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() },
}));

import { backendClient } from "@/lib/api/client";

function renderModal(onClose = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ChartAccountFormModal onClose={onClose} />
    </QueryClientProvider>,
  );
}

/**
 * SEKME-F1.3b · `ChartAccountFormModal` merkezi kayda bağlanması bekçisi.
 */
describe("ChartAccountFormModal — kaydedilmemiş değişiklik kaydı", () => {
  it("açıldı, dokunulmadı → temiz", () => {
    renderModal();
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });

  it("bir alan değiştirildi → kirli", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.type(screen.getByTestId("hp-dialog-code"), "100");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
  });

  it("başarılı kayıt sonrası (onClose çağrılır, unmount) → temiz", async () => {
    const user = userEvent.setup();
    vi.mocked(backendClient.POST).mockResolvedValue({
      data: { id: "a1", code: "100", name: "Kasa", account_type: "asset", is_active: true, is_contra: false },
      error: undefined,
      response: { ok: true } as Response,
    } as never);
    const onClose = vi.fn();
    const { unmount } = renderModal(onClose);
    await user.type(screen.getByTestId("hp-dialog-code"), "100");
    await user.type(screen.getByTestId("hp-dialog-name"), "Kasa");
    await user.click(screen.getByTestId("hp-dialog-save"));
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    unmount();
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });
});
