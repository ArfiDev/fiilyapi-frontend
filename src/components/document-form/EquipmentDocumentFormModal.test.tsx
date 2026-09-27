import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";

import { BackendError } from "@/lib/api/unwrap";
import type { EquipmentResponse } from "@/lib/api/hooks/useEquipment";
import {
  useEquipmentDocumentTypes,
  useEquipmentDocuments,
} from "@/lib/api/hooks/useEquipmentDocuments";
import { useUploadEquipmentDocument } from "@/lib/api/hooks/useEquipmentDocumentMutations";

import { EquipmentDocumentFormModal } from "./EquipmentDocumentFormModal";
import {
  EQUIPMENT_DOCUMENT_NO_REASON,
  EQUIPMENT_DOCUMENT_TEXT as TEXT,
  EQUIPMENT_ISSUE_DATE_REASON,
  EQUIPMENT_NOTE_REASON,
} from "./constants";

vi.mock("@/lib/api/hooks/useEquipmentDocuments", () => ({
  useEquipmentDocumentTypes: vi.fn(),
  useEquipmentDocuments: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useEquipmentDocumentMutations", () => ({
  useUploadEquipmentDocument: vi.fn(),
}));

const EQUIPMENT_ID = "eeeeeeee-0000-0000-0000-000000000001";
const TYPE_ID = "tttttttt-0000-0000-0000-000000000001";

// Yalnız formun okuduğu alanlar anlamlıdır; gerisi şema gereği doldurulur.
const EQUIPMENT = {
  id: EQUIPMENT_ID,
  name: "Tower Crane TC-48",
  category: "crane",
  brand: "Liebherr",
  plate_no: "06 TC 4800",
  site_id: null,
} as unknown as EquipmentResponse;

const upload = vi.fn();
const onClose = vi.fn();

function renderModal() {
  return render(
    <EquipmentDocumentFormModal
      equipment={EQUIPMENT}
      siteLabel="Güneşkent A-Blok"
      categoryIcon="🏗"
      ownershipLabel="Kiralık"
      onClose={onClose}
    />,
  );
}

function selectFile() {
  const file = new File(["x"], "ruhsat.pdf", { type: "application/pdf" });
  fireEvent.change(screen.getByLabelText(TEXT.file), { target: { files: [file] } });
  return file;
}

beforeEach(() => {
  vi.clearAllMocks();
  upload.mockResolvedValue({});
  vi.mocked(useEquipmentDocumentTypes).mockReturnValue({
    data: { items: [{ id: TYPE_ID, code: "license", name: "Ruhsat / Tescil Belgesi" }] },
    isError: false,
    error: null,
  } as never);
  vi.mocked(useEquipmentDocuments).mockReturnValue({
    data: { items: [{}, {}, {}, {}] },
  } as never);
  vi.mocked(useUploadEquipmentDocument).mockReturnValue({
    mutateAsync: upload,
    isPending: false,
  } as never);
});

