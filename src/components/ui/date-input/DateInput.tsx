// Taslak/secici durumu icin hook kullanir → istemci bileseni olmak ZORUNDA.
// `ui/` primitive'lerinin cogu hooksuzdur ve bu satira ihtiyac duymaz; emsal
// `ui/popover/AnchoredPopover.tsx`. 🔴 Bunu DORT KAPIDAN YALNIZ `pnpm build`
// yakalar: jsdom testleri, typecheck ve lint sorunsuz gecer, sunucu bileseni
// sinirinda derleme patlar.
"use client";

import { forwardRef, useEffect, useRef, useState } from "react";

import { cx } from "@/lib/cx";
import { formatDateDots, parseDateDots } from "@/lib/format";
import { CalendarIcon } from "@/components/ui/icons";
import type { InputSize, InputStatus } from "../input/Input";
// 🔴 CSS'i BİLEŞENİN KENDİSİ getirir. Çağırana bırakılırsa dört kapı da 5.
// kapı da GÖRMEZ (stil eksikliği DOM'u değiştirmez) — bkz.
// `subcontractor-contract-form/ContractTermsCard.tsx` başlığındaki uyarı.
import "./date-input.css";

/** TR kullanıcının gördüğü ve yazdığı kalıp. */
const DISPLAY_PLACEHOLDER = "gg.aa.yyyy";

/** Yalnız SALT TARİH ISO kabul edilir — saat taşıyan bir değer tarih değildir. */
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * ISO → TR gösterim. Kalıba UYMAYAN değer BOŞ gösterilir.
 *
 * 🔴 `formatDateDots`e doğrudan geçilseydi "2026-07-19T00:00:00" gibi bir
 * değer `19T00:00:00.07.2026` basardı: ekranda ANLAMSIZ metin. Native
 * `type="date"` böyle bir değeri boş gösterirdi; bu koruma o davranışı korur.
 */
function isoToDisplay(iso: string): string {
  return ISO_DATE_PATTERN.test(iso) ? formatDateDots(iso) : "";
}

export interface DateInputProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    // `size` burada ÖLÇÜ varyantıdır (DOM'un sayısal `size`ı değil).
    // `type` sabittir: native tarih kontrolüne dönüş biçimi geri kırardı.
    // `value`/`onChange` YERİNE ISO sözleşmesi gelir (aşağıdaki nota bak).
    // `placeholder` de KAPALI: kalıp (`gg.aa.yyyy`) girdinin sözleşmesinin bir
    // parçasıdır, süsü değil. Açık bırakılsaydı çağıranın verdiği değer
    // SESSİZCE yutulurdu (bileşen kendi kalıbını sonradan basıyor); kapalı
    // olunca derleme hatası olur.
    "size" | "type" | "value" | "onChange" | "placeholder"
  > {
  /** ISO `YYYY-MM-DD` ya da boş dize. Gösterim biçimi bu değerden TÜRETİLİR. */
  value: string;
  /**
   * ISO `YYYY-MM-DD` (ya da girdi ayrıştırılamıyorsa boş dize) döndürür.
   *
   * 🔴 NEDEN `onChange` DEĞİL: DOM olayı görünen TR metni taşır. Prop adı
   * korunsaydı mevcut `onChange={(e) => set(alan, e.target.value)}` çağrıları
   * tip denetiminden GEÇER ve "19.07.2026"yı sunucuya ISO sanarak yazardı —
   * sessiz veri bozulması. Ad değiştiği için 38 çağrı yerinin hepsi göç
   * edene kadar DERLEME HATASI verir: tip sistemi göçün bekçisidir.
   */
  onValueChange: (isoDate: string) => void;
  status?: InputStatus;
  size?: InputSize;
}

/**
 * TR biçimli tarih girdisi — `gg.aa.yyyy` gösterir, ISO `YYYY-MM-DD` taşır.
 *
 * 🔴 NEDEN NATIVE `<input type="date">` KULLANILMIYOR (F-DATE T0 ölçümü,
 * `scripts/date-locale-probe.mjs`): native kontrolün gösterim biçimi YALNIZCA
 * tarayıcının ARAYÜZ DİLİNE bağlıdır. `document.lang="tr"`, `Intl` varsayılanı
 * ve `Accept-Language` biçimi DEĞİŞTİRMEZ (kare bayt bayt aynı çıktı). Arayüz
 * dili bir OS/tarayıcı ayarıdır ve web uygulamasının ona erişimi YOKTUR —
 * yani biçim kullanıcıdan kullanıcıya değişir: İngilizce arayüzlü Chrome
 * kullanan bir TR şantiye müdürü `07/19/2026` görür.
 *
 * Hedef biçim UYDURULMADI: `projedesign/`de tarih METİN olarak 144 kez
 * yazılmış ve 144'ü de `gg.aa.yyyy`; `mm/dd/yyyy` SIFIR. Chromium da Türkçe
 * arayüzde tam olarak `19.07.2026` basar.
 *
 * Takvim seçici KORUNUR (yönetim kararı 2026-08-23): gizli bir native tarih
 * girdisi `showPicker()` ile açılır — özel takvim UI'ı ÇİZİLMEZ (mockup'ların
 * çizmediği takvim davranışları kapsam dışı).
 */
