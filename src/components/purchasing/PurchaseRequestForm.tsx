"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { AccessDenied } from "@/components/settings/AccessDenied";
import { DocumentsPlaceholderCard, FormActions } from "@/components/form-shell";
import { Alert, Button } from "@/components/ui";
import { isoDate } from "@/components/site-diary/derive";
import { backendErrorMessage } from "@/lib/api/error-message";
import { useProjects } from "@/lib/api/hooks/useProjects";
import {
  useCreatePurchaseRequest,
  useSubmitPurchaseRequest,
  useUpdatePurchaseRequest,
  type PurchaseRequestResponse,
} from "@/lib/api/hooks/usePurchaseRequestMutations";
import { useSites } from "@/lib/api/hooks/useSites";
import { useSiteSections } from "@/lib/api/hooks/useSiteSections";
import { STOCK_LIST_MAX_LIMIT } from "@/lib/api/hooks/useStockItems";
import { useStockSummary } from "@/lib/api/hooks/useStockSummary";
import { useSuppliers } from "@/lib/api/hooks/useSuppliers";
import { isForbidden } from "@/lib/api/unwrap";
import { COST_HIDDEN_CATEGORIES } from "@/lib/auth/finance-hidden";
import { useCategoryHidden } from "@/lib/auth/useCategoryHidden";
import { useModulePermission } from "@/lib/auth/useModulePermission";
import { PURCHASE_REQUEST_EDIT } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";

import { PurchaseRequestApprovalBox } from "./PurchaseRequestApprovalBox";
import { PurchaseRequestFormInfoCard } from "./PurchaseRequestFormInfoCard";
import { PurchaseRequestFormLinesCard } from "./PurchaseRequestFormLinesCard";
import { PurchaseRequestFormSupplierCard } from "./PurchaseRequestFormSupplierCard";
import {
  buildPurchaseRequestCreateBody,
  buildPurchaseRequestUpdateBody,
} from "./purchase-request-body";
import {
  DRAFT_SAVE_ERROR_FALLBACK,
  PURCHASE_REQUEST_DOCUMENTS,
  PURCHASE_REQUEST_DOCUMENTS_PENDING_REASON,
  PURCHASE_REQUEST_DOCUMENTS_TITLE,
  PURCHASE_REQUEST_FORM_BREADCRUMB,
  PURCHASE_REQUEST_FORM_SUBTITLE,
  PURCHASE_REQUEST_FORM_TITLE,
  SUBMIT_ERROR_FALLBACK,
  submitAfterCreateNotice,
} from "./purchase-request-form-constants";
import {
  addPurchaseRequestLine,
  emptyPurchaseRequestFormValues,
  removePurchaseRequestLine,
  selectPurchaseRequestProject,
  selectPurchaseRequestSite,
  updatePurchaseRequestLine,
  type PurchaseRequestFormValues,
  type PurchaseRequestLineValues,
} from "./purchase-request-form-state";
import {
  firstPurchaseRequestError,
  hasPurchaseRequestErrors,
  validatePurchaseRequestForm,
  type PurchaseRequestFormErrors,
} from "./purchase-request-validate";
import { PURCHASING_LIST_MAX_LIMIT, PURCHASING_PERMISSION_MODULE } from "./purchasing-labels";
// Sıra önemli: önce paylaşılan kabuk, sonra forma özgü bloklar.
import "@/styles/form-shell.css";
import "./purchase-request-form.css";
import { routes } from "@/lib/routes";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";

const EMPTY_ERRORS: PurchaseRequestFormErrors = { lineErrors: {} };

/** SAT listesi — İptal ve başarılı gönderim buraya döner. */
const PURCHASING_LIST_HREF = routes.purchasing.root();

