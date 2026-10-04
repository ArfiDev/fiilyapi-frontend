"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { AccessDenied } from "@/components/settings/AccessDenied";
import { Button } from "@/components/ui";
import { UnitFormTabs } from "@/components/unit-shell/UnitFormTabs";
import { SALES_LIST_HREF } from "@/components/unit-shell/routes";
import { backendErrorMessage } from "@/lib/api/error-message";
import { useProjectBlocks, type BlockResponse } from "@/lib/api/hooks/useProjectBlocks";
import { useProjects } from "@/lib/api/hooks/useProjects";
import { useSites } from "@/lib/api/hooks/useSites";
import { useCreateUnit } from "@/lib/api/hooks/useUnitMutations";
import { isForbidden } from "@/lib/api/unwrap";
import { useModulePermission } from "@/lib/auth/useModulePermission";
import { PROJECT_UNITS_EDIT } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";

import { buildUnitBody } from "./build-body";
import {
  UNIT_CANCEL_LABEL,
  UNIT_FORM_SUBTITLE,
  UNIT_FORM_TITLE,
  UNIT_PROJECT_REQUIRED_MESSAGE,
  UNIT_SAVE_ERROR_FALLBACK,
  UNIT_SUBMIT_AND_NEW_LABEL,
  UNIT_SUBMIT_LABEL,
} from "./constants";
import {
  emptyUnitFormValues,
  setUnitField,
  type UnitFormField,
  type UnitFormValues,
} from "./form-state";
import { UnitDocumentsCard } from "./UnitDocumentsCard";
import { UnitInfoCard } from "./UnitInfoCard";
import { UnitLocationCard } from "./UnitLocationCard";
import { UnitPricingCard } from "./UnitPricingCard";
import { PROJECT_PARAM } from "@/lib/navigation-params";
// Sıra önemli: ortak kabuk → aile ortağı → forma özgü bloklar.
import "@/styles/form-shell.css";
import "@/components/unit-shell/unit-shell.css";
import "./unit-form.css";

/**
 * UE — "Ünite Ekle" formu (`Form - Unite Ekle.dc.html`, kanonik).
 * Yorumlardaki sayılar O DOSYANIN satır numaralarıdır.
 *
 * ⚠️ TAM SAYFA, MODAL DEĞİL: mockup kendi breadcrumb'ını (37), yapışkan üst
 * barını (32-44) ve beş sekmelik şeridini (49-55) çizer; "İptal" (40/125) bir
 * `<a href>`, yani GEZİNMEDİR.
 *
 * ⚠️ Kabuk canonu: mockup'ın kendi üst barı ve sol menüsü BASILMAZ; üst
 * bardaki ÜÇ eylem kabuğa oturur (`SaleCreateView` emsali).
 *
 * ⚠️ İZİN AYRIMI: ünite uçlarının kapısı `projects` modülüdür (`sales` DEĞİL).
 *
 * ⚠️ ŞANTİYE SÜZGECİ (64) GÖVDEYE GİRMEZ: blok listesini istemcide daraltır.
 * `BlockResponse` her satırda `site_id` taşıdığı için ikinci bir istek AÇILMAZ.
 */
