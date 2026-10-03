import "./catalog-shared.css";

interface SourceCodeSubProps {
  /** Bakanlık poz no'su; null/boş → HİÇBİR ŞEY basılmaz. */
  code: string | null;
  /** `screen`: tek satır + üç nokta (title ile tam kod); `print`: kırılır, title yok. */
  variant?: "screen" | "print";
  "data-testid"?: string;
}

/** Kalem adının altına küçük mono Bakanlık poz no'su (ekran + yazdırma ortak bileşeni). */
export function SourceCodeSub({ code, variant = "screen", "data-testid": testId }: SourceCodeSubProps) {
  if (code === null) return null;
  const isPrint = variant === "print";
  return (
    <span
      className={isPrint ? "source-code-sub source-code-sub--print" : "source-code-sub"}
      title={isPrint ? undefined : code}
      data-testid={testId}
    >
      {code}
    </span>
  );
}