describe("EquipmentDocumentFormModal (EKP · Form - Ekipman Belgesi)", () => {
  it("dosya seçilmeden AĞA ÇIKMAZ; hata GÖRÜNÜR basılır (mockup 86)", async () => {
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: TEXT.submit }));

    expect(upload).not.toHaveBeenCalled();
    expect(await screen.findByTestId("edf-error")).toHaveTextContent("Bir dosya seçin.");
  });

  it("belge türü seçilmeden AĞA ÇIKMAZ (mockup 100 `*`)", async () => {
    renderModal();
    selectFile();
    fireEvent.click(screen.getByRole("button", { name: TEXT.submit }));

    expect(upload).not.toHaveBeenCalled();
    expect(await screen.findByTestId("edf-error")).toHaveTextContent("Belge Türü zorunludur.");
  });

  it("🔴 devre-dışı üç öğe SİLİNMEZ: Belge No · Düzenlenme Tarihi · Not (111-118, 147-151)", () => {
    renderModal();

    expect(screen.getByTestId("edf-document-no")).toBeDisabled();
    expect(screen.getByTestId("edf-issue-date")).toBeDisabled();
    expect(screen.getByTestId("edf-note")).toBeDisabled();

    // Gerekçe `title`da SAKLANMAZ, ekranda okunur (F-TH kanonu).
    expect(screen.getByText(EQUIPMENT_DOCUMENT_NO_REASON)).toBeInTheDocument();
    expect(screen.getByText(EQUIPMENT_ISSUE_DATE_REASON)).toBeInTheDocument();
    expect(screen.getByTestId("edf-note-reason")).toHaveTextContent(EQUIPMENT_NOTE_REASON);
  });

  // Kayıt 61 — `FileInput`e `disabled={isPending}` EKSİKTİ; yükleme
  // sürüyorken (ikinci tıklamada) diğer alanlar kilitlenirken dosya seçici
  // hâlâ etkileşime açık kalıyordu.
  it("yükleme sürerken (isPending) dosya seçici de diğer alanlar gibi kilitlenir (kayıt 61)", () => {
    vi.mocked(useUploadEquipmentDocument).mockReturnValue({
      mutateAsync: upload,
      isPending: true,
    } as never);
    renderModal();
    expect(screen.getByLabelText(TEXT.file)).toBeDisabled();
  });

  // Kayıt 65/83 — backend beyaz listesi (pdf/jpg/jpeg/png/heic) `image/*`i
  // kapsamıyordu (svg/gif/webp vb. seçilebilir ama 422 alırdı); tavan da
  // 20 MB değil 50 MB'dır.
  it("dosya seçici yalnız backend beyaz listesindeki uzantıları kabul eder, tavan 50 MB yazar (kayıt 65/83)", () => {
    renderModal();
    expect(screen.getByLabelText(TEXT.file)).toHaveAttribute("accept", ".pdf,.jpg,.jpeg,.png,.heic");
    expect(screen.getByText("PDF veya fotoğraf · Maks 50 MB")).toBeInTheDocument();
  });

  it("🔴 devre-dışı alanlar gövdeye GİRMEZ — istek yalnız file/type_id taşır", async () => {
    renderModal();
    const file = selectFile();
    fireEvent.change(screen.getByTestId("edf-type"), { target: { value: TYPE_ID } });
    fireEvent.click(screen.getByRole("button", { name: TEXT.submit }));

    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    expect(upload).toHaveBeenCalledWith({
      equipmentId: EQUIPMENT_ID,
      file,
      typeId: TYPE_ID,
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("geçerlilik tarihi doluysa gövdeye eklenir (mockup 119-123)", async () => {
    renderModal();
    selectFile();
    fireEvent.change(screen.getByTestId("edf-type"), { target: { value: TYPE_ID } });
    fireEvent.change(screen.getByTestId("edf-valid-until"), { target: { value: "01.03.2027" } });
    fireEvent.click(screen.getByRole("button", { name: TEXT.submit }));

    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    expect(upload.mock.calls[0][0]).toMatchObject({ validUntil: "2027-03-01" });
  });

  it("sunucu hatası YUTULMAZ — Türkçe `detail` basılır ve diyalog KAPANMAZ", async () => {
    upload.mockRejectedValue(new BackendError(413, { detail: "Dosya 20 MB sınırını aşıyor." }));
    renderModal();
    selectFile();
    fireEvent.change(screen.getByTestId("edf-type"), { target: { value: TYPE_ID } });
    fireEvent.click(screen.getByRole("button", { name: TEXT.submit }));

    expect(await screen.findByTestId("edf-error")).toHaveTextContent(
      "Dosya 20 MB sınırını aşıyor.",
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it("bağlam bandındaki sayaç SUNUCUDAN gelir (mockup 81 rakamı göstermelik)", () => {
    renderModal();
    expect(screen.getByTestId("edf-document-count")).toHaveTextContent(
      `4 ${TEXT.documentCountSuffix}`,
    );
    expect(screen.getByTestId("edf-context")).toHaveTextContent(
      "Liebherr · Plaka: 06 TC 4800 · Kiralık · Güneşkent A-Blok",
    );
  });

  it("rozet önizleme kutusu (126-143) aynen basılır — salt-görsel", () => {
    renderModal();
    const legend = screen.getByTestId("edf-badge-legend");
    expect(legend).toHaveTextContent("Geçerli");
    expect(legend).toHaveTextContent("Yakında Doluyor");
    expect(legend).toHaveTextContent("Süresi Doldu");
  });
});

/** SEKME-F1.3b · merkezi kayda bağlanma bekçisi. */
describe("EquipmentDocumentFormModal — kaydedilmemiş değişiklik kaydı", () => {
  it("açıldı, dokunulmadı → temiz", () => {
    renderModal();
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });

  it("dosya seçildi → kirli", () => {
    renderModal();
    selectFile();
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
  });

  it("başarılı kayıt sonrası (onClose çağrılır, unmount) → temiz", async () => {
    const { unmount } = renderModal();
    const file = selectFile();
    fireEvent.change(screen.getByTestId("edf-type"), { target: { value: TYPE_ID } });
    fireEvent.click(screen.getByRole("button", { name: TEXT.submit }));
    await waitFor(() => expect(upload).toHaveBeenCalledWith({ equipmentId: EQUIPMENT_ID, file, typeId: TYPE_ID }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    unmount();
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });
});
