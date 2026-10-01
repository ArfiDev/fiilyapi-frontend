import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ConfirmDialog } from "./ConfirmDialog";

describe("ConfirmDialog · iptal etiketi", () => {
  it("varsayılan iptal etiketi 'Vazgeç' (mevcut çağıranlar değişmez)", () => {
    render(<ConfirmDialog title="Başlık" message="Mesaj" onConfirm={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Vazgeç" })).toBeInTheDocument();
  });

  it("cancelLabel verilirse iptal düğmesi o etiketi taşır ve onClose çağırır", async () => {
    const onClose = vi.fn();
    render(
      <ConfirmDialog title="Başlık" message="Mesaj" cancelLabel="Yalnız bölümü değiştir" onConfirm={vi.fn()} onClose={onClose} />,
    );

    expect(screen.queryByRole("button", { name: "Vazgeç" })).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Yalnız bölümü değiştir" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
