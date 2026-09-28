"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { AccessDenied } from "@/components/settings/AccessDenied";
import { Button, Checkbox } from "@/components/ui";
import { FormActions } from "@/components/form-shell";
import { backendErrorMessage } from "@/lib/api/error-message";
import { useProject } from "@/lib/api/hooks/useProjects";
import { useSection } from "@/lib/api/hooks/useSection";
import { useCreateSection, useUpdateSection } from "@/lib/api/hooks/useSectionMutations";
import { useSite } from "@/lib/api/hooks/useSites";
import { useSiteSections } from "@/lib/api/hooks/useSiteSections";
import { useUserOptions } from "@/lib/api/hooks/useUserOptions";
import { BackendError, isForbidden } from "@/lib/api/unwrap";
import { useModulePermission } from "@/lib/auth/useModulePermission";
import { pendingModuleLabel } from "@/lib/pending-modules";
import { isUserListUnavailable } from "@/components/site-form/user-picker";

import { BoqAssignmentCard } from "@/components/boq-assignment/BoqAssignmentCard";
import { buildSectionBody } from "./build-body";
import { DocumentsCard } from "./DocumentsCard";
import { emptySectionFormValues, sectionFormValuesFromDetail, type SectionFormValues } from "./form-state";
import { ScheduleBudgetCard } from "./ScheduleBudgetCard";
import { SectionInfoCard } from "./SectionInfoCard";
import { TeamCard } from "./TeamCard";
import { hasSectionFormErrors, MESSAGES, validateSectionForm, type SectionFormErrors } from "./validate";
// Sıra önemli: önce paylaşılan kabuk, sonra forma özgü bloklar.
import "@/styles/form-shell.css";
import "./section-form.css";
import { routes, routeKeyOf } from "@/lib/routes";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";

/** F-TKV T5 — devre dışı Gantt kutusunun GÖRÜNÜR gerekçesi (test bunu import eder). */
export const GANTT_AUTO_ADD_REASON = pendingModuleLabel("gantt_auto_add");

/**
 * 🔴 URL-3 — bu propların hepsi ADRESTEKI anahtarlardır (slug VEYA UUID),
 * kanonik kimlik DEĞİLDİR. Kanonik kimlikler gövdede sorgu yanıtlarından
 * türetilir; ad bu yüzden `...Key`tir.
 */
export type SectionFormProps =
  | { mode: "create"; projectKey: string; siteKey: string }
  | { mode: "edit"; projectKey: string; siteKey: string; sectionKey: string };

