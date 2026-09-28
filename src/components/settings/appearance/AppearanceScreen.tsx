"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Field } from "@/components/ui";
import { Select } from "@/components/ui/select";
import { CheckIcon, inlineSymbolProps } from "@/components/ui/icons";
import { SettingsCard } from "@/components/settings/primitives/SettingsCard";
import { AccessDenied } from "@/components/settings/AccessDenied";
import { isForbidden } from "@/lib/api/unwrap";
import { backendErrorMessage } from "@/lib/api/error-message";
import { cx } from "@/lib/cx";
import { PREFERENCES_QUERY_KEY, usePreferences, useUpdatePreferences } from "@/lib/api/hooks/usePreferences";
import type { PreferencesRead, PreferencesUpdate } from "@/lib/api/models";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";
import "./appearance-screen.css";

// Sadece Acik tema secilebilir; Koyu/Sistem yakinda gelecek (sunucu 4xx doner).
const THEMES: Array<{ key: PreferencesRead["theme"]; label: string; enabled: boolean; preview: "light" | "dark" | "system" }> = [
  { key: "light", label: "Açık", enabled: true, preview: "light" },
  { key: "dark", label: "Koyu", enabled: false, preview: "dark" },
  { key: "system", label: "Sistem", enabled: false, preview: "system" },
];

// Vurgu rengi paleti — veri degeri (hex), token degil.
const ACCENT_COLORS = ["#2563eb", "#16a34a", "#8b5cf6", "#f59e0b", "#ef4444", "#0f766e", "#1e293b"];

const LOCALE_OPTIONS: Array<{ value: PreferencesRead["locale"]; label: string }> = [
  { value: "tr", label: "🇹🇷 Türkçe" },
  { value: "en", label: "🇬🇧 English" },
];

const CURRENCY_OPTIONS: Array<{ value: PreferencesRead["currency"]; label: string }> = [
  { value: "TRY", label: "₺ Türk Lirası" },
  { value: "USD", label: "$ Dolar" },
  { value: "EUR", label: "€ Euro" },
];

const DATE_FORMAT_OPTIONS = [
  { value: "DD.MM.YYYY", label: "GG.AA.YYYY" },
  { value: "YYYY-MM-DD", label: "YYYY-AA-GG" },
  { value: "MM/DD/YYYY", label: "AA/GG/YYYY" },
];

const DENSITY_OPTIONS: Array<{ value: PreferencesRead["density"]; name: string; desc: string }> = [
  { value: "comfortable", name: "Rahat", desc: "Geniş boşluklar, büyük alanlar" },
  { value: "normal", name: "Normal", desc: "Dengeli — şu anki görünüm" },
  { value: "compact", name: "Kompakt", desc: "Daha fazla bilgi, daha az boşluk" },
];

type Draft = Partial<PreferencesRead>;

// Değeri `ref`teki karşılığına eşit olan alanları taslaktan çıkarır (yeni nesne).
function dropMatching(draft: Draft, ref: object | undefined): Draft {
  const kept = Object.entries(draft).filter(([k, v]) => (ref as Record<string, unknown> | undefined)?.[k] !== v);
  return Object.fromEntries(kept) as Draft;
}

function differsFromServer(draft: Draft, server: PreferencesRead): boolean {
  return Object.keys(dropMatching(draft, server)).length > 0;
}

