"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { AccessDenied } from "@/components/settings/AccessDenied";
import { Button } from "@/components/ui";
import { DocumentsPlaceholderCard, FormActions } from "@/components/form-shell";
import { SubcontractorFormModal } from "@/components/subcontractors/SubcontractorFormModal";
import { contractTabHref } from "@/components/contracts/contract-tabs";
import { backendErrorMessage } from "@/lib/api/error-message";
import { isForbidden } from "@/lib/api/unwrap";
import { useModulePermission } from "@/lib/auth/useModulePermission";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";
import { useEmployerContract } from "@/lib/api/hooks/useContract";
import { useProjects } from "@/lib/api/hooks/useProjects";
import { useSites } from "@/lib/api/hooks/useSites";
import { useSubcontractors } from "@/lib/api/hooks/useSubcontractors";
import type { SubcontractorResponse } from "@/lib/api/hooks/useSubcontractorMutations";
import { useSubcontractorContract } from "@/lib/api/hooks/useSubcontractorProgressPayments";
import {
  useCreateSubcontractorContract,
  useDeleteSubcontractorContractItem,
  useLoadSubcontractorContractItemsFromEmployer,
  useUpdateSubcontractorContract,
  useUpdateSubcontractorContractItem,
} from "@/lib/api/hooks/useSubcontractorContractMutations";

import { buildContractCreateBody, buildContractUpdateBody } from "./build-body";
import { ContractItemsCard } from "./ContractItemsCard";
import { ContractTermsCard } from "./ContractTermsCard";
import {
  CONTRACT_DOCUMENTS,
  CONTRACT_DOCUMENTS_DROP_SUBTITLE,
  CONTRACT_DOCUMENTS_DROP_TITLE,
  CONTRACT_DOCUMENTS_NOTE,
  CONTRACT_DOCUMENTS_SOON_TITLE,
  CONTRACT_DOCUMENTS_TITLE,
} from "./documents";
import { FSO_TEXT, ITEMS_NEED_PROJECT_REASON } from "./constants";
import {
  emptySubcontractorContractFormValues,
  type ContractTermsValues,
  type SubcontractorContractFormValues,
} from "./form-state";
import { ProjectLinkCard } from "./ProjectLinkCard";
import { SubcontractorInfoCard } from "./SubcontractorInfoCard";
import {
  hasContractFormErrors,
  validateContractForm,
  type SubcontractorContractFormErrors,
} from "./validate";
// Sıra önemli: önce paylaşılan kabuk, sonra ekrana özgü bloklar.
import "@/styles/form-shell.css";
import "./subcontractor-contract-form.css";

/**
 * FSO · `/sozlesmeler/taseron/yeni` — Yeni Taşeron Sözleşmesi formu
 * (`Form - Sözleşme Oluştur.dc.html`). Beş kart mockup'la birebir:
 * 51 Proje Bağlantısı · 71 Taşeron Bilgileri · 87 Sözleşme Şartları ·
 * 112 Poz Listesi · 190 Sözleşme Belgeleri.
 *
 * **İKİ ADIMLI KAYDETME (bilinçli sapma, F-SD emsali).** Poz uçlarının HEPSİ
 * sözleşme kimliğiyle çalışır (`POST /subcontractor-contracts/{id}/items/
 * load-from-employer`, `PATCH|DELETE /subcontractor-contracts/items/{id}`) —
 * yani mockup'ın DOLU poz tablosu, sözleşme kaydı olmadan var olamaz.
 * Bu yüzden "İşveren Sözleşmesinden Yükle"ye ilk basıldığında form kendini
 * TASLAK olarak kaydeder (`is_draft: true`) ve poz akışı gerçek uçlar
 * üzerinden sürer. Kullanıcı için tek tıklamadır; ekran mockup'ın gösterdiği
 * hâle gelir. Alternatif (kalemleri iç içe `items[]` ile göndermek) ne
 * `created/skipped` bildirimini ne de `items_missing_price` sayacını
 * üretebilirdi — ikisi de sunucu yanıtıdır.
 */
