import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PlanRowAddPopover } from "./PlanRowAddPopover";
import { EMPTY_PLAN_SECTIONS } from "./plan-sections";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";

describe("PlanRowAddPopover — kaydedilmemiş değişiklik kaydı", () => {
  it("açıldı + dokunulmadı → false", () => {
    render(
      <PlanRowAddPopover
        defaultKind="crew"
        defaultSectionId={null}
        sections={EMPTY_PLAN_SECTIONS}
        onSubmit={() => {}}
        onClose={() => {}}
      />,
    );
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });

  it("etiket yazıldı → true", async () => {
    render(
      <PlanRowAddPopover
        defaultKind="crew"
        defaultSectionId={null}
        sections={EMPTY_PLAN_SECTIONS}
        onSubmit={() => {}}
        onClose={() => {}}
      />,
    );
    await userEvent.type(screen.getByLabelText("Etiket"), "Kalıpçı");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
  });

  it("Ekle sonrası unmount ile false", async () => {
    const onSubmit = vi.fn();
    const { unmount } = render(
      <PlanRowAddPopover
        defaultKind="crew"
        defaultSectionId={null}
        sections={EMPTY_PLAN_SECTIONS}
        onSubmit={onSubmit}
        onClose={() => {}}
      />,
    );
    await userEvent.type(screen.getByLabelText("Etiket"), "Kalıpçı");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Ekle" }));
    expect(onSubmit).toHaveBeenCalled();
    unmount();
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });
});