export function UnitCreateView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const permission = useModulePermission("projects");
  // IZN-F2.x · blok/ünite/toplu/Excel/paylaşım yazma kapısı = mali.satis_* Düzenler (VEYA).
  const canEdit = useButtonGate({ pages: PROJECT_UNITS_EDIT, need: "edit", fallback: permission.canWrite });

  const [values, setValues] = useState<UnitFormValues>(() => emptyUnitFormValues());
  const [touched, setTouched] = useState<ReadonlySet<UnitFormField>>(
    () => new Set<UnitFormField>(),
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const projectsQuery = useProjects();
  const sitesQuery = useSites(values.projectId);
  const blocksQuery = useProjectBlocks(values.projectId);
  const createUnit = useCreateUnit();

  // `?proje=` tohumlaması — YALNIZ BİR KEZ (`SaleCreateView` deseni).
  const projectSeededRef = useRef(false);
  useEffect(() => {
    if (projectSeededRef.current) return;
    projectSeededRef.current = true;
    const projeParam = searchParams.get(PROJECT_PARAM);
    if (projeParam) setValues((prev) => ({ ...prev, projectId: projeParam }));
  }, [searchParams]);

  const projects = projectsQuery.data?.items ?? [];
  const sites = sitesQuery.data?.items ?? [];
  const allBlocks = useMemo<readonly BlockResponse[]>(
    () => blocksQuery.data?.blocks ?? [],
    [blocksQuery.data],
  );

  // UE 64 — şantiye YALNIZ süzgeçtir; seçim yoksa liste daralmaz.
  const blocks = useMemo(
    () =>
      values.siteId === ""
        ? allBlocks
        : allBlocks.filter((block) => block.site_id === values.siteId),
    [allBlocks, values.siteId],
  );

  const selectedBlock = useMemo(
    () => allBlocks.find((block) => block.id === values.blockId) ?? null,
    [allBlocks, values.blockId],
  );

  // SEKME-F1.3b · dirty (tercih 1, hazır): `touched` Set'i ZATEN VAR. ASYNC
  // TABAN DEĞİL (yalnız `?proje=` URL tohumu, `touched`ı kirletmez).
  // 🔴 Hook, erken dönüşten (`AccessDenied`) ÖNCE çağrılır.
  useUnsavedChanges(touched.size > 0, "Ünite");

  if (!canEdit) return <AccessDenied />;

  const isSaving = createUnit.isPending;

  const blocksNotice = blocksQuery.isError
    ? isForbidden(blocksQuery.error)
      ? "Blok listesi için proje yetkisi gerekiyor."
      : backendErrorMessage(blocksQuery.error, "Blok listesi yüklenemedi.")
    : values.projectId === ""
      ? "Önce bir proje seçin — blok listesi projeye bağlıdır."
      : null;

  function handleChangeField<K extends UnitFormField>(field: K, value: UnitFormValues[K]) {
    setValues((prev) => setUnitField(prev, field, value));
    setTouched((prev) => new Set(prev).add(field));
  }

  function handleChangeProject(projectId: string) {
    // Proje değişince şantiye VE blok seçimi geçersizleşir; kat da bloğa
    // bağlıdır (`floor-options.ts`) — üçü birlikte sıfırlanır.
    setValues((prev) => ({ ...prev, projectId, siteId: "", blockId: "", floor: "" }));
    setTouched((prev) => {
      const next = new Set(prev);
      next.add("projectId");
      next.delete("blockId");
      next.delete("floor");
      return next;
    });
    const params = new URLSearchParams(searchParams.toString());
    if (projectId) params.set(PROJECT_PARAM, projectId);
    else params.delete(PROJECT_PARAM);
    const next = params.toString();
    router.replace(next.length > 0 ? `${pathname}?${next}` : pathname, { scroll: false });
  }

  function handleChangeBlock(blockId: string) {
    // Blok doğrudan değişince eski bloğun katı yeni blokta anlamsızlaşır;
    // proje/şantiye değişimleriyle AYNI desende sıfırlanır (kalan-6 no 338).
    setValues((prev) => ({ ...prev, blockId, floor: "" }));
    setTouched((prev) => {
      const next = new Set(prev);
      next.add("blockId");
      next.delete("floor");
      return next;
    });
  }

  function handleChangeSite(siteId: string) {
    // Şantiye süzgeci değişince seçili blok listenin dışında kalabilir; blok ve
    // ona bağlı kat sıfırlanır (görünmeyen bir bloğu gövdeye göndermemek için).
    setValues((prev) => ({ ...prev, siteId, blockId: "", floor: "" }));
    setTouched((prev) => {
      const next = new Set(prev);
      next.delete("blockId");
      next.delete("floor");
      return next;
    });
  }

  /** Kaydeder; başarıda `true` döner (çağıran yönlendirir ya da formu tazeler). */
  async function saveUnit(): Promise<boolean> {
    if (values.projectId === "") {
      setFormError(UNIT_PROJECT_REQUIRED_MESSAGE);
      return false;
    }
    setFormError(null);
    try {
      await createUnit.mutateAsync({
        projectId: values.projectId,
        body: buildUnitBody(values, touched),
      });
      return true;
    } catch (error) {
      // Sunucunun 404 (IDOR-9) / 409 / 422 gövdesi OLDUĞU GİBİ basılır —
      // başarı taklidi YOK.
      setFormError(backendErrorMessage(error, UNIT_SAVE_ERROR_FALLBACK));
      return false;
    }
  }

  async function handleSubmit() {
    if (await saveUnit()) router.push(SALES_LIST_HREF);
  }

  /**
   * UE 41/126 "Kaydet & Yeni Ekle" — aynı POST, ama listeye DÖNMEZ: form
   * temizlenir ve KONUM (proje/şantiye/blok/kat) korunur. Aynı katta arka
   * arkaya ünite girmek bu formun asıl kullanımıdır; konumu da sıfırlamak
   * kullanıcıya her seferinde dört seçiciyi yeniden doldurturdu.
   */
  async function handleSubmitAndNew() {
    if (!(await saveUnit())) return;
    const savedUnitNo = values.unitNo.trim();
    setValues((prev) => ({
      ...emptyUnitFormValues(),
      projectId: prev.projectId,
      siteId: prev.siteId,
      blockId: prev.blockId,
      floor: prev.floor,
    }));
    setTouched((prev) => {
      const next = new Set<UnitFormField>();
      // Konum korunduğu için ONUN dokunma kaydı da korunur; geri kalan her
      // alan yeniden "dokunulmamış"tır.
      if (prev.has("floor")) next.add("floor");
      return next;
    });
    setSavedNotice(
      savedUnitNo === ""
        ? "Ünite kaydedildi. Aynı konumda yenisini ekleyebilirsiniz."
        : `"${savedUnitNo}" kaydedildi. Aynı konumda yenisini ekleyebilirsiniz.`,
    );
  }

  function handleCancel() {
    router.push(SALES_LIST_HREF);
  }

  return (
    <div className="pf-shell">
      {/* 32-44 — kabuk canonuna oturtulmuş üst şerit */}
      <div className="pf-topbar">
        <nav className="pf-breadcrumb" aria-label="Kırıntı yolu">
          <Link href={SALES_LIST_HREF}>Satış Yönetimi</Link>
          <span className="pf-breadcrumb__sep" aria-hidden="true">
            /
          </span>
          <span className="pf-breadcrumb__current" aria-current="page">
            Ünite Ekle
          </span>
        </nav>
        <div className="pf-topbar__actions">
          <Button
            variant="secondary"
            className="pf-topbar-cancel"
            onClick={handleCancel}
            disabled={isSaving}
          >
            {UNIT_CANCEL_LABEL}
          </Button>
          {/* 41 — üst barda kısaltılmış etiket ("Kaydet & Yeni") */}
          <Button
            variant="secondary"
            className="pf-topbar-cancel"
            data-testid="unite-form-kaydet-yeni-ust"
            onClick={handleSubmitAndNew}
            disabled={isSaving}
          >
            Kaydet &amp; Yeni
          </Button>
          <Button
            variant="primary"
            className="pf-topbar-submit"
            data-testid="unite-form-kaydet-ust"
            onClick={handleSubmit}
            disabled={isSaving}
          >
            {isSaving ? "Kaydediliyor…" : UNIT_SUBMIT_LABEL}
          </Button>
        </div>
      </div>

      <div className="pf ue-page">
        {/* 49-55 */}
        <UnitFormTabs activeTab="Ünite Ekle" />

        <header className="pf-head">
          <h1 className="pf-title">{UNIT_FORM_TITLE}</h1>
          <p className="pf-subtitle">{UNIT_FORM_SUBTITLE}</p>
        </header>

        {savedNotice && (
          <p className="uf-notice" data-testid="unite-form-kayit-notu">
            {savedNotice}
          </p>
        )}

        <div className="pf-body" data-testid="unite-form-govde">
          <UnitLocationCard
            values={values}
            projects={projects}
            sites={sites}
            blocks={blocks}
            selectedBlock={selectedBlock}
            projectsDisabled={projectsQuery.isLoading || projectsQuery.isError}
            sitesDisabled={sitesQuery.isLoading || sitesQuery.isError}
            blocksDisabled={blocksQuery.isLoading || blocksQuery.isError}
            blocksNotice={blocksNotice}
            onChangeProject={handleChangeProject}
            onChangeSite={handleChangeSite}
            onChangeBlock={handleChangeBlock}
            onChangeField={handleChangeField}
          />

          <UnitInfoCard values={values} onChangeField={handleChangeField} />

          <UnitPricingCard values={values} onChangeField={handleChangeField} />

          <UnitDocumentsCard />
        </div>

        {formError && (
          <p className="pf-form-error" data-testid="unite-form-hata">
            {formError}
          </p>
        )}

        {/* 124-128 — alt eylem şeridi (sağa yaslı, üç düğme) */}
        <div className="pf-actions">
          <Button
            variant="secondary"
            className="pf-action pf-action--cancel"
            onClick={handleCancel}
            disabled={isSaving}
          >
            {UNIT_CANCEL_LABEL}
          </Button>
          <Button
            variant="secondary"
            className="pf-action pf-action--draft"
            data-testid="unite-form-kaydet-yeni"
            onClick={handleSubmitAndNew}
            disabled={isSaving}
          >
            {UNIT_SUBMIT_AND_NEW_LABEL}
          </Button>
          <Button
            variant="primary"
            className="pf-action pf-action--submit"
            data-testid="unite-form-kaydet"
            onClick={handleSubmit}
            disabled={isSaving}
          >
            {isSaving ? "Kaydediliyor…" : UNIT_SUBMIT_LABEL}
          </Button>
        </div>
      </div>
    </div>
  );
}