export function SubcontractorContractCreateView() {
  const router = useRouter();
  const { canWrite, canDelete } = useModulePermission("contracts");

  const [values, setValues] = useState<SubcontractorContractFormValues>(
    emptySubcontractorContractFormValues,
  );
  const [errors, setErrors] = useState<SubcontractorContractFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [contractId, setContractId] = useState<string | null>(null);
  const [loadNotice, setLoadNotice] = useState<{ created: number; skipped: number } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoadQueued, setIsLoadQueued] = useState(false);

  // SEKME-F1.3b (B5, ORTAK EMİR KURAL 1) · dirty = YALNIZ commit edilmemiş
  // ALAN değerleri (`values`in boş formdan farkı, tercih 1). Taslak
  // sözleşmenin sunucuda KALEMSİZ durması (yalnız `contractId` set edilmiş
  // olması) kirli SAYILMAZ — poz satırları `handleCommitItem`/
  // `handleDeleteItem` ile ANINDA kaydolur, ayrı bir taslak değildir. ASYNC
  // TABAN DEĞİL (`detailQuery` kalemleri sunucudan gelir ama `values`in
  // kendisi async seed almaz). Sıfırlama: her iki `submit` yolu da
  // (taslak/nihai) başarıda `router.push(listHref)` ile unmount eder.
  const isDirty = JSON.stringify(values) !== JSON.stringify(emptySubcontractorContractFormValues());
  useUnsavedChanges(isDirty, "Taşeron sözleşmesi");

  const projectsQuery = useProjects();
  const sitesQuery = useSites(values.projectId);
  const subcontractorsQuery = useSubcontractors();
  const employerContractQuery = useEmployerContract(values.projectId);
  const detailQuery = useSubcontractorContract(contractId ?? "");

  const createContract = useCreateSubcontractorContract(values.projectId);
  const updateContract = useUpdateSubcontractorContract(contractId ?? "");
  const loadItems = useLoadSubcontractorContractItemsFromEmployer(contractId ?? "");
  const updateItem = useUpdateSubcontractorContractItem(contractId ?? "");
  const deleteItem = useDeleteSubcontractorContractItem(contractId ?? "");

  // Mutasyon nesnesi her render'da yenidir; kuyruk etkisinin bağımlılığı
  // olarak kullanılırsa gereksiz koşar. Ref ile SON hâli tutulur — bu etki,
  // kuyruk etkisinden ÖNCE tanımlıdır, yani aynı commit'te önce çalışır.
  const loadItemsRef = useRef(loadItems);
  useEffect(() => {
    loadItemsRef.current = loadItems;
  });

  // Taslak kaydı oluştuğunda kuyruğa alınmış "işveren sözleşmesinden yükle"
  // çağrısı buradan tetiklenir: hook sözleşme kimliğini RENDER anında bağlar,
  // bu yüzden `setContractId` sonrası bir render beklemek zorunludur.
  useEffect(() => {
    if (!isLoadQueued || !contractId) return;
    setIsLoadQueued(false);
    loadItemsRef.current.mutate(undefined, {
      onSuccess: (response) =>
        setLoadNotice({ created: response.created_count, skipped: response.skipped_count }),
      onError: (error) => setLoadError(backendErrorMessage(error)),
    });
  }, [isLoadQueued, contractId]);

  const shouldFocusRef = useRef(false);
  const formRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!shouldFocusRef.current) return;
    shouldFocusRef.current = false;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [errors]);

  if (!canWrite) return <AccessDenied />;
  if (isForbidden(projectsQuery.error) || isForbidden(subcontractorsQuery.error)) {
    return <AccessDenied />;
  }

  const projects = projectsQuery.data?.items ?? [];
  const sites = sitesQuery.data?.items ?? [];
  const subcontractors = subcontractorsQuery.data?.items ?? [];
  const selectedSubcontractor =
    subcontractors.find((item) => item.id === values.subcontractorId) ?? null;

  const detail = detailQuery.data;
  const employerContract = employerContractQuery.data;
  const employerContractNo = employerContract?.contract_no ?? null;

  const isSaving = createContract.isPending || updateContract.isPending;
  const isItemBusy = updateItem.isPending || deleteItem.isPending;
  const listHref = contractTabHref("subcontractor");

  const employerContractNote = !values.projectId
    ? "Proje seçilince sözleşme no görünür"
    : employerContractQuery.isLoading
      ? "Yükleniyor…"
      : employerContractNo
        ? null
        : "Seçili projenin işveren sözleşmesi bulunamadı";

  const loadDisabledReason = !values.projectId
    ? ITEMS_NEED_PROJECT_REASON
    : employerContractQuery.isLoading
      ? "İşveren sözleşmesi yükleniyor…"
      : !employerContractNo
        ? "Seçili projenin işveren sözleşmesi yok — poz listesi buradan gelir"
        : null;

  function handleChange<K extends keyof SubcontractorContractFormValues>(
    field: K,
    value: SubcontractorContractFormValues[K],
  ) {
    setValues((prev) => ({ ...prev, [field]: value }));
  }

  // Şart kartı PAYLAŞILAN olduğu için kendi dar tipiyle konuşur (T7 aynı kartı
  // sözleşme detayında kullanacak); iki generic imza doğrudan atanamaz.
  function handleTermsChange<K extends keyof ContractTermsValues>(
    field: K,
    value: ContractTermsValues[K],
  ) {
    setValues((prev) => ({ ...prev, [field]: value }));
  }

  function handleChangeProject(projectId: string) {
    // Şantiye projeye bağlıdır — proje değişince seçim DÜŞER, aksi hâlde
    // başka projenin şantiyesi gövdeye sızardı.
    setValues((prev) => ({ ...prev, projectId, siteId: "" }));
    // no 336 · Taslak (varsa) ESKİ projeye aittir. `contractId` düşmezse
    // `submit` yeni projenin alanlarını (özellikle `site_id`) eski projedeki
    // sözleşmeye PATCH eder — başka projenin şantiyesi o kayda sızar. Proje
    // değişince taslak bağlamı TAMAMEN sıfırlanır: bir sonraki kaydetme YENİ
    // bir sözleşme açar (poz listesi de bu kimliğe bağlıydı — o da düşer).
    setContractId(null);
    setLoadNotice(null);
    setLoadError(null);
    setIsLoadQueued(false);
  }

  function handleCancel() {
    router.push(listHref);
  }

  function handleSubcontractorCreated(created: SubcontractorResponse) {
    setIsModalOpen(false);
    // Modal'ın döndürdüğü kayıt DOĞRUDAN seçili olur; salt-okunur alanlar
    // listeden süzülerek dolar (liste geçersiz kılındığı için yeni kaydı
    // içerir).
    setValues((prev) => ({ ...prev, subcontractorId: created.id }));
  }

  function handleLoadFromEmployer() {
    setLoadError(null);
    setLoadNotice(null);
    if (contractId) {
      setIsLoadQueued(true);
      return;
    }
    const nextErrors = validateContractForm(values, { isDraft: true });
    setErrors(nextErrors);
    if (hasContractFormErrors(nextErrors)) {
      shouldFocusRef.current = true;
      setFormError(Object.values(nextErrors)[0] ?? null);
      return;
    }
    setFormError(null);
    createContract.mutate(buildContractCreateBody(values, { isDraft: true }), {
      onSuccess: (created) => {
        setContractId(created.id);
        setIsLoadQueued(true);
      },
      onError: (error) => setLoadError(backendErrorMessage(error)),
    });
  }

  function handleCommitItem(itemId: string, patch: { quantity?: string; unitPrice?: string }) {
    const body = {
      ...(patch.quantity !== undefined ? { quantity: patch.quantity } : {}),
      // Boş fiyat = "girilmedi" → `null`. `0` ASLA türetilmez.
      ...(patch.unitPrice !== undefined
        ? { unit_price: patch.unitPrice.trim() ? patch.unitPrice.trim() : null }
        : {}),
    };
    updateItem.mutate(
      { itemId, body },
      { onError: (error) => setFormError(backendErrorMessage(error)) },
    );
  }

  function handleDeleteItem(itemId: string) {
    deleteItem.mutate(itemId, {
      onError: (error) => setFormError(backendErrorMessage(error)),
    });
  }

  function submit(isDraft: boolean) {
    const nextErrors = validateContractForm(values, { isDraft });
    setErrors(nextErrors);
    if (hasContractFormErrors(nextErrors)) {
      shouldFocusRef.current = true;
      setFormError(Object.values(nextErrors)[0] ?? null);
      return;
    }
    setFormError(null);
    const onError = (error: unknown) => setFormError(backendErrorMessage(error));

    // Taslak zaten kurulmuşsa (poz listesi yüklendiği için) İKİNCİ bir
    // sözleşme yaratılmaz — mevcut kayıt güncellenir.
    if (contractId) {
      updateContract.mutate(buildContractUpdateBody(values, { isDraft }), {
        onSuccess: () => router.push(listHref),
        onError,
      });
      return;
    }
    createContract.mutate(buildContractCreateBody(values, { isDraft }), {
      onSuccess: () => router.push(listHref),
      onError,
    });
  }

  return (
    <div className="pf-shell">
      {/* 31-42 · üst şerit: kırıntı yolu + İptal + birincil eylem */}
      <div className="pf-topbar">
        <nav className="pf-breadcrumb" aria-label="Kırıntı yolu">
          {/* no 329 · kırıntı `routes.contracts.subcontractorList()`
              (`/sozlesmeler/taseronlar`) İptal/başarı `listHref`inden
              (`contractTabHref("subcontractor")` → `/sozlesmeler?type=
              subcontractor`) FARKLI bir rotaydı — TEK hedef kullanılır. */}
          <Link href={listHref}>{FSO_TEXT.breadcrumbRoot}</Link>
          <span className="pf-breadcrumb__sep" aria-hidden="true">
            /
          </span>
          <span className="pf-breadcrumb__current" aria-current="page">
            {FSO_TEXT.breadcrumbCurrent}
          </span>
        </nav>
        <div className="pf-topbar__actions">
          <Button
            variant="secondary"
            className="pf-topbar-cancel"
            onClick={handleCancel}
            disabled={isSaving}
          >
            İptal
          </Button>
          <Button
            variant="primary"
            className="pf-topbar-submit"
            onClick={() => submit(false)}
            disabled={isSaving}
          >
            {isSaving ? "Kaydediliyor…" : FSO_TEXT.submit}
          </Button>
        </div>
      </div>

      <div className="pf">
        <header className="pf-head">
          <h1 className="pf-title">{FSO_TEXT.title}</h1>
          <p className="pf-subtitle">{FSO_TEXT.subtitle}</p>
        </header>

        <div className="pf-body" data-testid="fso-body" ref={formRef}>
          <ProjectLinkCard
            projectId={values.projectId}
            siteId={values.siteId}
            projects={projects}
            sites={sites}
            isProjectsLoading={projectsQuery.isLoading}
            isSitesLoading={sitesQuery.isLoading}
            employerContractNo={employerContractNo}
            employerContractNote={employerContractNote}
            errors={errors}
            disabled={isSaving}
            onChangeProject={handleChangeProject}
            onChangeSite={(siteId) => handleChange("siteId", siteId)}
          />

          <SubcontractorInfoCard
            subcontractorId={values.subcontractorId}
            workCategory={values.workCategory}
            subcontractors={subcontractors}
            selected={selectedSubcontractor}
            isLoading={subcontractorsQuery.isLoading}
            errors={errors}
            disabled={isSaving}
            onChangeSubcontractor={(id) => handleChange("subcontractorId", id)}
            onChangeWorkCategory={(category) => handleChange("workCategory", category)}
            onRequestNewSubcontractor={() => setIsModalOpen(true)}
          />

          <ContractTermsCard
            values={values}
            errors={errors}
            disabled={isSaving}
            onChange={handleTermsChange}
          />

          <ContractItemsCard
            items={detail?.items ?? []}
            contractTotal={detail?.contract_total ?? null}
            itemsMissingPrice={detail?.items_missing_price ?? 0}
            employerContractNo={employerContractNo}
            loadNotice={loadNotice}
            loadError={loadError}
            isLoadPending={loadItems.isPending || createContract.isPending || isLoadQueued}
            isBusy={isItemBusy || isSaving}
            loadDisabledReason={loadDisabledReason}
            canDelete={canDelete}
            onLoadFromEmployer={handleLoadFromEmployer}
            onCommitItem={handleCommitItem}
            onDeleteItem={handleDeleteItem}
          />

          <DocumentsPlaceholderCard
            title={CONTRACT_DOCUMENTS_TITLE}
            note={CONTRACT_DOCUMENTS_NOTE}
            items={CONTRACT_DOCUMENTS}
            dropTitle={CONTRACT_DOCUMENTS_DROP_TITLE}
            dropSubtitle={CONTRACT_DOCUMENTS_DROP_SUBTITLE}
            soonTitle={CONTRACT_DOCUMENTS_SOON_TITLE}
          />
        </div>

        {formError && (
          <p className="pf-form-error" data-testid="fso-form-error">
            {formError}
          </p>
        )}

        {/* 232-236 · İptal · Taslak Kaydet · Sözleşmeyi Oluştur */}
        <FormActions
          onCancel={handleCancel}
          onSaveDraft={() => submit(true)}
          onSubmit={() => submit(false)}
          submitLabel={FSO_TEXT.submit}
          pendingLabel="Kaydediliyor…"
          isPending={isSaving}
        />
      </div>

      {isModalOpen && (
        // 76 son seçeneği. Seçici bir `<select>`tir (yazılabilir bir birleşik
        // kutu DEĞİL), bu yüzden modala taşınacak "yazılmış ad" YOKTUR —
        // `initialName` bilerek geçilmez.
        <SubcontractorFormModal
          onClose={() => setIsModalOpen(false)}
          onCreated={handleSubcontractorCreated}
        />
      )}
    </div>
  );
}
