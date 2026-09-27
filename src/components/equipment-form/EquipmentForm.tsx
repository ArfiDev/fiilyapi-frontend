"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { AccessDenied } from "@/components/settings/AccessDenied";
import { FormActions } from "@/components/form-shell";
import { Button, Checkbox } from "@/components/ui";
import { usePersonnel, PERSONNEL_MAX_LIMIT } from "@/lib/api/hooks/usePersonnel";
import { useSiteOptions } from "@/lib/api/hooks/useSiteOptions";
import { isLoaded } from "@/lib/api/query-state";
import { useSuppliers } from "@/lib/api/hooks/useSuppliers";
import { useEquipmentDetail } from "@/lib/api/hooks/useEquipmentDetail";
import {
  useCreateEquipment,
  useUpdateEquipment,
} from "@/lib/api/hooks/useEquipmentMutations";
import { isForbidden } from "@/lib/api/unwrap";
import { hasAtLeast } from "@/lib/auth/permissions";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";
import { useModulePermission } from "@/lib/auth/useModulePermission";

import {
  buildEquipmentCreateBody,
  buildEquipmentUpdateBody,
  submittableEquipmentValues,
} from "./build-body";
import {
  BREADCRUMB_CURRENT,
  BREADCRUMB_CURRENT_EDIT,
  BREADCRUMB_EQUIPMENT,
  COMPANY_ASSET_LABEL,
  EQUIPMENT_LIST_HREF,
  PAGE_SUBTITLE,
  PAGE_TITLE,
  PAGE_TITLE_EDIT,
  SUBMIT_LABEL,
  SUBMIT_LABEL_EDIT,
  SUBMIT_PENDING_LABEL,
} from "./constants";
import { EquipmentDocumentsCard } from "./EquipmentDocumentsCard";
import { EquipmentInfoCard } from "./EquipmentInfoCard";
import { FinanceCard } from "./FinanceCard";
import {
  emptyEquipmentFormValues,
  equipmentFormValuesFromDetail,
  type EquipmentFormValues,
} from "./form-state";
import { omittedEquipmentFields } from "./omit-fields";
import { OwnershipCard } from "./OwnershipCard";
import { equipmentSubmitErrorMessage } from "./submit-errors";
import { UsageCard } from "./UsageCard";
import {
  hasEquipmentFormErrors,
  validateEquipmentForm,
  type EquipmentFormErrors,
} from "./validate";
// Sıra önemli: önce paylaşılan kabuk, sonra forma özgü bloklar (özgü kazansın).
import "@/styles/form-shell.css";
import "./equipment-form.css";

export type EquipmentFormProps = { mode: "create" } | { mode: "edit"; equipmentId: string };

/**
 * Makine / Ekipman formu — `create`/`edit` AYNI bileşendir (F-P6 `SectionForm`
 * ve `PersonnelForm` iki-kip emsali; iki kopya form YOK). Mockup
 * `Form - Makine Ekle.dc.html` (yorumlardaki sayılar O DOSYANIN satır
 * numaralarıdır); düzenleme kipinin kendi mockup'ı yoktur (spec K4),
 * metinleri kip desenini izler.
 *
 * 🔴 **K5 KAPISI BU BİLEŞENDEDİR:** alan başına `touched` izi tutulur ve
 * düzenleme kipinde "sunucuda `null` + dokunulmamış" olan seçicilerin
 * anahtarları gövdeye HİÇ konmaz (`omit-fields.ts` + `build-body.ts`).
 * Oluşturma kipi ETKİLENMEZ — orada ezilecek sunucu değeri yoktur.
 */
