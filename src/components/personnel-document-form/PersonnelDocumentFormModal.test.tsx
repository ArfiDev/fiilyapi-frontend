import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { BackendError } from "@/lib/api/unwrap";
import { useUploadDocument } from "@/lib/api/hooks/useDocumentMutations";
import { useHrDocumentsSummary, usePersonnelDocuments } from "@/lib/api/hooks/useHrDocuments";
import { useCreatePersonnelDocument } from "@/lib/api/hooks/usePersonnelDocumentMutations";
import type { PersonnelDetailResponse } from "@/lib/api/hooks/usePersonnelDetail";

import { PersonnelDocumentFormModal } from "./PersonnelDocumentFormModal";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";
import {
  ARCHIVE_PICK_REASON,
  NO_PROJECT_UPLOAD_REASON,
  OTHER_TYPE_VALUE,
  PERSONNEL_DOCUMENT_TEXT as TEXT,
} from "./constants";

vi.mock("@/lib/api/hooks/useDocumentMutations", () => ({ useUploadDocument: vi.fn() }));
vi.mock("@/lib/api/hooks/useHrDocuments", () => ({
  useHrDocumentsSummary: vi.fn(),
  usePersonnelDocuments: vi.fn(),
}));
vi.mock("@/lib/api/hooks/usePersonnelDocumentMutations", () => ({
  useCreatePersonnelDocument: vi.fn(),
}));

const PERSONNEL_ID = "eeeeeeee-0000-0000-0000-000000000001";
const PROJECT_ID = "pppppppp-0000-0000-0000-000000000001";
const TYPE_ID = "tttttttt-0000-0000-0000-000000000001";
const DOCUMENT_ID = "dddddddd-0000-0000-0000-000000000001";

const upload = vi.fn();
const create = vi.fn();
const onClose = vi.fn();

function personnel(overrides: Partial<PersonnelDetailResponse> = {}): PersonnelDetailResponse {
  return {
    id: PERSONNEL_ID,
    full_name: "Mehmet Yılmaz",
    trade: "Kalıpçı Usta",
    source: "company",
    sgk_no: "123-456-789-00",
    assigned_project_id: PROJECT_ID,
    ...overrides,
  } as PersonnelDetailResponse;
}

function renderModal(overrides: Partial<PersonnelDetailResponse> = {}) {
  return render(
    <PersonnelDocumentFormModal personnel={personnel(overrides)} onClose={onClose} />,
  );
}

function selectFile(name = "saglik.pdf") {
  const file = new File(["x"], name, { type: "application/pdf" });
  fireEvent.change(screen.getByLabelText(TEXT.file), { target: { files: [file] } });
  return file;
}

function submit() {
  fireEvent.click(screen.getByRole("button", { name: TEXT.submit }));
}

beforeEach(() => {
  vi.clearAllMocks();
  upload.mockResolvedValue({ id: DOCUMENT_ID });
  create.mockResolvedValue({ id: "kayit-1" });
  vi.mocked(useUploadDocument).mockReturnValue({ mutateAsync: upload, isPending: false } as never);
  vi.mocked(useCreatePersonnelDocument).mockReturnValue({
    mutateAsync: create,
    isPending: false,
  } as never);
  vi.mocked(useHrDocumentsSummary).mockReturnValue({
    data: {
      by_type: [
        { type_id: TYPE_ID, type_name: "Sağlık Raporu (Periyodik Muayene)" },
      ],
    },
    isError: false,
    error: null,
  } as never);
  vi.mocked(usePersonnelDocuments).mockReturnValue({ data: [{ id: "b1" }, { id: "b2" }] } as never);
});

