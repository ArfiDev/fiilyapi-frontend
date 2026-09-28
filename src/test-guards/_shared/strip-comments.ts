/**
 * SEKME-F1.3b · Bekçiler arası paylaşılan yorum-soyma yardımcısı.
 *
 * `unsaved-changes-inventory.test.ts` ve `unsaved-changes-forms.test.ts`
 * aynı deseni kullanıyordu (yoruma yazılan sahte çağrı bekçiyi yanıltmasın).
 * DRY: davranış AYNI, tek kaynağa taşındı.
 */
export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}
