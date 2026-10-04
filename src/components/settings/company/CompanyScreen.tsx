"use client";

import { useEffect, useState } from "react";
import { Button, Field, Input, Toggle } from "@/components/ui";
import { Select } from "@/components/ui/select";
import { SettingsCard } from "@/components/settings/primitives/SettingsCard";
import { useCompany, useUpdateCompany } from "@/lib/api/hooks/useCompany";
import { AccessDenied } from "@/components/settings/AccessDenied";
import { isForbidden } from "@/lib/api/unwrap";
import { backendErrorMessage } from "@/lib/api/error-message";
import type { CompanyUpdate } from "@/lib/api/models";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";
import "./company-screen.css";
import { COMPANY_EDIT } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";

// e-Arşiv portalı seçenekleri (ref mockup — backend serbest metin alanı kabul eder).
const EARSIV_PORTAL_OPTIONS = ["Logo e-Fatura", "Mikro e-Fatura", "Paraşüt", "Türk Telekom"];

// KDV oranı seçenekleri (ref mockup).
const VAT_RATE_OPTIONS = ["20", "10", "1", "0"];

/** Kayıt 276 — "seçilmedi" değeri GERÇEK boşluğu temsil eder; "%20"ye
 * sessizce eşlenmez (kullanıcı "zaten %20" sanıp başka alanı kaydedebilirdi). */
const VAT_RATE_UNSET_VALUE = "";

/**
 * Sunucu değeri seçim kutusunun değerine çevrilir. `null` ⇒ GERÇEK boşluk
 * (önceden sessizce "20"ye düşüyordu). Listede olmayan bir değer (ör.
 * ondalıklı "18.5") de sessizce yuvarlanıp bir seçeneğe eşlenmez — ham
 * değer AYNEN döner ki çağıran onu listeye ek bir seçenek olarak basabilsin.
 */
function vatRateToSelectValue(rate: CompanyUpdate["default_vat_rate"]): string {
  if (rate == null) return VAT_RATE_UNSET_VALUE;
  return String(rate);
}

