import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { CatalogItemFormModal } from "./CatalogItemFormModal";
import { useCreateEvCatalogItem, useUpdateEvCatalogItem } from "@/lib/api/hooks/useEvCatalog";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";
import type { EvCatalogItemRead, EvDisciplineRead } from "@/lib/api/models";
import { BETON, DUV, KAB } from "./catalog-test-utils";

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

const DISC_WARNING = "Disiplin değişirse yeni poz no verilir; eski numara sözleşme/teklif kopyalarında kalır";

function renderEdit(item: EvCatalogItemRead = BETON) {
  return render(
    <CatalogItemFormModal
      mode={{ kind: "edit", item }}
      disciplines={[KAB, DUV]}
      catalogUnits={["m³"]}
      readOnly={false}
      onClose={onClose}
      onSaved={onSaved}
    />,
  );
}

/** TKL-F1.4 · ÜS-12 poz no + ÜS-13(a) disiplin değişimi uyarısı + ÜS-11 kg. */
describe("CatalogItemFormModal — poz no ve numara uyarıları", () => {
  it("düzenlemede başlık altında salt okunur 'Poz no KAB-0001' görünür", () => {
    renderEdit();
    expect(screen.getByText("Poz no KAB-0001")).toBeInTheDocument();
  });

  it("yeni kalem modalında poz no satırı YOK", () => {
    renderModal();
    expect(screen.queryByText(/Poz no/)).not.toBeInTheDocument();
  });

  it("disiplin mevcut değerden farklıya değişince uyarı çıkar", () => {
    renderEdit();
    expect(screen.queryByText(DISC_WARNING)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /DUV/ }));
    expect(screen.getByText(DISC_WARNING)).toBeInTheDocument();
  });

  it("disiplin uyarısı role=\"alert\" BASMAZ (dinamik bilgi notu: status)", () => {
    renderEdit();
    fireEvent.click(screen.getByRole("button", { name: /DUV/ }));
    expect(screen.getByText(DISC_WARNING).closest(".alert")).toHaveAttribute("role", "status");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("disiplin değişmezse (ya da eskiye dönülürse) uyarı yok", () => {
    renderEdit();
    fireEvent.click(screen.getByRole("button", { name: /KAB/ }));
    expect(screen.queryByText(DISC_WARNING)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /DUV/ }));
    fireEvent.click(screen.getByRole("button", { name: /KAB/ }));
    expect(screen.queryByText(DISC_WARNING)).not.toBeInTheDocument();
  });

  it("yeni kalemde disiplin seçimi uyarı çıkarmaz", () => {
    render(
      <CatalogItemFormModal
        mode={{ kind: "create", disciplineId: null }}
        disciplines={[KAB, DUV]}
        catalogUnits={[]}
        readOnly={false}
        onClose={onClose}
        onSaved={onSaved}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /DUV/ }));
    expect(screen.queryByText(DISC_WARNING)).not.toBeInTheDocument();
  });

  it("birim listesinde kg seçeneği var", () => {
    renderModal();
    expect(screen.getByRole("option", { name: "Kg" })).toBeInTheDocument();
  });
});
