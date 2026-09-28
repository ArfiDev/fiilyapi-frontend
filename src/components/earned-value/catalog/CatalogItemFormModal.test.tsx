import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { CatalogItemFormModal } from "./CatalogItemFormModal";
import { useCreateEvCatalogItem, useUpdateEvCatalogItem } from "@/lib/api/hooks/useEvCatalog";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";
import type { EvDisciplineRead } from "@/lib/api/models";

vi.mock("@/lib/api/hooks/useEvCatalog", () => ({
  useCreateEvCatalogItem: vi.fn(),
  useUpdateEvCatalogItem: vi.fn(),
}));

const DISCIPLINES: EvDisciplineRead[] = [
  {
    id: "d-1",
    code: "KAB",
    name: "Kaba İnşaat",
    color: "#123456",
    default_contractor_type: "own",
    sort_order: 0,
    used_by_item_count: 0,
    used_by_site_count: 0,
  } as EvDisciplineRead,
];

const create = vi.fn();
const update = vi.fn();
const onClose = vi.fn();
const onSaved = vi.fn();

function renderModal(readOnly = false) {
  return render(
    <CatalogItemFormModal
      mode={{ kind: "create", disciplineId: null }}
      disciplines={DISCIPLINES}
      catalogUnits={["m³"]}
      readOnly={readOnly}
      onClose={onClose}
      onSaved={onSaved}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useCreateEvCatalogItem).mockReturnValue({
    mutate: create,
    isPending: false,
    error: null,
  } as never);
  vi.mocked(useUpdateEvCatalogItem).mockReturnValue({
    mutate: update,
    isPending: false,
    error: null,
  } as never);
});

/** SEKME-F1.3b · merkezi kayda bağlanma bekçisi. */
describe("CatalogItemFormModal — kaydedilmemiş değişiklik kaydı", () => {
  it("açıldı, dokunulmadı → temiz", () => {
    renderModal();
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });

  it("bir alan değiştirildi → kirli", () => {
    renderModal();
    fireEvent.change(screen.getByLabelText("İş tipi adı"), { target: { value: "Beton döküm" } });
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
  });

  it("readOnly dalında dirty ZORLA false — dokunma taklidi de kirletmez", () => {
    renderModal(true);
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });

  it("başarılı kayıt sonrası (onSaved çağrılır, unmount) → temiz", () => {
    const { unmount } = renderModal();
    fireEvent.change(screen.getByLabelText("İş tipi adı"), { target: { value: "Beton döküm" } });
    fireEvent.change(screen.getByLabelText("Standart oran"), { target: { value: "1,5" } });
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(create).toHaveBeenCalled();
    unmount();
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });
});
