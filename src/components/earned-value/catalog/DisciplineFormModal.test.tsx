import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { DisciplineFormModal } from "./DisciplineFormModal";
import { useCreateEvDiscipline, useUpdateEvDiscipline } from "@/lib/api/hooks/useEvDisciplines";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";

vi.mock("@/lib/api/hooks/useEvDisciplines", () => ({
  useCreateEvDiscipline: vi.fn(),
  useUpdateEvDiscipline: vi.fn(),
}));

const create = vi.fn();
const update = vi.fn();
const onClose = vi.fn();
const onSaved = vi.fn();

function renderModal() {
  return render(
    <DisciplineFormModal discipline={null} existing={[]} onClose={onClose} onSaved={onSaved} />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useCreateEvDiscipline).mockReturnValue({
    mutate: create,
    isPending: false,
    error: null,
  } as never);
  vi.mocked(useUpdateEvDiscipline).mockReturnValue({
    mutate: update,
    isPending: false,
    error: null,
  } as never);
});

/** SEKME-F1.3b · merkezi kayda bağlanma bekçisi. */
describe("DisciplineFormModal — kaydedilmemiş değişiklik kaydı", () => {
  it("açıldı, dokunulmadı → temiz", () => {
    renderModal();
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });

  it("bir alan değiştirildi → kirli", () => {
    renderModal();
    fireEvent.change(screen.getByLabelText("Kod"), { target: { value: "KAB" } });
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
  });

  it("başarılı kayıt sonrası (onSaved çağrılır, unmount) → temiz", () => {
    const { unmount } = renderModal();
    fireEvent.change(screen.getByLabelText("Kod"), { target: { value: "KAB" } });
    fireEvent.change(screen.getByLabelText("Disiplin adı"), { target: { value: "Kaba İnşaat" } });
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(create).toHaveBeenCalled();
    unmount();
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });
});
