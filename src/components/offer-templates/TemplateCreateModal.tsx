"use client";

import { useState } from "react";

import { Modal } from "@/components/settings/Modal";
import { pctToInputText } from "@/components/offers/offer-form";
import { Button, Checkbox, Field, Input } from "@/components/ui";
import { WarningTriangleIcon } from "@/components/ui/icons";
import { backendErrorMessage } from "@/lib/api/error-message";
import { useCatalogDisciplines } from "@/lib/api/hooks/useCatalogItems";
import { useOfferSettings, useOffers, type OfferListItem } from "@/lib/api/hooks/useOffers";
import type { OfferTemplateListItem } from "@/lib/api/hooks/useOfferTemplates";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";

import { GroupChips, OfferSourcePanel, SourceCards, TemplateSourceChips } from "./TemplateSourcePanels";
import type { FlowResult } from "./template-create-flow";
import {
  NAME_MAX_LENGTH,
  checkCreateForm,
  effectiveRates,
  initialCreateForm,
  missingFieldsText,
  previewText,
  resolveTemplate,
  switchSource,
  type CreateContext,
  type CreateFormState,
  type FormErrors,
  type RateDefaultTexts,
  type SourceKind,
} from "./template-create-form";
import { useTemplateCreateFlow } from "./useTemplateCreateFlow";
import "./offer-templates.css";

const OFFERS_PAGE_SIZE = 8;
const SEARCH_DEBOUNCE_MS = 300;
const NOT_PCT_CHAR = /[^\d.,]/g;
const NAME_HINT = "Yeni Teklif ekranındaki şablon listesinde bu adla görünür";
const RATE_HINT = "Bu şablonla açılan tekliflere varsayılan";

interface TemplateCreateModalProps {
  /** "Tekliften şablon oluştur" düğmesi modalı "Bir tekliften" önseçili açar. */
  initialSource: SourceKind;
  templates: readonly OfferTemplateListItem[];
  onClose: () => void;
  /** Şablon oluştu (tam ya da kısmen): çağıran seçer, toast/bant basar, modalı kapatır. */
  onCreated: (result: FlowResult, toast: string) => void;
}