export function AppearanceScreen() {
  const query = usePreferences();
  const update = useUpdatePreferences();
  const qc = useQueryClient();
  const [err, setErr] = useState<string | null>(null);
  // AYR-F1 · gerçek `touched` deseni (F-İK): `draft` YALNIZ kullanıcının
  // dokunduğu alanları tutar (`{}` = dokunulmadı); gösterilen form
  // `{...sunucu, ...draft}`. Dokunulmayan alanlar hep GÜNCEL sunucu değeridir
  // — arkaplan refetch'i onları günceller, kirli formu EZMEZ (eski efekt
  // `query.data` referansı her değiştiğinde `form`u eziyordu) ve kayıt
  // gövdesi sunucunun başka alandaki değişikliğini geri yazmaz.
  const [draft, setDraft] = useState<Partial<PreferencesRead>>({});
  const form = query.data ? { ...query.data, ...draft } : null;
  // 🔴 ASYNC TABAN: taban `query.data`; GET dönmeden `draft` boş → dirty
  // FALSE. Dirty = taslakta sunucudan FARKLI en az bir alan (sunucu sonradan
  // aynı değere gelirse ya da kullanıcı eski değere dönerse kirli sayılmaz).
  const isDirty = query.data !== undefined && differsFromServer(draft, query.data);
  // 🟡 hook riski: ifade `undefined` güvenlidir, hook koşulsuz çağrılır.
  useUnsavedChanges(isDirty, "Görünüm tercihleri");

  if (query.isLoading) return <p className="settings-note">Yükleniyor…</p>;
  if (isForbidden(query.error)) return <AccessDenied />;
  if (query.isError || !query.data || !form) {
    return <p className="settings-note settings-note--error">Görünüm tercihleri yüklenemedi.</p>;
  }

  // Sunucu değerine eşit düşen alan taslaktan ÇIKAR (eski değere dönüş = dokunulmadı).
  const set = (patch: Partial<PreferencesRead>) =>
    setDraft((d) => dropMatching({ ...d, ...patch }, query.data));

  function save() {
    if (!form) return;
    setErr(null);
    const body: PreferencesUpdate = {
      locale: form.locale,
      currency: form.currency,
      date_format: form.date_format,
      density: form.density,
      accent_color: form.accent_color,
      // theme kasitli olarak gonderilmiyor — yalnizca "light" desteklenir, sunucu tarafi bunu zaten varsayilan tutar.
    };
    update.mutate(body, {
      onSuccess: (saved) => {
        // PUT yanıtı sunucunun yeni hâlidir: önbelleğe yaz (refetch dönene
        // kadar eski değer görünmesin). Taslaktan yalnız GÖNDERİLEN değerle
        // hâlâ aynı olan alanlar düşer; kayıt yoldayken değiştirilenler kalır.
        qc.setQueryData([PREFERENCES_QUERY_KEY], saved);
        setDraft((d) => dropMatching(d, body));
      },
      onError: (e) => setErr(backendErrorMessage(e)),
    });
  }

  return (
    <>
      <div className="appearance-grid">
        <SettingsCard>
          <div className="appearance-card__title">Tema</div>
          <div className="theme-cards">
            {THEMES.map((t) => {
              const active = t.enabled && form.theme === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  className={cx("theme-card", active && "theme-card--active", !t.enabled && "theme-card--disabled")}
                  disabled={!t.enabled}
                  title={!t.enabled ? "Yakında" : undefined}
                  onClick={() => t.enabled && set({ theme: t.key })}
                >
                  <div className={cx("theme-card__preview", `theme-card__preview--${t.preview}`)}>
                    <div className={cx("theme-card__bar", "theme-card__bar--sm", `theme-card__bar--${t.preview}`)} />
                    <div className={cx("theme-card__bar", "theme-card__bar--lg", `theme-card__bar--${t.preview}`)} />
                  </div>
                  <div className={cx("theme-card__label", active ? "theme-card__label--active" : "theme-card__label--muted")}>
                    {t.label}
                    {/* Seçili temanın `✓`si (F-SEM: glif değil ikon). Tek
                        başına anlam taşır — görünmez metin onu korur. */}
                    {active && (
                      <>
                        {" "}
                        <CheckIcon {...inlineSymbolProps} />
                        <span className="sr-only">(seçili)</span>
                      </>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </SettingsCard>

        <SettingsCard>
          <div className="appearance-card__title">Vurgu Rengi</div>
          {/* Kayıt 419/482 — seçim kaydediliyor ama arayüzde HİÇBİR yerde
              uygulanmıyor (CSS köprüsü yok); kullanıcı yanılmasın diye
              durum açıkça yazılır (theme-card'ların "Yakında" deseniyle
              aynı dürüstlük ilkesi). */}
          <p className="appearance-card__note">Seçiminiz kaydedilir; arayüze yansıtılması yakında gelecek.</p>
          <div className="accent-swatches">
            {ACCENT_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={`Vurgu rengi ${color}`}
                className={cx("accent-swatch", form.accent_color === color && "accent-swatch--active")}
                style={{ background: color }}
                onClick={() => set({ accent_color: color })}
              />
            ))}
          </div>
        </SettingsCard>

        <SettingsCard>
          <div className="appearance-card__title">Dil &amp; Bölge</div>
          <div className="pref-fields">
            <Field label="Arayüz Dili">
              {(control) => (
                <Select
                  {...control}
                  value={form.locale}
                  onChange={(e) => set({ locale: e.target.value as PreferencesRead["locale"] })}
                >
                  {LOCALE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Para Birimi">
              {(control) => (
                <Select
                  {...control}
                  value={form.currency}
                  onChange={(e) => set({ currency: e.target.value as PreferencesRead["currency"] })}
                >
                  {CURRENCY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Tarih Formatı">
              {(control) => (
                <Select
                  {...control}
                  value={form.date_format}
                  onChange={(e) => set({ date_format: e.target.value })}
                >
                  {DATE_FORMAT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
        </SettingsCard>

        <SettingsCard>
          <div className="appearance-card__title">Arayüz Yoğunluğu</div>
          <p className="appearance-card__note">Seçiminiz kaydedilir; arayüze yansıtılması yakında gelecek.</p>
          <div className="density-rows">
            {DENSITY_OPTIONS.map((opt) => {
              const active = form.density === opt.value;
              return (
                <label key={opt.value} className={cx("density-row", active && "density-row--active")}>
                  <input
                    type="radio"
                    name="density"
                    className="density-row__radio"
                    checked={active}
                    onChange={() => set({ density: opt.value })}
                  />
                  <div>
                    <div className="density-row__name">{opt.name}</div>
                    <div className="density-row__desc">{opt.desc}</div>
                  </div>
                </label>
              );
            })}
          </div>
        </SettingsCard>
      </div>

      {err && <p className="settings-note settings-note--error">{err}</p>}

      <div className="appearance-actions">
        <Button variant="primary" onClick={save} disabled={update.isPending}>
          Kaydet
        </Button>
      </div>
    </>
  );
}
