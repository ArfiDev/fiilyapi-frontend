import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";

import { BackendError } from "@/lib/api/unwrap";
import { useDocumentFolders } from "@/lib/api/hooks/useDocumentFolders";
import { useUploadDocument } from "@/lib/api/hooks/useDocumentMutations";
import { useProjects } from "@/lib/api/hooks/useProjects";
import { sitesQueryOptions, useSites } from "@/lib/api/hooks/useSites";

import { ArchiveDocumentFormModal } from "./ArchiveDocumentFormModal";
import { ARCHIVE_DOCUMENT_NAME_REASON, ARCHIVE_DOCUMENT_TEXT as TEXT } from "./constants";

vi.mock("@/lib/api/hooks/useProjects", () => ({ useProjects: vi.fn() }));
vi.mock("@/lib/api/hooks/useDocumentFolders", () => ({ useDocumentFolders: vi.fn() }));
vi.mock("@/lib/api/hooks/useDocumentMutations", () => ({ useUploadDocument: vi.fn() }));
vi.mock("@/lib/api/hooks/useSites", async (importOriginal) => {
  // `sitesQueryOptions` GERÇEK kalır: boş-id kapısı onun içindedir ve test
  // tam olarak o kapıyı doğrular.
  const actual = await importOriginal<typeof import("@/lib/api/hooks/useSites")>();
  return { ...actual, useSites: vi.fn() };
});

const PROJECT_ID = "pppppppp-0000-0000-0000-000000000001";
const SITE_ID = "ssssssss-0000-0000-0000-000000000001";
const FOLDER_ID = "ffffffff-0000-0000-0000-000000000001";

const upload = vi.fn();
const onClose = vi.fn();

function renderModal(initialProjectId?: string) {
  return render(
    <ArchiveDocumentFormModal initialProjectId={initialProjectId} onClose={onClose} />,
  );
}

function selectFile(name = "sozlesme.pdf") {
  const file = new File(["x"], name, { type: "application/pdf" });
  fireEvent.change(screen.getByLabelText(TEXT.file), { target: { files: [file] } });
  return file;
}

beforeEach(() => {
  vi.clearAllMocks();
  upload.mockResolvedValue({});
  vi.mocked(useProjects).mockReturnValue({
    data: { items: [{ id: PROJECT_ID, name: "Güneşkent Konut" }] },
    isError: false,
    error: null,
  } as never);
  vi.mocked(useSites).mockReturnValue({
    data: { items: [{ id: SITE_ID, name: "A-Blok Şantiyesi" }] },
  } as never);
  vi.mocked(useDocumentFolders).mockReturnValue({
    data: { folders: [{ id: FOLDER_ID, name: "Hakedişler" }] },
  } as never);
  vi.mocked(useUploadDocument).mockReturnValue({
    mutateAsync: upload,
    isPending: false,
  } as never);
});

