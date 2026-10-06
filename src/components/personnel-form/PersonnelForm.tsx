"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { AccessDenied } from "@/components/settings/AccessDenied";
import { Button, Checkbox } from "@/components/ui";
import { useCreatePersonnel, useUpdatePersonnel } from "@/lib/api/hooks/usePersonnelMutations";
import { usePersonnelDetail } from "@/lib/api/hooks/usePersonnelDetail";
import { useSubcontractors } from "@/lib/api/hooks/useSubcontractors";
import { useProjects } from "@/lib/api/hooks/useProjects";
import { isForbidden } from "@/lib/api/unwrap";
import { hasAtLeast } from "@/lib/auth/permissions";
import { isCategoryHidden } from "@/lib/auth/hidden-fields";
import { useModulePermission } from "@/lib/auth/useModulePermission";
import { useSession } from "@/components/shell/SessionProvider";
import { PERSONNEL_EDIT } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";

import {
  buildPersonnelCreateBody,
  buildPersonnelUpdateBody,
  submittableValues,
  type OmittablePersonnelField,
} from "./build-body";
import {
  ACTIVE_TOGGLE_LABEL,
  BREADCRUMB_CURRENT,
  BREADCRUMB_CURRENT_EDIT,
  BREADCRUMB_HR,
  PAGE_SUBTITLE_EDIT_SUFFIX,
  PAGE_SUBTITLE_PREFIX,
  PAGE_SUBTITLE_SUFFIX,
  PAGE_TITLE,
  PAGE_TITLE_EDIT,
  PENDING_DRAFT_PUBLISHED,
  PENDING_NOTICES,
  PERSONNEL_LIST_HREF,
  DRAFT_HINT,
  DRAFT_STATE_NOTICE,
  PUBLISHED_STATE_NOTICE,
  SUBMIT_LABEL,
  SUBMIT_LABEL_EDIT,
  SUBMIT_LABEL_PUBLISH,
  TOPBAR_DRAFT_LABEL,
} from "./constants";
import { ContactCard } from "./ContactCard";
import {
  emptyPersonnelFormValues,
  personnelFormValuesFromDetail,
  type PersonnelFormValues,
} from "./form-state";
import { IdentityCard } from "./IdentityCard";
import { JobCard } from "./JobCard";
import { maskedPersonnelFields } from "./masked-fields";
import { PersonnelDocumentsCard } from "./PersonnelDocumentsCard";
import { PersonnelFormActions } from "./PersonnelFormActions";
import {
  hasPersonnelFormErrors,
  validatePersonnelForm,
  type PersonnelFormErrors,
  type PersonnelSubmitIntent,
} from "./validate";
import {
  DUPLICATE_TC_FIELD_MESSAGE,
  isPersonnelDuplicateError,
  personnelSubmitErrorMessage,
} from "./submit-errors";
// Sıra önemli: önce paylaşılan kabuk, sonra forma özgü bloklar (özgü kazansın).
import "@/styles/form-shell.css";
import "./personnel-form.css";
import { PERSONNEL_RETURN_PARAM, routes } from "@/lib/routes";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";

/**
 * "İptal"/kaydetme sonrası dönülecek rotayı taşıyan sorgu parametresi
 * (yalnız `create` kipinde okunur).
 *
 * Mockup'ın "İptal" bağlantıları `Personel.dc.html`e gider (35, 38, 210).
 * Form GELDİĞİ YERE döner: puantaj ekranlarındaki giriş noktaları bu
 * parametreyi doldurur, doğrudan URL ile gelen kullanıcı genel puantaja düşer.
 */
export const RETURN_PARAM = PERSONNEL_RETURN_PARAM;

/** Parametre yoksa ya da güvenilir değilse dönülecek rota. */
export const DEFAULT_RETURN_TO = routes.timesheet();

/** Yalnız uygulama içi mutlak yol kabul edilir (açık yönlendirme kapalı). */
export function safeReturnTo(raw: string | null): string {
  if (!raw) return DEFAULT_RETURN_TO;
  if (!raw.startsWith("/") || raw.startsWith("//")) return DEFAULT_RETURN_TO;
  return raw;
}

