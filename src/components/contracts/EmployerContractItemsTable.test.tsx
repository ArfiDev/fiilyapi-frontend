import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";

import { EmployerContractItemsTable } from "./EmployerContractItemsTable";
import type {
  EmployerContractDetail,
  EmployerContractItemsResponse,
} from "@/lib/api/hooks/useContract";

/**
 * no 52 — `commitCell`'in "noop" dalı (değer değişmedi/hücreye dokunulmadı)
 * `setClientError`i HİÇ çağırmıyordu; yalnız `error` ve başarı dalları
 * güncelliyordu. Kullanıcı geçersiz bir değer yazıp odağı çıkardığında hata
 * bandı basılır, ardından değeri SUNUCU değerine geri getirse (görünürde
 * "değişmemiş" bir noop) hata bandı EKRANDA KALIYORDU.
 */

const PROJECT_ID = "pppppppp-0000-0000-0000-000000000001";
const GROUP_ID = "gggggggg-0000-0000-0000-000000000002";
const ITEM_CODE = "03.011";

const DETAIL = {
  project_id: PROJECT_ID,
  amount: "22400000.00",
  items_total: "1000.00",
  items_total_diff: "0.00",
} as EmployerContractDetail;

const DATA: EmployerContractItemsResponse = {
  groups: [
    {
      id: GROUP_ID,
      name: "B — Betonarme İşleri",
      sort_order: 20,
      items: [
        {
          id: "iiiiiiii-0000-0000-0000-000000000001",
          group_id: GROUP_ID,
          code: ITEM_CODE,
          description: "Grobeton",
          unit: "m³",
          quantity: "100.000",
          unit_price: "1200.00",
          sort_order: 10,
          distributed_quantity: "40.000",
          remaining_quantity: "60.000",
        },
      ],
    },
  ],
} as EmployerContractItemsResponse;

function renderTable(
  onCommitItem: ReturnType<typeof vi.fn> = vi.fn(),
  data: EmployerContractItemsResponse = DATA,
) {
  return render(
    <EmployerContractItemsTable
      projectId={PROJECT_ID}
      detail={DETAIL}
      isError={false}
      isLoading={false}
      data={data}
      onAddItem={vi.fn()}
      onCommitItem={onCommitItem}
      onCreateItem={vi.fn().mockResolvedValue(true)}
      isCreating={false}
      saveError={null}
    />,
  );
}

describe("EmployerContractItemsTable — hücre içi doğrulama hatası noop'ta temizlenir (no 52)", () => {
  it("geçersiz girdi hatası basılır, ardından sunucu değerine dönülünce (noop) hata TEMİZLENİR", () => {
    renderTable();
    const quantityInput = screen.getByLabelText(`${ITEM_CODE} miktar`);

    fireEvent.change(quantityInput, { target: { value: "-5" } });
    fireEvent.blur(quantityInput);
    expect(screen.getByTestId("ecd-items-error")).toHaveTextContent(
      "Miktar sıfırdan büyük olmalıdır.",
    );

    // Kullanıcı hücreyi SUNUCU değerine geri getirir (görüntüde "100") —
    // `commitInlineCell` bunu "noop" sayar (değer değişmedi).
    fireEvent.change(quantityInput, { target: { value: "100" } });
    fireEvent.blur(quantityInput);

    expect(screen.queryByTestId("ecd-items-error")).not.toBeInTheDocument();
  });
});

/**
 * SEKME-F1.3b · merkezi kayda bağlanma bekçisi. Hücre-içi `drafts` (odak
 * çıkışında ANINDA kaydolur) BİLEREK dışarıda tutulur — yalnız "+ Satır Ekle"
 * taslağı commit edilmemiş sayılır.
 */
describe("EmployerContractItemsTable — kaydedilmemiş değişiklik kaydı (yalnız + Satır Ekle taslağı)", () => {
  it("açıldı, dokunulmadı → temiz", () => {
    renderTable();
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });

  it("hücre-içi düzenleme (drafts) kirli SAYILMAZ — anında kaydolur", () => {
    renderTable();
    const quantityInput = screen.getByLabelText(`${ITEM_CODE} miktar`);
    fireEvent.change(quantityInput, { target: { value: "150" } });
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });

  it("+ Satır Ekle açıldı, bir alan dolduruldu → kirli", () => {
    renderTable();
    fireEvent.click(screen.getByTestId(`ecd-add-row-${GROUP_ID}`));
    fireEvent.change(screen.getByLabelText("Yeni poz no"), { target: { value: "03.012" } });
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
  });

  it("Vazgeç taslağı sıfırlar → temiz", () => {
    renderTable();
    fireEvent.click(screen.getByTestId(`ecd-add-row-${GROUP_ID}`));
    fireEvent.change(screen.getByLabelText("Yeni poz no"), { target: { value: "03.012" } });
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
    fireEvent.click(screen.getByTestId("ecd-new-row-cancel"));
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });
});

