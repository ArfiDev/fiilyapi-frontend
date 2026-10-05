import { cx } from "@/lib/cx";
import { HIDDEN_FIELD_HINT } from "@/lib/auth/hidden-fields";

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
