import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";

import { SupplierModal } from "./SupplierModal";
import { useCreateSupplier } from "@/lib/api/hooks/useSupplierMutations";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";

vi.mock("@/lib/api/hooks/useSupplierMutations", () => ({ useCreateSupplier: vi.fn() }));

const mutate = vi.fn();
const onClose = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useCreateSupplier).mockReturnValue({
    mutate,
    isPending: false,
  } as unknown as ReturnType<typeof useCreateSupplier>);
});

describe("SupplierModal — TED kartından türetilmiş minimal diyalog (spec K5)", () => {
  it("YALNIZ kartın kendi alanlarını sorar (uydurma alan YOK)", () => {
    render(<SupplierModal onClose={onClose} />);
    for (const label of ["Tedarikçi Adı", "Kategori", "VKN", "İletişim", "Ödeme Vadesi"]) {
      expect(screen.getByLabelText(new RegExp(label))).toBeInTheDocument();
    }
    // Kartta olmayan alanlar sorulmaz.
    expect(screen.queryByLabelText(/E-posta/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Adres/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Puan/)).not.toBeInTheDocument();
  });

  it("ödeme vadesi KAPALI kümedir — dört seçenek basılır", () => {
    render(<SupplierModal onClose={onClose} />);
    const select = screen.getByLabelText(/Ödeme Vadesi/);
    expect(
      Array.from(select.querySelectorAll("option")).map((option) => option.textContent),
    ).toEqual(["Peşin", "15 gün", "30 gün", "60 gün"]);
  });

  it("ad boşken gönderim engellenir ve görünür hata basılır", () => {
    render(<SupplierModal onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByText("Tedarikçi adı zorunludur.")).toBeInTheDocument();
  });

  it("boş bırakılan isteğe bağlı alanlar gövdeye KONMAZ", () => {
    render(<SupplierModal onClose={onClose} />);
    fireEvent.change(screen.getByLabelText(/Tedarikçi Adı/), {
      target: { value: "  Demirsan A.Ş.  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));

    const [body] = mutate.mock.calls[0];
    expect(body).toEqual({
      name: "Demirsan A.Ş.",
      payment_terms: "days_30",
      is_active: true,
    });
  });

  it("doldurulan alanları kırpılmış olarak gönderir", () => {
    render(<SupplierModal onClose={onClose} />);
    fireEvent.change(screen.getByLabelText(/Tedarikçi Adı/), {
      target: { value: "KarTaş Yapı Market" },
    });
    fireEvent.change(screen.getByLabelText(/Kategori/), {
      target: { value: " Yapı Malzemeleri " },
    });
    fireEvent.change(screen.getByLabelText(/VKN/), { target: { value: "9876543210" } });
    fireEvent.change(screen.getByLabelText(/İletişim/), { target: { value: "0216 444 22 33" } });
    fireEvent.change(screen.getByLabelText(/Ödeme Vadesi/), { target: { value: "days_15" } });
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));

    const [body] = mutate.mock.calls[0];
    expect(body).toEqual({
      name: "KarTaş Yapı Market",
      payment_terms: "days_15",
      is_active: true,
      category: "Yapı Malzemeleri",
      tax_no: "9876543210",
      phone: "0216 444 22 33",
    });
  });

  it("sunucu hatasında gövdedeki Türkçe cümle basılır", () => {
    render(<SupplierModal onClose={onClose} />);
    fireEvent.change(screen.getByLabelText(/Tedarikçi Adı/), { target: { value: "Demirsan" } });
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));

    const [, options] = mutate.mock.calls[0];
    // Geri çağrı React olay döngüsünün DIŞINDA tetiklenir → durum güncellemesi
    // `act` ile boşaltılır (aksi hâlde metin henüz DOM'a yazılmamış olur).
    act(() => options.onError(new Error("boom")));
    expect(screen.getByText("Tedarikçi kaydedilemedi.")).toBeInTheDocument();
  });

  it("başarıda diyalog kapanır", () => {
    render(<SupplierModal onClose={onClose} />);
    fireEvent.change(screen.getByLabelText(/Tedarikçi Adı/), { target: { value: "Demirsan" } });
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));

    const [, options] = mutate.mock.calls[0];
    act(() => options.onSuccess());
    expect(onClose).toHaveBeenCalled();
  });

  it("SEKME-F1.3b · açıldı/dokunulmadı → false; ad yazıldı → true; başarılı kayıt (kapanış) → false", () => {
    let unmount = () => {};
    const wrappedOnClose = vi.fn(() => unmount());
    ({ unmount } = render(<SupplierModal onClose={wrappedOnClose} />));
    expect(unsavedRegistry.hasUnsaved()).toBe(false);

    fireEvent.change(screen.getByLabelText(/Tedarikçi Adı/), { target: { value: "Demirsan" } });
    expect(unsavedRegistry.hasUnsaved()).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    const [, options] = mutate.mock.calls[0];
    act(() => options.onSuccess());
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });

  it("KURAL 7 · dirty hâldeyken arka plana tıklamak window.confirm'ü ÇAĞIRMAZ (settings/Modal'a isDirty verilmez)", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<SupplierModal onClose={onClose} />);

    fireEvent.change(screen.getByLabelText(/Tedarikçi Adı/), { target: { value: "Demirsan" } });
    expect(unsavedRegistry.hasUnsaved()).toBe(true);

    fireEvent.click(screen.getByRole("presentation"));
    expect(confirmSpy).not.toHaveBeenCalled();
    // Bugünkü davranış AYNI kalır: overlay tıklaması doğrudan kapatır.
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
