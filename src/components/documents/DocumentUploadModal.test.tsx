import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";

import { DocumentUploadModal } from "./DocumentUploadModal";
import { useUploadDocument } from "@/lib/api/hooks/useDocumentMutations";
import { BackendError } from "@/lib/api/unwrap";
import type { DocumentUploadInput } from "@/lib/api/documents-client";

// F-BC T3 · Belge Yükle diyaloğu (spec §6 S1 ONAYLI türetilmiş minimal form:
// dosya + hedef klasör + isteğe bağlı açıklama). Genişletme İCAT EDİLMEZ.

vi.mock("@/lib/api/hooks/useDocumentMutations", () => ({
  useUploadDocument: vi.fn(),
  useCreateDocumentFolder: vi.fn(),
}));

const FOLDERS = [
  { id: "df-1", project_id: "p-1", site_id: "s-1", parent_id: null, name: "Sözleşmeler", created_at: "2026-01-01T00:00:00Z" },
  { id: "df-2", project_id: "p-1", site_id: "s-1", parent_id: null, name: "Hakedişler", created_at: "2026-01-01T00:00:00Z" },
];

const mutate = vi.fn();

function mockUpload(overrides: { isPending?: boolean } = {}) {
  vi.mocked(useUploadDocument).mockReturnValue({
    mutate,
    isPending: overrides.isPending ?? false,
  } as unknown as ReturnType<typeof useUploadDocument>);
}

/** Son `mutate` çağrısının yükleme girdisi. */
function lastInput(): DocumentUploadInput {
  return mutate.mock.calls[mutate.mock.calls.length - 1][0] as DocumentUploadInput;
}

/** Son `mutate` çağrısının React Query geri çağrıları. */
function lastCallbacks(): {
  onSuccess?: (data: unknown) => void;
  onError?: (error: Error) => void;
} {
  return mutate.mock.calls[mutate.mock.calls.length - 1][1];
}

