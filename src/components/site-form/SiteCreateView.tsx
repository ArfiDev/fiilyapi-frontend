"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { AccessDenied } from "@/components/settings/AccessDenied";
import { Button } from "@/components/ui";
import { useProject, type ProjectDetail } from "@/lib/api/hooks/useProjects";
import { useCreateSite } from "@/lib/api/hooks/useSiteMutations";
import { useUserOptions } from "@/lib/api/hooks/useUserOptions";
import { BackendError, isForbidden } from "@/lib/api/unwrap";
import { backendErrorMessage } from "@/lib/api/error-message";
import { pendingModuleLabel } from "@/lib/pending-modules";
import { projectTypeBannerLabel } from "./project-type-label";
import { SiteInfoCard } from "./SiteInfoCard";
import { LocationCard } from "./LocationCard";
import { ScheduleCard } from "./ScheduleCard";
import { SectionsCard } from "./SectionsCard";
import { FacilitiesCard } from "./FacilitiesCard";
import { buildSiteCreateBody } from "./build-body";
import {
  emptySectionRow,
  validateSections,
  type SectionIssue,
  type SectionRow,
} from "./sections-validate";
import { emptySiteFormValues, type SiteFormValues } from "./form-state";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";
import { SITE_EDIT } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";
import { isUserListUnavailable } from "./user-picker";
import {
  MESSAGES,
  hasSiteFormErrors,
  validateSiteForm,
  type SiteFormErrors,
} from "./validate";
import { SiteDocumentsCard } from "./SiteDocumentsCard";
import { SiteFormActions } from "./SiteFormActions";
// Sıra önemli: önce paylaşılan kabuk, sonra forma özgü bloklar (özgü kazansın).
import "@/styles/form-shell.css";
import "./site-form.css";
import { routes, routeKeyOf } from "@/lib/routes";

function isNotFound(err: unknown): boolean {
  return err instanceof BackendError && err.status === 404;
}

