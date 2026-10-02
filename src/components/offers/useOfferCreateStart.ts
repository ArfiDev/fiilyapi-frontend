import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

import { backendErrorMessage } from "@/lib/api/error-message";
import { OFFERS_QUERY_KEY, offerTemplatesKey } from "@/lib/api/hooks/offer-query-keys";
import { useOfferRevision, type OfferListItem, type OfferSettingsRead } from "@/lib/api/hooks/useOffers";
import type { OfferTemplateListItem } from "@/lib/api/hooks/useOfferTemplates";
import { BackendError } from "@/lib/api/unwrap";

import type { OfferFormValues } from "./offer-form";
import {
  conditionsFromRevision,
  conditionsFromSettings,
  conditionsFromTemplate,
  kunyeFromOffer,
  pendingStartLabel,
  startSummaryLabel,
  type OfferBodyStart,
  type OfferStartKind,
} from "./offer-start";

const NOT_FOUND = 404;
export const START_MESSAGES = {
  templateRequired: "Bir şablon seçin",
  copyRequired: "Kopyalanacak teklifi seçin",
  sourceLoading: "Kaynak teklif yükleniyor",
  sourceUnreadable: "Kaynak teklif okunamadı",
} as const;

interface Args {
  settings: OfferSettingsRead;
  setValues: Dispatch<SetStateAction<OfferFormValues>>;
  /** `?sablon=` ile açılışta önceden çözülmüş şablon (liste kapıda beklenir); `undefined` = başlangıç boş. */
  initialTemplate?: OfferTemplateListItem | null;
}

/**
 * TKL-F4.7 · Yeni teklifin başlangıç durumu: seçim, form doldurma (oran ezmesi önlemi), gövde başlangıcı, özet etiketi.
 * Doldurma kuralları `offer-start.ts`te (saf); burası yalnız ne zaman uygulanacağını yönetir.
 */
export function useOfferCreateStart({ settings, setValues, initialTemplate }: Args) {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<OfferStartKind>(initialTemplate === undefined ? "blank" : "template");
  const [template, setTemplate] = useState<OfferTemplateListItem | null>(initialTemplate ?? null);
  const [copy, setCopy] = useState<OfferListItem | null>(null);
  // Hangi kaynak revizyonun koşulları forma yazıldı (aynı kaynak için tekrar yazılmaz).
  const filledRevisionKey = useRef<string | null>(null);

  const revisionQuery = useOfferRevision(kind === "copy" ? copy?.id : undefined, kind === "copy" ? copy?.rev_no : undefined);
  const revision = revisionQuery.data;
  const sourceError =
    kind === "copy" && copy !== null && revisionQuery.isError
      ? backendErrorMessage(revisionQuery.error, START_MESSAGES.sourceUnreadable)
      : null;

  useEffect(() => {
    if (kind !== "copy" || copy === null || revision === undefined) return;
    const key = `${copy.id}:${copy.rev_no}`;
    if (filledRevisionKey.current === key) return;
    filledRevisionKey.current = key;
    setValues((previous) => conditionsFromRevision(previous, revision));
  }, [kind, copy, revision, setValues]);

  const isSourceMissing = revisionQuery.error instanceof BackendError && revisionQuery.error.status === NOT_FOUND;
  useEffect(() => {
    if (isSourceMissing) void queryClient.invalidateQueries({ queryKey: [OFFERS_QUERY_KEY] });
  }, [isSourceMissing, queryClient]);

  const selectKind = useCallback(
    (next: OfferStartKind) => {
      if (next === kind) return;
      setKind(next);
      filledRevisionKey.current = null;
      setValues((previous) => {
        // Şablon/kopya değerleri başka başlangıca SIZMAZ: önce ayara dön, sonra yeni başlangıcın değerini uygula.
        const base = kind === "blank" ? previous : conditionsFromSettings(previous, settings);
        if (next === "template" && template !== null) return conditionsFromTemplate(base, template, settings);
        if (next === "copy" && copy !== null) return kunyeFromOffer(base, copy);
        return base;
      });
    },
    [kind, template, copy, settings, setValues],
  );

  const selectTemplate = useCallback(
    (next: OfferTemplateListItem | null) => {
      if (next?.id === template?.id) return;
      setTemplate(next);
      if (next !== null) setValues((previous) => conditionsFromTemplate(previous, next, settings));
    },
    [template, settings, setValues],
  );

  const selectCopy = useCallback(
    (next: OfferListItem) => {
      if (next.id === copy?.id && next.rev_no === copy.rev_no) return;
      setCopy(next);
      filledRevisionKey.current = null;
      setValues((previous) => kunyeFromOffer(previous, next));
    },
    [copy, setValues],
  );

  /** Gönderim 404'ü: kaynak (şablon/teklif) silinmiş — ilgili liste tazelenir (bant metni çağıranda). */
  const refreshSourcesOn404 = useCallback(
    (error: unknown) => {
      if (!(error instanceof BackendError) || error.status !== NOT_FOUND) return;
      if (kind === "template") void queryClient.invalidateQueries({ queryKey: offerTemplatesKey() });
      if (kind === "copy") void queryClient.invalidateQueries({ queryKey: [OFFERS_QUERY_KEY] });
    },
    [kind, queryClient],
  );

  const resolved = resolveBodyStart(kind, template, copy, revision);
  const summaryLabel =
    kind === "blank"
      ? startSummaryLabel({ kind: "blank" }, null)
      : kind === "template"
        ? template === null
          ? pendingStartLabel("template")
          : startSummaryLabel({ kind: "template", templateId: template.id }, template.name)
        : copy === null
          ? pendingStartLabel("copy")
          : startSummaryLabel({ kind: "copy", offerId: copy.id, revNo: copy.rev_no }, copy.offer_no);

  return {
    kind,
    templateId: template?.id ?? null,
    copyOfferId: copy?.id ?? null,
    /** Kopya kaynağının işvereni (aktif işveren listesinde olmayabilir → seçenek olarak eklenir). */
    copyEmployer: kind === "copy" && copy !== null ? { id: copy.employer_id, name: copy.employer_name } : null,
    selectKind,
    selectTemplate,
    selectCopy,
    refreshSourcesOn404,
    summaryLabel,
    /** `null` = başlangıç tamam değil; gerekçe `startProblem`da. */
    bodyStart: resolved.start,
    startProblem: resolved.start === null ? (sourceError ?? resolved.problem) : null,
    /** Kaynak revizyonu okunamadı (404 …): bant olarak basılır. */
    sourceError,
  };
}

type Resolved = { start: OfferBodyStart; problem: null } | { start: null; problem: string };

function resolveBodyStart(
  kind: OfferStartKind,
  template: OfferTemplateListItem | null,
  copy: OfferListItem | null,
  revision: ReturnType<typeof useOfferRevision>["data"],
): Resolved {
  if (kind === "blank") return { start: { kind: "blank" }, problem: null };
  if (kind === "template") {
    return template === null
      ? { start: null, problem: START_MESSAGES.templateRequired }
      : { start: { kind: "template", templateId: template.id }, problem: null };
  }
  if (copy === null) return { start: null, problem: START_MESSAGES.copyRequired };
  if (revision === undefined) return { start: null, problem: START_MESSAGES.sourceLoading };
  return {
    start: {
      kind: "copy",
      offerId: copy.id,
      revNo: copy.rev_no,
      priceEscalation: revision.price_escalation,
      priceIndexType: revision.price_index_type,
    },
    problem: null,
  };
}