/** TS:163-239 — Yeni Şablon modalı. */
export function TemplateCreateModal({ initialSource, templates, onClose, onCreated }: TemplateCreateModalProps) {
  const [form, setForm] = useState<CreateFormState>(() => initialCreateForm(initialSource));
  const [attempted, setAttempted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [offerSearch, setOfferSearch] = useState("");
  const [chosenOffer, setChosenOffer] = useState<OfferListItem | null>(null);
  const flow = useTemplateCreateFlow();

  const q = useDebouncedValue(offerSearch.trim(), SEARCH_DEBOUNCE_MS);
  const offersQuery = useOffers({ ...(q ? { q } : {}), limit: OFFERS_PAGE_SIZE });
  const disciplinesQuery = useCatalogDisciplines();
  const settings = useOfferSettings();

  const offers = offersQuery.data?.items ?? [];
  const context: CreateContext = {
    // Aramayla görünmez olan SEÇİLİ teklif kaynak olarak geçerli kalır.
    offers: chosenOffer !== null && !offers.some((o) => o.id === chosenOffer.id) ? [chosenOffer, ...offers] : offers,
    templates,
    disciplines: disciplinesQuery.data ?? [],
  };
  const defaults: RateDefaultTexts = {
    overhead: settings.data ? pctToInputText(settings.data.default_overhead_pct) : "",
    profit: settings.data ? pctToInputText(settings.data.default_profit_pct) : "",
  };
  const check = checkCreateForm(form, context, defaults);
  const errors: FormErrors = attempted && !check.ok ? check.errors : {};
  const rates = effectiveRates(form, defaults);
  const selectedOfferId = (context.offers.find((o) => o.id === form.offerId) ?? offers[0])?.id;
  const selectedTemplateId = resolveTemplate(form, context)?.id;

  const patch = (changes: Partial<CreateFormState>) => setForm((current) => ({ ...current, ...changes }));

  async function submit() {
    if (!check.ok) {
      setAttempted(true);
      return;
    }
    setSubmitError(null);
    const result = await flow.run(check.input);
    if (result.template === null) {
      setSubmitError(result.failure?.message ?? backendErrorMessage(undefined));
      return;
    }
    onCreated(result, check.toast);
  }

  return (
    <Modal
      title="Yeni Şablon"
      subtitle="Kalem seti, gruplar ve varsayılan oranlar saklanır · miktar ve fiyat saklanmaz"
      className="otpl-modal"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={flow.isPending}>
            Vazgeç
          </Button>
          <Button onClick={() => void submit()} disabled={flow.isPending}>
            Şablonu Oluştur
          </Button>
        </>
      }
    >
      <div className="otpl-modal__body">
        {attempted && !check.ok && (
          <p className="otpl-modal__error">
            <WarningTriangleIcon width={14} height={14} />
            <span>
              <b>{missingFieldsText(check.count)}</b> Şablonu oluşturmadan önce işaretli alanları doldurun.
            </span>
          </p>
        )}
        {submitError !== null && <p className="otpl-modal__error">{submitError}</p>}
        <Field
          label="Şablon adı"
          required
          labelAside={<span className="otpl-modal__name-count">{form.name.length}/{NAME_MAX_LENGTH}</span>}
          hint={errors.name ? undefined : NAME_HINT}
          error={errors.name}
        >
          {(control) => (
            <Input
              {...control}
              value={form.name}
              maxLength={NAME_MAX_LENGTH}
              placeholder="Örn. Konut · ince işler"
              status={errors.name ? "error" : "default"}
              onChange={(event) => patch({ name: event.target.value.slice(0, NAME_MAX_LENGTH) })}
            />
          )}
        </Field>
        <Field label="Açıklama">
          {(control) => (
            <Input
              {...control}
              value={form.description}
              placeholder="Kapsam: hangi işler için kullanılır"
              onChange={(event) => patch({ description: event.target.value })}
            />
          )}
        </Field>
        <div>
          <span className="otpl-modal__label">
            Kalemler nereden gelsin? <span aria-hidden="true">*</span>
          </span>
          <SourceCards source={form.source} onChange={(kind) => setForm((current) => switchSource(current, kind, context))} />
        </div>
        {form.source === "offer" && (
          <OfferSourcePanel
            offers={offers}
            selectedId={selectedOfferId}
            searchText={offerSearch}
            onSearchChange={setOfferSearch}
            onSelect={(offer) => {
              setChosenOffer(offer);
              patch({ offerId: offer.id });
            }}
            isLoading={offersQuery.isPending}
            error={errors.source}
          />
        )}
        {form.source === "template" && (
          <TemplateSourceChips
            templates={templates}
            selectedId={selectedTemplateId}
            onSelect={(id) => setForm((current) => switchSource(current, "template", context, id))}
          />
        )}
        {form.source === "blank" && (
          <GroupChips
            disciplines={context.disciplines}
            selectedIds={form.groupIds}
            onToggle={(id) =>
              patch({ groupIds: form.groupIds.includes(id) ? form.groupIds.filter((x) => x !== id) : [...form.groupIds, id] })
            }
          />
        )}
        <div className="otpl-rates">
          <RateField label="Varsayılan genel gider" value={rates.overhead} error={errors.overhead} onChange={(overhead) => patch({ overhead })} />
          <RateField label="Varsayılan kâr" value={rates.profit} error={errors.profit} onChange={(profit) => patch({ profit })} />
        </div>
        <div className={form.makeDefault ? "otpl-default otpl-default--on" : "otpl-default"}>
          <Checkbox
            checked={form.makeDefault}
            onChange={(event) => patch({ makeDefault: event.target.checked })}
            label={
              <span className="otpl-default__text">
                <span className="otpl-default__title">Varsayılan şablon yap</span>
                <span className="otpl-default__desc">Yeni Teklif ekranında önceden seçili gelir</span>
              </span>
            }
          />
        </div>
        <p className="otpl-note">
          Oluşacak şablon: <b>{previewText(form, context, defaults)}</b>
        </p>
      </div>
    </Modal>
  );
}

function RateField({
  label,
  value,
  error,
  onChange,
}: {
  label: string;
  value: string;
  error: string | undefined;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label} hint={RATE_HINT} error={error}>
      {(control) => (
        <Input
          {...control}
          numeric
          inputMode="decimal"
          value={value}
          status={error ? "error" : "default"}
          rightIcon={<span aria-hidden="true">%</span>}
          onChange={(event) => onChange(event.target.value.replace(NOT_PCT_CHAR, ""))}
        />
      )}
    </Field>
  );
}
