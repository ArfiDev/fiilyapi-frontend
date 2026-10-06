"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { AccessDenied } from "@/components/settings/AccessDenied";
import { Button, Checkbox } from "@/components/ui";
import {
  isUserListUnavailable,
  userPickerNote,
} from "@/components/site-form/user-picker";
import { backendErrorMessage } from "@/lib/api/error-message";
import { useCustomers } from "@/lib/api/hooks/useCustomers";
import { useCreateCustomer } from "@/lib/api/hooks/useCustomerMutations";
import { useProjects } from "@/lib/api/hooks/useProjects";
import { useProjectUnits, type UnitResponse } from "@/lib/api/hooks/useProjectUnits";
import {
  useCreateSale,
  useGenerateSalePlan,
  useSaveSaleInstallments,
} from "@/lib/api/hooks/useSaleMutations";
import type { SaleType } from "@/lib/api/hooks/useSales";
import { useUserOptions } from "@/lib/api/hooks/useUserOptions";
import { isForbidden } from "@/lib/api/unwrap";
import { SALES_EDIT } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";

import {
  AUTO_INVOICE_LABEL,
  AUTO_INVOICE_PENDING_REASON,
  SALE_CREATED_LOCK_REASON,
  SALE_FORM_SUBTITLE,
  SALE_FORM_TITLE,
  SALES_LIST_HREF,
} from "./constants";
import {
  buildCustomerCreateBody,
  buildInstallmentsSave,
  buildSaleCreateBody,
} from "./build-body";
import {
  emptySaleFormValues,
  planRowsFromServer,
  type PlanRowValues,
  type SaleFormValues,
} from "./form-state";
import { firstSaleFormError, hasSaleFormErrors, validateSaleForm, type SaleFormErrors } from "./validate";
import { BuyerCard } from "./BuyerCard";
import { DeedDeliveryCard } from "./DeedDeliveryCard";
import { PaymentPlanCard } from "./PaymentPlanCard";
import { SaleDocumentsCard } from "./SaleDocumentsCard";
import { SalePriceCard } from "./SalePriceCard";
import { SoldUnitCard } from "./SoldUnitCard";
import { PROJECT_PARAM } from "@/lib/navigation-params";
// Sıra önemli: önce paylaşılan kabuk, sonra forma özgü bloklar.
import "@/styles/form-shell.css";
import "./sales-form.css";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";

/** `?proje=` / `?unit=` bağlam parametreleri (spec §1/DS "?unit ile de gelinebilir"). */
const UNIT_PARAM = "unit";

/**
 * DS — Yeni Satış (Daire Satışı) formu (`Form - Daire Satisi.dc.html`, kanonik).
 * Yorumlardaki sayılar O DOSYANIN satır numaralarıdır.
 *
 * ⚠️ Kabuk canonu: mockup'ın kendi üst barı (31-42) yeniden çizilmez —
 * breadcrumb + iki eylem düğmesi kabuğa oturur (StockEntryForm emsali).
 *
 * ⚠️ İKİ ADIMLI KAYDETME (F-SD onaylı sapması): plan SUNUCUDA üretildiği için
 * (`generate-plan` bir `sale_id` ister), "Plan Oluştur" ÖNCE satışı oluşturur.
 * Bir kez oluşunca ünite/müşteri/bedel/plan parametreleri KİLİTLENİR (bu
 * alanları değiştirecek PATCH ucu bu dilimde bağlanmadı); düzeltme yalnız plan
 * tablosundan yapılır ve kaydetmede PUT DEĞİŞTİRME ile gider (spec K5).
 */
