"use client";

import { useState } from "react";

import { Button, Field, FileInput, Select, Textarea } from "@/components/ui";
import { Modal } from "@/components/settings/Modal";
import { backendErrorMessage } from "@/lib/api/error-message";
import type { DocumentUploadInput } from "@/lib/api/documents-client";
import type { DocumentFolderRead } from "@/lib/api/hooks/useDocumentFolders";
import { useUploadDocument } from "@/lib/api/hooks/useDocumentMutations";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";
import "@/components/settings/settings.css";
import "@/styles/form-shell.css";

export interface DocumentUploadModalProps {
  /** Yükleme kapsamı — her istekte ZORUNLU. */
  projectId: string;
  /**
   * ⚠️ İSTEĞE BAĞLI ve `undefined` ANLAMLIDIR: verilmezse istekte `site_id`
   * HİÇ geçmez ve kayıt PROJE DÜZEYİNDE (`site_id IS NULL`) oluşur. Boş dize
   * geçmek gerçek backend'de 422 üretir — `siteId ?? ""` YAZMAYIN.
   */
  siteId?: string;
  /** Hedef klasör seçeneği listesi (çağıran ekranın kapsamındaki klasörler). */
  folders: readonly DocumentFolderRead[];
  /** Ekranda seçili klasör — diyalogda VARSAYILAN hedef olur (spec §6 S1). */
  activeFolderId?: string;
  onClose: () => void;
}

/** Klasörsüz (kök) yükleme seçeneğinin `<option>` değeri. */
const NO_FOLDER = "";

/**
 * "Belge Yükle" diyaloğu — spec §6 S1 (ONAYLI KULLANICI KARARI): mockup form
 * ÇİZMEZ, bu yüzden ekranın kendi dilinden TÜRETİLMİŞ MİNİMAL form basılır:
 * dosya + hedef klasör (aktif klasör varsayılan) + isteğe bağlı açıklama.
 * Sürükle-bırak, çoklu dosya, ilerleme çubuğu, etiket/versiyon alanı İCAT
 * EDİLMEZ (spec §4 BASILMAYANLAR).
 *
 * Kapsam-bağımsızdır: ŞB (şantiye) ve E12 (proje düzeyi) ekranları AYNI
 * diyaloğu kullanır; tek fark `siteId` prop'unun verilip verilmemesidir.
 */
export function DocumentUploadModal({
  projectId,
  siteId,
  folders,
  activeFolderId,
  onClose,
}: DocumentUploadModalProps) {
  const uploadDocument = useUploadDocument();

  const [file, setFile] = useState<File | null>(null);
  const [folderId, setFolderId] = useState(activeFolderId ?? NO_FOLDER);
  const [description, setDescription] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const isPending = uploadDocument.isPending;
  // SEKME-F1.3b — `File` `JSON.stringify` ile KIYASLANAMAZ, ayrı `!== null`.
  const isDirty =
    file !== null || description.trim() !== "" || folderId !== (activeFolderId ?? NO_FOLDER);
  // Kayıt 50/ortak emir §7 — `Modal`a `isDirty` VERİLMEZ; doğrudan bağlanır.
  useUnsavedChanges(isDirty, "Belge yükleme formu");

  function handleSubmit() {
    if (!file) {
      setFormError("Bir dosya seçin.");
      return;
    }
    setFormError(null);

    // Boş bırakılan alanlar GÖVDEYE HİÇ eklenmez (EmployerFormModal deseni);
    // `site_id` için bu bir üslup tercihi değil, kapsam semantiğidir.
    const input: DocumentUploadInput = {
      file,
      projectId,
      ...(siteId !== undefined ? { siteId } : {}),
      ...(folderId !== NO_FOLDER ? { folderId } : {}),
      ...(description.trim() ? { description: description.trim() } : {}),
    };

    uploadDocument.mutate(input, {
      onSuccess: () => onClose(),
      // 413 (boyut aşımı) / 422 (uzantı reddi) gövdesindeki Türkçe `detail`
      // OLDUĞU GİBİ basılır — backend zaten kullanıcıya hazır mesaj döner.
      onError: (error) => setFormError(backendErrorMessage(error, "Belge yüklenemedi.")),
    });
  }

  return (
    <Modal
      title="Belge Yükle"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            Vazgeç
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={isPending}>
            Yükle
          </Button>
        </>
      }
    >
      <div className="settings-form">
        <Field label="Dosya" required>
          {(control) => (
            <FileInput
              {...control}
              status={formError && !file ? "error" : "default"}
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setFormError(null);
              }}
            />
          )}
        </Field>

        <Field label="Klasör" hint="Boş bırakılırsa belge klasörsüz yüklenir.">
          {(control) => (
            <Select
              {...control}
              value={folderId}
              onChange={(event) => setFolderId(event.target.value)}
            >
              <option value={NO_FOLDER}>Klasörsüz</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label="Açıklama">
          {(control) => (
            <Textarea
              {...control}
              // Kayıt 73 — backend `description` max_length=2000 dayatır;
              // istemci tavanı taşımıyordu.
              maxLength={2000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          )}
        </Field>

        {formError && <p className="pf-form-error">{formError}</p>}
      </div>
    </Modal>
  );
}
