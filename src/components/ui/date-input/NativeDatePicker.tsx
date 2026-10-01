// `useImperativeHandle`/`useRef` → istemci bileseni ZORUNLU (bkz.
// `DateInput.tsx` başındaki aynı not — `use-client-directive-guard` bekçisi).
"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

import "./native-date-picker.css";

export interface NativeDatePickerHandle {
  /** Native takvimi açar (`showPicker()`); yoksa/hata verirse sessizce geçer. */
  open: () => void;
}

export interface NativeDatePickerProps {
  /** Seçicinin başlangıç günü, ISO `YYYY-MM-DD`. */
  value: string;
  min?: string | null;
  max?: string | null;
  disabled?: boolean;
  /** Yalnız GEÇERLİ, sınır İÇİNDE ve `value`den FARKLI bir gün için çağrılır. */
  onPick: (day: string) => void;
}

/**
 * GIR-F1 · `DateInput.tsx`teki "gizli native `type=date` + `showPicker()`"
 * deseninin yeniden kullanılabilir çekirdeği (yönetim kararı 2026-08-23:
 * takvim seçici korunur, özel takvim UI'ı çizilmez).
 *
 * `DateInput`ten FARKI: `DateInput`in kendi "taslak" (draft) durumu ve
 * TR-gösterim senkronizasyonu VAR — bu primitive öyle bir sözleşme taşımaz,
 * yalnız ISO gün alır/verir. `DateInput`e bu primitive'i taşımak RİSKLİ
 * görüldü (40+ mevcut test, draft senkronizasyon davranışı ince) ve bu emrin
 * kapsamı DIŞINDA tutuldu — bkz. GIR-F1 raporu.
 *
 * 🔴 NEDEN GUARD KODDA (native `min`/`max` özniteliğine GÜVENİLMEZ): jsdom
 * `fireEvent.change` ile yazılan sınır-dışı bir değeri REDDETMEZ (tarayıcı
 * form-doğrulaması jsdom'da simüle edilmez). `min`/`max` özniteliği yine de
 * geçilir (gerçek tarayıcıda takvim SEÇİLEMEYEN günleri devre dışı gösterir),
 * ama `onPick` çağrısının kendisi ayrıca burada denetlenir.
 */
export const NativeDatePicker = forwardRef<NativeDatePickerHandle, NativeDatePickerProps>(
  ({ value, min, max, disabled, onPick }, ref) => {
    const inputRef = useRef<HTMLInputElement>(null);

    useImperativeHandle(ref, () => ({
      open() {
        try {
          inputRef.current?.showPicker?.();
        } catch {
          // `showPicker()` kullanıcı etkinliği (user activation) olmadan
          // çağrılırsa ya da tarayıcı desteklemiyorsa fırlatabilir.
          //
          // 🔴 focus()+click() DÜŞÜŞÜ EKLENMEDİ (ölçülüp gerekçelendirildi):
          // script'ten çağrılan `.click()` input[type=date] için GÜVENİLİR
          // (trusted) bir tıklama SAYILMAZ — tarayıcılar native takvim
          // panelini yalnız gerçek kullanıcı tıklamasında ya da `showPicker()`
          // API'siyle açar (API'nin var oluş nedeni tam bu: script'in bir
          // kullanıcı hareketi İÇİNDE takvimi açabilmesi). `.focus()` ise
          // gizli (`aria-hidden` + 1x1 + `opacity:0`) girdiyi görünmez şekilde
          // odaklar — hiçbir görsel/işlevsel fayda sağlamaz, yalnız
          // erişilebilirlik ağacında sessiz bir odak sıçraması yaratır. Bu
          // yüzden hata burada YUTULUR, düğmenin kendisi zaten görünür ve
          // tıklanabilir kalır (kullanıcı gizli girdiyi kullanmaz).
        }
      },
    }));

    // Güncel guard girdileri; dinleyici bir kez bağlanır, her render'da yeniden değil.
    const latest = useRef({ value, min, max, onPick });
    latest.current = { value, min, max, onPick };

    // 🔴 GRP-F1: seçim YALNIZ native `change` olayında işlenir. Chrome'un takvim
    // popup'ı ay okunda girdinin değerini canlı günceller ve `input` olayı atar;
    // React'in `onChange`i `input`u dinler → `onPick` ay gezinmesinde çağrılıyor,
    // rota değişip popup kapanıyordu. `change` yalnız gün seçilince/popup
    // kapanınca gelir.
    useEffect(() => {
      const input = inputRef.current;
      if (!input) return;
      function handleChange() {
        const { value: current, min: lo, max: hi, onPick: pick } = latest.current;
        const next = input!.value;
        if (!next) return;
        if (lo != null && next < lo) return;
        if (hi != null && next > hi) return;
        if (next === current) return;
        pick(next);
      }
      input.addEventListener("change", handleChange);
      return () => input.removeEventListener("change", handleChange);
    }, []);

    // Uncontrolled (`defaultValue`): `value`+`onChange` olmadan React "kontrollü
    // girdi" uyarısı verir, `value`+`onChange` ise `input` olayını yeniden
    // bağlar. Dış `value` değişince değer elle senkronlanır; aynıysa dokunulmaz
    // (açık popup'ın gezindiği ayı bozmamak için).
    useEffect(() => {
      const input = inputRef.current;
      if (input && input.value !== value) input.value = value;
    }, [value]);

    return (
      <input
        ref={inputRef}
        type="date"
        className="native-date-picker"
        tabIndex={-1}
        aria-hidden="true"
        disabled={disabled}
        min={min ?? undefined}
        max={max ?? undefined}
        defaultValue={value}
      />
    );
  },
);

NativeDatePicker.displayName = "NativeDatePicker";
