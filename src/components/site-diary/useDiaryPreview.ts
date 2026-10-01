import { useCallback, useEffect, useRef, useState } from "react";

import { diaryDetailLock } from "@/components/site-diary-detail/derive";
import type { SiteDiaryEntryDetail } from "@/lib/api/hooks/useSiteDiary";
import { useSiteDiarySkeleton, type SiteDiarySkeleton } from "@/lib/api/hooks/useSiteDiarySkeleton";

import type { DiaryTreeLine } from "./diary-lines-tree";

/**
 * GKS-F1.3 · kayıtsız günün ÖNİZLEME mantığı (`SiteDiaryEntryView` 800 satırı
 * aştığı için burada). Ekranın bildiği tek şey: "gün için liste eşleşmesi" —
 * önizleme sorgusu YALNIZ o YOKKEN açıktır (döngü yok: koşul `matchedId`e
 * değil liste eşleşmesine bağlı). `existing_entry_id` gelirse `matchedId`
 * onunla dolar, ekran o kaydı yükler ve liste yeniden çekilir.
 */

export type DiaryPreviewStatus = "loading" | "ready" | "error";

export interface UseDiaryPreviewInput {
  siteId: string;
  /** Aranan gün (`activeDate`). */
  activeDate: string;
  /** Formdaki başlık bölümü (`""` = seçilmedi). */
  sectionId: string;
  /** Ay listesinden bulunan kayıt kimliği; yoksa `""`. */
  listMatchedId: string;
  /** Ay listesi hâlâ yükleniyor — liste gelmeden önizleme çekilmez. */
  isListLoading: boolean;
  /** `existing_entry_id` gelince ay listesini tazelemek için (Son Kayıtlar). */
  refetchEntries: () => unknown;
}

/** Başarılı POST'un ekrana bildirdiği kayıt (liste henüz tazelenmemiş olabilir). */
export interface CreatedDiaryEntryRef {
  id: string;
  entry_date: string;
}

export interface DiaryPreview {
  skeleton: SiteDiarySkeleton | undefined;
  status: DiaryPreviewStatus;
  /** Önizleme formdaki gün + bölüm için ve yenilenmiyor — Taslak Kaydet'in ön koşulu. */
  isCurrent: boolean;
  /** Liste eşleşmesi ?? az önce açılan kayıt ?? önizlemenin `existing_entry_id`si ?? `""`. */
  matchedId: string;
  /** Yalnız önizlemeden gelen kimlik (liste eşleşmesi yokken); yoksa `""`. */
  existingEntryId: string;
  refetch: () => void;
  /** Başarılı POST sonrası: liste tazelenene dek yeni kaydı `matchedId`de tutar. */
  adoptCreatedEntry: (created: CreatedDiaryEntryRef) => void;
}

export function useDiaryPreview({
  siteId,
  activeDate,
  sectionId,
  listMatchedId,
  isListLoading,
  refetchEntries,
}: UseDiaryPreviewInput): DiaryPreview {
  const [adopted, setAdopted] = useState<CreatedDiaryEntryRef | null>(null);
  const adoptedId = adopted !== null && adopted.entry_date === activeDate ? adopted.id : "";
  const hasKnownEntry = listMatchedId !== "" || adoptedId !== "";

  const query = useSiteDiarySkeleton(siteId, activeDate, sectionId, { enabled: !isListLoading && !hasKnownEntry });
  const skeleton = query.data;
  const existingEntryId = hasKnownEntry ? "" : (skeleton?.existing_entry_id ?? "");
  const matchedId = listMatchedId || adoptedId || existingEntryId;

  const notifiedRef = useRef("");
  useEffect(() => {
    if (existingEntryId === "" || notifiedRef.current === existingEntryId) return;
    notifiedRef.current = existingEntryId;
    void refetchEntries();
  }, [existingEntryId, refetchEntries]);

  const refetchQuery = query.refetch;
  const refetch = useCallback(() => {
    void refetchQuery();
  }, [refetchQuery]);
  const adoptCreatedEntry = useCallback((created: CreatedDiaryEntryRef) => {
    setAdopted({ id: created.id, entry_date: created.entry_date });
  }, []);

  const status: DiaryPreviewStatus = query.isError ? "error" : skeleton ? "ready" : "loading";
  const isCurrent =
    skeleton !== undefined &&
    !query.isFetching &&
    skeleton.entry_date === activeDate &&
    (skeleton.section_id ?? "") === sectionId;

  return { skeleton, status, isCurrent, matchedId, existingEntryId, refetch, adoptCreatedEntry };
}

/**
 * Ü6 · kayıtsız günde form KİRLİYKEN önizleme başka birinin açtığı kaydı
 * (`existing_entry_id`) bildirirse bilgi bandı basılır. "Kirli" bilgisi
 * kimlik görünmeden ÖNCEKİ son değerdir: kayıt yüklenince form kayıttan
 * kurulur ve kirlilik sıfırlanır.
 */
export function useExistingEntryRaceNotice(input: {
  existingEntryId: string;
  matchedId: string;
  isFormDirty: boolean;
}): boolean {
  const { existingEntryId, matchedId, isFormDirty } = input;
  const dirtyBeforeRef = useRef(false);
  useEffect(() => {
    if (existingEntryId === "") dirtyBeforeRef.current = isFormDirty;
  });
  const [noticeFor, setNoticeFor] = useState("");
  useEffect(() => {
    if (existingEntryId !== "" && dirtyBeforeRef.current) setNoticeFor(existingEntryId);
  }, [existingEntryId]);
  return noticeFor !== "" && noticeFor === matchedId;
}

/** Ağacın okuduğu kaynak: kayıtta `entry.lines`, önizlemede `skeleton.lines`. */
export interface DiaryTreeSource {
  lines: readonly DiaryTreeLine[];
  linesTotal: string;
  isPreview: boolean;
}

export function diaryTreeSource(
  entry: SiteDiaryEntryDetail | undefined,
  skeleton: SiteDiarySkeleton | undefined,
): DiaryTreeSource {
  if (entry) return { lines: entry.lines, linesTotal: entry.lines_total, isPreview: false };
  return { lines: skeleton?.lines ?? [], linesTotal: skeleton?.lines_total ?? "0", isPreview: true };
}

/**
 * Çekirdek kilit türevi (Ü8): kayıt varsa `entry.locked`, yoksa
 * `skeleton.locked`. `bannerText` kilitsizse `null`; fallback tek kaynaktan
 * (`diaryDetailLock`, Ü7).
 */
export interface DiaryCoreLock {
  isLocked: boolean;
  bannerText: string | null;
}

export function diaryCoreLock(
  entry: SiteDiaryEntryDetail | undefined,
  skeleton: SiteDiarySkeleton | undefined,
): DiaryCoreLock {
  const source = entry ?? skeleton;
  if (source === undefined || !source.locked) return { isLocked: false, bannerText: null };
  const lock = diaryDetailLock({ locked: true, lock_report_date: source.lock_report_date });
  return { isLocked: true, bannerText: `${lock?.bandTitle ?? ""} Bütün alanlar salt okunur.` };
}
