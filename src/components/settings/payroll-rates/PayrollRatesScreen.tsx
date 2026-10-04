"use client";

import { useState } from "react";

import { Button, Field, Input, Select, Toggle } from "@/components/ui";
import {
  ArrowRightIcon,
  LockIcon,
  WarningTriangleIcon,
  inlineSymbolProps,
} from "@/components/ui/icons";
import { AccessDenied } from "@/components/settings/AccessDenied";
import { backendErrorMessage } from "@/lib/api/error-message";
import { isForbidden } from "@/lib/api/unwrap";
import {
  usePayrollRates,
  usePayrollTaxBrackets,
  useReplacePayrollTaxBrackets,
  useUpsertPayrollRate,
} from "@/lib/api/hooks/usePayrollRates";
import { usePayrollPeriods } from "@/lib/api/hooks/usePayroll";
import { hasAtLeast } from "@/lib/auth/permissions";
import { useModulePermission } from "@/lib/auth/useModulePermission";
import { PAYROLL_EDIT, TAX_BRACKETS_EDIT } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";
import { cx } from "@/lib/cx";
import { normalizeDecimalInput, sumDecimalStrings } from "@/lib/decimal";
import { formatDecimal } from "@/lib/format";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";
import {
  BRACKETS_CARD_TITLE,
  BRACKETS_FULL_SET_WARNING,
  EMPTY_RATE_DRAFT,
  INCOME_KINDS,
  INCOME_KIND_LABELS,
  INCOME_TAX_NULL_HINT,
  PAYROLL_TYPE_SOURCES,
  RATES_CARD_TITLE,
  RATES_FULL_SET_WARNING,
  RATE_TYPE_MISSING_BADGE,
  RATE_TYPE_PRESENT_BADGE,
  WORKER_SOURCE_LABELS,
  appendBracketDraft,
  bracketLowerBound,
  bracketsToDrafts,
  buildYearOptions,
  copiedNotice,
  copyFromLabel,
  defaultYear,
  emptyBracketDrafts,
  emptyYearTitle,
  isYearLocked,
  rateDraftToBody,
  rateLockedReason,
  rateToDraft,
  removeBracketDraft,
  type IncomeKind,
  type RateDraft,
  type RateField,
  type WorkerSource,
} from "./payroll-rate-admin";
import { checkBracketSet, type BracketDraft } from "./payroll-rate-guards";
import "@/components/settings/settings.css";
import "./payroll-rates.css";

/**
 * F-BORORAN · `Ayarlar > Bordro Oranları`.
 * Kanonik mockup: `projedesign/Ayarlar - Bordro Oranları.dc.html` (":N" = satır).
 *
 * 🔴 ÖLÇÜLMÜŞ ÜÇ SAPMA — hepsi mockup'ın vaat ettiği ama sözleşmenin
 * TAŞIMADIĞI şeylerdir; gerekçeleri kullanıldıkları yerdedir:
 *   1. `POST …/copy` ucu YOKTUR → kopyalama İSTEMCİDE, forma (`copyInto`).
 *   2. TEK "Oranları Kaydet" düğmesi YETMEZ → oran ucu `payroll:full`,
 *      tarife ucu `payroll:admin` (`router.py` `_FULL` / `_ADMIN`).
 *   3. "Dilim tablosu yoksa bu sabit oran kullanılır" notu TERSTİR →
 *      `INCOME_TAX_NULL_HINT`.
 */

type RateKey = `${number}:${WorkerSource}`;
type BracketKey = `${number}:${IncomeKind}`;

const CURRENT_YEAR = new Date().getFullYear();