/**
 * FST — Satın Alma Talebi formu
 * (`projedesign/Form - Satinalma Talebi.dc.html`, kanonik). Yorumlardaki
 * sayılar O DOSYANIN satır numaralarıdır.
 *
 * Rota: `/satinalma/talep/yeni` (spec §3 K1).
 *
 * ⚠️ Sayfa KENDİ LAYOUT'UNU KURMAZ: `pf-shell` tam sayfa form kabuğudur
 * (StockEntryForm/SiteCreateView emsali) ve mockup'ın kendi üst barı (31-42)
 * yeniden çizilmez — breadcrumb + eylem düğmeleri kabuk canonuna oturur.
 *
 * 🔴 İKİ ADIMLI "Onaya Gönder" (F-SD emsali): sunucuda tek adımlı bir
 * "oluştur ve gönder" ucu YOKTUR — önce `POST /purchase-requests` (talep
 * `draft` DOĞAR), sonra `POST /{id}/submit`. İkisi arasında hata olursa
 * KULLANICI KAYBOLMAZ: talep taslak olarak durur, numarasıyla birlikte
 * söylenir ve yeniden deneme İKİNCİ bir talep AÇMAZ (kimlik saklanır,
 * sonraki tur `PATCH` + `submit` yolunu kullanır).
 *
 * ⚠️ approve/reject BASILMAZ (spec K6) — onay/red ekranı ayrı dilimdir.
 */
