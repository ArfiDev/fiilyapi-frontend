"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { ArchiveDocumentFormModal } from "@/components/document-form/ArchiveDocumentFormModal";
import { AccessDenied } from "@/components/settings/AccessDenied";
import { Button } from "@/components/ui/button/Button";
import { Input } from "@/components/ui/input/Input";
import { SearchIcon } from "@/components/ui/icons";
import { backendErrorMessage } from "@/lib/api/error-message";
import { downloadDocument } from "@/lib/api/documents-client";
import { useDocumentFolders } from "@/lib/api/hooks/useDocumentFolders";
import { useDocuments, type DocumentRead } from "@/lib/api/hooks/useDocuments";
import { useProjects } from "@/lib/api/hooks/useProjects";
import { BackendError } from "@/lib/api/unwrap";
import { hasAtLeast } from "@/lib/auth/permissions";
import { useModulePermission } from "@/lib/auth/useModulePermission";
import { DOCUMENTS_EDIT, DOCUMENTS_VIEW } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";

import { DocumentCardGrid } from "./DocumentCardGrid";
import { DocumentFolderModal } from "./DocumentFolderModal";
import { DocumentFolderPanel, type DocumentFolderRoot } from "./DocumentFolderPanel";
import { DocumentUploadModal } from "./DocumentUploadModal";
import { documentGridMessage } from "./grid-message";
import { RecentDocumentsList } from "./RecentDocumentsList";
import { recentDocuments } from "./recent-documents";
import { PROJECT_PARAM } from "@/lib/navigation-params";
import "./documents.css";

/**
 * F-BLG T3/G3 — E12'de İKİ yükleme girişi yan yana durur ve yönetim ikisinin
 * de kalmasına karar verdi. Kullanıcının ayırt edebilmesi ŞARTTIR:
 *
 *   • "↑ Yükle" (`DocumentUploadModal`) — YALNIZ bir proje seçiliyken basılır
 *     ve o an EKRANDA SEÇİLİ olan proje/şantiye/klasör kapsamına yükler.
 *   • bu düğme (`ArchiveDocumentFormModal`) — kapsamı KENDİ İÇİNDE seçtiren
 *     bağımsız akıştır, ekranda proje seçili olmasa da açılır.
 *
 * Ayırt edici ETİKETTEDİR (ekranda okunur); `title` özniteliğine saklanmaz —
 * bu dilimin kanonu gerekçenin görünür kalmasıdır.
 */
export const ARCHIVE_ADD_DOCUMENT_LABEL = "+ Belge Ekle (proje seçerek)";

/** URL durumu anahtarları — proje/klasör/arama paylaşılabilir olmalı. */
const FOLDER_PARAM = "folder";
const QUERY_PARAM = "q";

/**
 * 🔴 `GET /documents` `q` parametresinin sözleşme tavanı **150**dir ve arama
 * kutusunda korkuluk YOKTU: 151. karakterden itibaren HER TUŞ VURUŞU 422
 * üretiyordu (arama her değişimde istek atar). Sayı sözleşmeden ölçülmüştür
 * ve `form-limits.contract.test.ts` ikisini karşılaştırır.
 */
export const DOCUMENT_SEARCH_MAX_LENGTH = 150;

/** Klasör panelinin durum metni (proje listesi + seçili projenin klasörleri). */
function folderPanelMessage(options: {
  isProjectsLoading: boolean;
  isProjectsError: boolean;
  hasProjects: boolean;
  hasSelection: boolean;
  isFoldersLoading: boolean;
  isFoldersError: boolean;
  hasFolders: boolean;
}): string | undefined {
  if (options.isProjectsLoading) return "Projeler yükleniyor…";
  if (options.isProjectsError) return "Projeler yüklenemedi.";
  if (!options.hasProjects) return "Görüntüleyebileceğiniz proje yok.";
  if (!options.hasSelection) return undefined;
  if (options.isFoldersLoading) return "Klasörler yükleniyor…";
  if (options.isFoldersError) return "Klasörler yüklenemedi.";
  return options.hasFolders ? undefined : "Bu projede henüz klasör yok.";
}

