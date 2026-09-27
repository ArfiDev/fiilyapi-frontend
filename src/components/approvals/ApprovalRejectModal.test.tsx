import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { ApprovalInboxItem, ApprovalStepRead } from "@/lib/api/hooks/useApprovals";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";

import { ApprovalRejectModal } from "./ApprovalRejectModal";

vi.mock("@/lib/api/client", () => ({
  backendClient: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() },
}));

import { backendClient } from "@/lib/api/client";

function step(partial: Partial<ApprovalStepRead>): ApprovalStepRead {
  return { step_no: 1, approval_role: "accounting", decided_at: null, decided_by_name: null, ...partial };
}

function item(partial: Partial<ApprovalInboxItem> = {}): ApprovalInboxItem {
  return {
    chain_id: "chain-1",
    document_type: "purchase_request",
    document_id: "pr-1",
    created_by_name: "Test",
    created_at: "2026-01-01T00:00:00Z",
    threshold_snapshot: "1000.00",
    amount_snapshot: "500.00",
    current_step_no: 1,
    steps: [step({})],
    title: "Satınalma #1",
    subtitle: null,
    gross_amount: "500.00",
    net_amount: "500.00",
    ...partial,
  };
}

function renderModal(onClose = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ApprovalRejectModal item={item()} onClose={onClose} />
    </QueryClientProvider>,
  );
}

describe("ApprovalRejectModal — kaydedilmemiş değişiklik kaydı", () => {
  it("açıldı, dokunulmadı → temiz", () => {
    renderModal();
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });

  it("gerekçe yazıldı → kirli", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.type(screen.getByTestId("ok-reject-reason"), "Belge eksik");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
  });

  it("başarılı ret sonrası (onClose çağrılır, unmount) → temiz", async () => {
    const user = userEvent.setup();
    vi.mocked(backendClient.POST).mockResolvedValue({
      data: undefined,
      error: undefined,
      response: { ok: true } as Response,
    } as never);
    const onClose = vi.fn();
    const { unmount } = renderModal(onClose);
    await user.type(screen.getByTestId("ok-reject-reason"), "Belge eksik");
    await user.click(screen.getByTestId("ok-reject-submit"));
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    unmount();
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });
});