export type PersonnelFormProps = { mode: "create" } | { mode: "edit"; personnelId: string };

/**
 * Personel Kaydı formu — `create`/`edit` AYNI bileşendir (F-P6 `SectionForm`
 * iki-kip emsali BİREBİR, iki kopya form YOK). Mockup `Form - Personel
 * Ekle.dc.html` (yorumlardaki sayılar o dosyanın SATIR numaralarıdır);
 * düzenleme kipinin kendi mockup'ı yoktur, metinleri `SectionForm`ın
 * kip desenini izler.
 *
 * ⭐ ÜST KURAL: mockup'taki her alan basılır. Sunucu sözleşmesinde
 * (`PersonnelCreate`/`PersonnelUpdate`) karşılığı OLMAYAN alanlar
 * devre-dışıdır, gerekçeleri ekranın üstünde GÖRÜNÜR listelenir ve gövdeye
 * ASLA sızmazlar — bu alanların form durumunda karşılığı bile yoktur
 * (`form-state.ts`). Düzenleme kipinde bu pending alanlar AYNEN pending
 * kalır (K2) — yalnız `is_active` ek olarak düzenlenebilir.
 */
export function PersonnelForm(props: PersonnelFormProps) {
  const isEdit = props.mode === "edit";
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = safeReturnTo(searchParams.get(RETURN_PARAM));

  const permission = useModulePermission("personnel");
  // IZN-F2.x · personel ekle/düzenle = ik.* Düzenler (VEYA).
  const canEdit = useButtonGate({ pages: PERSONNEL_EDIT, need: "edit", fallback: hasAtLeast(permission.level, "full") });
  const createPersonnel = useCreatePersonnel();
  const updatePersonnel = useUpdatePersonnel(isEdit ? props.personnelId : "");
  const subcontractorsQuery = useSubcontractors();
  const projectsQuery = useProjects();
  const detailQuery = usePersonnelDetail(isEdit ? props.personnelId : "");
  const detail = isEdit ? detailQuery.data : undefined;
  const isSaving = createPersonnel.isPending || updatePersonnel.isPending;

  // "Atandığı Proje" seçeneklerinin TEK kaynağı (mockup'ın sabit adları DEĞİL).
  const projectOptions = projectsQuery.data?.items ?? [];
  /** Düzenlenen kayıt bugün TASLAK mı — "Yayına Al" yolunu bu belirler. */
  const isDraftRecord = isEdit ? (detail?.is_draft ?? false) : false;


  const [values, setValues] = useState<PersonnelFormValues>(emptyPersonnelFormValues);
  const [errors, setErrors] = useState<PersonnelFormErrors>({});
  // Kullanıcının GERÇEKTEN dokunduğu alanlar. Yalnız `wage_type` /
  // `payment_method` için okunur: bu iki seçicinin mockup'ta boş seçeneği
  // yoktur, ekranda hep dolu görünürler ve "görünen değer" kullanıcının
  // KARARI DEĞİLDİR (bkz. `omittedSelectFields`).
  const [touched, setTouched] = useState<ReadonlySet<keyof PersonnelFormValues>>(
    () => new Set(),
  );
  const [formError, setFormError] = useState<string | null>(null);
  // SEKME-F1.3b · dirty = `touched.size > 0` (tercih 1, ZATEN tutuluyor).
  // 🔴 ASYNC TABAN: edit modunda tohumlama efekti `handleChange` ÜZERİNDEN
  // GEÇMEDİĞİ için `touched`ı doğal olarak kirletmiyor — güvenli desen
  // (envanter notu), ayrı bir baseline gerekmiyor.
  const isDirty = touched.size > 0;
  useUnsavedChanges(isDirty, "Personel");

  // Düzenleme kipinde tohumlama YALNIZ BİR KEZ çalışır (`SectionForm` deseni)
  // — sonraki `detailQuery` yenilemeleri kullanıcının o anki düzenlemesini
  // SİLMEZ.
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    if (!isEdit) return;
    if (!detail) return;
    seededRef.current = true;
    setValues(personnelFormValuesFromDetail(detail));
  }, [isEdit, detail]);

  // Doğrulama sonrası ilk hatalı alana odak — hangi alanın "ilk" olduğunu DOM
  // sırası söyler; odak isteği bayrakla taşınır (şantiye formu deseni).
  const shouldFocusRef = useRef(false);
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!shouldFocusRef.current) return;
    shouldFocusRef.current = false;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [errors]);

  // Mutasyon yok: her değişiklik yeni nesne üretir.
  function handleChange<K extends keyof PersonnelFormValues>(
    field: K,
    value: PersonnelFormValues[K],
  ) {
    setValues((prev) => ({ ...prev, [field]: value }));
    setTouched((prev) => (prev.has(field) ? prev : new Set(prev).add(field)));
  }

  function handleCancel() {
    router.push(isEdit ? routes.personnel.detail({ personnelId: props.personnelId }) : returnTo);
  }

  /**
   * PATCH gövdesinden ATLANACAK seçiciler.
   *
   * "Ücret Tipi" ve "Ödeme Şekli" mockup'ta boş seçenek TAŞIMAZ: sunucuda
   * `null` olsalar bile ekranda ilk seçenek ("Günlük" / "Banka Havalesi")
   * görünür. Kullanıcı o seçiciyi hiç AÇMADAN kaydederse anahtarı göndermek,
   * kullanıcının VERMEDİĞİ bir kararı veriye yazmak olurdu — sunucudaki
   * `null` sessizce EZİLİRDİ. Bu yüzden "sunucuda null + dokunulmamış"
   * durumunda anahtar hiç basılmaz (`is_draft` ile AYNI desen).
   *
   * Dolu gelen alan zaten tohumlanmıştır ve normal gider; kullanıcı dokunduysa
   * seçimi normal gider. OLUŞTURMA kipi etkilenmez: orada ezilecek sunucu
   * değeri YOKTUR.
   */
  // 🔴 IZN-F4c.2 — maskeli (maas_kisisel gizli + sunucudan `null`) alanlar: salt okunur "—" + kilit;
  // PATCH gövdesine KONMAZ (dolu gizli alan 403 verir; `null` yazmak gerçek değeri silerdi). POST etkilenmez.
  const { me } = useSession();
  const maskedSpecs = isEdit ? maskedPersonnelFields(detail, (categories) => isCategoryHidden(me, categories)) : [];
  const maskedFields: ReadonlySet<keyof PersonnelFormValues> = new Set(maskedSpecs.map((spec) => spec.formKey));
  const maskedApiFields: readonly OmittablePersonnelField[] = maskedSpecs.map((spec) => spec.apiField);

  const omittedSelectFields: readonly OmittablePersonnelField[] =
    !isEdit || !detail
      ? []
      : [
          ...maskedApiFields,
          // 🔴 IZN-F5a.2 — atamaya dokunulmadıysa anahtar gitmez (görünmeyen atamada PATCH 404);
          // kasıtlı kaldırma (null) dokunulmuş sayılır ve açıkça gider.
          ...(touched.has("assignedProjectId") ? [] : (["assigned_project_id"] as const)),
          ...(detail.wage_type === null && !touched.has("wageType")
            ? (["wage_type"] as const)
            : []),
          ...(detail.payment_method === null && !touched.has("paymentMethod")
            ? (["payment_method"] as const)
            : []),
        ];

  /**
   * Gönderim — spec K4 taslak/yayın ayrımı.
   *
   * `intent` HANGİ DÜĞMEYE basıldığıdır: doğrulama ölçüsünü ve gövdedeki
   * `is_draft` anahtarını o belirler. Düzenleme kipinde düz "Kaydet"
   * (`intent === "publish"` ama kayıt zaten yayında) `is_draft` anahtarını
   * HİÇ göndermez — yayın durumu düzenlemenin yan etkisi DEĞİLDİR.
   */
  function submit(intent: PersonnelSubmitIntent) {
    // ⚠️ Yıldızlı alan denetimi YALNIZ YAYIN GEÇİŞİNDE uygulanır: yeni kayıt
    // yayınlarken ya da taslağı "Yayına Al" ile yayına alırken. ZATEN yayında
    // olan bir kaydı düzenlerken uygulanmaz — bu alanlar sunucuya İK-1 ile
    // sonradan eklendi; eski kayıtların çoğu boş. Denetimi orada da zorlamak,
    // kullanıcının yalnız telefonunu düzeltmek istediği bir kaydı ekranda
    // KİLİTLERDİ (zorunlulukları sunucu uygular, istemci icat etmez).
    const isPublishTransition = intent === "publish" && (!isEdit || isDraftRecord);
    const nextErrors = validatePersonnelForm(values, {
      intent: isPublishTransition ? "publish" : "draft",
      hasProjectOptions: projectOptions.length > 0,
      maskedFields,
    });
    setErrors(nextErrors);

    if (hasPersonnelFormErrors(nextErrors)) {
      shouldFocusRef.current = true;
      // Özet, alan mesajlarının İLKİDİR — yeni dize üretilmez.
      setFormError(Object.values(nextErrors)[0] ?? null);
      return;
    }

    const submittable = submittableValues(values);
    if (!submittable) return; // doğrulama geçtiyse ulaşılamaz; tip kapısı

    setFormError(null);
    const onError = (err: unknown) => {
      setFormError(personnelSubmitErrorMessage(err));
      // 409 (çift kayıt) hangi alanın çakıştığını da SÖYLER — 422 ile aynı
      // yere düşmesin diye TC alanının altına ayrı kısa mesaj basılır.
      if (isPersonnelDuplicateError(err)) {
        setErrors((prev) => ({ ...prev, tcNo: DUPLICATE_TC_FIELD_MESSAGE }));
      }
    };

    if (!isEdit) {
      createPersonnel.mutate(
        buildPersonnelCreateBody(submittable, { isDraft: intent === "draft" }),
        {
          // `usePersonnelMutations` başarıda personel önbelleğini geçersizleştirir
          // → matris/liste yeni kişiyi HEMEN çizer.
          onSuccess: () => router.push(returnTo),
          onError,
        },
      );
      return;
    }

    // Düzenleme: taslak düğmesi `true`, "Yayına Al" `false`, düz "Kaydet"
    // (yayındaki kayıt) `null` = anahtar hiç gönderilmez.
    const updateDraftFlag = intent === "draft" ? true : isDraftRecord ? false : null;

    updatePersonnel.mutate(
      buildPersonnelUpdateBody(submittable, {
        isDraft: updateDraftFlag,
        omitFields: omittedSelectFields,
      }),
      {
        onSuccess: () => router.push(routes.personnel.detail({ personnelId: props.personnelId })),
        onError,
      },
    );
  }

  // Yazma yetkisi olmayan kullanıcı bu rotayı hiç görmemeli (giriş noktaları
  // zaten gizli); doğrudan URL ile gelen için kapı burada.
  if (!canEdit) return <AccessDenied />;
  if (isEdit && isForbidden(detailQuery.error)) return <AccessDenied />;
  if (isEdit && detailQuery.isError) {
    return <p className="pf-message">Personel yüklenemedi</p>;
  }
  if (isEdit && (detailQuery.isLoading || !detail)) {
    return <p className="pf-message">Yükleniyor…</p>;
  }

  const pageTitle = isEdit ? PAGE_TITLE_EDIT : PAGE_TITLE;
  // Taslak bir kaydın birincil eylemi AÇIKÇA "Yayına Al"dır: düz "Kaydet"
  // yayınlamayı düzenlemenin sessiz yan etkisine çevirirdi (spec K4).
  const submitLabel = !isEdit
    ? SUBMIT_LABEL
    : isDraftRecord
      ? SUBMIT_LABEL_PUBLISH
      : SUBMIT_LABEL_EDIT;
  const breadcrumbCurrent = isEdit ? BREADCRUMB_CURRENT_EDIT : BREADCRUMB_CURRENT;
  // Taslak yolu YAYINLANMIŞ kayıtta kapalıdır (geri düşürme yok); oluşturma
  // ve taslak düzenleme kiplerinde AÇIK.
  const canSaveDraft = !isEdit || isDraftRecord;
  const saveDraft = canSaveDraft ? () => submit("draft") : undefined;

  return (
    <div className="pf-shell">
      {/* 30-42 — yapışkan üst şerit */}
      <div className="pf-topbar">
        <nav className="pf-breadcrumb" aria-label="Kırıntı yolu">
          {/* F-PT2 T3 kapsam C: `/personel` GERÇEK rota — kırıntı artık edilgen DEĞİL. */}
          <Link href={PERSONNEL_LIST_HREF}>{BREADCRUMB_HR}</Link>
          <span className="pf-breadcrumb__sep" aria-hidden="true">
            /
          </span>
          <span className="pf-breadcrumb__current" aria-current="page">
            {breadcrumbCurrent}
          </span>
        </nav>
        <div className="pf-topbar__actions">
          {/* 38 */}
          <Button
            variant="secondary"
            className="pf-topbar-cancel"
            onClick={handleCancel}
            disabled={isSaving}
          >
            İptal
          </Button>
          {/* 39 — taslak yolu (spec K4). Yayınlanmış kayıtta devre-dışıdır:
              yayındaki kayıt formdan sessizce taslağa DÜŞMEZ. */}
          <Button
            variant="secondary"
            className="pf-topbar-cancel"
            onClick={saveDraft}
            disabled={isSaving || !canSaveDraft}
            title={canSaveDraft ? undefined : PENDING_DRAFT_PUBLISHED}
          >
            {TOPBAR_DRAFT_LABEL}
          </Button>
          {/* 40 */}
          <Button
            variant="primary"
            className="pf-topbar-submit"
            onClick={() => submit("publish")}
            disabled={isSaving}
          >
            {isSaving ? "Kaydediliyor…" : submitLabel}
          </Button>
        </div>
      </div>

      <div className="pf">
        <header className="pf-head">
          {/* 47 */}
          <h1 className="pf-title">{pageTitle}</h1>
          {/* 48 */}
          <p className="pf-subtitle">
            {PAGE_SUBTITLE_PREFIX}
            <span className="pnf-req">*</span>
            {isEdit ? PAGE_SUBTITLE_EDIT_SUFFIX : PAGE_SUBTITLE_SUFFIX}
          </p>
          {/* K2 — mockup'ta karşılığı yok, yalnız düzenleme kipinde basılır. */}
          {isEdit && (
            <Checkbox
              className="pnf-active-toggle"
              checked={values.isActive}
              onChange={(event) => handleChange("isActive", event.target.checked)}
              label={ACTIVE_TOGGLE_LABEL}
            />
          )}
        </header>

        {/* Devre-dışı yüzeylerin + taslak/yayın yolunun GÖRÜNÜR açıklamaları —
            sessiz atlama yok. */}
        <ul className="pnf-notices" data-testid="personnel-form-notices">
          {isEdit && (
            <li className="pnf-notices__item">
              {isDraftRecord ? DRAFT_STATE_NOTICE : PUBLISHED_STATE_NOTICE}
            </li>
          )}
          {canSaveDraft && <li className="pnf-notices__item">{DRAFT_HINT}</li>}
          {PENDING_NOTICES.map((notice) => (
            <li key={notice} className="pnf-notices__item">
              {notice}
            </li>
          ))}
        </ul>

        <div className="pf-body" data-testid="personnel-form-body" ref={formRef}>
          <IdentityCard values={values} onChange={handleChange} errors={errors} maskedFields={maskedFields} />
          <ContactCard values={values} onChange={handleChange} errors={errors} maskedFields={maskedFields} />
          <JobCard
            values={values}
            onChange={handleChange}
            errors={errors}
            maskedFields={maskedFields}
            subcontractors={{
              items: subcontractorsQuery.data?.items ?? [],
              isLoading: subcontractorsQuery.isLoading,
              isError: subcontractorsQuery.isError,
            }}
            projects={{
              items: projectOptions,
              isLoading: projectsQuery.isLoading,
              isError: projectsQuery.isError,
            }}
          />
          <PersonnelDocumentsCard />
        </div>

        {formError && (
          <p className="pf-form-error" data-testid="personnel-form-error">
            {formError}
          </p>
        )}

        <PersonnelFormActions
          onCancel={handleCancel}
          onSubmit={() => submit("publish")}
          onSaveDraft={saveDraft}
          isPending={isSaving}
          submitLabel={submitLabel}
        />
      </div>
    </div>
  );
}
