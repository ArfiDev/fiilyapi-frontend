import "./contract-distribution.css";

/**
 * Kaydetme akışının GÖRÜNÜR sonucu (`TimesheetSaveStatus`/`PlanSaveStatus`
 * deseni). Mockup'ta karşılığı yoktur — repo kuralı: kaydedilmemiş değişiklik
 * sessiz kalmaz, hata gerekçesiyle yazılır, "kaydedildi" ancak sunucu yazdıktan
 * sonra çıkar.
 *
 * `role="alert"` KULLANILMAZ (F-P6 dersi; e2e'de yasak) — görünür metin yeter.
 */
const DEFAULT_SAVED_TEXT = "Poz dağılımı kaydedildi.";

export interface ContractDistributionSaveStatusProps {
  dirtyCount: number;
  isSaving: boolean;
  isSaved: boolean;
  /** KDG K7 · "Kalanı buraya dağıt" sonucu (bilgi satırları, hata değil). */
  noticeMessages?: readonly string[];
  /** Gövdeye ALINMAYAN hücrelerin Türkçe gerekçeleri (T1 üreticisinden). */
  rejectionMessages: readonly string[];
  /** Sunucu hatası (422 dahil) — backend `detail`i olduğu gibi basılır. */
  saveError: string | null;
  /** BDG: başarı metni ekrana göre değişir; verilmezse sözleşme ekranının metni. */
  savedText?: string;
}

export function ContractDistributionSaveStatus({
  dirtyCount,
  isSaving,
  isSaved,
  noticeMessages = [],
  rejectionMessages,
  saveError,
  savedText = DEFAULT_SAVED_TEXT,
}: ContractDistributionSaveStatusProps) {
  const lines: { text: string; isFailure: boolean }[] = [];

  if (isSaving) {
    lines.push({ text: "Kaydediliyor…", isFailure: false });
  } else if (dirtyCount > 0) {
    lines.push({
      text: `Kaydedilmemiş ${dirtyCount} hücre değişikliği var — “Dağılımı Kaydet” ile yazın. Dokunulmayan kotalar olduğu gibi korunur.`,
      isFailure: false,
    });
  } else if (isSaved) {
    lines.push({ text: savedText, isFailure: false });
  }

  for (const message of noticeMessages) lines.push({ text: message, isFailure: false });
  for (const message of rejectionMessages) lines.push({ text: message, isFailure: true });
  if (saveError !== null) lines.push({ text: saveError, isFailure: true });

  if (lines.length === 0) return null;

  return (
    <div className="cdist-status" data-testid="cdist-status">
      {lines.map((line) => (
        <p
          key={line.text}
          className={
            line.isFailure
              ? "cdist-status__line cdist-status__line--failed"
              : "cdist-status__line"
          }
        >
          {line.text}
        </p>
      ))}
    </div>
  );
}
