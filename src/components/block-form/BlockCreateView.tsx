"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { AccessDenied } from "@/components/settings/AccessDenied";
import { Button, Checkbox } from "@/components/ui";
import { UnitFormTabs } from "@/components/unit-shell/UnitFormTabs";
import { BULK_UNIT_FORM_HREF, SALES_LIST_HREF } from "@/components/unit-shell/routes";
import { backendErrorMessage } from "@/lib/api/error-message";
import { useProjects } from "@/lib/api/hooks/useProjects";
import { useSites } from "@/lib/api/hooks/useSites";
import { useCreateBlock } from "@/lib/api/hooks/useUnitMutations";
import { isForbidden } from "@/lib/api/unwrap";
import { SALES_BLOCK_EDIT } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";

import { buildBlockBody } from "./build-body";
import {
  BLOCK_BULK_UNITS_LABEL,
  BLOCK_CANCEL_LABEL,
  BLOCK_FORM_SUBTITLE,
  BLOCK_FORM_TITLE,
  BLOCK_PROJECT_REQUIRED_MESSAGE,
  BLOCK_SAVE_ERROR_FALLBACK,
  BLOCK_SUBMIT_LABEL,
} from "./constants";
import {
  emptyBlockFormValues,
  setBlockField,
  type BlockFormField,
  type BlockFormValues,
} from "./form-state";
import { BlockExtraCard } from "./BlockExtraCard";
import { BlockInfoCard } from "./BlockInfoCard";
import { BlockStructureCard } from "./BlockStructureCard";
import { PROJECT_PARAM, BLOCK_PARAM } from "@/lib/navigation-params";
// Sıra önemli: ortak kabuk → aile ortağı → forma özgü bloklar.
import "@/styles/form-shell.css";
import "@/components/unit-shell/unit-shell.css";
import "./block-form.css";

/**
 * BE — "Yeni Blok Ekle" formu (`Form - Blok Ekle.dc.html`, kanonik).
 * Yorumlardaki sayılar O DOSYANIN satır numaralarıdır.
 *
 * ⚠️ TAM SAYFA, MODAL DEĞİL: mockup kendi breadcrumb'ını (35), yapışkan üst
 * barını (30-41) ve beş sekmelik şeridini (47-53) çizer — üçü de modalde
 * bulunmaz; "İptal" (38/112) bir `<a href>`, yani GEZİNMEDİR.
 *
 * ⚠️ Kabuk canonu: mockup'ın kendi üst barı ve sol menüsü BASILMAZ (F3 Topbar +
 * Sidebar kazanır); üst bardaki İKİ EYLEM kabuğa oturur (`SaleCreateView`
 * emsali).
 *
 * ⚠️ İZİN AYRIMI: blok/ünite uçlarının kapısı `projects` modülüdür (`sales`
 * DEĞİL) — `useProjectUnits.ts`in ölçtüğü ayrım.
 *
 * ⚠️ KARAR 11: istemci "zorunlu alan" diye kaydı ENGELLEMEZ. Boş ad ile
 * kaydetmek 422 döndürür ve o hata OLDUĞU GİBİ basılır — başarı taklidi
 * yapılmaz. TEK istisna `project_id`dir ve o bir GÖVDE ALANI DEĞİL, yol
 * parçasıdır (bkz. `BLOCK_PROJECT_REQUIRED_MESSAGE`).
 */
