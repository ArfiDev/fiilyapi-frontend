import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import { HiddenMark } from "./HiddenMark";

export interface MaskedReadonlyFieldProps {
  label: string;
  className?: string;
  inputClassName?: string;
  testId?: string;
}

/**
 * IZN-F4d.2 — maskeli form alanı: salt okunur "—" + kilit ("Bu bilgi rolünüz için gizli"). Çağıran, alanı PATCH
 * gövdesine KOYMAZ (dolu gizli alan 403). Kullanım koşulu: kategori gizli VE sunucu değeri `null` (`MaskedMark` kuralı).
 */
export function MaskedReadonlyField({ label, className, inputClassName, testId }: MaskedReadonlyFieldProps) {
  return (
    <Field label={label} className={className} hint={<HiddenMark withText />}>
      {(control) => <Input {...control} readOnly disabled value="—" className={inputClassName} data-testid={testId} />}
    </Field>
  );
}
