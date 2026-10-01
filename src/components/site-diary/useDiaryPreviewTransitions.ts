import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

import type { SiteDiaryEntryDetail } from "@/lib/api/hooks/useSiteDiary";
import { fetchSiteDiarySkeleton } from "@/lib/api/hooks/useSiteDiarySkeleton";

import type { DiaryPreviewPending } from "./DiaryPreviewChangeDialog";
import { addDiaryLines, type DiaryFormState } from "./form-state";
import { countEnteredPreviewData, missingSkeletonLines } from "./preview-transition";

/**
 * GKS-F1.4 · bölüm/tarih değişiminde onay akışı (Ü3, Ü3b, Ü5). Ekran yalnız
 * değişikliği bu hook'a yollar (`requestFormChange`, `requestSelectDate`) ve
 * `pending`i diyalogla gösterir; kararlar saf yardımcılardan
 * (`preview-transition.ts`) gelir.
 *
 * - Kayıt YOK (S1/S2) + girilmiş satır verisi → değişim bekletilir, diyalog;
 *   onayda uygulanır (bölümde girilenler de temizlenir), vazgeçilirse form
 *   dokunulmadan kalır. Veri yoksa sessiz geçiş.
 * - Kayıtlı taslak (S3) + boş olmayan yeni bölüm → bölüm HEMEN yazılır, o
 *   bölümün iskeleti çekilir; kayıtta olmayan kalem varsa "eklensin mi?"
 *   diye sorulur. Eski satırlar hiçbir durumda silinmez.
 */

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const LOAD_ERROR_TEXT = "İş kalemleri yüklenemedi";

/** Bölüm değişiminde girilmiş satır verisi atılır (önizleme yeni anahtarla kendini çeker). */
const CLEARED_LINE_INPUTS = { quantities: {}, overrunReasons: {}, addedLines: [], removedLines: [] } as const;

export interface UseDiaryPreviewTransitionsInput {
  siteId: string;
  /** Aranan (uygulanmış) gün; `form.entryDate` yazım sırasında ondan geçici sapabilir. */
  activeDate: string;
  form: DiaryFormState;
  /** Kayıtlı gün; `undefined` = kayıtsız gün (önizleme). */
  entry: SiteDiaryEntryDetail | undefined;
  sections: readonly { id: string; name: string }[];
  /** Ekran salt okunur (izin yok / gönderilmiş / kilitli) — Ü5 yarış korumasının girdisi. */
  isReadOnly: boolean;
  setForm: Dispatch<SetStateAction<DiaryFormState>>;
  /** İskelet çekilemedi: ekranın mevcut hata alanına metin basar. */
  onLoadError: (message: string) => void;
}

export interface UseDiaryPreviewTransitionsResult {
  /** Açık diyalog; yoksa `null`. */
  pending: DiaryPreviewPending | null;
  /** Başlık alanı değişimi; `apply` değişimi gerçekten uygulayan ekran işlevidir. */
  requestFormChange: (patch: Partial<DiaryFormState>, apply: (patch: Partial<DiaryFormState>) => void) => void;
  /** Son Kayıtlar kartından gün seçimi. */
  requestSelectDate: (entryDate: string, apply: () => void) => void;
  confirm: () => void;
  cancel: () => void;
}

interface PendingState {
  model: DiaryPreviewPending;
  /** Diyalog hangi kayıt + güne soruldu; bağlam değişirse diyalog kapanır, `commit` atılır. */
  contextKey: string;
  commit: () => void;
  /** Vazgeçilirse çalışır (tarihte: alanı uygulanmış güne döndürür). */
  rollback?: () => void;
}

