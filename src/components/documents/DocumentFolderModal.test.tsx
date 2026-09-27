import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";

import { DocumentFolderModal } from "./DocumentFolderModal";
import { useCreateDocumentFolder } from "@/lib/api/hooks/useDocumentMutations";
import { BackendError } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";

// F-BC T3 · Yeni Klasör diyaloğu — spec §6 S1: TEK "ad" alanı. Üst klasör,
// renk, ikon gibi alanlar İCAT EDİLMEZ (mockup'ta yok).

vi.mock("@/lib/api/hooks/useDocumentMutations", () => ({
  useUploadDocument: vi.fn(),
  useCreateDocumentFolder: vi.fn(),
}));

const mutate = vi.fn();

function mockCreate(overrides: { isPending?: boolean } = {}) {
  vi.mocked(useCreateDocumentFolder).mockReturnValue({
    mutate,
    isPending: overrides.isPending ?? false,
  } as unknown as ReturnType<typeof useCreateDocumentFolder>);
}

function lastBody(): components["schemas"]["DocumentFolderCreate"] {
  return mutate.mock.calls[mutate.mock.calls.length - 1][0];
}

function lastCallbacks(): {
  onSuccess?: (data: unknown) => void;
  onError?: (error: Error) => void;
} {
  return mutate.mock.calls[mutate.mock.calls.length - 1][1];
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCreate();
});

describe("DocumentFolderModal", () => {
  it("YALNIZ ad alanı basar (üst klasör/renk/ikon YOK)", () => {
    render(<DocumentFolderModal projectId="p-1" siteId="s-1" onClose={vi.fn()} />);

    expect(screen.getByLabelText("Klasör Adı")).toBeInTheDocument();
    expect(screen.queryByLabelText(/üst klasör/i)).toBeNull();
    expect(screen.queryByLabelText(/renk/i)).toBeNull();
    expect(screen.queryByLabelText(/ikon/i)).toBeNull();
  });

  // Kayıt 73 — backend `DocumentFolderCreate.name` max_length=150 dayatır;
  // istemci tavanı taşımıyordu (150+ karakter girilip gönderilince 422 alırdı).
  it("ad alanı backend'in 150 karakter tavanını taşır (kayıt 73)", () => {
    render(<DocumentFolderModal projectId="p-1" siteId="s-1" onClose={vi.fn()} />);
    expect(screen.getByLabelText("Klasör Adı")).toHaveAttribute("maxLength", "150");
  });

  it("proje kimliğini hook'a YOL parametresi olarak verir, gövdeye koymaz", async () => {
    const user = userEvent.setup();
    render(<DocumentFolderModal projectId="p-1" siteId="s-1" onClose={vi.fn()} />);

    await user.type(screen.getByLabelText("Klasör Adı"), "  Ruhsatlar  ");
    await user.click(screen.getByRole("button", { name: "Oluştur" }));

    expect(vi.mocked(useCreateDocumentFolder)).toHaveBeenCalledWith("p-1");
    const body = lastBody();
    expect(body).toEqual({ name: "Ruhsatlar", site_id: "s-1" });
  });

  /** ⚠️ T4 tuzağı: proje düzeyinde `site_id` HİÇ taşınmaz (boş dize değil). */
  it("proje düzeyinde (siteId yok) site_id alanını HİÇ taşımaz", async () => {
    const user = userEvent.setup();
    render(<DocumentFolderModal projectId="p-1" onClose={vi.fn()} />);

    await user.type(screen.getByLabelText("Klasör Adı"), "Genel");
    await user.click(screen.getByRole("button", { name: "Oluştur" }));

    expect(lastBody()).toEqual({ name: "Genel" });
  });

  it("boş ad gönderilmez, görünür Türkçe hata basar", async () => {
    const user = userEvent.setup();
    render(<DocumentFolderModal projectId="p-1" siteId="s-1" onClose={vi.fn()} />);

    await user.type(screen.getByLabelText("Klasör Adı"), "   ");
    await user.click(screen.getByRole("button", { name: "Oluştur" }));

    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByText("Klasör adı zorunludur.")).toBeInTheDocument();
  });

  it("409 (ad çakışması) mesajı görünür basılır", async () => {
    const user = userEvent.setup();
    render(<DocumentFolderModal projectId="p-1" siteId="s-1" onClose={vi.fn()} />);

    await user.type(screen.getByLabelText("Klasör Adı"), "Hakedişler");
    await user.click(screen.getByRole("button", { name: "Oluştur" }));
    lastCallbacks().onError?.(new BackendError(409, { detail: "Bu adda bir klasör zaten var." }));

    expect(await screen.findByText("Bu adda bir klasör zaten var.")).toHaveClass("pf-form-error");
  });

  it("gövdesiz hatada bile sessiz kalmaz (yedek Türkçe mesaj)", async () => {
    const user = userEvent.setup();
    render(<DocumentFolderModal projectId="p-1" siteId="s-1" onClose={vi.fn()} />);

    await user.type(screen.getByLabelText("Klasör Adı"), "Hakedişler");
    await user.click(screen.getByRole("button", { name: "Oluştur" }));
    lastCallbacks().onError?.(new Error("ağ koptu"));

    expect(await screen.findByText("Klasör oluşturulamadı.")).toBeInTheDocument();
  });

  it("başarıda diyalog kapanır", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<DocumentFolderModal projectId="p-1" siteId="s-1" onClose={onClose} />);

    await user.type(screen.getByLabelText("Klasör Adı"), "Hakedişler");
    await user.click(screen.getByRole("button", { name: "Oluştur" }));
    lastCallbacks().onSuccess?.({});

    expect(onClose).toHaveBeenCalled();
  });

  it("istek sürerken düğmeler devre dışıdır", () => {
    mockCreate({ isPending: true });
    render(<DocumentFolderModal projectId="p-1" siteId="s-1" onClose={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Oluştur" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Vazgeç" })).toBeDisabled();
  });
});

/** SEKME-F1.3b · merkezi kayda bağlanma bekçisi. */
describe("DocumentFolderModal — kaydedilmemiş değişiklik kaydı", () => {
  it("açıldı, dokunulmadı → temiz", () => {
    render(<DocumentFolderModal projectId="p-1" siteId="s-1" onClose={vi.fn()} />);
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });

  it("ad yazıldı → kirli", async () => {
    const user = userEvent.setup();
    render(<DocumentFolderModal projectId="p-1" siteId="s-1" onClose={vi.fn()} />);
    await user.type(screen.getByLabelText("Klasör Adı"), "Ruhsatlar");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
  });

  it("başarılı kayıt sonrası (onClose çağrılır, unmount) → temiz", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { unmount } = render(<DocumentFolderModal projectId="p-1" siteId="s-1" onClose={onClose} />);
    await user.type(screen.getByLabelText("Klasör Adı"), "Hakedişler");
    await user.click(screen.getByRole("button", { name: "Oluştur" }));
    lastCallbacks().onSuccess?.({});
    expect(onClose).toHaveBeenCalled();
    unmount();
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });
});
