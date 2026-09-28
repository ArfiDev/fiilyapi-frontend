import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PlanCellPopover } from "./PlanCellPopover";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";

/**
 * SEKME-F1.3b · popover taslağa (usePlanDraft, ZATEN bağlı) yazmaz; yalnız
 * "Uygula"ya kadarki commit edilmemiş yerel girdi bağlanır. Modal
 * kullanılmıyor — doğrudan `useUnsavedChanges`.
 */
describe("PlanCellPopover — kaydedilmemiş değişiklik kaydı", () => {
  it("açıldı + dokunulmadı → false", () => {
    render(
      <PlanCellPopover cell={null} label="Kalıpçı (14) · Pzt 3 Ağu" onSubmit={() => {}} onClose={() => {}} />,
    );
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });

  it("mevcut hücreyle açıldı + dokunulmadı → false", () => {
    render(
      <PlanCellPopover
        cell={{ text: "Kat 9 Kalıp", tag: "red" }}
        label="Kalıpçı (14) · Pzt 3 Ağu"
        onSubmit={() => {}}
        onClose={() => {}}
      />,
    );
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });

  it("metin değişti → true", async () => {
    render(
      <PlanCellPopover cell={null} label="Kalıpçı (14) · Pzt 3 Ağu" onSubmit={() => {}} onClose={() => {}} />,
    );
    await userEvent.type(screen.getByLabelText("Plan metni"), "Kat 9 Kalıp");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
  });

  it("Uygula sonrası (onSubmit çağrılıp popover kapanınca) unmount ile false", async () => {
    const onSubmit = vi.fn();
    const { unmount } = render(
      <PlanCellPopover cell={null} label="Kalıpçı (14) · Pzt 3 Ağu" onSubmit={onSubmit} onClose={() => {}} />,
    );
    await userEvent.type(screen.getByLabelText("Plan metni"), "Kat 9 Kalıp");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Uygula" }));
    expect(onSubmit).toHaveBeenCalled();
    unmount();
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });
});
