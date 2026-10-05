"use client";

import { useMemo, useState } from "react";

import { Modal } from "@/components/settings/Modal";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";
import { Button, DateInput, Field, Input, Textarea } from "@/components/ui";
import { HiddenMark } from "@/components/ui/hidden-mark/HiddenMark";
import { WarningTriangleIcon } from "@/components/ui/icons";
import { formatAmount } from "@/lib/format";
import { backendErrorMessage } from "@/lib/api/error-message";
import {
  CHART_ACCOUNTS_MAX_LIMIT,
  useChartOfAccounts,
} from "@/lib/api/hooks/useChartOfAccounts";
import type { JournalEntryDetailResponse } from "@/lib/api/hooks/useJournalEntries";
import { useJournalEntry } from "@/lib/api/hooks/useJournalEntry";
import {
  useCreateJournalEntry,
  useReplaceJournalLines,
  useUpdateJournalEntry,
} from "@/lib/api/hooks/useJournalEntryFormMutations";

import { JournalBalanceStrip } from "./JournalBalanceStrip";
import { JournalLinesEditor } from "./JournalLinesEditor";
import {
  applyLineAmount,
  changedEntryFields,
  differenceWarning,
  draftsFromEntry,
  hasMaskedLines,
  emptyJournalLine,
  initialJournalLines,
  journalFormBlockers,
  journalTotals,
  linesChanged,
  selectableLineAccounts,
  todayIsoDate,
  toJournalLineInputs,
  JOURNAL_DESCRIPTION_MAX,
  JOURNAL_DETAIL_NOTE_MAX,
  JOURNAL_FORM_TEXT,
  type JournalEntryFormState,
  type JournalLineDraft,
  type LineSide,
} from "./journal-entry-form";
import "@/components/settings/settings.css";
import "./accounting.css";

export interface JournalEntryFormModalProps {
  /** `null` ⇒ oluşturma kipi; aksi hâlde düzenlenecek fişin kimliği. */
  entryId: string | null;
  onClose: () => void;
}

const NOT_DRAFT_NOTICE =
  "Yalnızca taslak fiş düzenlenebilir; bu fiş kayıtlaştırılmış ya da terslenmiş.";

/**
 * E8:67 `+ Yevmiye Kaydı` / taslak satırının `Düzenle` diyaloğu.
 * Kanon: `projedesign/Form - Yevmiye Kaydi.dc.html` (`M:` = o dosyanın satırı).
 *
 * 🔴 **`M:99-101` `Fiş No` ALANI ARTIK ÇİZİLİR — K4'ün bu yarısı DÜŞTÜ.**
 * K4'ün tek gerekçesi "şemada karşılığı yok"tu; FIS-NO dilimi `entry_no`yu
 * ÜRETTİ, F-OK devri sözleşmeye indirdi: hem `JournalEntryResponse` hem
 * `JournalEntryDetailResponse` üzerinde `string`, ZORUNLU, nullable DEĞİL.
 * Kutu artık VAR OLMAYAN bir numaralandırma vaat etmiyor. Alan HER KİPTE
 * devre dışıdır (numarayı SUNUCU üretir; forma/mutasyona GİRMEZ — şemalar
 * `extra="forbid"`, gönderilse 422 dönerdi) ve oluşturma kipinde BOŞ durur:
 * önden basılmış bir `YEV-…` sunucununkiyle çakışan bir numara vaat ederdi.
 * (İkiz karar `M:121` `Satır Açıklaması` HÂLÂ AYAKTA — gerekçesi ölçümle
 * çürümedi; `JournalLinesEditor` başında.)
 *
 * 🔴 **`M:56`/`M:255` `Taslak Kaydet` İKİNCİ DÜĞMESİ ÇİZİLMEZ.** ÖLÇÜM: `POST
 * /journal-entries` fişi ZATEN `draft` üretir; `posted`a geçiren AYRI bir uç
 * vardır (`POST /journal-entries/{id}/post`) ve onun düğmesi Taslak Fişler
 * panelindeki `Kayıtlaştır`dır. Mockup'ın iki düğmesi bu üründe AYNI isteği
 * atardı — ikincisi uydurma bir ayrım vaat ederdi.
 *
 * 🔴 `M:87` `📅` ve `M:113` `📋` emojileri basılmaz (T2'nin `M:61` `📒`
 * kararıyla aynı): kart başlığının anlamını taşımazlar, görsel kareye ise
 * yazı tipi ikamesi riski sokarlar.
 *
 * Düzenleme kipinde bacaklar LİSTE ucundan gelemez (o yalnız başlık döner) —
 * `useJournalEntry` ile detay çekilir ve form ancak veri geldikten sonra
 * kurulur. Aksi hâlde `useState` başlangıcı boş kalır ve gelen veri forma
 * hiç yansımazdı.
 */