async function pickFile(user: ReturnType<typeof userEvent.setup>, name = "plan.pdf") {
  await user.upload(
    screen.getByLabelText("Dosya"),
    new File(["icerik"], name, { type: "application/pdf" }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUpload();
});

describe("DocumentUploadModal", () => {
  it("aktif klasörü hedef olarak ÖN SEÇER (spec §6 S1)", () => {
    render(
      <DocumentUploadModal
        projectId="p-1"
        siteId="s-1"
        folders={FOLDERS}
        activeFolderId="df-2"
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Klasör")).toHaveValue("df-2");
  });

  // Kayıt 73 — backend `description` max_length=2000 dayatır; istemci
  // tavanı taşımıyordu.
  it("açıklama alanı backend'in 2000 karakter tavanını taşır (kayıt 73)", () => {
    render(
      <DocumentUploadModal projectId="p-1" folders={FOLDERS} onClose={vi.fn()} />,
    );
    expect(screen.getByLabelText("Açıklama")).toHaveAttribute("maxLength", "2000");
  });

  it("dosya seçilmeden gönderilirse istek ATILMAZ, görünür Türkçe hata basar", async () => {
    const user = userEvent.setup();
    render(
      <DocumentUploadModal projectId="p-1" siteId="s-1" folders={FOLDERS} onClose={vi.fn()} />,
    );

    await user.click(screen.getByRole("button", { name: "Yükle" }));

    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByText("Bir dosya seçin.")).toBeInTheDocument();
  });

  it("şantiye kapsamında site_id + klasör + açıklama gönderir", async () => {
    const user = userEvent.setup();
    render(
      <DocumentUploadModal
        projectId="p-1"
        siteId="s-1"
        folders={FOLDERS}
        activeFolderId="df-1"
        onClose={vi.fn()}
      />,
    );

    await pickFile(user);
    await user.type(screen.getByLabelText("Açıklama"), "Ruhsat eki");
    await user.click(screen.getByRole("button", { name: "Yükle" }));

    const input = lastInput();
    expect(input.projectId).toBe("p-1");
    expect(input.siteId).toBe("s-1");
    expect(input.folderId).toBe("df-1");
    expect(input.description).toBe("Ruhsat eki");
    expect(input.file.name).toBe("plan.pdf");
  });

  /**
   * ⚠️ TUZAK (T4 aynı diyaloğu proje düzeyinde kullanacak): `siteId`
   * verilmediğinde alan HİÇ taşınmamalıdır. `siteId ?? ""` yazmak gerçek
   * backend'de sessizce 422 üretir.
   */
  it("proje düzeyinde (siteId yok) site_id alanını HİÇ taşımaz", async () => {
    const user = userEvent.setup();
    render(<DocumentUploadModal projectId="p-1" folders={[]} onClose={vi.fn()} />);

    await pickFile(user);
    await user.click(screen.getByRole("button", { name: "Yükle" }));

    const input = lastInput();
    expect("siteId" in input).toBe(false);
    expect(input.projectId).toBe("p-1");
  });

  it("klasör seçilmezse folder_id ve boş açıklama HİÇ taşınmaz", async () => {
    const user = userEvent.setup();
    render(
      <DocumentUploadModal projectId="p-1" siteId="s-1" folders={FOLDERS} onClose={vi.fn()} />,
    );

    await pickFile(user);
    await user.click(screen.getByRole("button", { name: "Yükle" }));

    const input = lastInput();
    expect("folderId" in input).toBe(false);
    expect("description" in input).toBe(false);
  });

  it("başarıda diyalog kapanır", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <DocumentUploadModal projectId="p-1" siteId="s-1" folders={FOLDERS} onClose={onClose} />,
    );

    await pickFile(user);
    await user.click(screen.getByRole("button", { name: "Yükle" }));
    lastCallbacks().onSuccess?.({});

    expect(onClose).toHaveBeenCalled();
  });

  it("413 (boyut aşımı) ve 422 (uzantı reddi) mesajları görünür basılır", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <DocumentUploadModal projectId="p-1" siteId="s-1" folders={FOLDERS} onClose={vi.fn()} />,
    );

    await pickFile(user);
    await user.click(screen.getByRole("button", { name: "Yükle" }));
    lastCallbacks().onError?.(new BackendError(413, { detail: "Dosya boyutu sınırı aşıldı." }));
    rerender(
      <DocumentUploadModal projectId="p-1" siteId="s-1" folders={FOLDERS} onClose={vi.fn()} />,
    );
    expect(screen.getByText("Dosya boyutu sınırı aşıldı.")).toHaveClass("pf-form-error");

    await user.click(screen.getByRole("button", { name: "Yükle" }));
    lastCallbacks().onError?.(new BackendError(422, { detail: "Bu dosya türü kabul edilmiyor." }));
    rerender(
      <DocumentUploadModal projectId="p-1" siteId="s-1" folders={FOLDERS} onClose={vi.fn()} />,
    );
    expect(screen.getByText("Bu dosya türü kabul edilmiyor.")).toBeInTheDocument();
  });

  it("gövdesiz hatada bile sessiz kalmaz (yedek Türkçe mesaj)", async () => {
    const user = userEvent.setup();
    render(
      <DocumentUploadModal projectId="p-1" siteId="s-1" folders={FOLDERS} onClose={vi.fn()} />,
    );

    await pickFile(user);
    await user.click(screen.getByRole("button", { name: "Yükle" }));
    lastCallbacks().onError?.(new Error("ağ koptu"));

    expect(await screen.findByText("Belge yüklenemedi.")).toBeInTheDocument();
  });

  it("istek sürerken düğmeler devre dışıdır (çift gönderim yok)", () => {
    mockUpload({ isPending: true });
    render(
      <DocumentUploadModal projectId="p-1" siteId="s-1" folders={FOLDERS} onClose={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "Yükle" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Vazgeç" })).toBeDisabled();
  });

  it("BASILMAYANLAR: sürükle-bırak / çoklu dosya / ilerleme çubuğu yüzeyi YOKTUR", () => {
    render(
      <DocumentUploadModal projectId="p-1" siteId="s-1" folders={FOLDERS} onClose={vi.fn()} />,
    );
    expect(screen.getByLabelText("Dosya")).not.toHaveAttribute("multiple");
    expect(screen.queryByText(/sürükle/i)).toBeNull();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
});

/** SEKME-F1.3b · merkezi kayda bağlanma bekçisi. */
describe("DocumentUploadModal — kaydedilmemiş değişiklik kaydı", () => {
  it("açıldı, dokunulmadı → temiz", () => {
    render(<DocumentUploadModal projectId="p-1" siteId="s-1" folders={FOLDERS} onClose={vi.fn()} />);
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });

  it("dosya seçildi → kirli", async () => {
    const user = userEvent.setup();
    render(<DocumentUploadModal projectId="p-1" siteId="s-1" folders={FOLDERS} onClose={vi.fn()} />);
    await pickFile(user);
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
  });

  it("başarılı kayıt sonrası (onClose çağrılır, unmount) → temiz", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { unmount } = render(
      <DocumentUploadModal projectId="p-1" siteId="s-1" folders={FOLDERS} onClose={onClose} />,
    );
    await pickFile(user);
    await user.click(screen.getByRole("button", { name: "Yükle" }));
    lastCallbacks().onSuccess?.({});
    expect(onClose).toHaveBeenCalled();
    unmount();
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });
});
