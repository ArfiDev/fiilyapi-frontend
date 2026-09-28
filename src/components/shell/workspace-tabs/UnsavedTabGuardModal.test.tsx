import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { UnsavedTabGuardModal } from "./UnsavedTabGuardModal";

describe("UnsavedTabGuardModal", () => {
  it("kapalıyken hiçbir şey basmaz", () => {
    render(<UnsavedTabGuardModal isOpen={false} labels={[]} onCancel={vi.fn()} onDiscard={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("emsal başlık, gövde ve iki düğme; etiketler tekilleştirilip listelenir", () => {
    render(
      <UnsavedTabGuardModal
        isOpen
        labels={["Puantaj", "Bordro satırı", "Bordro satırı"]}
        onCancel={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    const dialog = screen.getByRole("dialog", { name: "Kaydedilmemiş değişiklikler var" });
    expect(dialog).toHaveTextContent(
      "Bu sekmede kaydedilmemiş değişiklik var. Geçiş yapılırsa bu değişiklikler kaybolur.",
    );
    expect(within(dialog).getByText("2")).toBeInTheDocument();
    expect(within(dialog).getByText("Puantaj · Bordro satırı")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Vazgeç" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Değişiklikleri at ve geç" })).toHaveClass(
      "ev-unsaved-modal__discard",
    );
  });

  it("etiketsiz kayıtta özet ızgarası basılmaz", () => {
    render(<UnsavedTabGuardModal isOpen labels={[]} onCancel={vi.fn()} onDiscard={vi.fn()} />);
    expect(screen.queryByText("Değişen bölüm")).toBeNull();
  });

  it("Vazgeç → onCancel, 'at ve geç' → onDiscard", async () => {
    const onCancel = vi.fn();
    const onDiscard = vi.fn();
    render(<UnsavedTabGuardModal isOpen labels={["Puantaj"]} onCancel={onCancel} onDiscard={onDiscard} />);
    await userEvent.click(screen.getByRole("button", { name: "Vazgeç" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "Değişiklikleri at ve geç" }));
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });
});
