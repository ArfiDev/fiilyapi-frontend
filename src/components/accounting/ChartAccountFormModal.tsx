"use client";

import { useState } from "react";

import { Modal } from "@/components/settings/Modal";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";
import { Badge, Button, Checkbox, Field, Input, Select, Toggle } from "@/components/ui";
import { WarningTriangleIcon } from "@/components/ui/icons";
import { backendErrorMessage } from "@/lib/api/error-message";
import type { ChartAccountResponse } from "@/lib/api/hooks/useChartOfAccounts";
import {
  useCreateChartAccount,
  useUpdateChartAccount,
} from "@/lib/api/hooks/useChartOfAccountMutations";
import type { ChartAccountType } from "@/lib/api/hooks/useChartOfAccounts";

import {
  ACCOUNT_TYPE_OPTIONS,
  ACCOUNT_TYPE_PLACEHOLDER,
  CONTRA_HELP,
  chartAccountFormBlockers,
  chartAccountFormOf,
  changedChartAccountFields,
  emptyChartAccountForm,
  kontraOnizleme,
  type ChartAccountFormState,
} from "./chart-account-form";
import { accountTypeLabel, accountTypeVariant } from "./chart-of-accounts-rows";
import "@/components/settings/settings.css";
import "./accounting.css";

export interface ChartAccountFormModalProps {
  /** `undefined` ⇒ oluşturma kipi. */
  account?: ChartAccountResponse;
  onClose: () => void;
}

/** `M:76` — mockup'ın kendi ipucu cümlesi (üçüncü kırılım AÇILMAZ). */
const CODE_HINT = "Biçim: 10 · 100 · 100.01 — üçüncü kırılım desteklenmez";
/** `M:81` — sunucu sınırı (`schemas.py` `_NAME`: `max_length=200`) ile birebir. */
const NAME_HINT = "En çok 200 karakter";
/** `M:96` */
const TYPE_HINT = "Bilanço ve gelir tablosunda yerini belirler";
/** `M:106` */
const ACTIVE_HINT = "Kapatılırsa yeni fişlerde seçilemez, geçmiş kayıtlar korunur";
/** `M:64` — başlığın altındaki açıklama; `Modal` alt başlık almadığı için gövdenin ilk satırı. */
const CREATE_SUBTITLE = "Tek düzen hesap planına yeni hesap tanımla";
/**
 * `M:146` mockup'ın önizleme ipucu REDDEDİLDİ (K3): "kontra işaretlenirse bu
 * satır 'aktif toplamdan düşülür' olarak değişir" cümlesi TARAFIN sabit
 * kaldığını varsayıyor. `257` bunun karşı kanıtıdır — işaret kalemin TARAFINI
 * da çevirir.
 */
const PREVIEW_HINT =
  "Cümle tür ile kontra işareti BİRLİKTE okunarak türetilir: işaret, hesabın " +
  "düştüğü kalemin tarafını da çevirir.";

/**
 * `Form - Hesap Ekle.dc.html` diyaloğu (`M:` = o dosyanın satır numarası).
 *
 * 🔴 BEŞ kontrol: `Kod` (`M:74`) · `Hesap Adı` (`M:79`) · `Tür` (`M:87`) ·
 * `Kullanımda` (`M:99`) · **`Bu bir kontra hesaptır`** (`M:112`). Sonuncusu
 * F-MU1'de yoktu ve AÇIK BORÇTU: kontra hesap arayüzden işaretlenemediği için
 * bilanço o hesap kadar dengesiz kalıyor ve UI'dan düzeltilemiyordu.
 * `Bakiye` (HP:61) TÜREVDİR ve formda salt-okunur bile basılmaz.
 *
 * 🔴 MOCKUP'IN İKİ METNİ REDDEDİLDİ — gerekçeleri `chart-account-form.ts`
 * başında (K1: `257`in türü Pasif'tir, karşı örnek `501` zorunludur ·
 * K2: `102 Alınan Çekler Reeskontu` uydurmadır).
 *
 * 🔴 `M:61` `📒`, `M:66` `×`, `M:125` `⚠`, `M:126` `≠` BASILMAZ: ilk ikisi
 * `Modal`ın kendi kabuğunda zaten var, son ikisinin glifi `fonts.css`
 * unicode-range'lerinde YOK (tofu kutusu basardı).
 *
 * 🔴 İstemci doğrulaması sunucununkinin YERİNE geçmez: kod deseni burada da
 * denetlenir ama sunucunun 409/422 Türkçe `detail` metni yine EKRANA basılır
 * (`backendErrorMessage`; ham gövde ya da `detail` nesnesi asla).
 *
 * 🔴 K9 — kod kilidi (409 `ACCOUNT_CODE_LOCKED`) ÖNGÖRÜLÜ basılamaz:
 * `ChartAccountResponse` (`schema.d.ts:6645-6675`) hesabın fiş satırı olup
 * olmadığını söyleyen HİÇBİR alan taşımaz (`balance` bunu söylemez — dengeli
 * hareketler sıfıra da toplanabilir). Uydurma bir kilit basmak yerine 409
 * ZARİFÇE karşılanır: diyalog açık kalır, sunucunun Türkçe gerekçesi basılır ve
 * form kaybolmaz.
 */
