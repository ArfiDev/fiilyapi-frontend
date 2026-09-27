import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PlanSprintEditor } from "./PlanSprintEditor";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";

describe("PlanSprintEditor — kaydedilmemiş değişiklik kaydı", () => {
  it("açıldı, düzenleme başlamadı → false", () => {
    render(<PlanSprintEditor name="Kat 8–9 Tamamlama" canWrite onChange={() => {}} />);
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });

  it("kalem tıklanıp ad değiştirilmeden açılınca → false (draftName === name)", async () => {
    render(<PlanSprintEditor name="Kat 8–9 Tamamlama" canWrite onChange={() => {}} />);
    await userEvent.click(screen.getByLabelText("Aktif sprinti düzenle"));
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });

  it("ad değişti → true", async () => {
    render(<PlanSprintEditor name="Kat 8–9 Tamamlama" canWrite onChange={() => {}} />);
    await userEvent.click(screen.getByLabelText("Aktif sprinti düzenle"));
    const input = screen.getByLabelText("Sprint adı");
    await userEvent.clear(input);
    await userEvent.type(input, "Kat 10");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
  });

  it("Uygula sonrası (popover kapanır) → false", async () => {
    const onChange = vi.fn();
    render(<PlanSprintEditor name="Kat 8–9 Tamamlama" canWrite onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("Aktif sprinti düzenle"));
    const input = screen.getByLabelText("Sprint adı");
    await userEvent.clear(input);
    await userEvent.type(input, "Kat 10");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Uygula" }));
    expect(onChange).toHaveBeenCalledWith("Kat 10");
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });
});