export function CompanyScreen() {
  const query = useCompany();
  const update = useUpdateCompany();
  // IZN-F2.x · şirket bilgisi kaydet = ayarlar.sirket_bilgileri Düzenler (bugün KAPISIZ → grant yoksa serbest).
  const canSaveCompany = useButtonGate({ pages: COMPANY_EDIT, need: "edit", fallback: true });
  const [form, setForm] = useState<CompanyUpdate>({});
  const [err, setErr] = useState<string | null>(null);
  // SEKME-F1.3b · dirty (tercih 2), taban `form`u dolduran AYNI efektte
  // alınır. 🔴 ASYNC TABAN: `baseline` `null` iken (GET henüz dönmedi) dirty
  // FALSE. Kayıt başarısında `useUpdateCompany` zaten `COMPANY_QUERY_KEY`i
  // geçersiz kılıyor (bkz. useCompany.ts) — `query.data` yenilenince bu efekt
  // YENİDEN çalışır ve `baseline`ı da kaydedilen değerle hizalar (dolaylı
  // sıfırlama, `AppearanceScreen` deseniyle aynı).
  const [baseline, setBaseline] = useState<CompanyUpdate | null>(null);
  const isDirty = baseline !== null && JSON.stringify(form) !== JSON.stringify(baseline);
  useUnsavedChanges(isDirty, "Şirket bilgileri");

  useEffect(() => {
    if (!query.data) return;
    const next: CompanyUpdate = {
      name: query.data.name,
      tax_number: query.data.tax_number,
      tax_office: query.data.tax_office,
      trade_registry_no: query.data.trade_registry_no,
      kep_address: query.data.kep_address,
      phone: query.data.phone,
      email: query.data.email,
      website: query.data.website,
      address: query.data.address,
      brand_color: query.data.brand_color,
      gib_integration_code: query.data.gib_integration_code,
      earsiv_portal: query.data.earsiv_portal,
      default_vat_rate: query.data.default_vat_rate,
      auto_einvoice: query.data.auto_einvoice,
    };
    setForm(next);
    setBaseline(next);
  }, [query.data]);

  if (query.isLoading) return <p className="settings-note">Yükleniyor…</p>;
  if (isForbidden(query.error)) return <AccessDenied />;
  if (query.isError || !query.data) {
    return <p className="settings-note settings-note--error">Şirket bilgileri yüklenemedi.</p>;
  }

  const set = (patch: Partial<CompanyUpdate>) => setForm((f) => ({ ...f, ...patch }));

  const field = (label: string, key: keyof CompanyUpdate, mono = false) => (
    <Field key={key} label={label} className="company-field">
      {(control) => (
        <Input
          {...control}
          className={mono ? "is-mono" : undefined}
          value={(form[key] as string) ?? ""}
          onChange={(e) => set({ [key]: e.target.value } as Partial<CompanyUpdate>)}
        />
      )}
    </Field>
  );

  function save() {
    setErr(null);
    // O2 (SEKME-F2) · taban SUNULAN gövdeye çekilir, o anki `form`a DEĞİL:
    // kayıt sürerken kullanıcı yeni bir değişiklik yaparsa (state ilerlerken
    // `submittedForm` sabit kalır) form kirli KALMALI. Sunucu normalleştirip
    // aynı/eski veriyi dönse ya da yeniden çekme (invalidateQueries → refetch)
    // hata verse bile bu taban kayıttan HEMEN sonra temiz sayar — `query.data`
    // efektine bağımlı kalınmaz.
    const submittedForm = form;
    update.mutate(submittedForm, {
      onSuccess: () => setBaseline(submittedForm),
      onError: (e) => setErr(backendErrorMessage(e)),
    });
  }

  return (
    <>
      <div className="company-grid">
        <SettingsCard>
          <div className="company-card__title">Firma Bilgileri</div>
          <div className="company-form">
            {field("Firma Adı", "name")}
            {field("Vergi No", "tax_number")}
            {field("Vergi Dairesi", "tax_office")}
            {field("Ticaret Sicil No", "trade_registry_no")}
            {field("KEP Adresi", "kep_address")}
          </div>
        </SettingsCard>

        <SettingsCard>
          <div className="company-card__title">İletişim &amp; Adres</div>
          <div className="company-form">
            {field("Telefon", "phone")}
            {field("E-posta", "email")}
            {field("Web Sitesi", "website")}
            <Field label="Adres" className="company-field">
              {(control) => (
                <textarea
                  {...control}
                  value={form.address ?? ""}
                  onChange={(e) => set({ address: e.target.value })}
                />
              )}
            </Field>
          </div>
        </SettingsCard>

        <SettingsCard>
          <div className="company-card__title">Logo &amp; Marka</div>
          <div className="company-logo">
            <span className="company-logo__preview" aria-hidden="true">
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                <rect x="5" y="5" width="13" height="13" rx="2" fill="var(--color-on-brand)" />
                <rect x="22" y="5" width="13" height="13" rx="2" fill="var(--color-on-brand)" opacity=".7" />
                <rect x="5" y="22" width="13" height="13" rx="2" fill="var(--color-on-brand)" opacity=".7" />
                <rect x="22" y="22" width="13" height="13" rx="2" fill="var(--color-on-brand)" opacity=".3" />
              </svg>
            </span>
            <div>
              <div className="company-logo__name">FİİL Yapı Logo</div>
              <div className="company-logo__caption">PNG, SVG · Önerilen 200×200px</div>
              {/* Logo yükleme (POST /company/logo) kapsam dışı — buton pasif, takip görevi. */}
              <Button variant="secondary" size="sm">
                ↑ Logo Yükle
              </Button>
            </div>
          </div>
          <Field label="Birincil Renk" className="company-field company-color-field">
            {(control) => (
              <span className="company-color-row">
                <span className="company-swatch" style={{ background: form.brand_color ?? "#2563eb" }} />
                <Input
                  {...control}
                  className="is-mono"
                  value={form.brand_color ?? ""}
                  onChange={(e) => set({ brand_color: e.target.value })}
                />
              </span>
            )}
          </Field>
        </SettingsCard>

        <SettingsCard>
          <div className="company-card__title">Fatura &amp; e-Fatura Ayarları</div>
          <div className="company-form">
            {field("GİB Entegrasyon Kodu", "gib_integration_code", true)}
            <Field label="e-Arşiv Portalı" className="company-field">
              {(control) => (
                <Select
                  {...control}
                  value={form.earsiv_portal ?? ""}
                  onChange={(e) => set({ earsiv_portal: e.target.value })}
                >
                  {EARSIV_PORTAL_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="KDV Oranı (Varsayılan)" className="company-field">
              {(control) => {
                const selectValue = vatRateToSelectValue(form.default_vat_rate);
                // Kayıt 276 — sunucu değeri listedeki dört seçenekten biri
                // değilse (ör. ondalıklı "18.5") sessizce yuvarlanıp bir
                // seçeneğe İTİLMEZ: kendi görünür seçeneği eklenir.
                const isCustomValue =
                  selectValue !== VAT_RATE_UNSET_VALUE && !VAT_RATE_OPTIONS.includes(selectValue);
                return (
                  <Select
                    {...control}
                    value={selectValue}
                    onChange={(e) => set({ default_vat_rate: e.target.value })}
                  >
                    <option value={VAT_RATE_UNSET_VALUE} disabled>
                      Seçilmedi
                    </option>
                    {isCustomValue && (
                      <option value={selectValue}>%{selectValue} (özel)</option>
                    )}
                    {VAT_RATE_OPTIONS.map((rate) => (
                      <option key={rate} value={rate}>
                        %{rate}
                      </option>
                    ))}
                  </Select>
                );
              }}
            </Field>
            <div className="company-toggle-row">
              <span className="company-toggle-row__text">
                <span className="company-toggle-row__label">Otomatik e-Fatura</span>
                <span className="company-toggle-row__subtitle">Hakediş onayında otomatik gönder</span>
              </span>
              <Toggle
                checked={form.auto_einvoice ?? false}
                onChange={(e) => set({ auto_einvoice: e.target.checked })}
                aria-label="Otomatik e-Fatura"
              />
            </div>
          </div>
        </SettingsCard>
      </div>

      {err && <p className="settings-note settings-note--error">{err}</p>}

      <div className="company-actions">
        <Button variant="secondary" onClick={() => query.refetch()}>
          İptal
        </Button>
        <Button variant="primary" onClick={save} disabled={update.isPending || !canSaveCompany}>
          Değişiklikleri Kaydet
        </Button>
      </div>
    </>
  );
}