/** Bilgi kutusu ikonu (mockup F54) — SiteCreateView deseniyle aynı. */
function InfoIcon() {
  return (
    <svg className="site-form__info-icon" width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 9v6M10 6.5v.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Bölüm oluştur/düzenle formu (F-P6 T3, mockup "Form - Bolum Ekle.dc.html").
 * `create` ve `edit` kipleri AYNI bileşendir (`ProgressPaymentForm` deseni,
 * iki kopya form YOK). `SectionFormModal` bunun yerine EMEKLİ edildi.
 */
export function SectionForm(props: SectionFormProps) {
  const router = useRouter();
  const { canWrite } = useModulePermission("sites");
  const isEdit = props.mode === "edit";

  const siteQuery = useSite(props.siteKey, { project: props.projectKey });
  const projectQuery = useProject(props.projectKey);
  const detailQuery = useSection(isEdit ? props.sectionKey : "", {
    site: props.siteKey,
    project: props.projectKey,
  });
  // 🔴 SLUG -> KANONIK KIMLIK GECIS NOKTASI. Asagidaki UC cagri UUID bekler
  // (`GET/POST /sites/{id}/sections`, `PATCH /sections/{id}`).
  const siteId = siteQuery.data?.id ?? "";
  const sectionId = detailQuery.data?.id ?? "";
  const detail = isEdit ? detailQuery.data : undefined;
  const users = useUserOptions();
  // F-TKV T5 — Bağımlılık seçicisinin seçenekleri: AYNI şantiyenin öbür
  // bölümleri. Backend "aynı şantiye / kendisi / döngü" ihlallerinde 422 verir;
  // listeden kendini çıkarmak o hatalardan yalnız BİRİNİ (self) önler,
  // öbürleri kullanıcıya GÖRÜNÜR hata olarak basılır (handleMutationError).
  const siteSections = useSiteSections(siteId);

  const createSection = useCreateSection(siteId);
  const updateSection = useUpdateSection(sectionId);
  const isSaving = createSection.isPending || updateSection.isPending;

  const [values, setValues] = useState<SectionFormValues>(emptySectionFormValues);
  const [errors, setErrors] = useState<SectionFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  // SEKME-F1.3b · dirty = `values`in tabanından sapması (tercih 2). Oluşturma
  // kipinde taban sabit boş formdur; düzenleme kipinde 🔴 ASYNC TABAN —
  // `detail` GET'i tamamlanana kadar taban da boş formdur (henüz render
  // edilmiyor: aşağıdaki "Yükleniyor…" erken dönüşü bu süreyi zaten kapatır),
  // gerçek taban tohumlama efektiyle AYNI ANDA (aşağıda) alınır.
  const [baseline, setBaseline] = useState<SectionFormValues>(emptySectionFormValues);
  const isDirty = JSON.stringify(values) !== JSON.stringify(baseline);
  useUnsavedChanges(isDirty, "Bölüm");

  // Düzenleme kipinde tohumlama YALNIZ BİR KEZ çalışır (ProgressPaymentForm
  // deseni) — sonraki `detailQuery` yenilemeleri kullanıcının o anki
  // düzenlemesini SİLMEZ.
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    if (!isEdit) return;
    if (!detail) return;
    seededRef.current = true;
    const seeded = sectionFormValuesFromDetail(detail);
    setValues(seeded);
    setBaseline(seeded);
  }, [isEdit, detail]);

  const shouldFocusRef = useRef(false);
  const formRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!shouldFocusRef.current) return;
    shouldFocusRef.current = false;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [errors]);

  if (!canWrite) return <AccessDenied />;
  if (isForbidden(siteQuery.error) || isForbidden(projectQuery.error) || isForbidden(detailQuery.error)) {
    return <AccessDenied />;
  }
  // final review I3: 403 dışı hatalarda (404/500) `isLoading:false` +
  // `data:undefined` olur — `isError` dalı olmadan ekran kalıcı "Yükleniyor…"
  // mesajında donar, hata yutulurdu. `SectionDetailView.tsx`teki desenin
  // birebiri.
  if (isEdit && detailQuery.isError) {
    return <p className="site-form__message">Bölüm yüklenemedi</p>;
  }
  if (isEdit && (detailQuery.isLoading || !detail)) {
    return <p className="site-form__message">Yükleniyor…</p>;
  }
  if (siteQuery.isLoading || !siteQuery.data) {
    return <p className="site-form__message">Yükleniyor…</p>;
  }

  const site = siteQuery.data;
  const project = projectQuery.data;
  const dependencyOptions = (siteSections.data?.items ?? [])
    // 🔴 KANONIK kimlikle karsilastirilir: `item.id` bir UUID'dir. Adres
    // anahtari (slug olabilir) ile karsilastirmak bolumun KENDISINI bagimlilik
    // secenegi olarak birakirdi — 422 vermeyen, sessiz bir kusur.
    .filter((item) => !isEdit || item.id !== sectionId)
    .map((item) => ({ id: item.id, name: item.name }));
  const existingMilestones = detail?.milestones ?? [];

  function handleChange<K extends keyof SectionFormValues>(field: K, value: SectionFormValues[K]) {
    setValues((prev) => ({ ...prev, [field]: value }));
  }

  function handleCancel() {
    const target = isEdit
      ? routes.projects.sites.sections.detail({
          projectId: props.projectKey,
          siteId: props.siteKey,
          sectionId: props.sectionKey,
        })
      : routes.projects.sites.detail({ projectId: props.projectKey, siteId: props.siteKey });
    router.push(target);
  }

  function handleMutationError(err: unknown) {
    const isCodeConflict = err instanceof BackendError && err.status === 409;
    if (isCodeConflict) {
      // Brief §409 kod çakışması: YALNIZ Bölüm Kodu alanının altında hata —
      // genel banner set edilmez (site-form'un 409 deseninden bilinçli sapma,
      // brief burada kazanır).
      // M5_1 kayıt #267: odak da istemci doğrulama yoluyla AYNI şekilde
      // taşınmalı — yoksa sunucu kaynaklı 409'da hatalı alana odak gitmiyordu.
      shouldFocusRef.current = true;
      setErrors((prev) => ({ ...prev, code: MESSAGES.sectionCodeConflict }));
      return;
    }
    setFormError(backendErrorMessage(err));
  }

  function submit(isDraft: boolean) {
    const nextErrors = validateSectionForm(values, {
      isDraft,
      isUserListUnavailable: isUserListUnavailable(users),
      // final review I1: eski (yalnız-isim) sorumlu kayıtlı bölümler için
      // sorumlu zorunluluğunu düşürür — detay.manager_name doluysa form hiç
      // dokunmasa da backend kuralı zaten karşılanmış demektir.
      hasExistingManagerName: isEdit ? Boolean(detail?.manager_name?.trim()) : false,
    });
    setErrors(nextErrors);

    if (hasSectionFormErrors(nextErrors)) {
      shouldFocusRef.current = true;
      setFormError(Object.values(nextErrors)[0] ?? null);
      return;
    }

    setFormError(null);
    const body = buildSectionBody(values, { isDraft, existingMilestones });

    if (!isEdit) {
      createSection.mutate(body, {
        onSuccess: (created) =>
          router.push(
            routes.projects.sites.sections.detail({
              projectId: props.projectKey,
              siteId: props.siteKey,
              // Yeni kaydin okunur anahtari YANITTAN gelir (`slug ?? id`).
              sectionId: routeKeyOf(created),
            }),
          ),
        onError: handleMutationError,
      });
      return;
    }

    updateSection.mutate(body, {
      onSuccess: (updated) =>
        router.push(
          routes.projects.sites.sections.detail({
            projectId: props.projectKey,
            siteId: props.siteKey,
            sectionId: routeKeyOf(updated),
          }),
        ),
      onError: handleMutationError,
    });
  }

  return (
    <div className="pf-shell">
      <div className="pf-topbar">
        <nav className="pf-breadcrumb" aria-label="Kırıntı yolu">
          <Link href={routes.projects.list()}>Projeler</Link>
          <span className="pf-breadcrumb__sep" aria-hidden="true">
            /
          </span>
          <Link href={routes.projects.sites.detail({ projectId: props.projectKey, siteId: props.siteKey })}>
            {site.name}
          </Link>
          <span className="pf-breadcrumb__sep" aria-hidden="true">
            /
          </span>
          <span className="pf-breadcrumb__current" aria-current="page">
            {isEdit ? "Bölümü Düzenle" : "Yeni Bölüm"}
          </span>
        </nav>
        <div className="pf-topbar__actions">
          <Button variant="secondary" className="pf-topbar-cancel" onClick={handleCancel} disabled={isSaving}>
            İptal
          </Button>
          <Button variant="primary" className="pf-topbar-submit" onClick={() => submit(false)} disabled={isSaving}>
            {isSaving ? "Kaydediliyor…" : isEdit ? "Kaydet" : "Bölümü Oluştur"}
          </Button>
        </div>
      </div>

      <div className="pf">
        <header className="pf-head">
          <h1 className="pf-title">{isEdit ? "Bölümü Düzenle" : "Yeni Bölüm (Faz) Ekle"}</h1>
          <p className="pf-subtitle">
            Bölüm, şantiyenin bir iş fazıdır — kendi iş kalemleri, işçileri ve hakedişi olur
          </p>
        </header>

        <div className="site-form__info" data-testid="section-form-site-info">
          <InfoIcon />
          <div className="site-form__info-text">
            <strong>Şantiye:</strong> {site.name}
            {project && ` · ${project.name} (${project.code})`}
            <br />
            Mevcut {site.section_count} bölüm var. Yeni bölüm eklendikten sonra{" "}
            <strong>iş kalemi ataması</strong> yapılmalı.
          </div>
          <Link
            href={routes.projects.sites.detail({ projectId: props.projectKey, siteId: props.siteKey })}
            className="site-form__info-link"
          >
            Mevcut Bölümler →
          </Link>
        </div>

        <div className="pf-body" data-testid="section-form-body" ref={formRef}>
          <SectionInfoCard values={values} onChange={handleChange} siteName={site.name} errors={errors} />
          <TeamCard values={values} onChange={handleChange} errors={errors} />
          <ScheduleBudgetCard
            values={values}
            onChange={handleChange}
            errors={errors}
            dependencyOptions={dependencyOptions}
            existingMilestones={existingMilestones}
          />
          {/* 🔴 F-BLMPOZ — kart CANLANDIRILDI. Eski hâli tamamen ölü bir yer
              tutucuydu ve gerekçesi ("iş kalemi ↔ bölüm bağı veri katmanında
              KAPALI") BAYATTI: `boq_item_section_allocations` tablosu ve
              `GET/PUT /boq/items/{id}/allocations` uçları VAR ve çalışıyor —
              yalnız frontend'de onları çağıran TEK SATIR KOD YOKTU, yani
              bölüme poz atamak arayüzden ULAŞILAMAZDI.

              Kart KENDİ kaydını yapar: `SectionCreate`/`SectionUpdate` gövdesi
              BOQ ataması KABUL ETMEZ, atama ayrı bir istektir. Oluşturma
              kipinde bölüm henüz yoktur (tahsis `section_id` NOT NULL) →
              kontroller görünür gerekçeyle devre dışı. */}
          {isEdit ? (
            <BoqAssignmentCard
              mode="edit"
              siteId={siteId}
              sectionId={sectionId}
              canWrite={canWrite}
            />
          ) : (
            <BoqAssignmentCard mode="create" />
          )}
          <DocumentsCard />
        </div>

        {formError && (
          <p className="pf-form-error" role="alert">
            {formError}
          </p>
        )}

        <FormActions
          variant="split"
          leading={
            // F236-239: Gantt'a otomatik ekleme. F-TKV T5'ten sonra kutu
            // "modül yok" diye değil, SEÇENEK OLMADIĞI için devre dışıdır:
            // `/projects/timeline` her bölümü döndürür, bir bölümü takvimden
            // dışarıda tutan alan ne şemada ne üründe vardır. Gerekçe ekrana
            // basılır (title'da saklanmaz).
            <span className="sf-gantt-note">
              <Checkbox
                checked
                disabled
                label="Bölümü proje takvimine (Gantt) otomatik ekle"
              />
              <span className="sf-gantt-note__reason">{GANTT_AUTO_ADD_REASON}</span>
            </span>
          }
          onCancel={handleCancel}
          // Kullanıcı kararı: düzenleme kipinde "Taslak Kaydet" YOK — yayına
          // alınmış (`is_draft: false`) bir bölümü uyarısız taslağa geri
          // düşürmesin. Mockup'ta düzenleme kipi hiç çizilmedi; ekleme
          // kipinde (F242) aynen kalır.
          onSaveDraft={isEdit ? undefined : () => submit(true)}
          onSubmit={() => submit(false)}
          submitLabel={isEdit ? "Kaydet" : "Bölümü Oluştur"}
          pendingLabel="Kaydediliyor…"
          isPending={isSaving}
        />
      </div>
    </div>
  );
}
