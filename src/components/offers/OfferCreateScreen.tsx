"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { EmployerFormModal } from "@/components/project-form/EmployerFormModal";
import { AccessDenied } from "@/components/settings/AccessDenied";
import { useSession } from "@/components/shell/SessionProvider";
import { Badge, Button } from "@/components/ui";
import { backendErrorMessage } from "@/lib/api/error-message";
import { useEmployers, type EmployerListItem } from "@/lib/api/hooks/useEmployers";
import { useCreateOffer } from "@/lib/api/hooks/useOfferMutations";
import { useOfferSettings } from "@/lib/api/hooks/useOffers";
import { isForbidden } from "@/lib/api/unwrap";
import { hasAtLeast } from "@/lib/auth/permissions";
import { useDisciplineScope } from "@/lib/auth/useDisciplineScope";
import { useModulePermission } from "@/lib/auth/useModulePermission";
import { routes } from "@/lib/routes";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";

import { OfferCreateSummary } from "./OfferCreateSummary";
import { OfferInfoFields } from "./OfferInfoFields";
import { OfferRateFields } from "./OfferRateFields";
import { OfferStartChoice } from "./OfferStartChoice";
import {
  buildOfferCreateBody,
  initialOfferFormValues,
  missingFieldsText,
  pctToInputText,
  validUntilIso,
  validateOfferForm,
  type OfferFormField,
  type OfferFormValues,
} from "./offer-form";
import { istanbulToday } from "./offer-status";
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
export function OfferCreateScreen() {
  const { level } = useModulePermission("contracts");
  const projects = useModulePermission("projects");
  const scope = useDisciplineScope();

  const canWrite = hasAtLeast(level, WRITE_LEVEL) && !scope.isRestricted && level !== "none";
  // Yetkisiz kullanıcı için HİÇBİR uç çağrılmaz: ayar sorgusu bu kapının ALTINDAKİ bileşendedir.
  if (!canWrite) return <AccessDenied />;
  return <OfferCreateSettingsGate canAddEmployer={hasAtLeast(projects.level, EMPLOYER_ADD_LEVEL)} />;
}

/** Form açılışta teklif ayarlarını (ön değerler) bekler; ayar ucu 403 → AccessDenied. */
function OfferCreateSettingsGate({ canAddEmployer }: { canAddEmployer: boolean }) {
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

  return <OfferCreateForm settings={settings.data} canAddEmployer={canAddEmployer} />;
}

interface OfferCreateFormProps {
  settings: NonNullable<ReturnType<typeof useOfferSettings>["data"]>;
  canAddEmployer: boolean;
}

function OfferCreateForm({ settings, canAddEmployer }: OfferCreateFormProps) {
  const router = useRouter();
  const { me } = useSession();
  const employersQuery = useEmployers({ activeOnly: true });
  const createOffer = useCreateOffer();

  // Taban BİR KEZ yakalanır (ön değerler ayardan): dokunulmamış form kirli sayılmaz.
  const [baseline] = useState<OfferFormValues>(() => initialOfferFormValues(settings, istanbulToday(new Date())));
  const [values, setValues] = useState<OfferFormValues>(baseline);
  const [attempted, setAttempted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isCreated, setIsCreated] = useState(false);
  const [isEmployerModalOpen, setIsEmployerModalOpen] = useState(false);
  // Yeni işveren, liste yeniden çekilene kadar seçenekte görünsün.
  const [justCreated, setJustCreated] = useState<EmployerListItem | null>(null);

  const isDirty = JSON.stringify(values) !== JSON.stringify(baseline);
  useUnsavedChanges(isDirty && !isCreated, "Teklif taslağı");

  // Doğrulama gönderim denemesinden sonra CANLI sürer (düzeltilen alan hatası ve bant sayısı anında güncellenir).
  const errors = useMemo(() => (attempted ? validateOfferForm(values) : {}), [attempted, values]);
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
    return justCreated && !listed.some((employer) => employer.id === justCreated.id)
      ? [...listed, { id: justCreated.id, name: justCreated.name }]
      : listed;
  }, [employersQuery.data, justCreated]);

  function change(field: OfferFormField, value: string) {
    setValues((previous) => ({ ...previous, [field]: value }));
  }

  function submit() {
    if (createOffer.isPending) return;
    setServerError(null);
    setAttempted(true);
    if (Object.keys(validateOfferForm(values)).length > 0) {
      shouldFocusRef.current = true;
      return;
    }
    createOffer.mutate(buildOfferCreateBody(values), {
      onSuccess: (offer) => {
        setIsCreated(true);
        router.replace(routes.offers.detail({ offerId: offer.id }));
      },
      onError: (error) => {
        if (!isForbidden(error)) setServerError(backendErrorMessage(error, "Teklif oluşturulamadı."));
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
            <OfferStartChoice />
            <section className="offer-create__card" aria-labelledby="offer-info-title">
              <h2 className="offer-create__card-title" id="offer-info-title">
                Teklif bilgileri
              </h2>
              {attempted && errorCount > 0 && (
                <p className="offer-create__band" role="status">
                  <b>{missingFieldsText(errorCount)}</b> Teklifi oluşturmadan önce işaretli alanları doldurun.
                </p>
              )}
              {serverError && (
                <p className="offer-create__band" role="status">
                  {serverError}
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
              defaults={{
                overheadPct: pctToInputText(settings.default_overhead_pct),
                profitPct: pctToInputText(settings.default_profit_pct),
                vatPct: pctToInputText(settings.default_vat_pct),
              }}
            />
          </div>
          <OfferCreateSummary
            employerName={selectedEmployer?.name ?? ""}
            title={values.title}
            validityDays={values.validityDays}
            validUntil={validUntil}
            overheadPct={values.overheadPct}
            profitPct={values.profitPct}
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
