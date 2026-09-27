"use client";

import { useRef, useState } from "react";

import { Button, Checkbox, Field, FileInput, Input, Select, Textarea } from "@/components/ui";
import { Modal } from "@/components/settings/Modal";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";
import { backendErrorMessage } from "@/lib/api/error-message";
import { useDocumentFolders } from "@/lib/api/hooks/useDocumentFolders";
import { useUploadDocument } from "@/lib/api/hooks/useDocumentMutations";
import { useProjects } from "@/lib/api/hooks/useProjects";
import { useSites } from "@/lib/api/hooks/useSites";

import { buildArchiveDocumentInput } from "./build-input";
import {
  ARCHIVE_DOCUMENT_NAME_REASON,
  ARCHIVE_DOCUMENT_TEXT as TEXT,
  ARCHIVE_FOLDER_NEEDS_PROJECT_REASON,
  ARCHIVE_SITE_NEEDS_PROJECT_REASON,
  EMPTY_OPTION_VALUE,
  MAX_LENGTH,
} from "./constants";
import {
  validateArchiveDocument,
  type ArchiveDocumentField,
  type ArchiveDocumentFormValues,
} from "./validate";
import "./document-form.css";

/**
 * ARŞ · `Form - Belge Ekle.dc.html` (F-BLG T2b).
 * Uç: `POST /documents` (multipart) — mevcut `useUploadDocument` hook'u.
 *
 * ⚠️ Bu form `components/documents/DocumentUploadModal.tsx`in YERİNE GEÇMEZ:
 * o diyalog PROJE KAPSAMINDA açılan akışa hizmet eder (`projectId` prop'u
 * ZORUNLU) ve kendi görsel baseline'ları vardır. Bu mockup ise projeyi formun
 * İÇİNDE seçtirir (87-96), yani ayrı bir yüzeydir.
 *
 * 🔴 "Belge Adı" (121-125) SİLİNMEZ: `Body_upload_document_endpoint_documents_post`
 * böyle bir alan tanımlamaz (`filename` yalnız `PATCH` ile değişir) — alan
 * devre-dışı basılır, mockup hint'i korunur, gerekçe GÖRÜNÜR durur.
 */
export interface ArchiveDocumentFormModalProps {
  /** Ekranda proje zaten seçiliyse form o projeyle açılır (mockup 90 seçili). */
  initialProjectId?: string;
  onClose: () => void;
}

function emptyValues(projectId: string): ArchiveDocumentFormValues {
  return {
    file: null,
    projectId,
    siteId: EMPTY_OPTION_VALUE,
    folderId: EMPTY_OPTION_VALUE,
    description: "",
  };
}

