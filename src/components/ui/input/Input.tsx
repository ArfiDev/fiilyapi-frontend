import { forwardRef } from "react";
import { cx } from "@/lib/cx";
import "./input.css";

export type InputStatus = "default" | "error" | "success";

/**
 * Kontrol ölçüsü. `"form"` (varsayılan) tam sayfa form kontrolüdür (mockup
 * `.f-in`); `"row"` satır-içi düzenleme tablosu kontrolüdür (mockup `.row-in`,
 * şantiye formu satır 27) — bölüm tablosu, BOQ, hakediş kalemleri.
 */
export type InputSize = "form" | "row";

// DOM'un kendi `size` ozniteligi (number) gizlenir: bu primitive'de `size`
// olcu varyantidir. Omit olmadan iki tanim cakisir.
export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  status?: InputStatus;
  size?: InputSize;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  numeric?: boolean;
  /** Metin son eki (`rightIcon` = "gün") için ayrılacak karakter sayısı; sayı son ekin altına girmez. */
  suffixChars?: number;
  /**
   * KAYIT 373: `className` yalnız iç `<input>`e gider (`.input-wrap` sabit
   * `width: 100%` taşır) — yerleşim sınıfı (ör. flex öğesi genişliği) vermek
   * isteyen çağıran yanlış elemana inerdi. Bu prop DIŞ `<span>`e uygulanır;
   * eklenmesi eski `className` davranışını DEĞİŞTİRMEZ (geriye uyumlu, opt-in).
   */
  wrapperClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      status = "default",
      size = "form",
      leftIcon,
      rightIcon,
      numeric,
      suffixChars,
      className,
      wrapperClassName,
      ...rest
    },
    ref,
  ) => (
    <span
      className={cx(
        "input-wrap",
        Boolean(leftIcon) && "input-wrap--left",
        Boolean(rightIcon) && "input-wrap--right",
        Boolean(rightIcon) && suffixChars !== undefined && "input-wrap--suffix",
        wrapperClassName,
      )}
      style={suffixChars === undefined ? undefined : ({ "--input-suffix-chars": suffixChars } as React.CSSProperties)}
    >
      {leftIcon && <span className="input-icon input-icon--left">{leftIcon}</span>}
      <input
        ref={ref}
        className={cx(
          "input",
          status !== "default" && `input--${status}`,
          size !== "form" && `input--${size}`,
          numeric && "input--numeric",
          className,
        )}
        {...rest}
      />
      {rightIcon && <span className="input-icon input-icon--right">{rightIcon}</span>}
    </span>
  ),
);

Input.displayName = "Input";