export function ChartAccountFormModal({ account, onClose }: ChartAccountFormModalProps) {
  const isEdit = account !== undefined;
  const [form, setForm] = useState<ChartAccountFormState>(() =>
    account ? chartAccountFormOf(account) : emptyChartAccountForm(),
  );
  // SEKME-F1.3b — sekme-değiştirme onayı için taban anlık görüntüsü (alanlar
  // yalnız string/boolean, JSON.stringify kıyası güvenli).
  const [initialForm, setInitialForm] = useState(form);
  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm);
  // Kayıt 50/ortak emir §7 — `Modal`a `isDirty` VERİLMEZ (arka plan tıklaması
  // davranışını değiştirir); doğrudan bağlanır.
  useUnsavedChanges(isDirty, "Hesap formu");
  const [formError, setFormError] = useState<string | null>(null);
  /** `M:153` — yalnız oluşturma kipinde anlamlı. */
  const [keepOpen, setKeepOpen] = useState(false);

  const createMutation = useCreateChartAccount();
  const updateMutation = useUpdateChartAccount();
  const isPending = createMutation.isPending || updateMutation.isPending;

  const blockers = chartAccountFormBlockers(form);
  const canSave = blockers.length === 0 && !isPending;
  const preview = kontraOnizleme(form.accountType, form.isContra);

  function patch(next: Partial<ChartAccountFormState>) {
    setForm((current) => ({ ...current, ...next }));
  }

  async function handleSubmit() {
    if (!canSave) return;
    setFormError(null);
    try {
      if (account === undefined) {
        await createMutation.mutateAsync({
          code: form.code.trim(),
          name: form.name.trim(),
          account_type: form.accountType,
          is_active: form.isActive,
          // K7: TS'te ZORUNLU alan (`schema.d.ts:6611`) — gövdeye HER ZAMAN yazılır.
          is_contra: form.isContra,
        });
        if (keepOpen) {
          // `M:154` — diyalog açık kalır, form sıfırlanır. Ardışık hesap girişi
          // hesap planını sıfırdan kurarken tek tek diyalog açmaya bedeldir.
          const reset = emptyChartAccountForm();
          setForm(reset);
          setInitialForm(reset);
          return;
        }
      } else {
        const body = changedChartAccountFields(form, account);
        // Hiçbir alan değişmediyse istek ATILMAZ.
        if (Object.keys(body).length === 0) {
          onClose();
          return;
        }
        await updateMutation.mutateAsync({ accountId: account.id, body });
      }
      onClose();
    } catch (error) {
      // Diyalog AÇIK kalır: kullanıcı doldurduğu formu kaybetmeden hatayı görür.
      // 409 `ACCOUNT_CODE_LOCKED` de bu daldan geçer (K9).
      setFormError(
        backendErrorMessage(error, isEdit ? "Hesap güncellenemedi." : "Hesap oluşturulamadı."),
      );
    }
  }

  return (
    <Modal
      title={isEdit ? "Hesap Düzenle" : "Yeni Hesap Ekle"}
      className="mu-modal--account"
      onClose={onClose}
      footer={
        <>
          {!isEdit && (
            <Checkbox
              className="mu-account-form__repeat-box"
              label="Kaydettikten sonra yeni hesap ekle"
              checked={keepOpen}
              data-testid="hp-dialog-repeat"
              onChange={(event) => setKeepOpen(event.target.checked)}
            />
          )}
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            Vazgeç
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={!canSave}
            data-testid="hp-dialog-save"
          >
            {isEdit ? "Kaydet" : "Hesabı Kaydet"}
          </Button>
        </>
      }
    >
      <div className="settings-form">
        {!isEdit && <p className="mu-account-form__subtitle">{CREATE_SUBTITLE}</p>}

        {/* M:72 — `150px 1fr`: kod dar, ad geniş. */}
        <div className="mu-account-form__row mu-account-form__row--code">
          <Field label="Kod" required hint={CODE_HINT}>
            {(control) => (
              <Input
                {...control}
                className="is-mono"
                value={form.code}
                placeholder="257.01"
                data-testid="hp-dialog-code"
                onChange={(event) => patch({ code: event.target.value })}
              />
            )}
          </Field>
          <Field label="Hesap Adı" required hint={NAME_HINT}>
            {(control) => (
              <Input
                {...control}
                value={form.name}
                maxLength={200}
                placeholder="Birikmiş Amortismanlar"
                data-testid="hp-dialog-name"
                onChange={(event) => patch({ name: event.target.value })}
              />
            )}
          </Field>
        </div>

        {/* M:85 — `1fr 1fr`: Tür + Kullanımda yan yana. */}
        <div className="mu-account-form__row">
          <Field label="Tür" required hint={TYPE_HINT}>
            {(control) => (
              <Select
                {...control}
                value={form.accountType}
                data-testid="hp-dialog-type"
                onChange={(event) => patch({ accountType: event.target.value as ChartAccountType })}
              >
                {/* K8 · M:89 — SEÇİLEMEZ placeholder; varsayılan `asset` KALIR. */}
                <option value="" disabled>
                  {ACCOUNT_TYPE_PLACEHOLDER}
                </option>
                {ACCOUNT_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {/* M:99-107 `Kullanımda` — kaldırma yolu DELETE değil `is_active`tir.
              Etiket `<span>`dir, `Field` DEĞİL: `Toggle` kendi `<label>`ını
              kurar ve `Field` ikinci bir etiket bağlantısı açardı (bekçi:
              `field-adoption.test.ts` bağlantıyı TEK primitive'de tutar).
              Erişilebilir ad bu yüzden `aria-label`dan gelir. */}
          <div className="field">
            <span className="field__label-row">
              <span className="field__label">Kullanımda</span>
            </span>
            <div className="mu-account-form__toggle">
              <Toggle
                checked={form.isActive}
                aria-label="Kullanımda"
                data-testid="hp-dialog-active"
                onChange={(event) => patch({ isActive: event.target.checked })}
                label={
                  <span
                    className={
                      form.isActive
                        ? "mu-account-form__state mu-account-form__state--on"
                        : "mu-account-form__state"
                    }
                  >
                    {form.isActive ? "Aktif" : "Kapalı"}
                  </span>
                }
              />
            </div>
            <p className="field__hint">{ACTIVE_HINT}</p>
          </div>
        </div>

        {/* M:111-131 — KRİTİK kutu. Düzen/renk mockup'tan, CÜMLELER kanondan (K1). */}
        <section className="mu-contra" data-testid="hp-dialog-contra-help">
          <Checkbox
            className="mu-contra__box"
            checked={form.isContra}
            data-testid="hp-dialog-contra"
            onChange={(event) => patch({ isContra: event.target.checked })}
            label={<span className="mu-contra__title">{CONTRA_HELP.title}</span>}
          />
          <div className="mu-contra__body">
            <p>{CONTRA_HELP.rule}</p>
            <p>
              <strong className="is-mono">{CONTRA_HELP.positiveExample}</strong>{" "}
              {CONTRA_HELP.positiveExampleNote}
            </p>
            {/* 🔴 KARŞI ÖRNEK — silinirse kullanıcı "(-) varsa işaretle" diye
                YANLIŞ kuralı öğrenir ve sermayeyi ters çevirir. */}
            <p>
              <strong className="is-mono">{CONTRA_HELP.counterExample}</strong>{" "}
              {CONTRA_HELP.counterExampleNote}
            </p>
            <p className="mu-contra__fallback">{CONTRA_HELP.fallback}</p>
            <div className="mu-contra__why">
              {/* M:125 `⚠` yerine ikon: U+26A0 fontta YOK. */}
              <WarningTriangleIcon className="mu-contra__why-icon" width={13} height={13} />
              <span>
                <strong>{CONTRA_HELP.whyTitle}</strong> {CONTRA_HELP.why}
              </span>
            </div>
          </div>
        </section>

        {/* M:133-147 — CANLI ÖNİZLEME. TÜRETİLİR (K3), sabit metin DEĞİLDİR. */}
        <section className="mu-preview">
          <div className="mu-preview__eyebrow">Önizleme</div>
          <div className="mu-preview__head" data-testid="hp-dialog-preview-head">
            <span className="mu-preview__code is-mono">{form.code.trim() || "—"}</span>
            <span className="mu-preview__name">{form.name.trim() || "Hesap adı"}</span>
            <Badge variant={accountTypeVariant(form.accountType)}>
              {accountTypeLabel(form.accountType)}
            </Badge>
            <Badge variant={form.isActive ? "success" : "neutral"}>
              {form.isActive ? "KULLANIMDA" : "KAPALI"}
            </Badge>
          </div>
          <div className="mu-preview__row">
            <span className="mu-preview__label">{preview.label}</span>
            <span
              className={`mu-preview__value mu-preview__value--${preview.tone}`}
              data-testid="hp-dialog-preview"
            >
              {preview.text}
            </span>
          </div>
          <p className="field__hint">{PREVIEW_HINT}</p>
        </section>

        {blockers.length > 0 && (
          <ul className="mu-blockers" data-testid="hp-dialog-blockers">
            {blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        )}
        {formError !== null && (
          <p className="settings-note settings-note--error" data-testid="hp-dialog-error">
            {formError}
          </p>
        )}
      </div>
    </Modal>
  );
}