describe("ArchiveDocumentFormModal (ARŞ · Form - Belge Ekle)", () => {
  it("dosya seçilmeden AĞA ÇIKMAZ (mockup 73 `*`)", async () => {
    renderModal(PROJECT_ID);
    fireEvent.click(screen.getByRole("button", { name: TEXT.submit }));

    expect(upload).not.toHaveBeenCalled();
    expect(await screen.findByTestId("adf-error")).toHaveTextContent("Bir dosya seçin.");
  });

  it("proje seçilmeden AĞA ÇIKMAZ (mockup 87 `*`)", async () => {
    renderModal();
    selectFile();
    fireEvent.click(screen.getByRole("button", { name: TEXT.submit }));

    expect(upload).not.toHaveBeenCalled();
    expect(await screen.findByTestId("adf-error")).toHaveTextContent("Proje zorunludur.");
  });

  it("🔴 proje seçilmeden ŞANTİYE SORGUSU ATILMAZ (boş-id kapısı)", () => {
    renderModal();

    // Hook boş id ile çağrılır (Rules of Hooks: koşullu çağrılamaz)…
    expect(vi.mocked(useSites)).toHaveBeenCalledWith("");
    // …ama sorgu KAPALIdır: `/projects//sites` isteği hiç doğmaz.
    expect(sitesQueryOptions("").enabled).toBe(false);
    expect(sitesQueryOptions(PROJECT_ID).enabled).toBe(true);
  });

  it("şantiye ve klasör seçicileri proje seçilene kadar KAPALIdır (mockup notu 34)", () => {
    renderModal();
    expect(screen.getByTestId("adf-site")).toBeDisabled();
    expect(screen.getByTestId("adf-folder")).toBeDisabled();

    fireEvent.change(screen.getByTestId("adf-project"), { target: { value: PROJECT_ID } });
    expect(screen.getByTestId("adf-site")).toBeEnabled();
    expect(screen.getByTestId("adf-folder")).toBeEnabled();
  });

  it("proje değişince şantiye/klasör seçimi DÜŞER", () => {
    renderModal(PROJECT_ID);
    fireEvent.change(screen.getByTestId("adf-site"), { target: { value: SITE_ID } });
    expect(screen.getByTestId("adf-site")).toHaveValue(SITE_ID);

    fireEvent.change(screen.getByTestId("adf-project"), { target: { value: "" } });
    expect(screen.getByTestId("adf-site")).toHaveValue("");
  });

  it("🔴 şantiye seçilince klasör sorgusu SEÇİLİ ŞANTİYE ile atılır (kapsam eşleşmesi)", () => {
    renderModal(PROJECT_ID);

    fireEvent.change(screen.getByTestId("adf-site"), { target: { value: SITE_ID } });

    // Şantiye seçiliyken klasör sorgusu YALNIZ proje-düzeyi (siteId=undefined)
    // klasörleri getirirse backend `folder.site_id != site_id` kontrolüyle
    // HER ZAMAN 422 (FOLDER_SCOPE_MISMATCH) döner — bu yüzden ikinci argüman
    // SEÇİLİ ŞANTİYE olmalı.
    expect(vi.mocked(useDocumentFolders)).toHaveBeenCalledWith(PROJECT_ID, SITE_ID);
  });

  it("🔴 şantiye değişince klasör seçimi DÜŞER (artık başka kapsamın klasörü)", () => {
    renderModal(PROJECT_ID);
    fireEvent.change(screen.getByTestId("adf-folder"), { target: { value: FOLDER_ID } });
    expect(screen.getByTestId("adf-folder")).toHaveValue(FOLDER_ID);

    fireEvent.change(screen.getByTestId("adf-site"), { target: { value: SITE_ID } });
    expect(screen.getByTestId("adf-folder")).toHaveValue("");
  });

  it("🔴 'Belge Adı' (121-125) SİLİNMEZ: devre-dışı + hint korunur + gerekçe görünür", () => {
    renderModal(PROJECT_ID);
    const field = screen.getByTestId("adf-document-name");

    expect(field).toBeDisabled();
    expect(screen.getByText(TEXT.documentNameHint)).toBeInTheDocument();
    expect(screen.getByTestId("adf-document-name-reason")).toHaveTextContent(
      ARCHIVE_DOCUMENT_NAME_REASON,
    );
  });

  it("🔴 şantiye sorgusu hata dönerse EKRANDA basılır (sessizce yutulmaz)", () => {
    vi.mocked(useSites).mockReturnValue({
      data: undefined,
      isError: true,
      error: new Error("Şantiyeler alınamadı"),
    } as never);
    renderModal(PROJECT_ID);

    expect(screen.getByTestId("adf-sites-error")).toBeInTheDocument();
  });

  it("🔴 klasör sorgusu hata dönerse EKRANDA basılır (sessizce yutulmaz)", () => {
    vi.mocked(useDocumentFolders).mockReturnValue({
      data: undefined,
      isError: true,
      error: new Error("Klasörler alınamadı"),
    } as never);
    renderModal(PROJECT_ID);

    expect(screen.getByTestId("adf-folders-error")).toBeInTheDocument();
  });

  it("boş bırakılan şantiye/klasör/açıklama gövdeye GİRMEZ", async () => {
    renderModal(PROJECT_ID);
    const file = selectFile();
    fireEvent.click(screen.getByRole("button", { name: TEXT.submit }));

    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    expect(upload).toHaveBeenCalledWith({ file, projectId: PROJECT_ID });
    expect(onClose).toHaveBeenCalled();
  });

  it("dolu alanlar gövdeye taşınır", async () => {
    renderModal(PROJECT_ID);
    selectFile();
    fireEvent.change(screen.getByTestId("adf-site"), { target: { value: SITE_ID } });
    fireEvent.change(screen.getByTestId("adf-folder"), { target: { value: FOLDER_ID } });
    fireEvent.change(screen.getByTestId("adf-description"), { target: { value: "Ruhsat" } });
    fireEvent.click(screen.getByRole("button", { name: TEXT.submit }));

    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    expect(upload.mock.calls[0][0]).toMatchObject({
      projectId: PROJECT_ID,
      siteId: SITE_ID,
      folderId: FOLDER_ID,
      description: "Ruhsat",
    });
  });

  it("'başka belge ekle' işaretliyse form SIFIRLANIR ve diyalog AÇIK kalır (139)", async () => {
    renderModal(PROJECT_ID);
    fireEvent.click(screen.getByTestId("adf-keep-open"));
    selectFile("plan.pdf");
    fireEvent.change(screen.getByTestId("adf-description"), { target: { value: "Ruhsat" } });
    fireEvent.click(screen.getByRole("button", { name: TEXT.submit }));

    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    expect(onClose).not.toHaveBeenCalled();
    expect(await screen.findByTestId("adf-saved")).toHaveTextContent("plan.pdf yüklendi.");
    expect(screen.getByTestId("adf-description")).toHaveValue("");
    // Kapsam KORUNUR: art arda yükleme aynı projede yapılır.
    expect(screen.getByTestId("adf-project")).toHaveValue(PROJECT_ID);
  });

  it("sunucu hatası YUTULMAZ — Türkçe `detail` basılır", async () => {
    upload.mockRejectedValue(new BackendError(422, { detail: "Bu uzantı kabul edilmiyor." }));
    renderModal(PROJECT_ID);
    selectFile();
    fireEvent.click(screen.getByRole("button", { name: TEXT.submit }));

    expect(await screen.findByTestId("adf-error")).toHaveTextContent(
      "Bu uzantı kabul edilmiyor.",
    );
    expect(onClose).not.toHaveBeenCalled();
  });
});

/** SEKME-F1.3b · merkezi kayda bağlanma bekçisi. */
describe("ArchiveDocumentFormModal — kaydedilmemiş değişiklik kaydı", () => {
  it("açıldı, dokunulmadı → temiz", () => {
    renderModal(PROJECT_ID);
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });

  it("dosya seçildi → kirli", () => {
    renderModal(PROJECT_ID);
    selectFile();
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
  });

  it("keepOpen ile kayıt sonrası (file/description sıfırlanır, taban da tazelenir) → temiz", async () => {
    renderModal(PROJECT_ID);
    fireEvent.click(screen.getByTestId("adf-keep-open"));
    selectFile("plan.pdf");
    fireEvent.change(screen.getByTestId("adf-description"), { target: { value: "Ruhsat" } });
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: TEXT.submit }));
    await screen.findByTestId("adf-saved");
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });

  it("keepOpen kapalıyken kayıt sonrası (onClose çağrılır, unmount) → temiz", async () => {
    const { unmount } = renderModal(PROJECT_ID);
    selectFile();
    fireEvent.click(screen.getByRole("button", { name: TEXT.submit }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    unmount();
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });
});
