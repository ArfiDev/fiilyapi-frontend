"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { EmployerFormModal } from "@/components/project-form/EmployerFormModal";
import { AccessDenied } from "@/components/settings/AccessDenied";
import { useSession } from "@/components/shell/SessionProvider";
import { Badge, Button } from "@/components/ui";
import { backendErrorMessage } from "@/lib/api/error-message";
import { EMPTY_CELL } from "@/lib/format";
import { useEmployers, type EmployerListItem } from "@/lib/api/hooks/useEmployers";
import { useCreateOffer } from "@/lib/api/hooks/useOfferMutations";
import { useOfferSettings } from "@/lib/api/hooks/useOffers";
import { useOfferTemplates, type OfferTemplateListItem } from "@/lib/api/hooks/useOfferTemplates";
import { isForbidden } from "@/lib/api/unwrap";
import { hasAtLeast } from "@/lib/auth/permissions";
import { useCategoryHidden } from "@/lib/auth/useCategoryHidden";
import { useDisciplineScope } from "@/lib/auth/useDisciplineScope";
import { useModulePermission } from "@/lib/auth/useModulePermission";
import { OFFERS_EDIT, PROJECT_CREATE_EDIT } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";
import { routes } from "@/lib/routes";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";

import { OfferCreateSummary } from "./OfferCreateSummary";
import { OfferInfoFields } from "./OfferInfoFields";
import { OfferRateFields } from "./OfferRateFields";
import { OfferStartChoice } from "./OfferStartChoice";
import {
  BOTH_RATES_MASKED,
  maskedRatesOfSettings,
  buildOfferCreateBody,
  initialOfferFormValues,
  missingFieldsText,
  pctToInputText,
  validUntilIso,
  validateOfferForm,
  type OfferFormField,
  type OfferFormValues,
} from "./offer-form";
import { conditionsFromTemplate, pickTemplate } from "./offer-start";
import { istanbulToday } from "./offer-status";
import { useOfferCreateStart } from "./useOfferCreateStart";
import "./offer-create.css";

/** T25: teklif YAZMA = `contracts:full` + disiplin kısıtsız. */
const WRITE_LEVEL = "full";
/** ÜS-F3-8: işveren kartoteksine yazma proje yönetici yetkisidir (`projects:admin`). */
const EMPLOYER_ADD_LEVEL = "admin";
const EMPLOYER_ADD_DENIED_TITLE = "İşveren eklemek proje yönetici yetkisi ister";
const SETTINGS_ERROR_TEXT = "Teklif ayarları yüklenemedi";

/**
 * TKL-F3.4 · `/teklif-hazirlama/yeni` — Yeni teklif (kapsayıcı). ÇEKİRDEK ekran.
 * Kapı: yazamayan (contracts < full ya da disiplin kısıtlı) ve 403 alan → AccessDenied (plan §2.3, SO-19);
 * form açılışta `GET /offers/settings` ön değerlerini bekler.
 */
export function OfferCreateScreen({ initialTemplateId }: { initialTemplateId?: string } = {}) {
  const { level } = useModulePermission("contracts");
  const projects = useModulePermission("projects");
  const scope = useDisciplineScope();

  // IZN-F2.x · teklif oluştur = sözleşme/teklif sayfaları Düzenler (VEYA) ∧ disiplin kısıtsız; işveren ekle =
  // genel.projeler Düzenler.
  const canEditOffers = useButtonGate({
    pages: OFFERS_EDIT,
    need: "edit",
    fallback: hasAtLeast(level, WRITE_LEVEL) && level !== "none",
  });
  const canAddEmployer = useButtonGate({
    pages: PROJECT_CREATE_EDIT,
    need: "edit",
    fallback: hasAtLeast(projects.level, EMPLOYER_ADD_LEVEL),
  });
  const canWrite = canEditOffers && !scope.isRestricted;
  // Yetkisiz kullanıcı için HİÇBİR uç çağrılmaz: ayar sorgusu bu kapının ALTINDAKİ bileşendedir.
  if (!canWrite) return <AccessDenied />;
  return (
    <OfferCreateSettingsGate
      canAddEmployer={canAddEmployer}
      initialTemplateId={initialTemplateId}
    />
  );
}

/** Form açılışta teklif ayarlarını (ön değerler) bekler; ayar ucu 403 → AccessDenied. */
function OfferCreateSettingsGate({
  canAddEmployer,
  initialTemplateId,
}: {
  canAddEmployer: boolean;
  initialTemplateId: string | undefined;
}) {
  const settings = useOfferSettings();
  if (isForbidden(settings.error)) return <AccessDenied />;

  if (settings.data === undefined) {
    return settings.isError ? (
      <div className="offer-create__state">
        <p>{SETTINGS_ERROR_TEXT}</p>
        <Button variant="secondary" size="sm" onClick={() => void settings.refetch()} disabled={settings.isFetching}>
          Tekrar dene
        </Button>
      </div>
    ) : (
      <p className="offer-create__state">Teklif ayarları yükleniyor</p>
    );
  }

  if (initialTemplateId !== undefined) {
    return <TemplateParamGate settings={settings.data} canAddEmployer={canAddEmployer} templateId={initialTemplateId} />;
  }
  return <OfferCreateForm settings={settings.data} canAddEmployer={canAddEmployer} />;
}