/**
 * Ekran 12 · Belge Arşivi — mockup `Ekran 12 - Belge Arşivi.dc.html` (E12,
 * kanonik). Yorumlardaki sayılar o dosyanın SATIR numaralarıdır.
 *
 * Rota `/belgeler` (kabuk `(app)` içinde; [...slug] catch-all bu segment için
 * devre dışı kalır). Mockup'ın KENDİ sol menüsü (42-65), üst barı (20-39) ve
 * bağlam çipi (26-31) BASILMAZ — kabuk canon kazanır (spec §2, F-PL emsali).
 * Üst bardaki "Belge ara..." kutusu (35) kaybolmasın diye ŞB ekranındaki
 * yerleşimin AYNISIYLA başlık şeridine iner.
 *
 * ⚠️⚠️ KAPSAM KURALI (spec §2, bu dilimin en kritik kuralı): bu ekranın
 * isteklerinde `site_id` GEÇİLMEZ. Geçmemek "hepsi" DEMEK DEĞİLDİR — backend
 * `site_id IS NULL` semantiğiyle YALNIZ proje düzeyi kayıtları döner. Şantiye
 * kırılımı E12'de YOKTUR (ŞB ekranının işi); burada bir şantiye belgesi
 * görünüyorsa KUSURDUR (jsdom + e2e testleriyle çivili).
 */
