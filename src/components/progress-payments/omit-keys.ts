/** Hata sözlüğünden verilen anahtarları çıkarır; hiçbiri yoksa AYNI nesneyi döner (gereksiz render yok). */
export function omitKeys(
  errors: Readonly<Record<string, string>>,
  keys: readonly string[],
): Readonly<Record<string, string>> {
  if (!keys.some((key) => key in errors)) return errors;
  return Object.fromEntries(Object.entries(errors).filter(([key]) => !keys.includes(key)));
}