/** Bilgi kutusu ikonu (mockup satır 54) — rengi CSS'ten, çıplak hex yok. */
function InfoIcon() {
  return (
    <svg
      className="site-form__info-icon"
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M10 9v6M10 6.5v.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** "Bağlı Proje" bilgi kutusu (mockup satır 53–60, spec §4.0.1). */
function ProjectInfoBanner({ project }: { project: ProjectDetail | undefined }) {
  return (
    <div className="site-form__info" data-testid="site-form-project-info">
      <InfoIcon />
      <div className="site-form__info-text">
        {project ? (
          <>
            <strong>Bağlı Proje:</strong> {project.name} ({project.code}) ·{" "}
            {projectTypeBannerLabel(project.project_type)}
            <br />
            Şantiye oluşturulduktan sonra <strong>poz dağılımı</strong> ekranından bu
            şantiyeye kota atayabilirsiniz.
          </>
        ) : (
          <span
            className="site-form__info-skeleton"
            data-testid="site-form-project-info-skeleton"
            aria-hidden="true"
          />
        )}
      </div>
      {/* Edilgen yer tutucu (§1.2): sözleşme modülü gelene kadar bağlantı yok. */}
      <span className="site-form__info-link" title={pendingModuleLabel("contracts")}>
        Poz Dağılımı →
      </span>
    </div>
  );
}

/**
 * Yeni Şantiye oluşturma yüzeyi (spec §2.2, §4.0).
 *
 * Gönderim ATOMİKTİR (§3.4): şantiye ve bölümleri TEK `POST` ile gider,
 * `useCreateSection` çağrılmaz. Kısmi başarı yolu yoktur.
 */
export function SiteCreateView() {
  const router = useRouter();
  // 🔴 URL-3 — rota parametresi ADRES anahtaridir (slug VEYA UUID).
  const { projectId: projectKey } = useParams<{ projectId: string }>();
  const projectQuery = useProject(projectKey);
  // IZN-F2.y · POST /projects/{id}/sites = santiye.bolumler / bolum.detay Düzenler (VEYA; backend
  // `sites:full`). Bugün kapı yok → sayfa izni hiç yoksa (fallback) form açık kalır.
  const canCreate = useButtonGate({ pages: SITE_EDIT, need: "edit" });
  // SLUG -> KANONIK KIMLIK: `POST /projects/{project_id}/sites` UUID BEKLER.
  const projectId = projectQuery.data?.id ?? "";
  const createSite = useCreateSite(projectId);
  // Kartlarla AYNI sorgu anahtarı (React Query tekilleştirir): şef zorunluluğu
  // liste yüklenemediğinde kalkar (§10.1.1) — bu karar gönderim katmanında da
  // bilinmelidir.
  const users = useUserOptions();

  const [values, setValues] = useState<SiteFormValues>(emptySiteFormValues);
  // Bölüm satırları ayrı tutulur: kendi satır modeli var (spec §6.1).
  const [sectionRows, setSectionRows] = useState<SectionRow[]>(() => [emptySectionRow()]);
  const [errors, setErrors] = useState<SiteFormErrors>({});
  const [sectionIssues, setSectionIssues] = useState<SectionIssue[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  // SEKME-F1.3b · dirty (tercih 1): `values`/`sectionRows` boş formdan farkı.
  // ASYNC TABAN DEĞİL (`projectQuery` yalnız salt-okunur banner için).
  // `emptySectionRow().id` HER ÇAĞRIDA yeni üretilir (sayaç) — bu yüzden
  // satır karşılaştırması `id` HARİÇ alanlarla yapılır (aksi halde başlangıç
  // tek boş satırı bile "kirli" görünürdü).
  const isSectionRowBlank = (row: SectionRow) =>
    row.name.trim() === "" && row.managerUserId === "" && row.startDate === "" && row.endDate === "";
  const isDirty =
    JSON.stringify(values) !== JSON.stringify(emptySiteFormValues()) ||
    sectionRows.length > 1 ||
    sectionRows.some((row) => !isSectionRowBlank(row));
  useUnsavedChanges(isDirty, "Şantiye");

  // Doğrulama sonrası ilk hatalı alana odak (§13). Hangi alanın "ilk" olduğunu
  // DOM sırası söyler; odak isteği bayrakla taşınır.
  const shouldFocusRef = useRef(false);
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!shouldFocusRef.current) return;
    shouldFocusRef.current = false;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [errors, sectionIssues]);

  // Mutasyon yok: her degisiklik yeni nesne uretir (immutability kurali).
  function handleChange<K extends keyof SiteFormValues>(field: K, value: SiteFormValues[K]) {
    setValues((prev) => ({ ...prev, [field]: value }));
  }

  function handleCancel() {
    // `beforeunload` uyarısı YOKTUR (§12): veri kaybına karşı "Taslak Kaydet" var.
    router.push(routes.projects.detail({ projectId: projectKey }));
  }

  function submit(isDraft: boolean) {
    const nextErrors = validateSiteForm(values, {
      isDraft,
      isUserListUnavailable: isUserListUnavailable(users),
    });
    const nextIssues = validateSections(sectionRows, { isDraft });
    setErrors(nextErrors);
    setSectionIssues(nextIssues);

    if (hasSiteFormErrors(nextErrors) || nextIssues.length > 0) {
      shouldFocusRef.current = true;
      // Özet, alan mesajlarının İLKİDİR — §10 dışında yeni dize üretilmez.
      setFormError(Object.values(nextErrors)[0] ?? nextIssues[0]?.message ?? null);
      return;
    }

    setFormError(null);
    createSite.mutate(buildSiteCreateBody(values, sectionRows, { isDraft }), {
      // Önbellek geçersizleştirmesi hook'un içinde (§9.5).
      onSuccess: (site) =>
        router.push(
          isDraft
            ? routes.projects.detail({ projectId: projectKey })
            : routes.projects.sites.detail({
                projectId: projectKey,
                // Yeni santiyenin okunur anahtari YANITTAN gelir.
                siteId: routeKeyOf(site),
              }),
        ),
      onError: (err) => {
        const isCodeConflict = err instanceof BackendError && err.status === 409;
        if (isCodeConflict) {
          setErrors((prev) => ({ ...prev, code: MESSAGES.siteCodeConflict }));
        }
        setFormError(isCodeConflict ? MESSAGES.siteCodeConflict : backendErrorMessage(err));
      },
    });
  }

  if (!canCreate || isForbidden(projectQuery.error)) return <AccessDenied />;
  if (isNotFound(projectQuery.error)) {
    return (
      <p className="site-form__message">
        <span>Proje bulunamadı</span> — <Link href={routes.projects.list()}>Projeler</Link>
      </p>
    );
  }
  if (projectQuery.isError) {
    return <p className="site-form__message">Proje yüklenemedi</p>;
  }

  const project = projectQuery.data;

  return (
    <div className="pf-shell">
      <div className="pf-topbar">
        <nav className="pf-breadcrumb" aria-label="Kırıntı yolu">
          <Link href={routes.projects.list()}>Projeler</Link>
          <span className="pf-breadcrumb__sep" aria-hidden="true">
            /
          </span>
          {project ? (
            <Link href={routes.projects.detail({ projectId: projectKey })}>{project.name}</Link>
          ) : (
            <span>…</span>
          )}
          <span className="pf-breadcrumb__sep" aria-hidden="true">
            /
          </span>
          <span className="pf-breadcrumb__current" aria-current="page">
            Yeni Şantiye
          </span>
        </nav>
        <div className="pf-topbar__actions">
          <Button
            variant="secondary"
            className="pf-topbar-cancel"
            onClick={handleCancel}
            disabled={createSite.isPending}
          >
            İptal
          </Button>
          <Button
            variant="primary"
            className="pf-topbar-submit"
            onClick={() => submit(false)}
            disabled={createSite.isPending}
          >
            {createSite.isPending ? "Kaydediliyor…" : "Şantiyeyi Oluştur"}
          </Button>
        </div>
      </div>

      <div className="pf">
        <header className="pf-head">
          <h1 className="pf-title">Yeni Şantiye Ekle</h1>
          <p className="pf-subtitle">
            Şantiye bir projeye bağlıdır — poz kotaları proje sözleşmesinden dağıtılır
          </p>
        </header>

        <ProjectInfoBanner project={project} />

        {/* Altı kart + gönderim. Alanlar kaydederken `disabled` DEĞİLDİR (§12). */}
        <div className="pf-body" data-testid="site-form-body" ref={formRef}>
          <SiteInfoCard
            values={values}
            onChange={handleChange}
            projectName={project?.name ?? ""}
            errors={errors}
          />
          <LocationCard values={values} onChange={handleChange} errors={errors} />
          <ScheduleCard values={values} onChange={handleChange} errors={errors} />
          <SectionsCard
            rows={sectionRows}
            onRowsChange={setSectionRows}
            issues={sectionIssues}
          />
          <FacilitiesCard values={values} onChange={handleChange} errors={errors} />
          <SiteDocumentsCard />
        </div>

        {formError && (
          <p className="pf-form-error" role="alert">
            {formError}
          </p>
        )}

        <SiteFormActions
          onCancel={handleCancel}
          onSaveDraft={() => submit(true)}
          onSubmit={() => submit(false)}
          isPending={createSite.isPending}
        />
      </div>
    </div>
  );
}