describe("PersonnelDocumentFormModal — XOR kuralı", () => {
  it("tür seçilmeden AĞA ÇIKILMAZ (ikisi de boş gövde 422 olurdu)", async () => {
    renderModal();
    submit();

    expect(create).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
    expect(await screen.findByTestId("pdf-error")).toHaveTextContent("Belge Türü seçin");
  });

  it('"Diğer…" seçilmeden serbest etiket KAPALIdır (mockup 142)', () => {
    renderModal();
    expect(screen.getByTestId("pdf-free-label")).toBeDisabled();

    fireEvent.change(screen.getByTestId("pdf-type"), { target: { value: OTHER_TYPE_VALUE } });
    expect(screen.getByTestId("pdf-free-label")).toBeEnabled();
  });

  it('"Diğer…" seçiliyken boş etiketle AĞA ÇIKILMAZ', async () => {
    renderModal();
    fireEvent.change(screen.getByTestId("pdf-type"), { target: { value: OTHER_TYPE_VALUE } });
    submit();

    expect(create).not.toHaveBeenCalled();
    expect(await screen.findByTestId("pdf-error")).toHaveTextContent("Serbest Etiket zorunludur");
  });

  it("katalog tipi seçilince gövdede `free_label` YOKTUR", async () => {
    renderModal();
    fireEvent.change(screen.getByTestId("pdf-type"), { target: { value: TYPE_ID } });
    submit();

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0][0]).toEqual({ type_id: TYPE_ID });
  });

  it('"Diğer…" gövdesinde `type_id` YOKTUR', async () => {
    renderModal();
    fireEvent.change(screen.getByTestId("pdf-type"), { target: { value: OTHER_TYPE_VALUE } });
    fireEvent.change(screen.getByTestId("pdf-free-label"), {
      target: { value: "Vinç Operatör Belgesi" },
    });
    submit();

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0][0]).toEqual({ free_label: "Vinç Operatör Belgesi" });
  });
});