export function ArchiveDocumentsView() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const permission = useModulePermission("documents");
  const canViewDocuments = useButtonGate({ pages: DOCUMENTS_VIEW, need: "view", fallback: permission.canView });
  // Yazma yüzeyi `full` ister; `documents:admin` (silme) İMA EDİLMEZ — spec §4.
  // IZN-F2.x · belge yükle/klasör = mali.belge_arsivi/proje.belgeler/santiye.belgeler Düzenler (VEYA).
  const canWrite = useButtonGate({
    pages: DOCUMENTS_EDIT,
    need: "edit",
    fallback: hasAtLeast(permission.level, "full"),
  });

  const selectedProjectId = searchParams.get(PROJECT_PARAM) ?? "";
  const activeFolderId = searchParams.get(FOLDER_PARAM) ?? undefined;
  const query = searchParams.get(QUERY_PARAM) ?? "";

  // Panelin KÖKLERİ = görünür projeler (spec §6 S4). Backend zaten yalnız
  // kullanıcının erişebildiği projeleri döner.
  const projectsQuery = useProjects();
  // ⚠️ İKİNCİ ARGÜMAN (siteId) VERİLMEZ — proje düzeyi kapsam.
  const foldersQuery = useDocumentFolders(selectedProjectId);
  const documentsQuery = useDocuments(selectedProjectId, {
    folderId: activeFolderId,
    q: query.length > 0 ? query : undefined,
  });

  const [downloadError, setDownloadError] = useState<string | undefined>(undefined);
  // "belge-ekle" = F-BLG T2b `Form - Belge Ekle.dc.html` yüzeyi: projeyi
  // formun İÇİNDE seçtirir, bu yüzden ekranda proje seçili OLMASA da açılır.
  // "upload" (mevcut proje-kapsamlı diyalog) DURUYOR — iki akış ayrıdır.
  const [openDialog, setOpenDialog] = useState<"upload" | "folder" | "belge-ekle" | null>(null);

  const isForbidden =
    (documentsQuery.error instanceof BackendError && documentsQuery.error.status === 403) ||
    (foldersQuery.error instanceof BackendError && foldersQuery.error.status === 403);

  if (!canViewDocuments || isForbidden) return <AccessDenied />;

  const projects = projectsQuery.data?.items ?? [];
  const folders = selectedProjectId ? (foldersQuery.data?.folders ?? []) : [];
  const documents = selectedProjectId ? (documentsQuery.data?.documents ?? []) : [];
  const folderNames = new Map(folders.map((folder) => [folder.id, folder.name]));
  const selectedProject = projects.find((project) => project.id === selectedProjectId);
  const activeFolderName = activeFolderId ? folderNames.get(activeFolderId) : undefined;
  // Tarih dallarının ("Bugün"/"Dün") referansı TEK yerden verilir.
  const now = new Date();

  /**
   * Proje bağlantısı: klasör süzgecini DÜŞÜRÜR (klasör kimlikleri projeye
   * aittir; taşınırsa başka projede boş liste çıkardı). Arama KORUNUR.
   */
  function projectHref(projectId: string): string {
    const params = new URLSearchParams(searchParams.toString());
    params.set(PROJECT_PARAM, projectId);
    params.delete(FOLDER_PARAM);
    return `${pathname}?${params.toString()}`;
  }

  /** Klasör bağlantısı proje seçimini ve aramayı KORUR. */
  function folderHref(folderId?: string): string {
    const params = new URLSearchParams(searchParams.toString());
    if (folderId) params.set(FOLDER_PARAM, folderId);
    else params.delete(FOLDER_PARAM);
    const next = params.toString();
    return next.length > 0 ? `${pathname}?${next}` : pathname;
  }

  function pushQuery(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value.length > 0) params.set(QUERY_PARAM, value);
    else params.delete(QUERY_PARAM);
    const next = params.toString();
    router.replace(next.length > 0 ? `${pathname}?${next}` : pathname, { scroll: false });
  }

  async function handleDownload(document: DocumentRead) {
    setDownloadError(undefined);
    try {
      await downloadDocument(document.id, document.filename);
    } catch (error) {
      // Sessiz yutma YOK: gövdedeki Türkçe `detail` basılır.
      setDownloadError(backendErrorMessage(error, "Belge indirilemedi."));
    }
  }

  // E12 75-111 — her proje bir kök; YALNIZ seçili projenin klasörleri açılır
  // (mockup da tek projeyi açık çizer).
  const roots: DocumentFolderRoot[] = projects.map((project) => ({
    key: project.id,
    label: project.name,
    href: projectHref(project.id),
    isActive: project.id === selectedProjectId,
    children:
      project.id === selectedProjectId
        ? folders.map((folder) => ({
            key: folder.id,
            label: folder.name,
            href: folderHref(folder.id),
            isActive: folder.id === activeFolderId,
          }))
        : [],
  }));

  const recent = recentDocuments(documents);
  // E12 118 — "<Proje> / <Klasör>"; proje seçilmeden breadcrumb basılmaz.
  const crumb = [selectedProject?.name, activeFolderName].filter(Boolean).join(" / ");

  return (
    <div className="sdoc sdoc--archive">
      {/* E12 68-112 */}
      <DocumentFolderPanel
        title="Klasörler"
        roots={roots}
        message={folderPanelMessage({
          isProjectsLoading: projectsQuery.isLoading,
          isProjectsError: projectsQuery.isError,
          hasProjects: projects.length > 0,
          hasSelection: Boolean(selectedProjectId),
          isFoldersLoading: foldersQuery.isLoading,
          isFoldersError: foldersQuery.isError,
          hasFolders: folders.length > 0,
        })}
        // Kayıt 72 — panelin '+' düğmesi diğer üç yazma tetikleyicisinden
        // (238/238/260) farklı olarak `selectedProjectId` ile kısıtlanmamıştı;
        // proje seçilmeden basılabiliyordu (diyalog kendisi kapıda duruyor
        // ama düğme yanlışlıkla etkin görünüyordu).
        canWrite={canWrite && Boolean(selectedProjectId)}
        onCreateFolderClick={() => setOpenDialog("folder")}
      />

      <div className="sdoc__main">
        {/* E12 116-125 */}
        <div className="sdoc__head">
          <div>
            {crumb && <p className="sdoc__crumb">{crumb}</p>}
            {/* E12 119 — klasör adı; klasörsüzken proje adı */}
            <h1 className="sdoc__title">
              {activeFolderName ?? selectedProject?.name ?? "Belge Arşivi"}
            </h1>
          </div>
          <div className="sdoc__actions">
            {/* E12 35 — üst bar basılmadığı için arama kutusu buraya indi */}
            <Input
              className="sdoc__search"
              type="search"
              aria-label="Belge ara"
              maxLength={DOCUMENT_SEARCH_MAX_LENGTH}
              placeholder="Belge ara..."
              leftIcon={<SearchIcon />}
              value={query}
              onChange={(event) => pushQuery(event.target.value)}
            />
            {/* E12 121-124 — yazma tetikleyicileri; izinsizde BASILMAZ.
                Proje seçilmeden yükleme yapılamaz (`project_id` zorunlu). */}
            {canWrite && selectedProjectId && (
              <Button variant="secondary" onClick={() => setOpenDialog("upload")}>
                ↑ Yükle
              </Button>
            )}
            {/* F-BLG T2b — projeyi kendi içinde seçtiren bağımsız yüzey;
                ekranda proje seçili olmasa da açılır.

                F-BLG T3/G3 — İKİ yükleme girişi yan yana durur ve yönetim
                ikisinin de kalmasına karar verdi. Ayırt edici ETİKETE yazılır
                (`title` özniteliğinde SAKLANMAZ): "↑ Yükle" ekranda SEÇİLİ
                olan kapsama yükler, bu düğme projeyi kendi içinde seçtirir. */}
            {canWrite && (
              <Button
                variant="secondary"
                onClick={() => setOpenDialog("belge-ekle")}
                data-testid="e12-belge-ekle"
              >
                {ARCHIVE_ADD_DOCUMENT_LABEL}
              </Button>
            )}
            {canWrite && selectedProjectId && (
              <Button variant="primary" onClick={() => setOpenDialog("folder")}>
                + Yeni Klasör
              </Button>
            )}
          </div>
        </div>

        {downloadError && <p className="sdoc__error">{downloadError}</p>}

        {/* E12 127-163 */}
        <DocumentCardGrid
          documents={documents}
          now={now}
          emptyMessage={
            selectedProjectId
              ? documentGridMessage({
                  isLoading: documentsQuery.isLoading,
                  isError: documentsQuery.isError,
                  hasQuery: query.length > 0,
                  isEmpty: documents.length === 0,
                })
              : "Belgeleri görmek için soldaki panelden bir proje seçin."
          }
          canWrite={canWrite && Boolean(selectedProjectId)}
          onDocumentClick={(document) => void handleDownload(document)}
          onUploadClick={() => setOpenDialog("upload")}
        />

        {/* E12 165-185 — belge yokken hiç basılmaz; "İndir" düğmesi YOKTUR */}
        {recent.length > 0 && (
          <RecentDocumentsList
            documents={recent}
            folderNames={folderNames}
            now={now}
            onDownload={(document) => void handleDownload(document)}
            showDownloadButton={false}
          />
        )}
      </div>

      {/* T3 diyalogları — PROJE DÜZEYİ kapsam: `siteId` GEÇİLMEZ (verilseydi
          kayıt şantiyeye bağlanır, E12'nin kapsamından düşerdi). */}
      {openDialog === "upload" && selectedProjectId && (
        <DocumentUploadModal
          projectId={selectedProjectId}
          folders={folders}
          activeFolderId={activeFolderId}
          onClose={() => setOpenDialog(null)}
        />
      )}
      {openDialog === "belge-ekle" && (
        <ArchiveDocumentFormModal
          initialProjectId={selectedProjectId || undefined}
          onClose={() => setOpenDialog(null)}
        />
      )}
      {openDialog === "folder" && selectedProjectId && (
        <DocumentFolderModal
          projectId={selectedProjectId}
          onClose={() => setOpenDialog(null)}
        />
      )}
    </div>
  );
}