export const DateInput = forwardRef<HTMLInputElement, DateInputProps>(
  (
    {
      value,
      onValueChange,
      status = "default",
      size = "form",
      className,
      disabled,
      readOnly,
      ...rest
    },
    ref,
  ) => {
    // Kullanıcı yazarken gösterim ARA HÂLLERDEN geçer ("19.07.20") ve bunlar
    // ISO'ya çevrilemez. Taslak bu yüzden ayrı tutulur.
    const [draft, setDraft] = useState(() => isoToDisplay(value));

    // 🔴 DENETİMLİ DÖNGÜ TUZAĞI: yarım girdi "" yayınlar, ebeveyn `value`yi ""
    // yapar. Naif bir "value değişti → taslağı tazele" kuralı kullanıcının
    // yazdığını ANINDA silerdi. Bu yüzden taslağın hangi ISO'dan türediği
    // saklanır; yalnız DIŞARIDAN gelen (bizim yayınlamadığımız) değer tazeler.
    //
    // Bunu REF değil DURUM tutar: render sırasında ref'i değiştirmek eşzamanlı
    // (concurrent) render'da atılan bir render'ın izini KALICI bırakır ve
    // tazeleme sessizce atlanabilir. React'in belgelediği desen "prop değişince
    // durumu ayarla"dır (`useState` + render içinde karşılaştırma).
    const [syncedIso, setSyncedIso] = useState(value);
    if (value !== syncedIso) {
      setSyncedIso(value);
      setDraft(isoToDisplay(value));
    }

    const pickerRef = useRef<HTMLInputElement>(null);

    function emit(nextDraft: string, nextIso: string) {
      setDraft(nextDraft);
      setSyncedIso(nextIso);
      onValueChange(nextIso);
    }

    // 🔴 DTI-F1: gizli seçici YALNIZ native "change" ile işlenir. Chrome
    // popup'ında ay gezinmesi (ok/PageUp/PageDown) değeri canlı değiştirir ve
    // yalnız "input" atar; Esc de "input" ile açılış değerine döner. React'in
    // onChange'i "input"u dinler → her ay okunda emit olurdu. Gün seçimi ve
    // Enter "change" atar. Dinleyici bir kez bağlanır, güncel emit ref'ten okunur.
    const emitRef = useRef(emit);
    emitRef.current = emit;
    useEffect(() => {
      const picker = pickerRef.current;
      if (!picker) return;
      function handleChange() {
        const nextIso = picker!.value;
        emitRef.current(isoToDisplay(nextIso), nextIso);
      }
      picker.addEventListener("change", handleChange);
      return () => picker.removeEventListener("change", handleChange);
    }, []);

    // Seçici uncontrolled: taslaktan türeyen ISO değişince değeri eşitle.
    // Zaten eşitse DOKUNMA — açık popup'ın gezindiği ay bozulmasın.
    const pickerIso = parseDateDots(draft);
    useEffect(() => {
      const picker = pickerRef.current;
      if (picker && picker.value !== pickerIso) picker.value = pickerIso;
    }, [pickerIso]);

    return (
      <span className="date-input-wrap">
        <input
          {...rest}
          ref={ref}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder={DISPLAY_PLACEHOLDER}
          disabled={disabled}
          readOnly={readOnly}
          value={draft}
          onChange={(event) => emit(event.target.value, parseDateDots(event.target.value))}
          className={cx(
            "date-input",
            status !== "default" && `date-input--${status}`,
            size !== "form" && `date-input--${size}`,
            className,
          )}
        />
        {/* Gizli native kontrol YALNIZ takvim penceresini açmak için durur.
            `aria-hidden` + `tabIndex=-1`: ekran okuyucuya ikinci bir alan
            gibi görünmez ve sekme sırasına durak EKLEMEZ. `id` VERİLMEZ —
            Field'in id'si tektir ve görünen girdiye aittir. */}
        <input
          ref={pickerRef}
          type="date"
          className="date-input-picker"
          tabIndex={-1}
          aria-hidden="true"
          disabled={disabled || readOnly}
          defaultValue={pickerIso}
        />
        <button
          type="button"
          className="date-input-trigger"
          tabIndex={-1}
          aria-hidden="true"
          disabled={disabled || readOnly}
          onClick={() => pickerRef.current?.showPicker()}
        >
          <CalendarIcon />
        </button>
      </span>
    );
  },
);

DateInput.displayName = "DateInput";
