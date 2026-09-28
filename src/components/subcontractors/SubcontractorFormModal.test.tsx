import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

import { SubcontractorFormModal } from "./SubcontractorFormModal";
import { useCreateSubcontractor } from "@/lib/api/hooks/useSubcontractorMutations";
import type { SubcontractorResponse } from "@/lib/api/hooks/useSubcontractorMutations";
import { BackendError } from "@/lib/api/unwrap";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";

vi.mock("@/lib/api/hooks/useSubcontractorMutations", () => ({
  useCreateSubcontractor: vi.fn(),
}));

const mutate = vi.fn();
const onClose = vi.fn();
const onCreated = vi.fn();

function setup(initialName?: string) {
  vi.mocked(useCreateSubcontractor).mockReturnValue({ mutate, isPending: false } as never);
  render(
    <SubcontractorFormModal
      onClose={onClose}
      onCreated={onCreated}
      {...(initialName === undefined ? {} : { initialName })}
    />,
  );
}

function fillName(value = "ABC Taahhüt A.Ş.") {
  fireEvent.change(screen.getByLabelText("Ticari Ünvan"), { target: { value } });
}

describe("SubcontractorFormModal · paylaşılan '+ Taşeron Ekle' modalı", () => {
  beforeEach(() => vi.clearAllMocks());

  it("SubcontractorCreate şemasının altı alanını basar", () => {
    setup();
    for (const label of ["Ticari Ünvan", "VKN", "Kategori", "Yetkili Kişi", "Telefon", "E-posta"]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  it("metin girişleri şema uzunluk sınırlarını taşır", () => {
    setup();
    expect(screen.getByLabelText("Ticari Ünvan")).toHaveAttribute("maxLength", "200");
    expect(screen.getByLabelText("VKN")).toHaveAttribute("maxLength", "11");
    expect(screen.getByLabelText("Kategori")).toHaveAttribute("maxLength", "100");
    expect(screen.getByLabelText("Yetkili Kişi")).toHaveAttribute("maxLength", "200");
    expect(screen.getByLabelText("Telefon")).toHaveAttribute("maxLength", "30");
    expect(screen.getByLabelText("E-posta")).toHaveAttribute("maxLength", "255");
  });

  it("ünvan boşsa gönderilmez", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(screen.getByText("Taşeron ünvanı zorunludur.")).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();
  });

  it("hatalı VKN gönderilmez", () => {
    setup();
    fillName();
    fireEvent.change(screen.getByLabelText("VKN"), { target: { value: "123" } });
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(screen.getByText("VKN 10 veya 11 haneli rakam olmalıdır.")).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();
  });

  it("hatalı e-posta gönderilmez", () => {
    setup();
    fillName();
    fireEvent.change(screen.getByLabelText("E-posta"), { target: { value: "abc" } });
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(screen.getByText("Geçerli bir e-posta adresi giriniz.")).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();
  });

  it("boş bırakılan alanlar istekte HİÇ gönderilmez", () => {
    setup();
    fillName();
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(mutate).toHaveBeenCalledWith(
      { name: "ABC Taahhüt A.Ş.", is_active: true },
      expect.anything(),
    );
  });

  it("doldurulan alanların hepsi gönderilir", () => {
    setup();
    fillName();
    fireEvent.change(screen.getByLabelText("VKN"), { target: { value: "1234567890" } });
    fireEvent.change(screen.getByLabelText("Kategori"), { target: { value: "Betonarme" } });
    fireEvent.change(screen.getByLabelText("Yetkili Kişi"), { target: { value: "Ali Veli" } });
    fireEvent.change(screen.getByLabelText("Telefon"), { target: { value: "0212 555 00 01" } });
    fireEvent.change(screen.getByLabelText("E-posta"), { target: { value: "a@b.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));

    expect(mutate).toHaveBeenCalledWith(
      {
        name: "ABC Taahhüt A.Ş.",
        is_active: true,
        tax_number: "1234567890",
        category: "Betonarme",
        contact_person: "Ali Veli",
        phone: "0212 555 00 01",
        email: "a@b.com",
      },
      expect.anything(),
    );
  });

  it("BAŞARIDA oluşan kaydı çağırana geri verir (T6 onu seçili yapar)", () => {
    setup();
    fillName();
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));

    const created: SubcontractorResponse = {
      id: "sub-new-1",
      name: "ABC Taahhüt A.Ş.",
      tax_number: null,
      contact_person: null,
      phone: null,
      email: null,
      category: null,
      is_active: true,
    };
    const options = mutate.mock.calls[0][1] as { onSuccess: (v: SubcontractorResponse) => void };
    options.onSuccess(created);
    expect(onCreated).toHaveBeenCalledWith(created);
  });

  it("sunucu hatası kullanıcıya gösterilir", () => {
    setup();
    fillName();
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    const options = mutate.mock.calls[0][1] as { onError: (e: Error) => void };
    act(() => options.onError(new BackendError(409, { detail: "Bu VKN kayıtlı." })));
    expect(screen.getByText("Bu VKN kayıtlı.")).toBeInTheDocument();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("initialName ön-doldurulur (T6'daki '+ Yeni Taşeron Ekle' akışı)", () => {
    setup("Yılmaz Boya");
    expect(screen.getByLabelText("Ticari Ünvan")).toHaveValue("Yılmaz Boya");
  });

  it("Vazgeç modalı kapatır", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Vazgeç" }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("SubcontractorFormModal — kaydedilmemiş değişiklik kaydı", () => {
  it("açıldı + dokunulmadı → false", () => {
    setup();
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });

  it("`initialName` ile ön-dolu açılınca → false (taban initialName'dir)", () => {
    setup("Yılmaz Boya");
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });

  it("ünvan değişti → true", () => {
    setup();
    fillName();
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
  });

  it("başarılı kayıt (onSuccess: onCreated) → unmount ile false", () => {
    vi.mocked(useCreateSubcontractor).mockReturnValue({ mutate, isPending: false } as never);
    mutate.mockImplementation((_body, options) => options.onSuccess({ id: "s-1" } as SubcontractorResponse));
    const { unmount } = render(
      <SubcontractorFormModal onClose={onClose} onCreated={onCreated} />,
    );
    fillName();
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(onCreated).toHaveBeenCalled();
    unmount();
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });
});