export function PayrollRatesScreen() {
  const ratesQuery = usePayrollRates();
  const bracketsQuery = usePayrollTaxBrackets();
  const periodsQuery = usePayrollPeriods();

  const { level } = useModulePermission("payroll");
  // 🔴 İKİ AYRI KAPI — ölçüldü, varsayılmadı: oran `full`, tarife `admin`.
  // Bilinmezlik kuralı (seviye yoksa `true`) korunur.
  // IZN-F2.x · KOD kazanır: `PUT /payroll/rates` = payroll:full → mali.bordro VEYA mali.sgk_bildirimi Düzenler
  // (ayarlar.bordro_oranlari bu kapıdan ÇIKTI); vergi dilimi = yalnız ayarlar.bordro_oranlari Düzenler.
  const canEditRates = useButtonGate({
    pages: PAYROLL_EDIT,
    need: "edit",
    fallback: hasAtLeast(level, "full"),
  });
  const canEditBrackets = useButtonGate({
    pages: TAX_BRACKETS_EDIT,
    need: "edit",
    fallback: hasAtLeast(level, "admin"),
  });

  const [yearOverride, setYearOverride] = useState<number | null>(null);
  const [source, setSource] = useState<WorkerSource>(PAYROLL_TYPE_SOURCES[0]!);
  const [incomeKind, setIncomeKind] = useState<IncomeKind>("wage");
  const [rateDrafts, setRateDrafts] = useState<Record<string, RateDraft>>({});
  const [bracketDrafts, setBracketDrafts] = useState<Record<string, BracketDraft[]>>({});
  const [copiedFrom, setCopiedFrom] = useState<number | null>(null);
  const [rateError, setRateError] = useState<string | null>(null);
  const [bracketError, setBracketError] = useState<string | null>(null);

  const upsertRate = useUpsertPayrollRate();
  const replaceBrackets = useReplacePayrollTaxBrackets();

  // SEKME-F1.3b · dirty (tercih 1, hazır): iki bağımsız "kirli" kaynağı
  // (oran/dilim taslakları) TEK bayrağa OR'lanır. ASYNC TABAN DEĞİL
  // (taslaklar yalnız dokununca dolar). Sıfırlama ZATEN VAR — `saveRates`/
  // `saveBrackets` `onSuccess`inde ilgili anahtar drafts'tan siliniyor.
  // 🔴 Hook, erken dönüşlerden (`Yükleniyor…`/`AccessDenied`) ÖNCE çağrılır.
  useUnsavedChanges(
    Object.keys(rateDrafts).length > 0 || Object.keys(bracketDrafts).length > 0,
    "Bordro oranları",
  );

  const queries = [ratesQuery, bracketsQuery, periodsQuery];
  if (queries.some((q) => q.isLoading)) return <p className="settings-note">Yükleniyor…</p>;
  if (queries.some((q) => isForbidden(q.error))) return <AccessDenied />;
  if (!ratesQuery.data || !bracketsQuery.data || !periodsQuery.data) {
    return <p className="settings-note settings-note--error">Bordro oranları yüklenemedi.</p>;
  }

  const rates = ratesQuery.data.items;
  const brackets = bracketsQuery.data.items;
  const dataYears = [...rates.map((r) => r.year), ...brackets.map((b) => b.year)];
  const yearOptions = buildYearOptions(dataYears, CURRENT_YEAR);
  const year = yearOverride ?? defaultYear(dataYears, CURRENT_YEAR);

  const locked = isYearLocked(periodsQuery.data.items, year);
  const rateKey: RateKey = `${year}:${source}`;
  const bracketKey: BracketKey = `${year}:${incomeKind}`;

  const serverRate = rates.find((r) => r.year === year && r.personnel_source === source);
  const serverBrackets = brackets.filter(
    (b) => b.year === year && b.income_kind === incomeKind,
  );
  // Sunucudan gelen değer kutunun TABANIDIR; taslak varsa o kazanır
  // (`touched` deseni, F-İK dersi).
  const draft: RateDraft =
    rateDrafts[rateKey] ?? (serverRate ? rateToDraft(serverRate) : EMPTY_RATE_DRAFT);
  const bracketRows: BracketDraft[] =
    bracketDrafts[bracketKey] ??
    (serverBrackets.length > 0 ? bracketsToDrafts(serverBrackets) : []);

  const yearHasAnyRate = rates.some((r) => r.year === year);
  const yearHasAnyBracket = brackets.some((b) => b.year === year);
  const yearHasDraft =
    Object.keys(rateDrafts).some((k) => k.startsWith(`${year}:`)) ||
    Object.keys(bracketDrafts).some((k) => k.startsWith(`${year}:`));
  const isEmptyYear = !yearHasAnyRate && !yearHasAnyBracket && !yearHasDraft;

  const ratesReadOnly = !canEditRates || locked;
  const bracketsReadOnly = !canEditBrackets || locked;

  /** Kopyalanacak kaynak: seçili yıldan ÖNCEKİ, verisi olan en yakın yıl. */
  const copySource = yearOptions.find((option) => option < year && dataYears.includes(option));
  const nextYear = year + 1;
  const nextYearEmpty =
    nextYear <= Math.max(...yearOptions) &&
    !rates.some((r) => r.year === nextYear) &&
    !brackets.some((b) => b.year === nextYear);

  /**
   * 🔴 "KOPYALA" — SUNUCUDA BÖYLE BİR UÇ YOKTUR (ölçüldü: sözleşmede `copy`
   * içeren yol SAYISI 0; mockup yorumu `POST /settings/payroll-rates/copy`
   * vaat ediyor). İki seçenek vardı:
   *   (a) düğmeyi devre-dışı + görünür gerekçe ile basmak;
   *   (b) istemcide OKU + YAZ.
   * (b) SEÇİLDİ ve YAZMA ADIMI KULLANICIYA BIRAKILDI: kopyalama yalnız
   * FORMU doldurur, sunucuya HİÇBİR istek atmaz. Gerekçe:
   *   • sekiz ardışık PUT (dört tip + iki gelir türü) YARIM kalabilir ve
   *     kullanıcı "kopyalandı" görürken yılın yarısı yazılmış olurdu — para
   *     yüzeyinde kabul edilemez;
   *   • kopyalanan değerler MEVZUATTIR: 2026'nın oranını 2027'ye SESSİZCE
   *     yazmak, gözden geçirilmemiş bir tarifeyi yürürlüğe sokardı. Mockup'ın
   *     kendi metni de bunu söyler (`:135` "kopyalayıp GÜNCELLEYEBİLİRSİNİZ").
   *   • yan fayda: yazma olmadığı için hiçbir görsel kare bu düğmeden oynamaz.
   */
  function copyInto(from: number, to: number) {
    const nextRates: Record<string, RateDraft> = { ...rateDrafts };
    for (const src of PAYROLL_TYPE_SOURCES) {
      const row = rates.find((r) => r.year === from && r.personnel_source === src);
      if (row) nextRates[`${to}:${src}`] = rateToDraft(row);
    }
    const nextBrackets: Record<string, BracketDraft[]> = { ...bracketDrafts };
    for (const kind of INCOME_KINDS) {
      const rows = brackets.filter((b) => b.year === from && b.income_kind === kind);
      if (rows.length > 0) nextBrackets[`${to}:${kind}`] = bracketsToDrafts(rows);
    }
    setRateDrafts(nextRates);
    setBracketDrafts(nextBrackets);
    setYearOverride(to);
    setCopiedFrom(from);
    setRateError(null);
    setBracketError(null);
  }

  function startBlank() {
    setBracketDrafts({ ...bracketDrafts, [`${year}:${incomeKind}`]: emptyBracketDrafts() });
    setRateDrafts({ ...rateDrafts, [`${year}:${source}`]: EMPTY_RATE_DRAFT });
    setCopiedFrom(null);
  }

  function discard() {
    setRateDrafts({});
    setBracketDrafts({});
    setCopiedFrom(null);
    setRateError(null);
    setBracketError(null);
  }

  function patchDraft(field: RateField, value: string) {
    setRateDrafts({ ...rateDrafts, [rateKey]: { ...draft, [field]: value } });
  }

  function saveRates() {
    const body = rateDraftToBody(draft);
    if (!body.ok) {
      setRateError(body.reason);
      return;
    }
    setRateError(null);
    upsertRate.mutate(
      { year, source, body: body.body },
      {
        onSuccess: () => {
          const rest = { ...rateDrafts };
          delete rest[rateKey];
          setRateDrafts(rest);
          setCopiedFrom(null);
        },
        onError: (error) => setRateError(backendErrorMessage(error)),
      },
    );
  }

  function saveBrackets() {
    const checked = checkBracketSet(bracketRows);
    if (!checked.ok) {
      setBracketError(checked.reason);
      return;
    }
    setBracketError(null);
    replaceBrackets.mutate(
      { year, incomeKind, body: { brackets: checked.items, is_active: true } },
      {
        onSuccess: () => {
          const rest = { ...bracketDrafts };
          delete rest[bracketKey];
          setBracketDrafts(rest);
        },
        onError: (error) => setBracketError(backendErrorMessage(error)),
      },
    );
  }

  return (
    <div className="bro-wrap" data-testid="bro-wrap">
      {/* :86-98 · yıl seçici + kopyala + kaydet kümesi */}
      <div className="bro-toolbar">
        {/* Etiket katmanı `Field` primitive'inindir: `--text-form-label` /
            `--color-form-label` token'ları YALNIZ `field.css`te yaşayabilir
            (`field-adoption.test.ts` bekçisi) — ekranlar kendi etiket
            tipografisini YAZMAZ. */}
        <Field label="Yıl" className="bro-toolbar__year">
          {(control) => (
            <Select
              {...control}
              data-testid="bro-year"
              value={String(year)}
              onChange={(e) => {
                setYearOverride(Number(e.target.value));
                setCopiedFrom(null);
                setRateError(null);
                setBracketError(null);
              }}
            >
              {yearOptions.map((option) => {
                const bos =
                  !rates.some((r) => r.year === option) && !brackets.some((b) => b.year === option);
                return (
                  <option key={option} value={option}>
                    {bos ? `${option} — oran girilmedi` : String(option)}
                  </option>
                );
              })}
            </Select>
          )}
        </Field>
        {/* 🔴 SEÇİLİ YIL DÜZENLENEMİYORSA KOPYALA DA BASILMAZ: kopyalama formu
            doldurur, kaydetme ise 409/403'e takılır — kaydedilemeyecek bir
            formu dolduran düğme "sessizce çalışmayan düğme"dir. Alttaki iki
            kopyalama düğmesi BAŞKA (kilitsiz) bir yılı hedefler, onlar kalır. */}
        {copySource !== undefined && !ratesReadOnly && (
          <Button
            variant="secondary"
            data-testid="bro-copy"
            onClick={() => copyInto(copySource, year)}
          >
            {copyFromLabel(copySource, year)}
            <ArrowRightIcon {...inlineSymbolProps} />
          </Button>
        )}
        <span className="bro-toolbar__spacer" />
        <Button variant="secondary" onClick={discard} data-testid="bro-discard">
          Vazgeç
        </Button>
        {canEditRates && !locked && (
          <Button onClick={saveRates} disabled={upsertRate.isPending} data-testid="bro-save-rates">
            Oranları Kaydet
          </Button>
        )}
      </div>

      {/* 🔴 GEREKÇE ŞERİDİN KENDİ DURUMUNDAN TÜRETİLİR (F-KIRA kanonu):
          yıl kilidi kalktığı an cümle KENDİLİĞİNDEN düşer, elle silinmez. */}
      {locked && (
        <p className="bro-band bro-band--locked" data-testid="bro-locked">
          <LockIcon {...inlineSymbolProps} />
          {rateLockedReason(year)}
        </p>
      )}
      {!locked && !canEditRates && (
        <p className="bro-band bro-band--locked" data-testid="bro-no-permission">
          <LockIcon {...inlineSymbolProps} />
          Oranları değiştirmek için Bordro modülünde “tam” yetki gerekir; ekran salt-okunurdur.
        </p>
      )}
      {copiedFrom !== null && (
        <p className="bro-band bro-band--copied" data-testid="bro-copied">
          {copiedNotice(copiedFrom, year)}
        </p>
      )}

      {/* :131-140 · gelecek yıl uyarısı — SONRAKİ yıl boşken görünür */}
      {nextYearEmpty && !isEmptyYear && (
        <div className="bro-band bro-band--warn" data-testid="bro-next-year-warning">
          <WarningTriangleIcon {...inlineSymbolProps} />
          <span className="bro-band__text">
            <strong>{nextYear} oranları henüz girilmedi</strong>
            <span>
              Ocak {nextYear} bordrosu hesaplanamaz — dilim seti olmayan yıl fail-closed’dur ve
              satırlar “Hesaplanamadı” kalır.
            </span>
          </span>
          <Button variant="secondary" onClick={() => copyInto(year, nextYear)} data-testid="bro-copy-next">
            {copyFromLabel(year, nextYear)}
            <ArrowRightIcon {...inlineSymbolProps} />
          </Button>
        </div>
      )}

      {isEmptyYear ? (
        /* :224-241 · BOŞ HÂL — tabloların YERİNE geçer */
        <section className="bro-empty" data-testid="bro-empty">
          <span className="bro-empty__icon" aria-hidden="true">
            📋
          </span>
          <h2 className="bro-empty__title">{emptyYearTitle(year)}</h2>
          <p className="bro-empty__text">
            Bu yıla ait SGK oranları ve gelir vergisi dilimleri tanımlanmadan Ocak {year} bordrosu
            hesaplanamaz. Bir önceki yılın oranlarını kopyalayıp güncellemek en hızlı yol.
          </p>
          <div className="bro-empty__actions">
            {copySource !== undefined && (
              <Button onClick={() => copyInto(copySource, year)} data-testid="bro-empty-copy">
                {copyFromLabel(copySource, year)}
              </Button>
            )}
            <Button variant="secondary" onClick={startBlank} data-testid="bro-empty-blank">
              Sıfırdan Gir
            </Button>
          </div>
        </section>
      ) : (
        <>
          {/* :104-121 · tip sekmeleri (DÖRT — `general` bordro tipi DEĞİLDİR) */}
          <div className="bro-tabs" role="tablist" aria-label="Personel tipi">
            {PAYROLL_TYPE_SOURCES.map((option) => {
              const dolu = rates.some((r) => r.year === year && r.personnel_source === option);
              return (
                <button
                  key={option}
                  type="button"
                  role="tab"
                  aria-selected={option === source}
                  className={cx("bro-tab", option === source && "bro-tab--on")}
                  onClick={() => {
                    setSource(option);
                    setRateError(null);
                  }}
                >
                  <span className={cx("bro-tab__dot", `bro-tab__dot--${option}`)} aria-hidden="true" />
                  {WORKER_SOURCE_LABELS[option]}
                  <span className={cx("bro-tab__badge", !dolu && "bro-tab__badge--missing")}>
                    {dolu ? RATE_TYPE_PRESENT_BADGE : RATE_TYPE_MISSING_BADGE}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="bro-hint">
            Bir yılda dört ayrı oran seti tutulur — <strong>her tipin kendi SGK ve vergi oranı</strong>{" "}
            var. Oran seti olmayan tipteki personelin bordrosu hesaplanamaz.
          </p>

          {/* :124-129 · aktif/pasif */}
          <div className="bro-active">
            <span className="bro-active__text">
              <span className="bro-active__title">
                {WORKER_SOURCE_LABELS[source]} · {year} oran seti
              </span>
              <span className="bro-active__note">
                Pasife alınırsa bu tipteki personel bordroya dahil edilmez
              </span>
            </span>
            <Toggle
              checked={draft.isActive}
              disabled={ratesReadOnly}
              data-testid="bro-active-toggle"
              label={draft.isActive ? "Aktif" : "Pasif"}
              onChange={(e) =>
                setRateDrafts({
                  ...rateDrafts,
                  [rateKey]: { ...draft, isActive: e.target.checked },
                })
              }
            />
          </div>

          {/* :143-186 · SGK ve kesinti oranları */}
          <section className="bro-card">
            <header className="bro-card__head">
              <span className="bro-card__title">
                {RATES_CARD_TITLE} — {year} · {WORKER_SOURCE_LABELS[source]}
              </span>
              <span className="bro-card__note">İşçi ve işveren payları ayrı</span>
              <span className="bro-card__warning">{RATES_FULL_SET_WARNING}</span>
            </header>
            {rateError && (
              <p className="settings-note settings-note--error" data-testid="bro-rate-error">
                {rateError}
              </p>
            )}
            <div className="bro-table-scroll">
              <table className="bro-table">
                <thead>
                  <tr>
                    <th scope="col">Kesinti</th>
                    <th scope="col" className="bro-th--employee">
                      İşçi Payı %
                    </th>
                    <th scope="col" className="bro-th--employer">
                      İşveren Payı %
                    </th>
                    <th scope="col" className="bro-th--total">
                      Toplam
                    </th>
                    <th scope="col">Not</th>
                  </tr>
                </thead>
                <tbody>
                  <PairRow
                    label="SGK Primi"
                    note="5510 sayılı kanun"
                    employeeField="sgk_employee_pct"
                    employerField="sgk_employer_pct"
                    draft={draft}
                    readOnly={ratesReadOnly}
                    onChange={patchDraft}
                  />
                  <PairRow
                    label="İşsizlik Sigortası"
                    note="Devlet payı %1 ayrı"
                    employeeField="unemployment_employee_pct"
                    employerField="unemployment_employer_pct"
                    draft={draft}
                    readOnly={ratesReadOnly}
                    onChange={patchDraft}
                  />
                  {/* 🔴 TEK ORAN — işçi/işveren ÇİFTİ DEĞİLDİR (`short_work_pct`). */}
                  <SingleRow
                    label="Kısa Çalışma Ödeneği"
                    note="Tek oran — işçi/işveren ayrımı yok"
                    field="short_work_pct"
                    draft={draft}
                    readOnly={ratesReadOnly}
                    onChange={patchDraft}
                  />
                  {/* 🔴 Not mockup'takinin TERSİdir; gerekçe `INCOME_TAX_NULL_HINT`te. */}
                  <SingleRow
                    label="Gelir Vergisi Oranı"
                    note={INCOME_TAX_NULL_HINT}
                    field="income_tax_pct"
                    placeholder="Boş = dilimli tarife"
                    emptyDisplay="Dilimli tarife"
                    draft={draft}
                    readOnly={ratesReadOnly}
                    onChange={patchDraft}
                  />
                  <tr>
                    <th scope="row">Damga Vergisi</th>
                    <td className="bro-td--num">
                      <RateInput
                        label="Damga vergisi işçi payı"
                        value={draft.stamp_tax_pct}
                        readOnly={ratesReadOnly}
                        onChange={(v) => patchDraft("stamp_tax_pct", v)}
                      />
                    </td>
                    {/* :180 — damga vergisinin İŞVEREN payı YOKTUR: sözleşmede
                        böyle bir alan yok, uydurulmaz (WORKFLOW §3). */}
                    <td className="bro-td--num bro-td--na" aria-label="İşveren payı yok">
                      —
                    </td>
                    <td className="bro-td--total">{formatRate(draft.stamp_tax_pct)}</td>
                    <td className="bro-td--note">Binde 7,59</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* :189-221 · gelir vergisi dilimleri */}
          <section className="bro-card" data-testid="bro-brackets">
            <header className="bro-card__head">
              <span className="bro-card__title">
                {BRACKETS_CARD_TITLE} — {year}
              </span>
              <span className="bro-kind-tabs" role="tablist" aria-label="Gelir türü">
                {INCOME_KINDS.map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    role="tab"
                    aria-selected={kind === incomeKind}
                    className={cx("bro-kind-tab", kind === incomeKind && "bro-kind-tab--on")}
                    onClick={() => {
                      setIncomeKind(kind);
                      setBracketError(null);
                    }}
                  >
                    {INCOME_KIND_LABELS[kind]}
                  </button>
                ))}
              </span>
              <span className="bro-card__note">Kümülatif matrah üzerinden</span>
              {!bracketsReadOnly && (
                <span className="bro-card__actions">
                  <Button
                    variant="ghost"
                    onClick={() =>
                      setBracketDrafts({
                        ...bracketDrafts,
                        [bracketKey]: appendBracketDraft(bracketRows),
                      })
                    }
                    data-testid="bro-add-bracket"
                  >
                    + Dilim Ekle
                  </Button>
                  <Button
                    onClick={saveBrackets}
                    disabled={replaceBrackets.isPending}
                    data-testid="bro-save-brackets"
                  >
                    Tarifeyi Kaydet
                  </Button>
                </span>
              )}
            </header>
            {/* 🔴 TAM KÜME YAZMA — kullanıcı kısmi kaydettiğini SANMAMALIDIR. */}
            <p className="bro-card__warning bro-card__warning--block" data-testid="bro-full-set-warning">
              {BRACKETS_FULL_SET_WARNING}
            </p>
            {!canEditBrackets && !locked && (
              <p className="bro-band bro-band--locked" data-testid="bro-bracket-permission">
                <LockIcon {...inlineSymbolProps} />
                Gelir vergisi tarifesini değiştirmek için Bordro modülünde “yönetici” yetkisi
                gerekir — oran yetkisi (“tam”) bunun için YETMEZ.
              </p>
            )}
            {bracketError && (
              <p className="settings-note settings-note--error" data-testid="bro-bracket-error">
                {bracketError}
              </p>
            )}
            <div className="bro-table-scroll">
              <table className="bro-table bro-table--brackets">
                <thead>
                  <tr>
                    <th scope="col" className="bro-th--ordinal">
                      Dilim
                    </th>
                    <th scope="col" className="bro-th--num">
                      Alt Sınır (₺)
                    </th>
                    <th scope="col" className="bro-th--bound">
                      Üst Sınır (₺)
                    </th>
                    <th scope="col" className="bro-th--bound">
                      Oran %
                    </th>
                    <th scope="col">Açıklama</th>
                    <th scope="col" className="bro-th--remove">
                      <span className="bro-visually-hidden">Sil</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {bracketRows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="bro-td--empty">
                        {year} · {INCOME_KIND_LABELS[incomeKind]} için tarife girilmemiş — bu
                        yılın bordrosunda gelir vergisi hesaplanamaz.
                      </td>
                    </tr>
                  )}
                  {bracketRows.map((row, index) => {
                    const isLast = index === bracketRows.length - 1;
                    const lower = bracketLowerBound(
                      index === 0 ? undefined : bracketRows[index - 1]!.upperBound,
                    );
                    return (
                      <tr key={row.key}>
                        <td className="bro-td--ordinal">{index + 1}</td>
                        <td className="bro-td--num bro-td--derived">
                          {lower === null ? "—" : formatBound(lower)}
                        </td>
                        <td className="bro-td--num">
                          {isLast ? (
                            <span className="bro-unbounded">Üst sınır yok</span>
                          ) : (
                            <Input
                              numeric
                              size="row"
                              inputMode="decimal"
                              aria-label={`${index + 1}. dilim üst sınırı`}
                              value={row.upperBound}
                              readOnly={bracketsReadOnly}
                              onChange={(e) =>
                                setBracketDrafts({
                                  ...bracketDrafts,
                                  [bracketKey]: bracketRows.map((r) =>
                                    r.key === row.key ? { ...r, upperBound: e.target.value } : r,
                                  ),
                                })
                              }
                            />
                          )}
                        </td>
                        <td className="bro-td--num">
                          <Input
                            numeric
                            size="row"
                            inputMode="decimal"
                            aria-label={`${index + 1}. dilim oranı`}
                            value={row.ratePct}
                            readOnly={bracketsReadOnly}
                            onChange={(e) =>
                              setBracketDrafts({
                                ...bracketDrafts,
                                [bracketKey]: bracketRows.map((r) =>
                                  r.key === row.key ? { ...r, ratePct: e.target.value } : r,
                                ),
                              })
                            }
                          />
                        </td>
                        <td className="bro-td--note">
                          {index === 0 ? "İlk dilim" : isLast ? "Son dilim" : "—"}
                        </td>
                        <td className="bro-td--remove">
                          {!bracketsReadOnly && (
                            <button
                              type="button"
                              className="bro-remove"
                              aria-label={`${index + 1}. dilimi sil`}
                              onClick={() =>
                                setBracketDrafts({
                                  ...bracketDrafts,
                                  [bracketKey]: removeBracketDraft(bracketRows, row.key),
                                })
                              }
                            >
                              ×
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="bro-card__foot">
              <strong>Alt sınırlar otomatik:</strong> Her dilimin alt sınırı önceki dilimin üst
              sınırı + 1 kuruş olarak hesaplanır — elle girilmez ve sunucuya gönderilmez. Son
              dilimin üst sınırı yoktur.
            </p>
          </section>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ satırlar */

/**
 * "Toplam" sütunu — mockup `:151` `34,50` · `:158` `3,00` · `:172` `15,00` ·
 * `:180` `0,759`. Yani **en az 2, en çok 3** ondalık: `formatDecimal` tek
 * başına yetmez (yalnız `maximumFractionDigits` alır ve `34,5` basardı).
 */
const RATE_TOTAL_FORMAT = new Intl.NumberFormat("tr-TR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 3,
});

function formatRate(value: string): string {
  const normalized = normalize(value);
  if (normalized === null) return "—";
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? RATE_TOTAL_FORMAT.format(numeric) : "—";
}

function formatBound(value: string): string {
  return formatDecimal(value, 2);
}

function RateInput({
  label,
  value,
  readOnly,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  readOnly: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <Input
      numeric
      size="row"
      inputMode="decimal"
      aria-label={label}
      placeholder={placeholder}
      value={value}
      readOnly={readOnly}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/** İşçi + işveren payı olan kesinti — "Toplam" sütunu İKİSİNİN TOPLAMIdır. */
function PairRow({
  label,
  note,
  employeeField,
  employerField,
  draft,
  readOnly,
  onChange,
}: {
  label: string;
  note: string;
  employeeField: RateField;
  employerField: RateField;
  draft: RateDraft;
  readOnly: boolean;
  onChange: (field: RateField, value: string) => void;
}) {
  const employee = draft[employeeField];
  const employer = draft[employerField];
  // 🔴 `Number(a) + Number(b)` YASAK (WORKFLOW §4 para kuralı): toplam
  // ondalık string aritmetiğiyle kurulur.
  const employeeValue = normalize(employee);
  const employerValue = normalize(employer);
  const total =
    employeeValue === null || employerValue === null
      ? "—"
      : formatRate(sumDecimalStrings([employeeValue, employerValue]));
  return (
    <tr>
      <th scope="row">{label}</th>
      <td className="bro-td--num">
        <RateInput
          label={`${label} işçi payı`}
          value={employee}
          readOnly={readOnly}
          onChange={(v) => onChange(employeeField, v)}
        />
      </td>
      <td className="bro-td--num">
        <RateInput
          label={`${label} işveren payı`}
          value={employer}
          readOnly={readOnly}
          onChange={(v) => onChange(employerField, v)}
        />
      </td>
      <td className="bro-td--total">{total}</td>
      <td className="bro-td--note">{note}</td>
    </tr>
  );
}

/** Tek oranlı kesinti — iki kolonu BİRLEŞTİRİR (mockup `colspan=2`). */
function SingleRow({
  label,
  note,
  field,
  draft,
  readOnly,
  placeholder,
  emptyDisplay,
  onChange,
}: {
  label: string;
  note: string;
  field: RateField;
  draft: RateDraft;
  readOnly: boolean;
  placeholder?: string;
  emptyDisplay?: string;
  onChange: (field: RateField, value: string) => void;
}) {
  const value = draft[field];
  return (
    <tr>
      <th scope="row">{label}</th>
      <td className="bro-td--num" colSpan={2}>
        <RateInput
          label={label}
          value={value}
          readOnly={readOnly}
          placeholder={placeholder}
          onChange={(v) => onChange(field, v)}
        />
      </td>
      <td className="bro-td--total">
        {value.trim() === "" && emptyDisplay ? emptyDisplay : formatRate(value)}
      </td>
      <td className="bro-td--note">{note}</td>
    </tr>
  );
}

/**
 * TR virgülünü noktaya çevirir; `sumDecimalStrings` nokta bekler.
 *
 * 🔴 KANON AYRIŞTIRICIYI ÇAĞIRIR, özel kopya YOK: eski gövde
 * (`value.trim().replace(",", ".")`) kapısızdı ve `String.replace` string
 * desenle YALNIZ İLK virgülü çevirdiği için "1.234,56" → "1.234.56" ya da
 * "1,2," → "1.2," gibi ÇİFT AYRAÇLI string'ler doğrudan
 * `sumDecimalStrings`e sızıyordu: biri sessiz YANLIŞ toplam bastı
 * ("1.234,56" + "20.500" → "21,734"), öteki `BigInt("12,0")` ile RENDER
 * SIRASINDA fırlattı (hata sınırı yok → tüm ekran kaybedilir).
 * Geçersiz/yarım girdi artık `null` döner; çağıran "toplam yok" (—) dalını
 * seçer. Geçerli TR virgülü ("14,5") aynen çalışmaya devam eder.
 */
function normalize(value: string): string | null {
  return normalizeDecimalInput(value);
}
