"use client";

import { useMemo, useRef, useState } from "react";

import type { OfferConvertBody, OfferConvertResponse } from "@/lib/api/hooks/useOfferMutations";
import type { OfferDetailRead, OfferRevisionRead } from "@/lib/api/hooks/useOffers";
import type { WorkItemRead } from "@/lib/api/models";
import { istanbulToday } from "@/components/offers/offer-status";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";
import type { UseMutationResult } from "@tanstack/react-query";

import { ConvertBuildError, buildConvertRequest } from "./convert-body";
import { summarize, type ConvertSummary } from "./convert-derive";
import { diffPctText } from "./convert-format";
import { initialConvertForm } from "./convert-initial";
import * as model from "./convert-model";
import { classifyConvertError, firstIssueStep, locateIssues, type ConvertFailure, type LocatedIssues } from "./convert-server-errors";
import type { ConvertDraft, ConvertForm, ConvertStep } from "./convert-types";
import { hasStep1Errors, hasStep2Errors, validateStep1, validateStep2, type Step1Errors } from "./convert-validate";
import { visibleStep2Errors, type VisibleStep2Errors } from "./convert-view-errors";

export type ConvertMutation = UseMutationResult<OfferConvertResponse, Error, OfferConvertBody>;

interface BoardInput {
  detail: OfferDetailRead;
  revision: OfferRevisionRead;
  catalogItems: readonly WorkItemRead[];
  convert: ConvertMutation;
}

const NOTES: Readonly<Record<1 | 3, string>> = { 1: "Proje ve sözleşme kimliği", 3: "Kontrol edip oluşturun" };
const UNSAVED_LABEL = "Dönüştürme";

const disciplineMap = (items: readonly WorkItemRead[]): ReadonlyMap<string, string> => new Map(items.map((item) => [item.id, item.discipline.id]));

const isFormDirty = (a: ConvertForm, b: ConvertForm): boolean => (Object.keys(a) as (keyof ConvertForm)[]).some((key) => a[key] !== b[key]);

function footerNote(step: ConvertStep, summary: ConvertSummary): string {
  if (step !== 2) return NOTES[step];
  const changes = summary.changedCount + summary.excludedCount + summary.newCount;
  return `${changes} kalemde değişiklik · fark ${diffPctText(summary.diffPct)}`;
}

/** Sunucu alan hataları (422 `errors[].loc` ve 409 kod çakışması) Adım 1 formunda görünür kalır. */
function codeTakenIssues(failure: ConvertFailure, draft: ConvertDraft): LocatedIssues {
  const located = locateIssues(failure.issues, draft);
  return located.fields.projectCode ? located : { ...located, fields: { ...located.fields, projectCode: failure.message } };
}

/**
 * Dönüştürme ekranının durumu: form + taslak (F5.2 modeli) + adım + sunucu hata konumları + tek uçuşlu gönderim.
 * Tüm güncellemeler YENİ nesne üretir (model işlemleri saf); ekran bileşenleri yalnız çizer.
 */
export function useConvertBoard({ detail, revision, catalogItems, convert }: BoardInput) {
  const [initial] = useState(() => ({
    form: initialConvertForm({ title: detail.title, revision, today: istanbulToday(new Date()) }),
    draft: model.rowsFromRevision(revision, disciplineMap(catalogItems)),
  }));
  const [form, setForm] = useState(initial.form);
  const [draft, setDraft] = useState(initial.draft);
  const [step, setStep] = useState<ConvertStep>(1);
  const [shown, setShown] = useState({ 1: false, 2: false });
  const [located, setLocated] = useState<LocatedIssues | null>(null);
  const lastBody = useRef<OfferConvertBody | null>(null);
  const inFlight = useRef(false);

  const errors1 = useMemo(() => validateStep1(form), [form]);
  const errors2 = useMemo(() => validateStep2(draft, revision), [draft, revision]);
  const summary = useMemo(() => summarize(draft, revision.vat_pct), [draft, revision.vat_pct]);
  const isValid = (n: 1 | 2): boolean => !(n === 1 ? hasStep1Errors(errors1) : hasStep2Errors(errors2));
  const isDone = convert.isSuccess;
  const isBusy = convert.isPending;

  useUnsavedChanges(!isDone && (isFormDirty(form, initial.form) || draft !== initial.draft), UNSAVED_LABEL);

  const changeForm: <K extends keyof ConvertForm>(field: K, value: ConvertForm[K]) => void = (field, value) => {
    setForm((previous) => ({ ...previous, [field]: value }));
    setLocated(null);
  };
  const changeDraft = (change: (current: ConvertDraft) => ConvertDraft): void => {
    setDraft(change);
    setLocated(null);
  };

  /** Geçersiz ilk adımı açar ve hatalarını görünür kılar ("ileri" kapısının ortak ucu). */
  function reveal(blocked: 1 | 2): void {
    setShown((previous) => ({ ...previous, [blocked]: true }));
    setStep(blocked);
  }

  function goTo(target: ConvertStep): void {
    if (isBusy || isDone) return;
    const blocked = ([1, 2] as const).find((n) => n >= step && n < target && !isValid(n));
    if (blocked === undefined) return setStep(target);
    reveal(blocked);
  }

  function submit(body: OfferConvertBody): void {
    if (inFlight.current || isBusy) return;
    inFlight.current = true;
    lastBody.current = body;
    setLocated(null);
    convert.mutate(body, {
      onError: (error) => showFailure(classifyConvertError(error)),
      onSettled: () => {
        inFlight.current = false;
      },
    });
  }

  function showFailure(failure: ConvertFailure): void {
    const found = failure.kind === "codeTaken" ? codeTakenIssues(failure, draft) : locateIssues(failure.issues, draft);
    setLocated(found);
    const target = firstIssueStep(found);
    if (target !== null) setStep(target);
  }

  function create(): void {
    try {
      submit(buildConvertRequest(form, draft, revision));
    } catch (error) {
      if (!(error instanceof ConvertBuildError)) throw error;
      reveal(isValid(1) ? 2 : 1);
    }
  }

  const failure: ConvertFailure | null = convert.isError ? classifyConvertError(convert.error) : null;
  const visible1: Step1Errors = { ...(shown[1] ? errors1 : {}), ...located?.fields };
  const visible2: VisibleStep2Errors = visibleStep2Errors(errors2, draft, shown[2], located);
  const isDatesFromOffer = initial.form.endDate !== "" && form.startDate === initial.form.startDate && form.endDate === initial.form.endDate;

  return {
    form,
    draft,
    step,
    summary,
    failure,
    isDone,
    isBusy,
    visible1,
    visible2,
    isDatesFromOffer,
    footerNote: footerNote(step, summary),
    changeForm,
    goTo,
    next: () => goTo(Math.min(step + 1, 3) as ConvertStep),
    back: () => goTo(Math.max(step - 1, 1) as ConvertStep),
    create,
    retry: () => lastBody.current !== null && submit(lastBody.current),
    actions: {
      onToggle: (key: string) => changeDraft((current) => model.toggleIncluded(current, key)),
      onQty: (key: string, raw: string) => changeDraft((current) => model.setQty(current, key, raw)),
      onBf: (key: string, raw: string) => changeDraft((current) => model.setBf(current, key, raw)),
      onCode: (key: string, code: string) => changeDraft((current) => model.setCode(current, key, code)),
      onRename: (groupKey: string, name: string) => changeDraft((current) => model.renameGroup(current, groupKey, name)),
      onDiscipline: (groupKey: string, id: string | null) => changeDraft((current) => model.setGroupDiscipline(current, groupKey, id)),
    },
  };
}