/** SZK-F1 · var olan satırın poz no / ad / birim hücreleri satır içinde düzenlenir. */
describe("EmployerContractItemsTable — SZK-F1 metin hücreleri", () => {
  function withUnit(unit: string): EmployerContractItemsResponse {
    const group = DATA.groups[0];
    return { groups: [{ ...group, items: [{ ...group.items[0], unit }] }] } as EmployerContractItemsResponse;
  }

  it("poz no, poz adı ve birim hücreleri kontrol olarak render olur", () => {
    renderTable();
    expect(screen.getByLabelText(`${ITEM_CODE} poz no`)).toHaveValue(ITEM_CODE);
    expect(screen.getByLabelText(`${ITEM_CODE} poz adı`)).toHaveValue("Grobeton");
    expect(screen.getByLabelText(`${ITEM_CODE} birimi`)).toHaveValue("m³");
  });

  it("değişmeyen değerle blur onCommitItem ÇAĞIRMAZ", () => {
    const onCommit = vi.fn();
    renderTable(onCommit);
    for (const label of ["poz no", "poz adı", "birimi"]) {
      fireEvent.blur(screen.getByLabelText(`${ITEM_CODE} ${label}`));
    }
    const code = screen.getByLabelText(`${ITEM_CODE} poz no`);
    fireEvent.change(code, { target: { value: ` ${ITEM_CODE} ` } });
    fireEvent.blur(code);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("değişen poz no onCommitItem(id, {code}) çağırır", async () => {
    const onCommit = vi.fn();
    renderTable(onCommit);
    const code = screen.getByLabelText(`${ITEM_CODE} poz no`);
    fireEvent.change(code, { target: { value: "03.099" } });
    fireEvent.blur(code);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("iiiiiiii-0000-0000-0000-000000000001", { code: "03.099" });
    await act(async () => {});
  });

  it("birim seçici DEĞİŞTİĞİ ANDA kaydeder; ardından blur ikinci istek ATMAZ", async () => {
    const onCommit = vi.fn();
    renderTable(onCommit);
    const unit = screen.getByLabelText(`${ITEM_CODE} birimi`);
    fireEvent.change(unit, { target: { value: "m²" } });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("iiiiiiii-0000-0000-0000-000000000001", { unit: "m²" });
    fireEvent.blur(screen.getByLabelText(`${ITEM_CODE} birimi`));
    expect(onCommit).toHaveBeenCalledTimes(1);
    await act(async () => {});
  });

  it("sonu sıfırla biten poz kodu ('03.010') değişmeden blur'da istek ATMAZ (metin ondalık sayılmaz)", () => {
    const onCommit = vi.fn();
    const group = DATA.groups[0];
    const data = {
      groups: [{ ...group, items: [{ ...group.items[0], code: "03.010" }] }],
    } as EmployerContractItemsResponse;
    renderTable(onCommit, data);
    const code = screen.getByLabelText("03.010 poz no");
    fireEvent.blur(code);
    fireEvent.change(code, { target: { value: " 03.010 " } });
    fireEvent.blur(code);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("poz adı input'u tam açıklamayı `title` ile taşır", () => {
    renderTable();
    expect(screen.getByLabelText(`${ITEM_CODE} poz adı`)).toHaveAttribute("title", "Grobeton");
  });

  it("boş poz no istemci hatası basar, istek uçmaz, hücre eski değere döner", () => {
    const onCommit = vi.fn();
    renderTable(onCommit);
    const code = screen.getByLabelText(`${ITEM_CODE} poz no`);
    fireEvent.change(code, { target: { value: "  " } });
    fireEvent.blur(code);
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByTestId("ecd-items-error")).toHaveTextContent("Poz No zorunludur.");
    expect(screen.getByLabelText(`${ITEM_CODE} poz no`)).toHaveValue(ITEM_CODE);
  });

  it("listede OLMAYAN birim korunur: seçili kalır ve ayrı seçenek olarak vardır", () => {
    renderTable(vi.fn(), withUnit("paket"));
    const unit = screen.getByLabelText(`${ITEM_CODE} birimi`) as HTMLSelectElement;
    expect(unit).toHaveValue("paket");
    expect(Array.from(unit.options).map((o) => o.value)).toContain("paket");
  });

  it("katalogdan gelen 'kg' ayrı seçenek açmaz: tek 'Kg' seçili görünür, değişiklik yazılmaz", () => {
    const onCommit = vi.fn();
    renderTable(onCommit, withUnit("kg"));
    const unit = screen.getByLabelText(`${ITEM_CODE} birimi`) as HTMLSelectElement;
    expect(unit).toHaveValue("Kg");
    const kgOptions = Array.from(unit.options).filter((o) => o.value.toLocaleLowerCase("tr-TR") === "kg");
    expect(kgOptions.map((o) => o.value)).toEqual(["Kg"]);
    fireEvent.blur(unit);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("listede olan birim için fazladan seçenek EKLENMEZ", () => {
    renderTable();
    const unit = screen.getByLabelText(`${ITEM_CODE} birimi`) as HTMLSelectElement;
    expect(Array.from(unit.options).filter((o) => o.value === "m³")).toHaveLength(1);
  });
});
