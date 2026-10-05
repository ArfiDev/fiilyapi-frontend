import { cx } from "@/lib/cx";
import { HIDDEN_FIELD_HINT } from "@/lib/auth/hidden-fields";
import { shouldShowHiddenMark } from "@/lib/auth/masked-values";

import { LockIcon, inlineSymbolProps } from "../icons";
import "./hidden-mark.css";

export interface HiddenMarkProps {
  /** Kilidin yanında ipucu metni de görünsün (form alanı altı); kart/hücre değerinde yalnız simge + `title`. */
  withText?: boolean;
  className?: string;
}

/**
 * IZN-F4.2 — "bu bilgi rolünüz için gizli" işareti: küçük kilit + ipucu ("Bu bilgi rolünüz için gizli").
 * Backend alanı maskeler (değer `null`); bu işaret ekrana "—"nin NEDENİNİ söyler. Gizleme kararı
 * burada VERİLMEZ — çağıran yalnız maske gerçekten varken (`isCategoryHidden` ya da zarfın 3. hâli) basar.
 * Simge `aria-hidden`; erişilebilir metin her zaman var (`sr-only` ya da görünür).
 */
export function HiddenMark({ withText = false, className }: HiddenMarkProps) {
  return (
    <span className={cx("hidden-mark", withText && "hidden-mark--text", className)} title={HIDDEN_FIELD_HINT} data-testid="hidden-mark">
      <LockIcon {...inlineSymbolProps} aria-hidden="true" />
      <span className={withText ? "hidden-mark__text" : "sr-only"}>{HIDDEN_FIELD_HINT}</span>
    </span>
  );
}

export interface MaskedMarkProps {
  /** `useCategoryHidden(...)` sonucu. */
  isHidden: boolean;
  /** Bu işaretin açıkladığı değer(ler); en az biri `null` ise (maskeli) kilit basılır. */
  values: readonly (string | number | null | undefined)[];
  withText?: boolean;
}

/**
 * IZN-F4b.2 — başlık/kart için TEK kilit: kategori gizli VE değerlerden biri `null` ise basılır;
 * değer doluysa ya da kategori gizli değilse (`null` = veri yok) hiçbir şey basmaz.
 */
export function MaskedMark({ isHidden, values, withText = false }: MaskedMarkProps) {
  if (!shouldShowHiddenMark(isHidden, values)) return null;
  return <HiddenMark withText={withText} />;
}

/**
 * IZN-F4b.2 — başlıksız listeler (satır kartları) için TEK kilit notu: kategori gizli VE değerlerden
 * biri `null` ise listenin üstünde "Bu bilgi rolünüz için gizli" basılır; her satıra kilit konmaz.
 */
export function MaskedNote({ isHidden, values }: Omit<MaskedMarkProps, "withText">) {
  if (!shouldShowHiddenMark(isHidden, values)) return null;
  return (
    <p className="hidden-mark-note" data-testid="hidden-mark-note">
      <HiddenMark withText />
    </p>
  );
}
