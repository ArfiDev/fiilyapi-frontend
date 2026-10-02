"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { EmployerFormModal } from "@/components/project-form/EmployerFormModal";
import { AccessDenied } from "@/components/settings/AccessDenied";
import { confirmDiscardIfDirty } from "@/components/settings/Modal";
import { LockIcon } from "@/components/ui/icons";
import { backendErrorMessage } from "@/lib/api/error-message";
import { useEmployers, type EmployerListItem } from "@/lib/api/hooks/useEmployers";
import { useUpdateOffer, useUpdateOfferRevision } from "@/lib/api/hooks/useOfferMutations";
import type { OfferDetailRead, OfferRevisionRead } from "@/lib/api/hooks/useOffers";
import { BackendError, isForbidden } from "@/lib/api/unwrap";
import { formatDateTimeDots } from "@/lib/format";
import { routes } from "@/lib/routes";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";

import { ConfirmTransitionModal, type ConfirmTransitionKind } from "./ConfirmTransitionModal";
import { LoseOfferModal } from "./LoseOfferModal";
import { OfferActionBar } from "./OfferActionBar";
import { OfferDetailHeader } from "./OfferDetailHeader";
import { OfferInfoFields } from "./OfferInfoFields";
import { OfferRateFields } from "./OfferRateFields";
import { OfferTermsCard } from "./OfferTermsCard";
import { OfferTotalsCard } from "./OfferTotalsCard";
import { ReadOnlyRevisionBanner } from "./ReadOnlyRevisionBanner";
import { RevisionHistory } from "./RevisionHistory";
import { RevisionPicker } from "./RevisionPicker";
import { offerActionGate } from "./offer-actions";
import {
  OFFER_FORM_FIELDS,
  OFFER_INFO_FIELD_SET,
  applyFieldChange,
  buildOfferPatchBodies,
  changedFormFields,
  detailFormValuesFromServer,
  validateDetailForm,
  type OfferDetailFormField,
  type OfferDetailFormValues,
} from "./offer-detail-form";
import { validUntilIso } from "./offer-form";
import { useOfferDetailActions } from "./useOfferDetailActions";
import "./offers.css";
import "./offer-create.css";
import "./offer-detail.css";

/** Başarı bildiriminin ekranda kalma süresi (KIK/KAT emsali). */
const TOAST_MS = 2800;
/** ÜS-F3-8: işveren kartoteksine yazma proje yönetici yetkisidir. */
const EMPLOYER_ADD_DENIED_TITLE = "İşveren eklemek proje yönetici yetkisi ister";
const RATE_FORMULA_NOTE =
  "Teklif B.F. = Maliyet B.F. × (1 + gider) × (1 + kâr) · kalemde Teklif B.F. girilirse kâr % geriye hesaplanır";

/**
 * 🔌 F3.6 YUVASI — kalem tablosu bölgesi. Yuva, form ve toplam kartlarının arasında (TD:209-274)
 * `renderItems` ile doldurulur; verilmezse HİÇBİR ŞEY basılmaz (yer tutucu yok).
 */
export interface OfferItemsSlotContext {
  offerId: string;
  revNo: number;
  revision: OfferRevisionRead;
  /** Kalemler yazılabilir mi? (son revizyon ∧ taslak ∧ yazma yetkisi) */
  canEdit: boolean;
}

interface OfferDetailViewProps {
  detail: OfferDetailRead;
  revision: OfferRevisionRead;
  canWrite: boolean;
  canAddEmployer: boolean;
  /** Salt okunur şerit metni (yazamayan kullanıcı); boş = şerit yok. */
  readOnlyText: string;
  renderItems?: (context: OfferItemsSlotContext) => ReactNode;
  /** `null` = güncel revizyon (URL'den `rev` kalkar). */
  onSelectRevision: (revNo: number | null) => void;
}