describe("PersonnelDocumentFormModal — iki adımlı dosya akışı", () => {
  it("dosya önce arşive yüklenir, dönen künye `document_id` olarak bağlanır", async () => {
    renderModal();
    const file = selectFile();
    fireEvent.change(screen.getByTestId("pdf-type"), { target: { value: TYPE_ID } });
    submit();

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(upload).toHaveBeenCalledWith({ file, projectId: PROJECT_ID });
    expect(create.mock.calls[0][0]).toEqual({ type_id: TYPE_ID, document_id: DOCUMENT_ID });
    expect(onClose).toHaveBeenCalled();
  });

  it("dosya seçilmezse hiç yükleme yapılmaz (dosyasız takip meşru)", async () => {
    renderModal();
    fireEvent.change(screen.getByTestId("pdf-type"), { target: { value: TYPE_ID } });
    submit();

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(upload).not.toHaveBeenCalled();
  });

  it("🔴 projesi olmayan personelde dosya yüklenemez: DURUR ve gerekçe GÖRÜNÜR", async () => {
    renderModal({ assigned_project_id: null });
    selectFile();
    fireEvent.change(screen.getByTestId("pdf-type"), { target: { value: TYPE_ID } });
    submit();

    expect(upload).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(await screen.findByTestId("pdf-error")).toHaveTextContent(NO_PROJECT_UPLOAD_REASON);
  });

  it("birinci adım düşerse Türkçe `detail` basılır, ikinci adım DENENMEZ", async () => {
    upload.mockRejectedValue(new BackendError(413, { detail: "Dosya 20 MB sınırını aşıyor." }));
    renderModal();
    selectFile();
    fireEvent.change(screen.getByTestId("pdf-type"), { target: { value: TYPE_ID } });
    submit();

    expect(await screen.findByTestId("pdf-error")).toHaveTextContent(
      "Dosya 20 MB sınırını aşıyor.",
    );
    expect(create).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("🔴 ikinci adım düşerse ÖKSÜZ belge görünür biçimde bildirilir", async () => {
    create.mockRejectedValue(new BackendError(422, { detail: "Belge türü bulunamadı." }));
    renderModal();
    selectFile("saglik.pdf");
    fireEvent.change(screen.getByTestId("pdf-type"), { target: { value: TYPE_ID } });
    submit();

    const error = await screen.findByTestId("pdf-error");
    expect(error).toHaveTextContent("saglik.pdf");
    expect(error).toHaveTextContent("arşive YÜKLENDİ ama personel kaydına bağlanamadı");
    expect(error).toHaveTextContent("Belge türü bulunamadı.");
    expect(error).toHaveTextContent("ikinci kopya oluşmaz");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("🔴 tekrar denemede dosya İKİNCİ KEZ yüklenmez (öksüz kopya üremez)", async () => {
    create.mockRejectedValueOnce(new BackendError(500, { detail: "Sunucu hatası." }));
    renderModal();
    selectFile();
    fireEvent.change(screen.getByTestId("pdf-type"), { target: { value: TYPE_ID } });
    submit();
    await screen.findByTestId("pdf-error");

    submit();
    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    expect(upload).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[1][0]).toEqual({ type_id: TYPE_ID, document_id: DOCUMENT_ID });
  });

  it("🔴 öksüz uyarısı varken BAŞKA dosya seçilince uyarı KAYBOLMAZ", async () => {
    create.mockRejectedValue(new BackendError(422, { detail: "Belge türü bulunamadı." }));
    renderModal();
    selectFile("saglik.pdf");
    fireEvent.change(screen.getByTestId("pdf-type"), { target: { value: TYPE_ID } });
    submit();
    const error = await screen.findByTestId("pdf-error");
    expect(error).toHaveTextContent("saglik.pdf");
    expect(error).toHaveTextContent("arşive YÜKLENDİ ama personel kaydına bağlanamadı");

    // Kullanıcı öksüz uyarıyı okumadan başka bir dosya seçer.
    selectFile("baska.pdf");

    expect(screen.getByTestId("pdf-error")).toHaveTextContent("saglik.pdf");
  });
});

describe("PersonnelDocumentFormModal — M5_3 #172 dosya seçici backend whitelist'iyle eşleşir", () => {
  it("`accept` ham `image/*` DEĞİLDİR — yalnız backend'in kabul ettiği resim uzantıları", () => {
    renderModal();
    const input = screen.getByLabelText(TEXT.file) as HTMLInputElement;
    // config.py `allowed_document_extensions` içindeki resim alt kümesi.
    expect(input.accept).toBe(".pdf,.jpg,.jpeg,.png,.heic");
    expect(input.accept).not.toContain("image/*");
  });
});

describe("PersonnelDocumentFormModal — karşılıksız öğe ve bağlam", () => {
  it("🔴 'Arşivden Mevcut Belge Seç' (108-117) SİLİNMEZ: devre-dışı + görünür gerekçe", () => {
    renderModal();
    expect(screen.getByTestId("pdf-archive-pick")).toBeDisabled();
    expect(screen.getByText(TEXT.archivePickHint)).toBeInTheDocument();
    expect(screen.getByTestId("pdf-archive-pick-reason")).toHaveTextContent(ARCHIVE_PICK_REASON);
  });

  it("devre-dışı seçici gövdeye HİÇ girmez (`document_id` yalnız yüklemeden gelir)", async () => {
    renderModal();
    fireEvent.change(screen.getByTestId("pdf-type"), { target: { value: TYPE_ID } });
    submit();

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0][0]).not.toHaveProperty("document_id");
  });

  it("belge sayacı SUNUCUDAN gelir (mockup 85 '4' göstermelik)", () => {
    renderModal();
    expect(screen.getByTestId("pdf-document-count")).toHaveTextContent("2 belge kayıtlı");
  });

  it("bağlam bandı künyeyi mockup sırasıyla basar (83)", () => {
    renderModal();
    expect(screen.getByTestId("pdf-context")).toHaveTextContent(
      "Kalıpçı Usta · Şirket · SGK: 123-456-789-00",
    );
  });

  it("'Belge Takibi →' bağlantısı GERÇEK rotaya gider (160)", () => {
    renderModal();
    expect(screen.getByRole("link", { name: TEXT.ohsWarningLink })).toHaveAttribute(
      "href",
      "/personel/belgeler",
    );
  });

  it("tip kataloğu düşerse GÖRÜNÜR uyarı basılır (sessiz boş liste yok)", () => {
    vi.mocked(useHrDocumentsSummary).mockReturnValue({
      data: undefined,
      isError: true,
      error: new Error("x"),
    } as never);
    renderModal();
    expect(screen.getByTestId("pdf-types-error")).toHaveTextContent("kataloğu yüklenemedi");
  });
});

describe("PersonnelDocumentFormModal — SEKME-F1.3b kaydedilmemiş değişiklik kaydı", () => {
  it("açıldı/dokunulmadı → false; belge türü seçildi → true; başarılı kayıt → false (kapanış)", async () => {
    let unmount = () => {};
    const wrappedOnClose = vi.fn(() => unmount());
    ({ unmount } = render(
      <PersonnelDocumentFormModal personnel={personnel()} onClose={wrappedOnClose} />,
    ));
    expect(unsavedRegistry.hasUnsaved()).toBe(false);

    fireEvent.change(screen.getByTestId("pdf-type"), { target: { value: TYPE_ID } });
    expect(unsavedRegistry.hasUnsaved()).toBe(true);

    submit();
    await waitFor(() => expect(unsavedRegistry.hasUnsaved()).toBe(false));
  });
});