export function ArchiveDocumentFormModal({
  initialProjectId,
  onClose,
}: ArchiveDocumentFormModalProps) {
  const [values, setValues] = useState<ArchiveDocumentFormValues>(() =>
    emptyValues(initialProjectId ?? EMPTY_OPTION_VALUE),
  );
  // SEKME-F1.3b — taban anlık görüntüsü. `File` `JSON.stringify` ile
  // KIYASLANAMAZ (her zaman "{}") — `file !== null` ayrı kontrol edilir.
  const [initialValues, setInitialValues] = useState(values);
  const isDirty =
    values.file !== null ||
    values.description !== initialValues.description ||
    values.projectId !== initialValues.projectId ||
    values.siteId !== initialValues.siteId ||
    values.folderId !== initialValues.folderId;
  // Kayıt 50/ortak emir §7 — `Modal`a `isDirty` VERİLMEZ; doğrudan bağlanır.
  useUnsavedChanges(isDirty, "Belge arşiv formu");
  const [keepOpen, setKeepOpen] = useState(false); // 138 · mockup'ta İŞARETSİZ
  const [formError, setFormError] = useState<string | null>(null);
  const [savedName, setSavedName] = useState<string | null>(null);

  const projectsQuery = useProjects();
  // 🔴 Boş-id kapısı: proje seçilmeden şantiye sorgusu AĞA ÇIKMAZ
  // (`useSites` `enabled: projectId.length > 0`).
  const sitesQuery = useSites(values.projectId);
  // Seçili şantiye VARSA klasör sorgusu O ŞANTİYE ile süzülür: geçmemek
  // "proje düzeyi" demektir (site_id IS NULL), backend `folder.site_id !=
  // site_id` kontrolüyle şantiye+klasör birlikte seçilen her gönderimi 422
  // (FOLDER_SCOPE_MISMATCH) ile reddederdi.
  const foldersQuery = useDocumentFolders(
    values.projectId,
    values.siteId ? values.siteId : undefined,
  );
  const uploadDocument = useUploadDocument();

  const fileRef = useRef<HTMLInputElement>(null);
  const projectRef = useRef<HTMLSelectElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  const isPending = uploadDocument.isPending;
  const hasProject = values.projectId.length > 0;
  const projects = projectsQuery.data?.items ?? [];
  const sites = hasProject ? (sitesQuery.data?.items ?? []) : [];
  const folders = hasProject ? (foldersQuery.data?.folders ?? []) : [];

  function set<K extends keyof ArchiveDocumentFormValues>(
    key: K,
    value: ArchiveDocumentFormValues[K],
  ) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  /**
   * Proje değişince şantiye VE klasör seçimi DÜŞER: iki kimlik de projeye
   * aittir, taşınırsa başka projenin kapsamına yabancı bir id gönderilirdi
   * (`ArchiveDocumentsView.projectHref` ile aynı karar).
   */
  function handleProjectChange(projectId: string) {
    setValues((prev) => ({
      ...prev,
      projectId,
      siteId: EMPTY_OPTION_VALUE,
      folderId: EMPTY_OPTION_VALUE,
    }));
    setFormError(null);
  }

  /**
   * Şantiye değişince klasör seçimi DÜŞER: klasör listesi seçili şantiyeye
   * göre sorgulanır (yukarıdaki `foldersQuery`), önceki seçim artık başka
   * bir kapsama ait olabilir.
   */
  function handleSiteChange(siteId: string) {
    setValues((prev) => ({ ...prev, siteId, folderId: EMPTY_OPTION_VALUE }));
  }

  function focusField(field: ArchiveDocumentField) {
    const map: Record<ArchiveDocumentField, { focus: () => void } | null> = {
      file: fileRef.current,
      projectId: projectRef.current,
      description: descriptionRef.current,
    };
    map[field]?.focus();
  }

  async function handleSubmit() {
    const problem = validateArchiveDocument(values);
    if (problem) {
      setSavedName(null);
      setFormError(problem.message);
      focusField(problem.field);
      return;
    }
    setFormError(null);

    const file = values.file;
    if (!file) return;

    try {
      await uploadDocument.mutateAsync(buildArchiveDocumentInput(values, file));
    } catch (error) {
      setSavedName(null);
      // 413 (boyut aşımı) / 422 (uzantı reddi) gövdesindeki Türkçe `detail`
      // OLDUĞU GİBİ basılır.
      setFormError(backendErrorMessage(error, "Belge yüklenemedi."));
      return;
    }

    // 139 · "Yükledikten sonra başka belge ekle" işaretliyse form SIFIRLANIR
    // ve diyalog AÇIK kalır; değilse kapanır.
    if (!keepOpen) {
      onClose();
      return;
    }
    setSavedName(file.name);
    // Proje/şantiye/klasör seçimi KORUNUR: art arda yükleme aynı kapsamda
    // yapılır, kullanıcı her belgede yeniden seçmez. Taban da AYNI KISMİ
    // sıfırlamayla tazelenir — korunan alanlar yeni "temiz" durumdur.
    setValues((prev) => ({ ...prev, file: null, description: "" }));
    setInitialValues({ ...values, file: null, description: "" });
    if (fileRef.current) fileRef.current.value = "";
    fileRef.current?.focus();
  }

  return (
    <Modal
      title={TEXT.title}
      className="dcf-modal"
      onClose={onClose}
      footer={
        <>
          {/* 136-140 · onay kutusu şeridin SOLUNDA */}
          <span className="dcf__keep-open">
            <Checkbox
              size="lg"
              label={TEXT.keepOpen}
              checked={keepOpen}
              disabled={isPending}
              onChange={(event) => setKeepOpen(event.target.checked)}
              data-testid="adf-keep-open"
            />
          </span>
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            {TEXT.cancel}
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={isPending}>
            {TEXT.submit}
          </Button>
        </>
      }
    >
      <p className="dcf__subtitle">{TEXT.subtitle}</p>

      {/* 71-80 · Dosya */}
      <section className="dcf-card">
        <h3 className="dcf-card__title">
          {TEXT.fileCard}{" "}
          <span className="dcf-card__req" aria-hidden="true">
            *
          </span>
        </h3>
        <div className="dcf-drop">
          <span className="dcf-drop__title">{TEXT.dropTitle}</span>
          <span className="dcf-drop__hint">{TEXT.dropHint}</span>
          <Field label={TEXT.file} required className="dcf-drop__control">
            {(control) => (
              <FileInput
                {...control}
                ref={fileRef}
                disabled={isPending}
                status={formError && !values.file ? "error" : "default"}
                onChange={(event) => {
                  set("file", event.target.files?.[0] ?? null);
                  setFormError(null);
                  setSavedName(null);
                }}
              />
            )}
          </Field>
        </div>
      </section>

      {/* 82-127 · İlişkilendirme */}
      <section className="dcf-card">
        <h3 className="dcf-card__title">{TEXT.relationCard}</h3>
        <div className="dcf-grid">
          {/* 86-97 · Proje */}
          <Field label={TEXT.project} required hint={TEXT.projectHint}>
            {(control) => (
              <Select
                {...control}
                ref={projectRef}
                value={values.projectId}
                disabled={isPending}
                onChange={(event) => handleProjectChange(event.target.value)}
                data-testid="adf-project"
              >
                <option value={EMPTY_OPTION_VALUE}>{TEXT.projectPlaceholderOption}</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          {/* 98-106 · Şantiye — proje seçilene kadar KAPALI (mockup notu 34) */}
          <Field
            label={TEXT.site}
            hint={hasProject ? TEXT.siteHint : ARCHIVE_SITE_NEEDS_PROJECT_REASON}
          >
            {(control) => (
              <Select
                {...control}
                value={values.siteId}
                disabled={isPending || !hasProject}
                onChange={(event) => handleSiteChange(event.target.value)}
                data-testid="adf-site"
              >
                <option value={EMPTY_OPTION_VALUE}>{TEXT.siteEmptyOption}</option>
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          {/* 107-120 · Klasör — kaynak `document-folders` */}
          <Field label={TEXT.folder} hint={hasProject ? undefined : ARCHIVE_FOLDER_NEEDS_PROJECT_REASON}>
            {(control) => (
              <Select
                {...control}
                value={values.folderId}
                disabled={isPending || !hasProject}
                onChange={(event) => set("folderId", event.target.value)}
                data-testid="adf-folder"
              >
                <option value={EMPTY_OPTION_VALUE}>{TEXT.folderEmptyOption}</option>
                {folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          {/* 🔴 121-125 · karşılığı YOK — devre-dışı; mockup hint'i (124) KORUNUR */}
          <Field label={TEXT.documentName} hint={TEXT.documentNameHint}>
            {(control) => (
              <Input
                {...control}
                disabled
                readOnly
                value=""
                placeholder={TEXT.documentNamePlaceholder}
                data-testid="adf-document-name"
                onChange={() => undefined}
              />
            )}
          </Field>
        </div>
        <p className="dcf-readonly-note" data-testid="adf-document-name-reason">
          {ARCHIVE_DOCUMENT_NAME_REASON}
        </p>
      </section>

      {/* 129-134 · Açıklama */}
      <section className="dcf-card dcf-card--flush">
        <h3 className="dcf-card__title">{TEXT.descriptionCard}</h3>
        <Field label={TEXT.description} hint={TEXT.descriptionHint}>
          {(control) => (
            <Textarea
              {...control}
              ref={descriptionRef}
              rows={4}
              maxLength={MAX_LENGTH.description}
              placeholder={TEXT.descriptionPlaceholder}
              value={values.description}
              disabled={isPending}
              onChange={(event) => set("description", event.target.value)}
              data-testid="adf-description"
            />
          )}
        </Field>
      </section>

      {projectsQuery.isError && (
        <p className="dcf__error" data-testid="adf-projects-error">
          {backendErrorMessage(projectsQuery.error, "Projeler yüklenemedi.")}
        </p>
      )}
      {sitesQuery.isError && (
        <p className="dcf__error" data-testid="adf-sites-error">
          {backendErrorMessage(sitesQuery.error, "Şantiyeler yüklenemedi.")}
        </p>
      )}
      {foldersQuery.isError && (
        <p className="dcf__error" data-testid="adf-folders-error">
          {backendErrorMessage(foldersQuery.error, "Klasörler yüklenemedi.")}
        </p>
      )}
      {formError && (
        <p className="dcf__error" data-testid="adf-error">
          {formError}
        </p>
      )}
      {savedName && !formError && (
        <p className="dcf__saved" data-testid="adf-saved">
          {savedName} yüklendi.
        </p>
      )}
    </Modal>
  );
}