export function JournalEntryFormModal({ entryId, onClose }: JournalEntryFormModalProps) {
  const entryQuery = useJournalEntry(entryId);

  if (entryId !== null) {
    if (entryQuery.isLoading) {
      return (
        <Modal title="Yevmiye Fişi Düzenle" onClose={onClose}>
          <p className="mu-notice" data-testid="mu-entry-dialog-loading">
            Fiş yükleniyor…
          </p>
        </Modal>
      );
    }
    if (entryQuery.isError || entryQuery.data === undefined) {
      return (
        <Modal title="Yevmiye Fişi Düzenle" onClose={onClose}>
          <p className="mu-notice mu-notice--danger" data-testid="mu-entry-dialog-load-error">
            {backendErrorMessage(entryQuery.error, "Fiş yüklenemedi.")}
          </p>
        </Modal>
      );
    }
    return <JournalEntryFormBody entry={entryQuery.data} onClose={onClose} />;
  }

  return <JournalEntryFormBody onClose={onClose} />;
}

function JournalEntryFormBody({
  entry,
  onClose,
}: {
  entry?: JournalEntryDetailResponse;
  onClose: () => void;
}) {
  const isEdit = entry !== undefined;
  // 🔴 SAVUNMACI: T2 `posted`/`reversed` fişte "Düzenle"yi zaten SUNMAZ, ama
  // diyalog başka bir yoldan açılırsa sunucunun 409'unu beklemeyiz.
  const isEditable = entry === undefined || entry.status === "draft";

  const [form, setForm] = useState<JournalEntryFormState>(() =>
    entry === undefined
      ? {
          // 📅 YEREL takvim; `toISOString()` UTC'ye kaydırırdı (TB5 dersi).
          entryDate: todayIsoDate(new Date()),
          description: "",
          detailNote: "",
          lines: initialJournalLines(),
        }
      : {
          entryDate: entry.entry_date,
          description: entry.description,
          detailNote: entry.detail_note ?? "",
          lines: draftsFromEntry(entry),
        },
  );
  const [nextKey, setNextKey] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);
  // SEKME-F1.3b — taban anlık görüntüsü; edit kipinde `entry` prop zaten
  // sunucudan yüklü geldikten SONRA bu bileşen mount edilir (dış `JournalEntryFormModal`
  // yalnız `entryQuery` başarıyla dönünce bu gövdeyi render eder), bu yüzden
  // GET yarışı yoktur.
  const [initialForm] = useState(form);
  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm);
  // Kayıt 50/ortak emir §7 — `Modal`a `isDirty` VERİLMEZ; doğrudan bağlanır.
  useUnsavedChanges(isDirty, "Yevmiye fişi formu");

  // 🔴 `allPages`: SEÇİCİ KATALOGUN TAMAMINI İSTER. Tek sayfa (tavan 200)
  // çekildiğinde canlı tohumun 316 hesabının 116'sı seçenekte HİÇ görünmüyordu
  // (ilk sayfa `49`da bitiyor) — hiçbir 5xx/6xx/7xx hesabına elle fiş
  // kesilemiyordu. Üstelik `selectableLineAccounts`in YAPRAK KURALI kırpılmış
  // kümede yanlış çalışıp çocukları sayfa dışında kalan grubu (`49`) seçenek
  // olarak basıyor, kullanıcı onu seçince sunucu `leaf_blockers` ile 422
  // dönüyordu. Tavanı büyütmek çözüm DEĞİL: aşım 422'dir.
  const accountsQuery = useChartOfAccounts({
    limit: CHART_ACCOUNTS_MAX_LIMIT,
    allPages: true,
  });
  const createMutation = useCreateJournalEntry();
  const updateMutation = useUpdateJournalEntry();
  const replaceLinesMutation = useReplaceJournalLines();

  const accounts = useMemo(
    () => selectableLineAccounts(accountsQuery.data?.items),
    [accountsQuery.data],
  );
  // Katalog sayfasında olmayan bir hesabın adı fişin KENDİ satırından okunur.
  const knownLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const line of entry?.lines ?? []) {
      map.set(line.account_id, `${line.account_code} · ${line.account_name}`);
    }
    return map;
  }, [entry]);

  const totals = journalTotals(form.lines);
  const blockers = journalFormBlockers(form);
  const isPending =
    createMutation.isPending || updateMutation.isPending || replaceLinesMutation.isPending;
  const canSave = blockers.length === 0 && isEditable && !isPending;
  // IZN-F4b.2 — bir bacağın tutarı gizliyse satır kümesi TÜMÜYLE salt okunur (PUT bütün kümeyi
  // değiştirir; bilinmeyen tutarı gövdeye koyamayız) ve `PUT …/lines` HİÇ atılmaz.
  const areLinesLocked = hasMaskedLines(form.lines);

  function updateLine(key: string, map: (line: JournalLineDraft) => JournalLineDraft) {
    setForm((current) => ({
      ...current,
      lines: current.lines.map((line) => (line.key === key ? map(line) : line)),
    }));
  }

  function handleAdd() {
    setForm((current) => ({
      ...current,
      lines: [...current.lines, emptyJournalLine(`new-${nextKey}`)],
    }));
    setNextKey((value) => value + 1);
  }

  function handleRemove(key: string) {
    setForm((current) => ({
      ...current,
      lines: current.lines.filter((line) => line.key !== key),
    }));
  }

  function handleAmount(key: string, side: LineSide, raw: string) {
    updateLine(key, (line) => applyLineAmount(line, side, raw));
  }

  async function handleSubmit() {
    if (!canSave) return;
    setFormError(null);
    const lines = areLinesLocked ? [] : toJournalLineInputs(form.lines);

    if (entry === undefined) {
      try {
        // Oluşturmada satırlar AYNI istekte gider: iki adımlı yazma yoktur,
        // dolayısıyla kısmi başarısızlık da yoktur.
        await createMutation.mutateAsync({
          entry_date: form.entryDate,
          description: form.description.trim(),
          detail_note: form.detailNote.trim().length === 0 ? null : form.detailNote.trim(),
          lines: [...lines],
        });
        onClose();
      } catch (error) {
        setFormError(backendErrorMessage(error, "Fiş oluşturulamadı."));
      }
      return;
    }

    const fieldBody = changedEntryFields(form, entry);
    const hasFieldChanges = Object.keys(fieldBody).length > 0;
    const previousLines = areLinesLocked ? [] : toJournalLineInputs(draftsFromEntry(entry));
    const hasLineChanges = !areLinesLocked && linesChanged(lines, previousLines);

    if (!hasFieldChanges && !hasLineChanges) {
      onClose();
      return;
    }

    // SIRA: önce başlık (`PATCH`), sonra satırlar (`PUT …/lines`). Satır yazımı
    // başlığın toplamlarını yeniden yazar; ters sırada `PATCH` başarısız olsaydı
    // toplamlar yeni, tarih eski kalırdı.
    if (hasFieldChanges) {
      try {
        await updateMutation.mutateAsync({ entryId: entry.id, body: fieldBody });
      } catch (error) {
        setFormError(backendErrorMessage(error, "Fiş güncellenemedi."));
        return;
      }
    }

    if (hasLineChanges) {
      try {
        await replaceLinesMutation.mutateAsync({ entryId: entry.id, lines });
      } catch (error) {
        const message = backendErrorMessage(error, "Fiş satırları kaydedilemedi.");
        // 🔴 KISMİ BAŞARISIZLIK SESSİZCE YUTULMAZ: başlık yazıldıysa kullanıcı
        // bunu bilmelidir, aksi hâlde diyaloğu kapatıp "hiçbir şey olmadı" sanır.
        setFormError(
          hasFieldChanges
            ? `Başlık güncellendi ancak satırlar kaydedilemedi: ${message}`
            : message,
        );
        return;
      }
    }
    onClose();
  }

  return (
    <Modal
      title={isEdit ? "Yevmiye Fişi Düzenle" : "Yeni Yevmiye Fişi"}
      className="mu-modal"
      onClose={onClose}
      footer={
        <>
          {/* `M:249-251` — kapalı düğmenin GEREKÇESİ alt şeridin solundadır.
              `M:250`deki `⚠` (U+26A0) `fonts.css` unicode-range'lerinde YOKTUR
              → ikon (F-SEM kanonu). */}
          {totals.isVerifiable && !totals.isBalanced && (
            <p className="mu-entry-form__diff-warning" data-testid="mu-entry-dialog-diff-warning">
              <WarningTriangleIcon className="mu-entry-form__diff-icon" width={13} height={13} />
              <span>{differenceWarning(formatAmount(totals.difference))}</span>
            </p>
          )}
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            Vazgeç
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={!canSave}
            data-testid="mu-entry-dialog-save"
          >
            {isEdit ? "Kaydet" : "Fişi Kaydet"}
          </Button>
        </>
      }
    >
      <div className="settings-form">
        {!isEditable && (
          <p className="mu-notice mu-notice--danger" data-testid="mu-entry-dialog-locked">
            {NOT_DRAFT_NOTICE}
          </p>
        )}
        {/* `M:83` — başlığın altındaki kural cümlesi; `Modal` alt başlık
            almadığı için gövdenin ilk satırıdır (T2'nin emsali). */}
        <p className="mu-entry-form__subtitle" data-testid="mu-entry-dialog-subtitle">
          {JOURNAL_FORM_TEXT.subtitle}
        </p>

        {/* `M:86-108` — Fiş Bilgileri kartı. */}
        <section className="mu-entry-form__card">
          <h3 className="mu-entry-form__card-title">{JOURNAL_FORM_TEXT.headerCardTitle}</h3>
          {/* `M:88` ızgarası `170px 1fr 170px` — mockup'ın ÜÇ sütunu GERİ GELDİ.
              K4 üçüncü sütunu (`Fiş No`) düşürmüştü; FIS-NO `entry_no`yu üretti,
              F-OK devri sözleşmeye indirdi → sütun yeniden basılıyor. */}
          <div className="mu-entry-form__row">
            <Field label="Fiş Tarihi" required>
              {(control) => (
                <DateInput
                  {...control}
                  value={form.entryDate}
                  disabled={!isEditable}
                  data-testid="mu-entry-date"
                  onValueChange={(iso) =>
                    setForm((current) => ({ ...current, entryDate: iso }))
                  }
                />
              )}
            </Field>
            <Field label="Açıklama" required hint={JOURNAL_FORM_TEXT.descriptionHint}>
              {(control) => (
                <Input
                  {...control}
                  maxLength={JOURNAL_DESCRIPTION_MAX}
                  value={form.description}
                  placeholder={JOURNAL_FORM_TEXT.descriptionPlaceholder}
                  disabled={!isEditable}
                  data-testid="mu-entry-description"
                  onChange={(event) =>
                    setForm((current) => ({ ...current, description: event.target.value }))
                  }
                />
              )}
            </Field>
            {/* `M:99-101` — `Fiş No`: SUNUCU türevi, HER KİPTE devre dışı
                (`isEditable`e BAĞLANMAZ: hiçbir kipte yazılabilir değil).
                İpucu YALNIZ oluşturma kipinde basılır — numara üretildikten
                sonra "Kayıtta üretilir" cümlesi orada YALAN olurdu. */}
            <Field
              label="Fiş No"
              hint={entry === undefined ? JOURNAL_FORM_TEXT.entryNoHint : undefined}
            >
              {(control) => (
                <Input
                  {...control}
                  className="mu-entry-form__no"
                  value={entry?.entry_no ?? ""}
                  placeholder={JOURNAL_FORM_TEXT.entryNoPlaceholder}
                  disabled
                  data-testid="mu-entry-no"
                />
              )}
            </Field>
          </div>
          {/* `M:104-107` — `Detay Notu`: E8:113'ün İKİNCİ satırı (`detail_note`).
              Serbest metindir, bir FK değildir; boşaltmak GERÇEK bir
              temizlemedir (kolon NULLABLE). `M:106` çok satırlı çizer. */}
          <Field label="Detay Notu">
            {(control) => (
              <Textarea
                {...control}
                rows={2}
                value={form.detailNote}
                maxLength={JOURNAL_DETAIL_NOTE_MAX}
                placeholder={JOURNAL_FORM_TEXT.detailNotePlaceholder}
                disabled={!isEditable}
                data-testid="mu-entry-detail-note"
                onChange={(event) =>
                  setForm((current) => ({ ...current, detailNote: event.target.value }))
                }
              />
            )}
          </Field>
        </section>
      </div>

      {accountsQuery.isError && (
        <p className="mu-notice mu-notice--danger" data-testid="mu-entry-accounts-error">
          {backendErrorMessage(accountsQuery.error, "Hesap listesi yüklenemedi.")}
        </p>
      )}

      {areLinesLocked && (
        <p className="mu-notice" data-testid="mu-entry-lines-masked">
          <HiddenMark withText /> Satır tutarları rolünüz için gizli; satırlar düzenlenemez.
        </p>
      )}

      <JournalLinesEditor
        lines={form.lines}
        accounts={accounts}
        labelOf={(accountId) => knownLabels.get(accountId)}
        disabled={!isEditable || isPending || areLinesLocked}
        onAccountChange={(key, accountId) => updateLine(key, (line) => ({ ...line, accountId }))}
        onAmountChange={handleAmount}
        onAdd={handleAdd}
        onRemove={handleRemove}
      />

      <JournalBalanceStrip totals={totals} />

      {blockers.length > 0 && (
        <ul className="mu-blockers" data-testid="mu-entry-dialog-blockers">
          {blockers.map((blocker) => (
            <li key={blocker}>{blocker}</li>
          ))}
        </ul>
      )}
      {formError !== null && (
        <p className="mu-notice mu-notice--danger" data-testid="mu-entry-dialog-error">
          {formError}
        </p>
      )}
    </Modal>
  );
}
