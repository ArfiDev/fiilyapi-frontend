import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

import { EmployerFormModal } from "./EmployerFormModal";
import { useCreateEmployer } from "@/lib/api/hooks/useEmployerMutations";
import { BackendError } from "@/lib/api/unwrap";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";

vi.mock("@/lib/api/hooks/useEmployerMutations", () => ({ useCreateEmployer: vi.fn() }));

const mutate = vi.fn();
const onClose = vi.fn();
const onCreated = vi.fn();

function setup() {
  vi.mocked(useCreateEmployer).mockReturnValue({ mutate, isPending: false } as never);
  render(<EmployerFormModal onClose={onClose} onCreated={onCreated} />);
}

describe("EmployerFormModal (F7)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("yalnız 3 alanı etiketleriyle render eder (Alt-Proje 3'ün tam formu değil)", () => {
    setup();
    expect(screen.getByLabelText("Ticari Ünvan")).toBeInTheDocument();
    expect(screen.getByLabelText("VKN")).toBeInTheDocument();
    expect(screen.getByLabelText("Yetkili Kişi")).toBeInTheDocument();
    // Tam firma formunun diğer alanları (kısa ad, cari kod, vergi dairesi vb.) yok.
    expect(screen.queryByLabelText(/vergi dairesi/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/iban/i)).not.toBeInTheDocument();
  });

  it("ticari ünvan boş ise zorunlu alan hatası gösterir ve gönderilmez", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(screen.getByText("Ticari Ünvan zorunludur.")).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();
  });

  it("geçerli formda yalnız doldurulan alanlar istekte gönderilir", () => {
    setup();
    fireEvent.change(screen.getByLabelText("Ticari Ünvan"), {
      target: { value: "ABC İnşaat A.Ş." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(mutate).toHaveBeenCalledWith(
      { name: "ABC İnşaat A.Ş." },
      expect.anything(),
    );
  });

  it("VKN ve Yetkili Kişi doldurulursa istekte gönderilir", () => {
    setup();
    fireEvent.change(screen.getByLabelText("Ticari Ünvan"), {
      target: { value: "ABC İnşaat A.Ş." },
    });
    fireEvent.change(screen.getByLabelText("VKN"), { target: { value: "9876543210" } });
    fireEvent.change(screen.getByLabelText("Yetkili Kişi"), {
      target: { value: "Ahmet Güneş" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(mutate).toHaveBeenCalledWith(
      {
        name: "ABC İnşaat A.Ş.",
        tax_number: "9876543210",
        contact_person: "Ahmet Güneş",
      },
      expect.anything(),
    );
  });

  it("başarıda onCreated yeni işverenle çağrılır", () => {
    setup();
    fireEvent.change(screen.getByLabelText("Ticari Ünvan"), {
      target: { value: "ABC İnşaat A.Ş." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));

    const created = {
      id: "emp-1",
      name: "ABC İnşaat A.Ş.",
      tax_number: null,
      contact_person: null,
      is_active: true,
    };
    const onSuccess = mutate.mock.calls[0][1].onSuccess;
    act(() => onSuccess(created));

    expect(onCreated).toHaveBeenCalledWith(created);
  });

  it("409'da modal içinde backend'in Türkçe VKN mesajını gösterir (modal kapanmaz)", () => {
    setup();
    fireEvent.change(screen.getByLabelText("Ticari Ünvan"), {
      target: { value: "ABC İnşaat A.Ş." },
    });
    fireEvent.change(screen.getByLabelText("VKN"), { target: { value: "9876543210" } });
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));

    const onError = mutate.mock.calls[0][1].onError;
    act(() =>
      onError(
        new BackendError(409, { detail: "Bu VKN ile kayıtlı bir işveren zaten var." }),
      ),
    );

    expect(
      screen.getByText("Bu VKN ile kayıtlı bir işveren zaten var."),
    ).toBeInTheDocument();
    expect(onCreated).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("SEKME-F1.3b · açıldı/dokunulmadı → false; ünvan yazıldı → true; başarılı kayıt (çağıran kapatınca) → false", () => {
    vi.mocked(useCreateEmployer).mockReturnValue({ mutate, isPending: false } as never);
    const { unmount } = render(<EmployerFormModal onClose={onClose} onCreated={onCreated} />);
    expect(unsavedRegistry.hasUnsaved()).toBe(false);

    fireEvent.change(screen.getByLabelText("Ticari Ünvan"), {
      target: { value: "ABC İnşaat A.Ş." },
    });
    expect(unsavedRegistry.hasUnsaved()).toBe(true);

    // Başarılı kayıtta `onCreated` çağrılır; çağıran modalı kapatır (unmount).
    unmount();
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });
});
