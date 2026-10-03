/** T47 — Bakanlık poz no'su ("15.100.1001"); yok/boş/yalnız boşluk → null (alt satır basılmaz). */
export function sourceCodeLabel(value: { source_code?: string | null }): string | null {
  const code = value.source_code?.trim();
  return code ? code : null;
}