export function PurchaseRequestForm() {
  const router = useRouter();
  const permission = useModulePermission(PURCHASING_PERMISSION_MODULE);
  // IZN-F2.x · talep oluştur/düzenle/Onaya Gönder = stok.satinalma_talepleri Düzenler.
  const canEdit = useButtonGate({ pages: PURCHASE_REQUEST_EDIT, need: "edit", fallback: permission.canWrite });

  const [values, setValues] = useState<PurchaseRequestFormValues>(() =>
    // Tarih `new Date()`ten TEK yerde türetilir (site-diary `isoDate` deseni:
    // `toISOString()` UTC'ye çevirip günü geri atardı).
    emptyPurchaseRequestFormValues(isoDate(new Date())),
  );
  // SEKME-F1.3b · KULLANICI KARARI B3: "Taslak Kaydet" başarılı → form TEMİZ.
  // Taban başlangıçta boş formdur; her başarılı `persist()` (taslak YA DA
  // onaya-gönder öncesi ilk kayıt) sonrası o anki değerlere hizalanır — veri
  // sunucuya yazıldıysa "kaydedilmemiş" sayılmaz (ortak emir ilkesi).
  const [baseline, setBaseline] = useState(values);
  const isDirty = JSON.stringify(values) !== JSON.stringify(baseline);
  useUnsavedChanges(isDirty, "Satınalma talebi");
  const [errors, setErrors] = useState<PurchaseRequestFormErrors>(EMPTY_ERRORS);
  const [formError, setFormError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  /** Kayıttan sonra sunucunun döndürdüğü talep (numara + kimlik buradan gelir). */
  const [createdRequest, setCreatedRequest] = useState<PurchaseRequestResponse | null>(null);
  const [pendingSubmit, setPendingSubmit] = useState(false);
  const lineSeqRef = useRef(1);

  const projectsQuery = useProjects();
  const sitesQuery = useSites(values.projectId);
  const sectionsQuery = useSiteSections(values.siteId);
  // "Mevcut Stok" (75) SUNUCU türevidir: künye ucu (`/stock/items`) bakiye
  // TAŞIMAZ, özet ucu taşır. Kırpılma korkuluğu: tavan AÇIKÇA gönderilir.
  const stockQuery = useStockSummary({ limit: STOCK_LIST_MAX_LIMIT });
  const suppliersQuery = useSuppliers({ isActive: true, limit: PURCHASING_LIST_MAX_LIMIT });

  const createRequest = useCreatePurchaseRequest();
  const requestId = createdRequest?.id ?? "";
  const updateRequest = useUpdatePurchaseRequest(requestId);
  const submitRequest = useSubmitPurchaseRequest(requestId);
  // IZN-F4d.2: kayıtlı talebin fiyatı maskeli rolde `null`; PATCH'te dolu fiyat 403 → fiyat alanı salt okunur + gövdeden çıkar.
  const isCostHidden = useCategoryHidden(COST_HIDDEN_CATEGORIES);
  const isPriceMasked = isCostHidden && createdRequest !== null;

  const shouldFocusRef = useRef(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!shouldFocusRef.current) return;
    shouldFocusRef.current = false;
    bodyRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [errors]);

  /**
   * Gönderim İKİNCİ adımda koşar: `useSubmitPurchaseRequest` talep kimliğini
   * RENDER anında kapatır, yani talep yeni oluştuğunda aynı olay içinde
   * çağrılan `mutate` hâlâ BOŞ kimliği taşırdı. Bayrak, kimlik render'a
   * işlendikten sonra gönderimi tetikler.
   */
  useEffect(() => {
    if (!pendingSubmit || !createdRequest) return;
    setPendingSubmit(false);
    submitRequest
      .mutateAsync()
      .then(() => router.push(PURCHASING_LIST_HREF))
      .catch((error: unknown) => {
        setSavedNotice(null);
        setFormError(
          submitAfterCreateNotice(
            createdRequest.request_no,
            backendErrorMessage(error, SUBMIT_ERROR_FALLBACK),
          ),
        );
      });
    // `submitRequest` her render'da YENİ nesnedir; bağımlılığa konursa efekt
    // sonsuz döner. Tetikleyici ikili (bayrak + kimlik) yeterlidir ve
    // `submitRequest` bu render'da zaten doğru kimliği taşır.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSubmit, createdRequest, router]);

  if (!canEdit) return <AccessDenied />;
  if (isForbidden(projectsQuery.error)) return <AccessDenied />;

  const isSaving =
    createRequest.isPending || updateRequest.isPending || submitRequest.isPending || pendingSubmit;

  function handleChange<K extends keyof PurchaseRequestFormValues>(
    field: K,
    value: PurchaseRequestFormValues[K],
  ) {
    setValues((prev) => ({ ...prev, [field]: value }));
  }

  function handleAddLine() {
    setValues((prev) => addPurchaseRequestLine(prev, lineSeqRef.current));
    lineSeqRef.current += 1;
  }

  function handleRemoveLine(key: string) {
    setValues((prev) => removePurchaseRequestLine(prev, key));
  }

  function handleChangeLine(
    key: string,
    patch: Partial<Omit<PurchaseRequestLineValues, "key">>,
  ) {
    setValues((prev) => updatePurchaseRequestLine(prev, key, patch));
  }

  function handleCancel() {
    router.push(PURCHASING_LIST_HREF);
  }

  /** Doğrulama kapısı — geçerse `null`, geçmezse ilk hata cümlesi. */
  function guard(mode: "draft" | "submit"): boolean {
    const nextErrors = validatePurchaseRequestForm(values, mode);
    setErrors(nextErrors);
    if (hasPurchaseRequestErrors(nextErrors)) {
      shouldFocusRef.current = true;
      setSavedNotice(null);
      setFormError(firstPurchaseRequestError(nextErrors));
      return false;
    }
    setFormError(null);
    return true;
  }

  /**
   * Talebi SUNUCUYA yazar: ilk turda `POST`, sonrakilerde `PATCH`.
   *
   * ⚠️ `PATCH`in `lines` alanı TAM DEĞİŞTİRMEDİR — gövde kurucusu diziyi her
   * zaman eksiksiz gönderir (bkz. `purchase-request-body.ts`).
   */
  async function persist(): Promise<PurchaseRequestResponse> {
    if (createdRequest) {
      return updateRequest.mutateAsync(buildPurchaseRequestUpdateBody(values, { omitPrices: isPriceMasked }));
    }
    return createRequest.mutateAsync(buildPurchaseRequestCreateBody(values));
  }

  function handleSaveDraft() {
    if (!guard("draft")) return;
    persist()
      .then((saved) => {
        setCreatedRequest(saved);
        setBaseline(values);
        setSavedNotice(
          `Talep ${saved.request_no} taslak olarak kaydedildi. Düzenlemeye devam edebilir ya da “Onaya Gönder”e basabilirsiniz.`,
        );
      })
      .catch((error: unknown) => {
        setSavedNotice(null);
        setFormError(backendErrorMessage(error, DRAFT_SAVE_ERROR_FALLBACK));
      });
  }

  function handleSubmit() {
    if (!guard("submit")) return;
    persist()
      .then((saved) => {
        setCreatedRequest(saved);
        setBaseline(values);
        setPendingSubmit(true);
      })
      .catch((error: unknown) => {
        setSavedNotice(null);
        setFormError(backendErrorMessage(error, DRAFT_SAVE_ERROR_FALLBACK));
      });
  }

  return (
    <div className="pf-shell">
      {/* 31-42 — kabuk canonuna oturtulmuş üst şerit */}
      <div className="pf-topbar">
        <nav className="pf-breadcrumb" aria-label="Kırıntı yolu">
          <Link href={PURCHASING_LIST_HREF}>Satınalma</Link>
          <span className="pf-breadcrumb__sep" aria-hidden="true">
            /
          </span>
          <span className="pf-breadcrumb__current" aria-current="page">
            {PURCHASE_REQUEST_FORM_BREADCRUMB}
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
            onClick={handleSubmit}
            disabled={isSaving}
          >
            {isSaving ? "Gönderiliyor…" : "Onaya Gönder"}
          </Button>
        </div>
      </div>

      <div className="pf">
        <header className="pf-head">
          {/* 47-48 */}
          <h1 className="pf-title">{PURCHASE_REQUEST_FORM_TITLE}</h1>
          <p className="pf-subtitle">{PURCHASE_REQUEST_FORM_SUBTITLE}</p>
        </header>

        {savedNotice && (
          <Alert variant="success" data-testid="talep-kayit-sonuc">
            {savedNotice}
          </Alert>
        )}

        <div className="pf-body" data-testid="talep-body" ref={bodyRef}>
          <PurchaseRequestFormInfoCard
            values={values}
            errors={errors}
            requestNo={createdRequest?.request_no ?? null}
            projects={projectsQuery.data?.items ?? []}
            projectsStatus={{
              isLoading: projectsQuery.isLoading,
              isError: projectsQuery.isError,
            }}
            sites={sitesQuery.data?.items ?? []}
            sitesStatus={{ isLoading: sitesQuery.isLoading, isError: sitesQuery.isError }}
            sections={sectionsQuery.data?.items ?? []}
            sectionsStatus={{
              isLoading: sectionsQuery.isLoading,
              isError: sectionsQuery.isError,
            }}
            onChangeProject={(projectId) =>
              setValues((prev) => selectPurchaseRequestProject(prev, projectId))
            }
            onChangeSite={(siteId) => setValues((prev) => selectPurchaseRequestSite(prev, siteId))}
            onChange={handleChange}
          />

          <PurchaseRequestFormLinesCard
            values={values}
            isPriceMasked={isPriceMasked}
            errors={errors}
            stockRows={stockQuery.data?.items ?? []}
            stockIsLoading={stockQuery.isLoading}
            stockIsError={stockQuery.isError}
            onAddLine={handleAddLine}
            onRemoveLine={handleRemoveLine}
            onChangeLine={handleChangeLine}
          />

          <PurchaseRequestFormSupplierCard
            suppliers={suppliersQuery.data?.items ?? []}
            suppliersIsLoading={suppliersQuery.isLoading}
            suppliersIsError={suppliersQuery.isError}
            quoteDeadline={values.quoteDeadline}
            onChangeQuoteDeadline={(value) => handleChange("quoteDeadline", value)}
          />

          {/* 140-153 — BC form-slot'u YOK: kutular yerinde, devre dışı */}
          <DocumentsPlaceholderCard
            title={PURCHASE_REQUEST_DOCUMENTS_TITLE}
            note={PURCHASE_REQUEST_DOCUMENTS_PENDING_REASON}
            items={PURCHASE_REQUEST_DOCUMENTS}
            soonTitle={PURCHASE_REQUEST_DOCUMENTS_PENDING_REASON}
          />

          {/* 156-168 */}
          <PurchaseRequestApprovalBox lines={values.lines} isPriceMasked={isPriceMasked} />
        </div>

        {formError && (
          <p className="pf-form-error" data-testid="talep-hata">
            {formError}
          </p>
        )}

        {/* 170-174 */}
        <FormActions
          onCancel={handleCancel}
          onSaveDraft={handleSaveDraft}
          onSubmit={handleSubmit}
          submitLabel="Onaya Gönder"
          pendingLabel="Gönderiliyor…"
          isPending={isSaving}
        />
      </div>
    </div>
  );
}