export function EquipmentForm(props: EquipmentFormProps) {
  const isEdit = props.mode === "edit";
  const router = useRouter();

  const permission = useModulePermission("equipment");
  const createEquipment = useCreateEquipment();
  const updateEquipment = useUpdateEquipment(isEdit ? props.equipmentId : "");
  const detailQuery = useEquipmentDetail(isEdit ? props.equipmentId : "");
  const detail = isEdit ? detailQuery.data : undefined;
  const isSaving = createEquipment.isPending || updateEquipment.isPending;

  // Seçicilerin TEK kaynağı — mockup'ın sabit adları DEĞİL.
  const siteOptionsState = useSiteOptions();
  const suppliersQuery = useSuppliers({ isActive: true });
  // `limit` AÇIKÇA geçilir (TB3/F-TH kırpma dersi: varsayılan 50'ye güvenip
  // 51. personeli kaybetmek en kolay hatadır).
  const personnelQuery = usePersonnel({ isActive: true, limit: PERSONNEL_MAX_LIMIT });

  const [values, setValues] = useState<EquipmentFormValues>(emptyEquipmentFormValues);
  const [errors, setErrors] = useState<EquipmentFormErrors>({});
  /**
   * Kullanıcının GERÇEKTEN dokunduğu alanlar (spec K5). Boş seçeneği olmayan
   * seçiciler ekranda hep dolu görünür ve "görünen değer" kullanıcının KARARI
   * DEĞİLDİR — hangi anahtarın gövdeden düşeceğini bu iz belirler.
   */
  const [touched, setTouched] = useState<ReadonlySet<keyof EquipmentFormValues>>(
    () => new Set(),
  );
  const [formError, setFormError] = useState<string | null>(null);

  // Düzenleme kipinde tohumlama YALNIZ BİR KEZ çalışır (`SectionForm` deseni)
  // — sonraki yenilemeler kullanıcının o anki düzenlemesini SİLMEZ.
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    if (!isEdit) return;
    if (!detail) return;
    seededRef.current = true;
    setValues(equipmentFormValuesFromDetail(detail));
  }, [isEdit, detail]);

  // Doğrulama sonrası ilk hatalı alana odak — DOM sırası "ilk"i söyler.
  const shouldFocusRef = useRef(false);
  const formRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!shouldFocusRef.current) return;
    shouldFocusRef.current = false;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [errors]);

  // Mutasyon yok: her değişiklik yeni nesne üretir.
  function handleChange<K extends keyof EquipmentFormValues>(
    field: K,
    value: EquipmentFormValues[K],
  ) {
    setValues((prev) => ({ ...prev, [field]: value }));
    setTouched((prev) => (prev.has(field) ? prev : new Set(prev).add(field)));
  }

  function handleCancel() {
    router.push(EQUIPMENT_LIST_HREF);
  }

  const siteOptions = siteOptionsState.options;
  const supplierItems = suppliersQuery.data?.items ?? [];
  const operatorItems = (personnelQuery.data?.items ?? []).map((person) => ({
    id: person.id,
    label: person.trade ? `${person.full_name} (${person.trade})` : person.full_name,
  }));

  function submit() {
    const nextErrors = validateEquipmentForm(values, {
      hasSiteOptions: siteOptions.length > 0,
    });
    setErrors(nextErrors);

    if (hasEquipmentFormErrors(nextErrors)) {
      shouldFocusRef.current = true;
      // Özet, alan mesajlarının İLKİDİR — yeni dize üretilmez.
      setFormError(Object.values(nextErrors)[0] ?? null);
      return;
    }

    const submittable = submittableEquipmentValues(values);
    if (!submittable) return; // doğrulama geçtiyse ulaşılamaz; tip kapısı

    setFormError(null);
    const onError = (err: unknown) => setFormError(equipmentSubmitErrorMessage(err));

    if (!isEdit) {
      createEquipment.mutate(buildEquipmentCreateBody(submittable), {
        onSuccess: () => router.push(EQUIPMENT_LIST_HREF),
        onError,
      });
      return;
    }

    // 🔴 K5 — atlanacak anahtarlar SUNUCU KÜNYESİ + `touched` izinden çıkar.
    updateEquipment.mutate(
      buildEquipmentUpdateBody(submittable, {
        omitFields: omittedEquipmentFields(detail, touched),
      }),
      {
        onSuccess: () => router.push(EQUIPMENT_LIST_HREF),
        onError,
      },
    );
  }

  // SEKME-F1.3b — hook, erken dönüşlerden ÖNCE (Rules of Hooks). `touched`
  // seed efektinden (üstte) geçmez, doğal olarak "otomatik doldurma"yı
  // kirletmez.
  useUnsavedChanges(touched.size > 0, "Ekipman formu");

  // Yazma yetkisi olmayan kullanıcı bu rotayı hiç görmemeli (giriş noktaları
  // zaten gizli); doğrudan URL ile gelen için kapı burada.
  if (!hasAtLeast(permission.level, "full")) return <AccessDenied />;
  if (isEdit && isForbidden(detailQuery.error)) return <AccessDenied />;
  if (isEdit && detailQuery.isError) {
    return <p className="pf-message">Ekipman yüklenemedi</p>;
  }
  if (isEdit && (detailQuery.isLoading || !detail)) {
    return <p className="pf-message">Yükleniyor…</p>;
  }

  const pageTitle = isEdit ? PAGE_TITLE_EDIT : PAGE_TITLE;
  const submitLabel = isEdit ? SUBMIT_LABEL_EDIT : SUBMIT_LABEL;
  const breadcrumbCurrent = isEdit ? BREADCRUMB_CURRENT_EDIT : BREADCRUMB_CURRENT;

  return (
    <div className="pf-shell">
      {/* 30-41 — yapışkan üst şerit */}
      <div className="pf-topbar">
        <nav className="pf-breadcrumb" aria-label="Kırıntı yolu">
          {/* 35 */}
          <Link href={EQUIPMENT_LIST_HREF}>{BREADCRUMB_EQUIPMENT}</Link>
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
          {/* 39 */}
          <Button
            variant="primary"
            className="pf-topbar-submit"
            onClick={submit}
            disabled={isSaving}
          >
            {isSaving ? SUBMIT_PENDING_LABEL : submitLabel}
          </Button>
        </div>
      </div>

      <div className="pf">
        <header className="pf-head">
          {/* 46 */}
          <h1 className="pf-title">{pageTitle}</h1>
          {/* 47 */}
          <p className="pf-subtitle">{PAGE_SUBTITLE}</p>
        </header>

        <div className="pf-body" data-testid="equipment-form-body" ref={formRef}>
          <OwnershipCard
            value={values.ownership}
            onChange={(next) => handleChange("ownership", next)}
          />
          <EquipmentInfoCard values={values} onChange={handleChange} errors={errors} />
          <FinanceCard
            values={values}
            onChange={handleChange}
            errors={errors}
            suppliers={{
              items: supplierItems,
              isLoading: suppliersQuery.isLoading,
              isError: suppliersQuery.isError,
            }}
          />
          <UsageCard
            values={values}
            onChange={handleChange}
            errors={errors}
            sites={{
              items: siteOptions,
              isLoading: siteOptionsState.isLoading,
              isError: siteOptionsState.isError,
            }}
            operators={{
              items: operatorItems,
              isLoading: personnelQuery.isLoading,
              isError: personnelQuery.isError,
            }}
          />
          <EquipmentDocumentsCard />
        </div>

        {formError && (
          <p className="pf-form-error" data-testid="equipment-form-error">
            {formError}
          </p>
        )}

        {/* 164-173 — solda kutucuk (166), sağda İptal + Kaydet (170-171) */}
        <FormActions
          variant="split"
          leading={
            <Checkbox
              className="eqf-company-asset"
              checked={values.isCompanyAsset}
              onChange={(event) => handleChange("isCompanyAsset", event.target.checked)}
              label={COMPANY_ASSET_LABEL}
            />
          }
          onCancel={handleCancel}
          onSubmit={submit}
          // ⚠️ "Taslak Kaydet" HİÇ BASILMAZ (ne etkin ne devre-dışı): M2 böyle
          // bir buton ÇİZMİYOR ve sunucuda `is_draft` kolonu da YOK (MK-1
          // §2.1). Personel formunun taslak yolu buraya kopyalanmaz —
          // olmayan bir sunucu durumu için buton basmak mockup'a da
          // sözleşmeye de aykırı olurdu.
          isPending={isSaving}
          submitLabel={submitLabel}
          pendingLabel={SUBMIT_PENDING_LABEL}
        />

        {/* Görsel spec (T5b) "yüklendi" iddiasını KAYNAK BAŞINA kurar — F-İK
            dersi. Formun ÜÇ seçicisi ayrı sorgulardan beslenir ve her biri
            yüklenirken altındaki not "Yükleniyor…" basar; tek bayrakla
            beklemek o notu kadraja dondurabilirdi. */}
        {isLoaded(siteOptionsState) && <span hidden data-testid="makine-form-loaded-sites" />}
        {personnelQuery.data !== undefined && (
          <span hidden data-testid="makine-form-loaded-personnel" />
        )}
        {suppliersQuery.data !== undefined && (
          <span hidden data-testid="makine-form-loaded-suppliers" />
        )}
      </div>
    </div>
  );
}