type OfferSettings = NonNullable<ReturnType<typeof useOfferSettings>["data"]>;

/**
 * `?sablon=` ile gelindi: form, şablon listesi gelince AÇILIR (oranlar ilk çizimde şablondan dolu, form kirli
 * sayılmaz). Liste okunamazsa form boş başlangıçla açılır. İstenen kimlik listede yoksa varsayılan şablon.
 */
function TemplateParamGate({
  settings,
  canAddEmployer,
  templateId,
}: {
  settings: OfferSettings;
  canAddEmployer: boolean;
  templateId: string;
}) {
  const templates = useOfferTemplates();
  if (templates.data === undefined && !templates.isError) return <p className="offer-create__state">Şablonlar yükleniyor</p>;
  const initialTemplate = templates.data === undefined ? undefined : pickTemplate(templates.data.items, templateId);
  return <OfferCreateForm settings={settings} canAddEmployer={canAddEmployer} initialTemplate={initialTemplate} />;
}

interface OfferCreateFormProps {
  settings: OfferSettings;
  canAddEmployer: boolean;
  /** `?sablon=` çözümü: `undefined` = boş başlangıç; `null` = Şablondan açık ama şablon yok. */
  initialTemplate?: OfferTemplateListItem | null;
}

function OfferCreateForm({ settings, canAddEmployer, initialTemplate }: OfferCreateFormProps) {
  const router = useRouter();
  const { me } = useSession();
  const employersQuery = useEmployers({ activeOnly: true });
  const createOffer = useCreateOffer();

  // Taban BİR KEZ yakalanır (ön değerler ayardan): dokunulmamış form kirli sayılmaz.
  const [baseline] = useState<OfferFormValues>(() => {
    const initial = initialOfferFormValues(settings, istanbulToday(new Date()));
    return initialTemplate ? conditionsFromTemplate(initial, initialTemplate, settings) : initial;
  });
  const [values, setValues] = useState<OfferFormValues>(baseline);
  const [attempted, setAttempted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isCreated, setIsCreated] = useState(false);
  const [isEmployerModalOpen, setIsEmployerModalOpen] = useState(false);
  // Yeni işveren, liste yeniden çekilene kadar seçenekte görünsün.
  const [justCreated, setJustCreated] = useState<EmployerListItem | null>(null);

  const start = useOfferCreateStart({ settings, setValues, initialTemplate });

  const isDirty = JSON.stringify(values) !== JSON.stringify(baseline);
  useUnsavedChanges(isDirty && !isCreated, "Teklif taslağı");

  // Doğrulama gönderim denemesinden sonra CANLI sürer (düzeltilen alan hatası ve bant sayısı anında güncellenir).
  // IZN-F4.2: `maliyet_kar` gizli rol GG/kâr yazamaz (dolu gönderim 403) → iki oran salt okunur "—", gövdeye girmez;
  // sunucu ayardan / kaynaktan kendisi alır.
  const isMaliyetKarHidden = useCategoryHidden("maliyet_kar");
  const settingsMasked = useMemo(() => maskedRatesOfSettings(settings), [settings]);
  const maskedRates = isMaliyetKarHidden ? BOTH_RATES_MASKED : settingsMasked;
  const errors = useMemo(() => (attempted ? validateOfferForm(values, maskedRates) : {}), [attempted, values, maskedRates]);
  const errorCount = Object.keys(errors).length;

  const formRef = useRef<HTMLFormElement>(null);
  const shouldFocusRef = useRef(false);
  useEffect(() => {
    if (!shouldFocusRef.current) return;
    shouldFocusRef.current = false;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [errors]);

  const employers = useMemo(() => {
    const listed = (employersQuery.data?.items ?? []).map((employer) => ({ id: employer.id, name: employer.name }));
    // Listede olmayan işverenler (yeni açılan, pasif kaynak işvereni) seçenek olarak eklenir.
    const extras = [justCreated, start.copyEmployer].filter(
      (extra): extra is { id: string; name: string } =>
        extra !== null && !listed.some((employer) => employer.id === extra.id),
    );
    return [...listed, ...extras.map((extra) => ({ id: extra.id, name: extra.name }))];
  }, [employersQuery.data, justCreated, start.copyEmployer]);

  function change(field: OfferFormField, value: string) {
    setValues((previous) => ({ ...previous, [field]: value }));
  }

  function submit() {
    if (createOffer.isPending) return;
    setServerError(null);
    setAttempted(true);
    if (Object.keys(validateOfferForm(values, maskedRates)).length > 0) {
      shouldFocusRef.current = true;
      return;
    }
    if (start.bodyStart === null) {
      setServerError(start.startProblem);
      return;
    }
    createOffer.mutate(buildOfferCreateBody(values, start.bodyStart, maskedRates), {
      onSuccess: (offer) => {
        setIsCreated(true);
        router.replace(routes.offers.detail({ offerId: offer.id }));
      },
      onError: (error) => {
        if (isForbidden(error)) return;
        setServerError(backendErrorMessage(error, "Teklif oluşturulamadı."));
        start.refreshSourcesOn404(error);
      },
    });
  }

  if (isForbidden(createOffer.error)) return <AccessDenied />;

  const validUntil = validUntilIso(values.offerDate, values.validityDays);
  const selectedEmployer = employers.find((employer) => employer.id === values.employerId);
  const preparerName = me?.full_name ?? "";

  return (
    <div className="offer-create">
      <header className="offer-create__head">
        <div className="offer-create__titlerow">
          <h1 className="offer-create__title">Yeni Teklif</h1>
          <Badge variant="neutral">Taslak</Badge>
          <span className="offer-create__no">Numara oluşturunca verilir · Rev.0</span>
        </div>
        <p className="offer-create__lead">Teklifin künyesini girin; oluşturunca kalem tablosuna geçersiniz.</p>
      </header>

      <form
        ref={formRef}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="offer-create__layout">
          <div className="offer-create__main">
            <OfferStartChoice
              kind={start.kind}
              onKindChange={start.selectKind}
              templateId={start.templateId}
              onTemplateSelect={start.selectTemplate}
              copyOfferId={start.copyOfferId}
              onCopySelect={start.selectCopy}
            />
            <section className="offer-create__card" aria-labelledby="offer-info-title">
              <h2 className="offer-create__card-title" id="offer-info-title">
                Teklif bilgileri
              </h2>
              {attempted && errorCount > 0 && (
                <p className="offer-create__band" role="status">
                  <b>{missingFieldsText(errorCount)}</b> Teklifi oluşturmadan önce işaretli alanları doldurun.
                </p>
              )}
              {(serverError ?? start.sourceError) && (
                <p className="offer-create__band" role="status">
                  {serverError ?? start.sourceError}
                </p>
              )}
              <OfferInfoFields
                values={values}
                errors={errors}
                onChange={change}
                employers={employers}
                preparerName={preparerName}
                validUntil={validUntil}
                employerAction={
                  <button
                    type="button"
                    className="offer-create__newemployer"
                    disabled={!canAddEmployer}
                    title={canAddEmployer ? undefined : EMPLOYER_ADD_DENIED_TITLE}
                    onClick={() => setIsEmployerModalOpen(true)}
                  >
                    + Yeni işveren
                  </button>
                }
              />
            </section>
            <OfferRateFields
              values={values}
              errors={errors}
              onChange={change}
              masked={maskedRates}
              isHiddenHintShown={isMaliyetKarHidden}
              defaults={{
                overheadPct: pctToInputText(settings.default_overhead_pct),
                profitPct: pctToInputText(settings.default_profit_pct),
                vatPct: pctToInputText(settings.default_vat_pct),
              }}
            />
          </div>
          <OfferCreateSummary
            startLabel={start.summaryLabel}
            employerName={selectedEmployer?.name ?? ""}
            title={values.title}
            validityDays={values.validityDays}
            validUntil={validUntil}
            overheadPct={maskedRates.has("overheadPct") ? EMPTY_CELL : values.overheadPct}
            profitPct={maskedRates.has("profitPct") ? EMPTY_CELL : values.profitPct}
            vatPct={values.vatPct}
          />
        </div>

        <div className="offer-create__footer">
          <span className="offer-create__req">
            Zorunlu alanlar <b>*</b> işaretli
          </span>
          <div className="offer-create__actions">
            <Link href={routes.offers.list()} className="btn btn--secondary btn--md">
              Vazgeç
            </Link>
            <Button type="submit" variant="primary" disabled={createOffer.isPending}>
              {createOffer.isPending ? "Oluşturuluyor…" : "Teklifi oluştur ve kalemlere geç →"}
            </Button>
          </div>
        </div>
      </form>

      {isEmployerModalOpen && (
        <EmployerFormModal
          onClose={() => setIsEmployerModalOpen(false)}
          onCreated={(employer) => {
            setJustCreated(employer);
            change("employerId", employer.id);
            setIsEmployerModalOpen(false);
          }}
        />
      )}
    </div>
  );
}