export function useDiaryPreviewTransitions({
  siteId,
  activeDate,
  form,
  entry,
  sections,
  isReadOnly,
  setForm,
  onLoadError,
}: UseDiaryPreviewTransitionsInput): UseDiaryPreviewTransitionsResult {
  const [pending, setPending] = useState<PendingState | null>(null);

  // Asenkron yanıt "şimdiki" formu/kaydı görsün (yarış koruması).
  const latestRef = useRef({ form, entry, sections, isReadOnly });
  useEffect(() => {
    latestRef.current = { form, entry, sections, isReadOnly };
  });

  // Bağlam (kayıt kimliği + aranan gün) değişince açık diyalog bayattır: kapanır,
  // `commit` uygulanmaz (S3'e geçen formun miktarlarını boşaltmasın).
  const contextKey = `${entry?.id ?? ""}|${activeDate}`;
  if (pending !== null && pending.contextKey !== contextKey) setPending(null);

  const offerMissingLines = useCallback(
    async (target: SiteDiaryEntryDetail, sectionId: string) => {
      const isStale = () => {
        const latest = latestRef.current;
        return (
          latest.form.sectionId !== sectionId ||
          latest.entry?.id !== target.id ||
          latest.entry.status !== "draft" ||
          latest.entry.locked ||
          latest.isReadOnly
        );
      };
      try {
        const skeleton = await fetchSiteDiarySkeleton(siteId, target.entry_date, sectionId);
        if (isStale()) return;
        const latest = latestRef.current;
        const missing = missingSkeletonLines(skeleton.lines, latest.entry?.lines ?? target.lines, latest.form.addedLines);
        if (missing.length === 0) return;
        const sectionName = latest.sections.find((section) => section.id === sectionId)?.name ?? skeleton.section_name ?? "";
        setPending({
          model: { kind: "add-lines", sectionName, count: missing.length },
          contextKey: `${target.id}|${target.entry_date}`,
          commit: () => setForm((prev) => addDiaryLines(prev, missing)),
        });
      } catch {
        if (!isStale()) onLoadError(LOAD_ERROR_TEXT);
      }
    },
    [siteId, setForm, onLoadError],
  );

  const requestFormChange = useCallback<UseDiaryPreviewTransitionsResult["requestFormChange"]>(
    (patch, apply) => {
      const isSectionChange = patch.sectionId !== undefined && patch.sectionId !== form.sectionId;
      if (entry !== undefined) {
        apply(patch);
        if (isSectionChange && patch.sectionId !== "") void offerMissingLines(entry, patch.sectionId ?? "");
        return;
      }
      const typedDate = patch.entryDate;
      if (typedDate !== undefined && !ISO_DATE_PATTERN.test(typedDate)) {
        // Yarım/boş tarih: yalnız alan güncellenir (yazmaya devam edilebilsin);
        // aranan gün, iskelet ve girilen miktarlar dokunulmadan kalır.
        setForm((prev) => ({ ...prev, entryDate: typedDate }));
        return;
      }
      const count = countEnteredPreviewData(form);
      const isNewDate = typedDate !== undefined && typedDate !== activeDate;
      if (count === 0 || (!isSectionChange && !isNewDate)) {
        apply(patch);
      } else if (isSectionChange) {
        setPending({ model: { kind: "section", count }, contextKey, commit: () => apply({ ...patch, ...CLEARED_LINE_INPUTS }) });
      } else {
        const restore = () => setForm((prev) => ({ ...prev, entryDate: activeDate }));
        setPending({ model: { kind: "date", count }, contextKey, commit: () => apply(patch), rollback: restore });
      }
    },
    [entry, form, activeDate, contextKey, setForm, offerMissingLines],
  );

  const requestSelectDate = useCallback<UseDiaryPreviewTransitionsResult["requestSelectDate"]>(
    (entryDate, apply) => {
      const count = entry === undefined && entryDate !== activeDate ? countEnteredPreviewData(form) : 0;
      if (count === 0) apply();
      else setPending({ model: { kind: "date", count }, contextKey, commit: apply });
    },
    [entry, form, activeDate, contextKey],
  );

  const confirm = useCallback(() => {
    setPending(null);
    pending?.commit();
  }, [pending]);
  const cancel = useCallback(() => {
    setPending(null);
    pending?.rollback?.();
  }, [pending]);

  return { pending: pending?.model ?? null, requestFormChange, requestSelectDate, confirm, cancel };
}