export function SaleCreateView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // IZN-F2.x · satış kaydı yazma kapısı = mali.satis Düzenler.
  const canEdit = useButtonGate({ pages: SALES_EDIT, need: "edit" });

  const [values, setValues] = useState<SaleFormValues>(() => emptySaleFormValues());
  const [errors, setErrors] = useState<SaleFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [createdSaleId, setCreatedSaleId] = useState<string | null>(null);
  // no 269 · Satış POST'u başarısız olup kullanıcı yeniden denediğinde
  // `resolveCustomerId` YENİ müşteri kipinde İKİNCİ bir POST /customers
  // yapıp mükerrer kayıt açmasın diye oluşan id burada saklanır
  // (`createdSaleId` ile AYNI desen).
  const [resolvedCustomerId, setResolvedCustomerId] = useState<string | null>(null);
  const [planRows, setPlanRows] = useState<PlanRowValues[]>([]);
  const [planTotalText, setPlanTotalText] = useState<string | null>(null);
  const [planEdited, setPlanEdited] = useState(false);
  // SEKME-F1.3b · dirty = `values` (⚠️ `projectId`/`unitId` HARİÇ) +
  // `planRows`/`planEdited`in boş formdan sapması. 🔴 ASYNC TABAN KISMEN
  // RİSKLİ: `projectId`/`unitId` `?proje=`/`?unit=` URL parametrelerinden
  // OTOMATİK dolar (aşağıdaki iki efekt) — `unitId` seed'i ayrıca
  // `unitsQuery.data` gelene KADAR bekler (gerçek GET yarışı). Bu iki alan
  // KARŞILAŞTIRMA DIŞI tutulur (envanter notu, ikinci seçenek): otomatik
  // URL tohumu asla "kullanıcı kirletti" SAYILMAZ.
  const emptyValues = emptySaleFormValues();
  const isDirty =
    values.saleType !== emptyValues.saleType ||
    values.customerMode !== emptyValues.customerMode ||
    values.existingCustomerId !== emptyValues.existingCustomerId ||
    values.buyerType !== emptyValues.buyerType ||
    values.buyerName !== emptyValues.buyerName ||
    values.buyerNationalOrTaxId !== emptyValues.buyerNationalOrTaxId ||
    values.buyerPhone !== emptyValues.buyerPhone ||
    values.buyerEmail !== emptyValues.buyerEmail ||
    values.advisorUserId !== emptyValues.advisorUserId ||
    values.buyerAddress !== emptyValues.buyerAddress ||
    values.discountAmount !== emptyValues.discountAmount ||
    values.salePrice !== emptyValues.salePrice ||
    values.vatPct !== emptyValues.vatPct ||
    values.paymentPlanType !== emptyValues.paymentPlanType ||
    values.downPayment !== emptyValues.downPayment ||
    values.installmentCount !== emptyValues.installmentCount ||
    values.firstInstallmentDate !== emptyValues.firstInstallmentDate ||
    values.termInterestPct !== emptyValues.termInterestPct ||
    values.deedCondition !== emptyValues.deedCondition ||
    values.plannedDeedDate !== emptyValues.plannedDeedDate ||
    values.deliveryDate !== emptyValues.deliveryDate ||
    values.hasCondominiumEasement !== emptyValues.hasCondominiumEasement ||
    values.hasMortgage !== emptyValues.hasMortgage ||
    values.lateFeeEnabled !== emptyValues.lateFeeEnabled ||
    planRows.length > 0 ||
    planEdited;
  useUnsavedChanges(isDirty, "Satış");

  const projectsQuery = useProjects();
  const unitsQuery = useProjectUnits(values.projectId);
  const customersQuery = useCustomers();
  const advisors = useUserOptions();

  const createCustomer = useCreateCustomer();
  const createSale = useCreateSale();
  const generatePlan = useGenerateSalePlan();
  const saveInstallments = useSaveSaleInstallments();

  // `?proje=` / `?unit=` tohumlaması — YALNIZ BİR KEZ (SectionForm deseni).
  const projectSeededRef = useRef(false);
  const unitSeededRef = useRef(false);
  useEffect(() => {
    if (!projectSeededRef.current) {
      const projeParam = searchParams.get(PROJECT_PARAM);
      if (projeParam) setValues((prev) => ({ ...prev, projectId: projeParam }));
      projectSeededRef.current = true;
    }
  }, [searchParams]);
  useEffect(() => {
    if (unitSeededRef.current) return;
    const unitParam = searchParams.get(UNIT_PARAM);
    if (!unitParam || !unitsQuery.data) return;
    const exists = unitsQuery.data.blocks.some((group) =>
      group.units.some((unit) => unit.id === unitParam),
    );
    // no 248 · deneme sonucu BAĞIMSIZ (bulunamasa da) işaretlenir — aksi
    // hâlde `unitsQuery.data` her değiştiğinde (proje değişimi/refetch) bu
    // efekt yeniden çalışır ve kullanıcı üniteyi elle boşaltsa bile parametre
    // listede varsa değeri GERİ YAZAR.
    unitSeededRef.current = true;
    if (exists) {
      setValues((prev) => ({ ...prev, unitId: unitParam }));
    }
  }, [searchParams, unitsQuery.data]);

  const projects = projectsQuery.data?.items ?? [];
  const blocks = unitsQuery.data?.blocks ?? [];
  const customers = customersQuery.data?.items ?? [];

  const selectedUnit = useMemo<UnitResponse | null>(() => {
    for (const group of unitsQuery.data?.blocks ?? []) {
      const unit = group.units.find((candidate) => candidate.id === values.unitId);
      if (unit) return unit;
    }
    return null;
  }, [unitsQuery.data, values.unitId]);

  if (!canEdit) return <AccessDenied />;

  const locked = createdSaleId !== null;
  const isSaving =
    createCustomer.isPending ||
    createSale.isPending ||
    generatePlan.isPending ||
    saveInstallments.isPending;

  const unitsNotice = unitsQuery.isError
    ? isForbidden(unitsQuery.error)
      ? "Ünite listesi için proje (ünite) yetkisi gerekiyor."
      : backendErrorMessage(unitsQuery.error, "Ünite listesi yüklenemedi.")
    : values.projectId === ""
      ? "Önce bir proje seçin — ünite listesi projeye bağlıdır."
      : null;

  const advisorNote = userPickerNote({
    options: advisors.options,
    isLoading: advisors.isLoading,
    isError: isUserListUnavailable(advisors),
    isForbidden: advisors.isForbidden,
  });

  function handleChangeField<K extends keyof SaleFormValues>(field: K, value: SaleFormValues[K]) {
    setValues((prev) => ({ ...prev, [field]: value }));
  }

  function handleChangeProject(projectId: string) {
    // Proje değişince ünite seçimi geçersizleşir.
    setValues((prev) => ({ ...prev, projectId, unitId: "" }));
  }

  function handleSelectCustomer(customerId: string) {
    if (!customerId) {
      setValues((prev) => ({
        ...prev,
        customerMode: "new",
        existingCustomerId: "",
        buyerName: "",
        buyerNationalOrTaxId: "",
        buyerPhone: "",
        buyerEmail: "",
        buyerAddress: "",
      }));
      return;
    }
    const customer = customers.find((candidate) => candidate.id === customerId);
    if (!customer) return;
    setValues((prev) => ({
      ...prev,
      customerMode: "existing",
      existingCustomerId: customerId,
      buyerType: customer.customer_type,
      // IZN-F4.3: maskeli müşteri adı (`null`) → "—"; seçim id ile çalışır, mevcut müşteride ad gövdeye GİRMEZ.
      buyerName: customer.name ?? "—",
      buyerNationalOrTaxId: customer.national_id ?? customer.tax_number ?? "",
      buyerPhone: customer.phone ?? "",
      buyerEmail: customer.email ?? "",
      buyerAddress: customer.address ?? "",
    }));
  }

  function handleChangePlanRows(rows: PlanRowValues[]) {
    setPlanRows(rows);
    setPlanEdited(true);
  }

  /** Müşteri kimliğini çözer (yeni müşteri ise önce POST /customers). */
  async function resolveCustomerId(): Promise<string> {
    if (values.customerMode === "existing") return values.existingCustomerId;
    if (resolvedCustomerId !== null) return resolvedCustomerId;
    const customer = await createCustomer.mutateAsync(buildCustomerCreateBody(values));
    setResolvedCustomerId(customer.id);
    return customer.id;
  }

  /** Satışı oluşturur (yoksa) ve id'sini döndürür — kaydetme sırasının 1-2. adımı. */
  async function ensureSaleCreated(saleType: SaleType): Promise<string> {
    if (createdSaleId !== null) return createdSaleId;
    const customerId = await resolveCustomerId();
    const sale = await createSale.mutateAsync({
      projectId: values.projectId,
      body: buildSaleCreateBody(values, customerId, saleType),
    });
    setCreatedSaleId(sale.id);
    return sale.id;
  }

  function validateOrFocus(): boolean {
    const nextErrors = validateSaleForm(values);
    setErrors(nextErrors);
    if (hasSaleFormErrors(nextErrors)) {
      setFormError(firstSaleFormError(nextErrors));
      return false;
    }
    setFormError(null);
    return true;
  }

  async function handleGeneratePlan() {
    if (!validateOrFocus()) return;
    try {
      const saleId = await ensureSaleCreated(values.saleType);
      const plan = await generatePlan.mutateAsync(saleId);
      setPlanRows(planRowsFromServer(plan.items));
      setPlanTotalText(plan.total_amount);
      setPlanEdited(false);
    } catch (error) {
      setFormError(backendErrorMessage(error, "Ödeme planı oluşturulamadı."));
    }
  }

  async function handleFinalize(saleType: SaleType) {
    if (!validateOrFocus()) return;
    try {
      if (createdSaleId !== null) {
        // Satış zaten oluşturuldu (Plan Oluştur) — düzenlendiyse PUT DEĞİŞTİRME.
        if (planEdited && planRows.length > 0) {
          await saveInstallments.mutateAsync({
            saleId: createdSaleId,
            items: buildInstallmentsSave(planRows),
          });
        }
        router.push(SALES_LIST_HREF);
        return;
      }
      const saleId = await ensureSaleCreated(saleType);
      // Plan tipi seçiliyse sunucuda planı üret (Σ = sale_price sunucuda kurulur).
      if (values.paymentPlanType) await generatePlan.mutateAsync(saleId);
      router.push(SALES_LIST_HREF);
    } catch (error) {
      setFormError(backendErrorMessage(error, "Satış kaydedilemedi."));
    }
  }

  function handleCancel() {
    router.push(SALES_LIST_HREF);
  }

  const canGenerate = values.projectId !== "" && values.unitId !== "" && values.salePrice.trim() !== "";

  return (
    <div className="pf-shell">
      {/* 31-42 — kabuk canonuna oturtulmuş üst şerit */}
      <div className="pf-topbar">
        <nav className="pf-breadcrumb" aria-label="Kırıntı yolu">
          <Link href={SALES_LIST_HREF}>Satış Yönetimi</Link>
          <span className="pf-breadcrumb__sep" aria-hidden="true">
            /
          </span>
          <span className="pf-breadcrumb__current" aria-current="page">
            Yeni Satış
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
            data-testid="satis-form-kaydet-ust"
            onClick={() => handleFinalize(values.saleType)}
            disabled={isSaving}
          >
            {isSaving ? "Kaydediliyor…" : "Satışı Kaydet"}
          </Button>
        </div>
      </div>

      <div className="pf">
        <header className="pf-head">
          <h1 className="pf-title">{SALE_FORM_TITLE}</h1>
          <p className="pf-subtitle">{SALE_FORM_SUBTITLE}</p>
        </header>

        <div className="pf-body" data-testid="satis-form-body">
          <SoldUnitCard
            values={values}
            errors={errors}
            projects={projects}
            blocks={blocks}
            selectedUnit={selectedUnit}
            projectsDisabled={projectsQuery.isLoading || projectsQuery.isError}
            unitsDisabled={unitsQuery.isLoading || unitsQuery.isError}
            unitsNotice={unitsNotice}
            onChangeProject={handleChangeProject}
            onChangeField={handleChangeField}
            locked={locked}
            lockReason={SALE_CREATED_LOCK_REASON}
          />

          <BuyerCard
            values={values}
            errors={errors}
            customers={customers}
            projectId={values.projectId || undefined}
            customersDisabled={customersQuery.isLoading || customersQuery.isError}
            advisors={advisors.options}
            advisorsDisabled={advisors.isLoading || advisors.isError}
            advisorNote={advisorNote}
            onChangeField={handleChangeField}
            onSelectCustomer={handleSelectCustomer}
            locked={locked}
          />

          <SalePriceCard
            values={values}
            errors={errors}
            selectedUnit={selectedUnit}
            onChangeField={handleChangeField}
            locked={locked}
          />

          <PaymentPlanCard
            values={values}
            errors={errors}
            planRows={planRows}
            planTotalText={planTotalText}
            planEdited={planEdited}
            isGenerating={generatePlan.isPending}
            canGenerate={canGenerate}
            onChangeField={handleChangeField}
            onGeneratePlan={handleGeneratePlan}
            onChangePlanRows={handleChangePlanRows}
            // no 246 · `locked` (satış oluşturuldu) TEK BAŞINA burayı
            // kilitlerse: `generate-plan` PATLADIĞINDA `createdSaleId` zaten
            // set edilmiş olur ve plan HİÇ üretilmeden "Plan Oluştur" kalıcı
            // kilitlenir. Plan kartı yalnız plan GERÇEKTEN üretildiğinde
            // (`planRows` dolduğunda) donar; aksi hâlde satış oluşmuş olsa
            // bile aynı `saleId` ile yeniden denenebilir.
            locked={locked && planRows.length > 0}
          />

          <DeedDeliveryCard values={values} onChangeField={handleChangeField} locked={locked} />

          <SaleDocumentsCard />
        </div>

        {formError && (
          <p className="pf-form-error" data-testid="satis-form-hata">
            {formError}
          </p>
        )}

        {/* 204-213 — alt eylem şeridi */}
        <div className="pf-actions pf-actions--split">
          {/* 205-208 — otomatik fatura: Fatura Yönetimi'ne pending, devre dışı */}
          <span className="sf-auto-invoice">
            <Checkbox
              size="lg"
              disabled
              checked={false}
              readOnly
              title={AUTO_INVOICE_PENDING_REASON}
              data-testid="satis-form-oto-fatura"
              label={AUTO_INVOICE_LABEL}
            />
            <span className="sf-auto-invoice__reason">{AUTO_INVOICE_PENDING_REASON}</span>
          </span>
          <div className="pf-actions__group">
            <Button
              variant="secondary"
              className="pf-action pf-action--cancel"
              onClick={handleCancel}
              disabled={isSaving}
            >
              İptal
            </Button>
            {/* 211 — Rezervasyon Yap: aynı POST, sale_type=reservation */}
            <Button
              variant="secondary"
              className="pf-action pf-action--draft"
              data-testid="satis-form-rezervasyon"
              onClick={() => handleFinalize("reservation")}
              disabled={isSaving || locked}
              title={locked ? SALE_CREATED_LOCK_REASON : undefined}
            >
              Rezervasyon Yap
            </Button>
            {/* 212 — Satışı Kaydet: üstteki "Satış Tipi" seçicisiyle */}
            <Button
              variant="primary"
              className="pf-action pf-action--submit"
              data-testid="satis-form-kaydet"
              onClick={() => handleFinalize(values.saleType)}
              disabled={isSaving}
            >
              {isSaving ? "Kaydediliyor…" : "Satışı Kaydet"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