/** TKL-F3.5 · Teklif Detay gövdesi: künye + oranlar + koşullar TEK kirli form, durum eylemleri, geçmiş, toplamlar. */
export function OfferDetailView(props: OfferDetailViewProps) {
  const { detail, revision, canWrite, renderItems } = props;
  const offerId = detail.id;
  const revNo = revision.rev_no;
  const summary = detail.revisions.find((candidate) => candidate.rev_no === revNo);

  const updateOffer = useUpdateOffer(offerId);
  const updateRevision = useUpdateOfferRevision(offerId, revNo);
  const employersQuery = useEmployers({ activeOnly: true });

  // Düzenlemeler SUNUCU değerlerinin ÜSTÜNE biner: dokunulmayan alan sunucuyu izler, kayıttan sonra kirlilik kalkar.
  const [edits, setEdits] = useState<Partial<OfferDetailFormValues>>({});
  const [attempted, setAttempted] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<{ text: string } | null>(null);
  const [modal, setModal] = useState<ConfirmTransitionKind | "lose" | null>(null);
  const [isEmployerModalOpen, setIsEmployerModalOpen] = useState(false);
  const [justCreated, setJustCreated] = useState<EmployerListItem | null>(null);
  const [isSaveDenied, setIsSaveDenied] = useState(false);

  const server = useMemo(() => detailFormValuesFromServer(detail, revision), [detail, revision]);
  const values = useMemo(() => ({ ...server, ...edits }), [server, edits]);
  const changed = useMemo(() => changedFormFields(values, detail, revision), [values, detail, revision]);
  const isDirty = changed.size > 0;
  useUnsavedChanges(isDirty, "Teklif taslağı");

  const errors = useMemo(() => (attempted ? validateDetailForm(values) : {}), [attempted, values]);
  const formRef = useRef<HTMLDivElement>(null);
  const shouldFocusRef = useRef(false);
  useEffect(() => {
    if (!shouldFocusRef.current) return;
    shouldFocusRef.current = false;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [errors]);

  useEffect(() => {
    if (toast === null) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  function showToast(text: string) {
    setToast({ text });
  }

  const actions = useOfferDetailActions({
    offerId,
    revNo,
    validityDays: revision.validity_days,
    onToast: showToast,
    onRevisionOpened: (opened) => props.onSelectRevision(opened),
  });

  const isLatest = revision.is_latest;
  const gate = offerActionGate({ status: detail.status, isLatest, isDirty, canWrite });
  const canEdit = gate.edit.enabled && revision.is_editable;

  const employers = useMemo(() => {
    const listed = (employersQuery.data?.items ?? []).map((employer) => ({ id: employer.id, name: employer.name }));
    const extras = [
      { id: detail.employer_id, name: detail.employer_name },
      ...(justCreated ? [{ id: justCreated.id, name: justCreated.name }] : []),
    ];
    return [...listed, ...extras.filter((extra) => !listed.some((employer) => employer.id === extra.id))];
  }, [employersQuery.data, detail.employer_id, detail.employer_name, justCreated]);

  function change(field: OfferDetailFormField, text: string) {
    setEdits((previous) => applyFieldChange(previous, field, text));
  }

  async function save() {
    if (isSaving) return;
    setSaveError(null);
    setAttempted(true);
    if (Object.keys(validateDetailForm(values)).length > 0) {
      shouldFocusRef.current = true;
      return;
    }
    const bodies = buildOfferPatchBodies(values, changed);
    setIsSaving(true);
    try {
      // İlk hata durdurur; kaydedilen bölümün düzenlemesi düşer (sunucu artık onu taşır), kalan kirli kalır.
      let stamp = "";
      if (bodies.offer) {
        stamp = (await updateOffer.mutateAsync(bodies.offer)).updated_at;
        setEdits((previous) => dropFields(previous, (field) => OFFER_INFO_FIELD_SET.has(field)));
      }
      if (bodies.revision) {
        stamp = (await updateRevision.mutateAsync(bodies.revision)).updated_at;
        setEdits((previous) => dropFields(previous, (field) => !OFFER_INFO_FIELD_SET.has(field)));
      }
      showToast(`Taslak kaydedildi · Rev.${revNo} · ${formatDateTimeDots(stamp)}`);
    } catch (error) {
      if (isForbidden(error)) setIsSaveDenied(true);
      else setSaveError(backendErrorMessage(error, "Taslak kaydedilemedi."));
      if (error instanceof BackendError && error.status === 409) actions.refreshAfterConflict();
    } finally {
      setIsSaving(false);
    }
  }

  if (actions.isDenied || isSaveDenied) return <AccessDenied />;

  const validUntil =
    changed.has("offerDate") || changed.has("validityDays")
      ? validUntilIso(values.offerDate, values.validityDays)
      : revision.valid_until;
  const closeModal = () => {
    setModal(null);
    actions.clearError();
  };

  return (
    <div className="offer-detail">
      <OfferDetailHeader offerNo={detail.offer_no} title={detail.title} status={revision.status}>
        <RevisionPicker
          revisions={detail.revisions}
          currentRevNo={revNo}
          latestRevNo={detail.latest_rev_no}
          onSelect={(next) => {
            if (!confirmDiscardIfDirty(isDirty)) return;
            props.onSelectRevision(next === detail.latest_rev_no ? null : next);
          }}
        />
        <span className="offer-detail__saved">
          Son kayıt <b>{formatDateTimeDots(isLatest ? detail.updated_at : summary?.updated_at)}</b>
        </span>
      </OfferDetailHeader>

      <OfferActionBar
        gate={gate}
        isBusy={actions.isBusy || isSaving}
        isSaving={isSaving}
        onSave={() => void save()}
        onNewRevision={actions.newRevision}
        onSend={() => (revision.totals.unpriced_count > 0 ? setModal("send") : actions.send(() => undefined))}
        onWin={() => setModal("win")}
        onLose={() => setModal("lose")}
        onWithdraw={() => setModal("withdraw")}
      />

      {props.readOnlyText && (
        <div role="note" className="offers-readonly">
          <LockIcon className="offers-readonly__icon" />
          <span>{props.readOnlyText}</span>
        </div>
      )}
      {toast && (
        <div className="offers-toast" role="status">
          {toast.text}
        </div>
      )}
      {modal === null && (saveError ?? actions.error) && (
        <p className="offers-error" role="status">
          {saveError ?? actions.error}
        </p>
      )}
      {!isLatest && summary && (
        <ReadOnlyRevisionBanner revision={summary} currentHref={routes.offers.detail({ offerId })} />
      )}

      <div className="offer-detail__top" ref={formRef}>
        <div className="offer-detail__forms">
          <section className="offer-create__card" aria-labelledby="offer-info-title">
            <h2 className="offer-create__card-title" id="offer-info-title">
              Teklif bilgileri
            </h2>
            <OfferInfoFields
              values={values}
              errors={errors}
              onChange={change}
              employers={employers}
              preparerName={detail.prepared_by_name ?? ""}
              validUntil={validUntil}
              disabled={!canEdit}
              employerAction={
                <button
                  type="button"
                  className="offer-create__newemployer"
                  disabled={!canEdit || !props.canAddEmployer}
                  title={props.canAddEmployer ? undefined : EMPLOYER_ADD_DENIED_TITLE}
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
            disabled={!canEdit}
            title="Oranlar"
            subtitle="Teklif geneli · kalemde değiştirilebilir"
            note={RATE_FORMULA_NOTE}
          />
        </div>
        <RevisionHistory history={detail.history} revisions={detail.revisions} />
      </div>

      {renderItems?.({ offerId, revNo, revision, canEdit })}

      <div className="offer-detail__bottom">
        <OfferTermsCard values={values} errors={errors} onChange={change} disabled={!canEdit} />
        <OfferTotalsCard totals={revision.totals} vatPct={revision.vat_pct} />
      </div>

      {(modal === "send" || modal === "win" || modal === "withdraw") && (
        <ConfirmTransitionModal
          kind={modal}
          offerNo={detail.offer_no}
          revNo={revNo}
          unpricedCount={revision.totals.unpriced_count}
          isPending={actions.isBusy}
          errorText={actions.error}
          onClose={closeModal}
          onConfirm={() => actions[modal](closeModal)}
        />
      )}
      {modal === "lose" && (
        <LoseOfferModal
          offerNo={detail.offer_no}
          revNo={revNo}
          isPending={actions.isBusy}
          errorText={actions.error}
          onClose={closeModal}
          onSubmit={(body) => actions.lose(body, closeModal)}
        />
      )}
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

/** `predicate`i sağlayan alanların düzenlemesini düşürür (yeni nesne döner). */
function dropFields(
  edits: Partial<OfferDetailFormValues>,
  predicate: (field: OfferDetailFormField) => boolean,
): Partial<OfferDetailFormValues> {
  const next = { ...edits };
  for (const field of OFFER_FORM_FIELDS) {
    if (predicate(field)) delete next[field];
  }
  return next;
}
