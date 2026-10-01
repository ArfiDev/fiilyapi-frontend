import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { DisciplineFormModal } from "./DisciplineFormModal";
import { useCreateEvDiscipline, useUpdateEvDiscipline } from "@/lib/api/hooks/useEvDisciplines";
import { DUV, INC, KAB } from "./catalog-test-utils";
import type { EvDisciplineRead } from "@/lib/api/models";
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

function renderEdit(discipline: EvDisciplineRead) {
  return render(
    <DisciplineFormModal discipline={discipline} existing={[KAB, DUV, INC]} onClose={onClose} onSaved={onSaved} />,
  );
}

/** TKL-F1.4 · ÜS-13(b) kod değişimi uyarısı. */
describe("DisciplineFormModal — kod değişimi uyarısı", () => {
  const warning = (n: number) =>
    `Kod değişirse bu disiplinin ${n} kaleminin poz no'su yeni önekle yeniden numaralanır`;

  it("kalemi olan disiplinde kod değişince uyarı çıkar, N doğru", () => {
    renderEdit(KAB);
    expect(screen.queryByText(warning(6))).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Kod"), { target: { value: "KABX" } });
    expect(screen.getByText(warning(6))).toBeInTheDocument();
  });

  it("uyarı role=\"alert\" BASMAZ (dinamik bilgi notu: status) — ekran okuyucuyu bölmez", () => {
    renderEdit(KAB);
    fireEvent.change(screen.getByLabelText("Kod"), { target: { value: "KABX" } });
    const notice = screen.getByText(warning(6)).closest(".alert");
    expect(notice).toHaveAttribute("role", "status");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("kod değişmediyse (eski değere dönüldüyse) uyarı yok", () => {
    renderEdit(DUV);
    fireEvent.change(screen.getByLabelText("Kod"), { target: { value: "DUVX" } });
    expect(screen.getByText(warning(4))).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Kod"), { target: { value: "DUV" } });
    expect(screen.queryByText(/Kod değişirse/)).not.toBeInTheDocument();
  });

  it("kalemsiz disiplinde kod değişse de uyarı YOK", () => {
    renderEdit(INC);
    fireEvent.change(screen.getByLabelText("Kod"), { target: { value: "INCX" } });
    expect(screen.queryByText(/Kod değişirse/)).not.toBeInTheDocument();
  });

  it("yeni disiplinde uyarı yok", () => {
    renderModal();
    fireEvent.change(screen.getByLabelText("Kod"), { target: { value: "KAB" } });
    expect(screen.queryByText(/Kod değişirse/)).not.toBeInTheDocument();
  });
});