export function BlockCreateView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // IZN-F2.x · blok/ünite/toplu/Excel/paylaşım yazma kapısı = mali.satis_* Düzenler (VEYA).
  const canEdit = useButtonGate({ pages: SALES_BLOCK_EDIT, need: "edit" });

  const [values, setValues] = useState<BlockFormValues>(() => emptyBlockFormValues());
  const [touched, setTouched] = useState<ReadonlySet<BlockFormField>>(
    () => new Set<BlockFormField>(),
  );
  const [formError, setFormError] = useState<string | null>(null);

  const projectsQuery = useProjects();
  const sitesQuery = useSites(values.projectId);
  const createBlock = useCreateBlock();

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

  // SEKME-F1.3b — hook, erken dönüşten ÖNCE (Rules of Hooks).
  useUnsavedChanges(touched.size > 0, "Blok formu");

  if (!canEdit) return <AccessDenied />;

  const isSaving = createBlock.isPending;

  const sitesNotice = sitesQuery.isError
    ? isForbidden(sitesQuery.error)
      ? "Şantiye listesi için proje yetkisi gerekiyor."
      : backendErrorMessage(sitesQuery.error, "Şantiye listesi yüklenemedi.")
    : values.projectId === ""
      ? "Önce bir proje seçin — şantiye listesi projeye bağlıdır."
      : null;

  /**
   * Alan yazımı + DOKUNMA KAYDI. Kapı `build-body.ts`tedir; burada yalnız
   * "kullanıcı bu alana dokundu" gerçeği işaretlenir. Set KOPYALANIR: yerinde
   * `add` referansı değiştirmez ve React yeniden çizimi sessizce kaçırırdı.
   */
  function handleChangeField<K extends BlockFormField>(field: K, value: BlockFormValues[K]) {
    setValues((prev) => setBlockField(prev, field, value));
    setTouched((prev) => new Set(prev).add(field));
  }

  function handleChangeProject(projectId: string) {
    // Proje değişince şantiye seçimi geçersizleşir (liste projeye bağlıdır).
    setValues((prev) => ({ ...prev, projectId, siteId: "" }));
    setTouched((prev) => {
      const next = new Set(prev);
      next.add("projectId");
      next.delete("siteId");
      return next;
    });
    // Seçim URL'de taşınır: paylaşılabilir ve yeniden yüklemede korunur.
    const params = new URLSearchParams(searchParams.toString());
    if (projectId) params.set(PROJECT_PARAM, projectId);
    else params.delete(PROJECT_PARAM);
    const next = params.toString();
    router.replace(next.length > 0 ? `${pathname}?${next}` : pathname, { scroll: false });
  }

  async function handleSubmit() {
    if (values.projectId === "") {
      setFormError(BLOCK_PROJECT_REQUIRED_MESSAGE);
      return;
    }
    setFormError(null);
    try {
      const block = await createBlock.mutateAsync({
        projectId: values.projectId,
        body: buildBlockBody(values, touched),
      });
      // BE 109 — 🔴 GEZİNME BAYRAĞI. İşaretliyse kullanıcı toplu üretim
      // ekranına YENİ BLOĞUN bağlamıyla götürülür: yalnız `?proje=` vermek onu
      // blok seçicisi BOŞ bir ekrana bırakır ve kutucuk süs olurdu. Blok
      // kimliği oluşturma cevabından gelir (`BlockResponse.id`).
      if (values.goToBulkUnits) {
        const params = new URLSearchParams({
          [PROJECT_PARAM]: values.projectId,
          [BLOCK_PARAM]: block.id,
        });
        router.push(`${BULK_UNIT_FORM_HREF}?${params.toString()}`);
        return;
      }
      router.push(SALES_LIST_HREF);
    } catch (error) {
      // Sunucunun 422/409 gövdesi OLDUĞU GİBİ basılır — kayıt başarılı gibi
      // gösterilmez ve kullanıcı listeye yönlendirilmez.
      setFormError(backendErrorMessage(error, BLOCK_SAVE_ERROR_FALLBACK));
    }
  }

  function handleCancel() {
    router.push(SALES_LIST_HREF);
  }

  return (
    <div className="pf-shell">
      {/* 30-41 — kabuk canonuna oturtulmuş üst şerit */}
      <div className="pf-topbar">
        <nav className="pf-breadcrumb" aria-label="Kırıntı yolu">
          <Link href={SALES_LIST_HREF}>Satış Yönetimi</Link>
          <span className="pf-breadcrumb__sep" aria-hidden="true">
            /
          </span>
          <span className="pf-breadcrumb__current" aria-current="page">
            Blok Ekle
          </span>
        </nav>
        <div className="pf-topbar__actions">
          <Button
            variant="secondary"
            className="pf-topbar-cancel"
            onClick={handleCancel}
            disabled={isSaving}
          >
            {BLOCK_CANCEL_LABEL}
          </Button>
          <Button
            variant="primary"
            className="pf-topbar-submit"
            data-testid="blok-form-kaydet-ust"
            onClick={handleSubmit}
            disabled={isSaving}
          >
            {isSaving ? "Kaydediliyor…" : BLOCK_SUBMIT_LABEL}
          </Button>
        </div>
      </div>

      <div className="pf be-page">
        {/* 47-53 */}
        <UnitFormTabs activeTab="Blok Ekle" />

        <header className="pf-head">
          <h1 className="pf-title">{BLOCK_FORM_TITLE}</h1>
          <p className="pf-subtitle">{BLOCK_FORM_SUBTITLE}</p>
        </header>

        <div className="pf-body" data-testid="blok-form-govde">
          <BlockInfoCard
            values={values}
            projects={projects}
            sites={sites}
            projectsDisabled={projectsQuery.isLoading || projectsQuery.isError}
            sitesDisabled={sitesQuery.isLoading || sitesQuery.isError}
            sitesNotice={sitesNotice}
            onChangeProject={handleChangeProject}
            onChangeField={handleChangeField}
          />

          <BlockStructureCard values={values} onChangeField={handleChangeField} />

          <BlockExtraCard values={values} onChangeField={handleChangeField} />
        </div>

        {formError && (
          <p className="pf-form-error" data-testid="blok-form-hata">
            {formError}
          </p>
        )}

        {/* 106-115 — alt eylem şeridi */}
        <div className="pf-actions pf-actions--split">
          {/* 107-110 — 🔴 ARTIK GERÇEK (F-UNIT2 T2c): hedefi `/satis/toplu-uretim`
              T2a'da açıldı, bu yüzden kutucuk etkinleştirildi ve "henüz
              açılmadı" gerekçesi KALDIRILDI — canlı bir ekranı yalanlayan not
              ekranda bırakılmaz. İşaretlenirse kayıt başarısında `router.push`
              çalışır; bayrak GÖVDEYE GİRMEZ (`build-body.ts`). Mockup kutuyu
              `checked` çizer ama bu ÖRNEK VERİDİR: kullanıcı adına gezinme
              kararı verilmez. */}
          <span className="be-bulk">
            <Checkbox
              size="lg"
              data-testid="blok-form-toplu-uretim"
              label={BLOCK_BULK_UNITS_LABEL}
              checked={values.goToBulkUnits}
              disabled={isSaving}
              onChange={(event) => handleChangeField("goToBulkUnits", event.target.checked)}
            />
          </span>

          <div className="pf-actions__group">
            <Button
              variant="secondary"
              className="pf-action pf-action--cancel"
              onClick={handleCancel}
              disabled={isSaving}
            >
              {BLOCK_CANCEL_LABEL}
            </Button>
            <Button
              variant="primary"
              className="pf-action pf-action--submit"
              data-testid="blok-form-kaydet"
              onClick={handleSubmit}
              disabled={isSaving}
            >
              {isSaving ? "Kaydediliyor…" : BLOCK_SUBMIT_LABEL}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
