/**
 * DSC-F1.2 · Avatar menüsündeki "Disiplin: …" satırının TEK metin kaynağı.
 *
 * B0b sonrası `/auth/me.disciplines` `DisciplineRef[]`dir ({id, code, name, color}).
 * Adlar Türkçe birleştirilir: "A" · "A ve B" · "A, B ve C". Kural PR2'deki
 * `joinDisciplineNames` ile AYNIDIR (PR2 başka dalda — kopya değil aynı kural;
 * PR2 rebase'inde tek ortak yardımcıya indirilebilir).
 */
export interface DisciplineLike {
  readonly name: string;
  readonly color: string;
}

export interface DisciplineSummary {
  /** "Tümü (kısıtsız)" ya da birleştirilmiş adlar. */
  readonly label: string;
  /** Nokta rengi: TEK disiplinde onun `color`ı (backend verisi, inline style); aksi hâlde `null` = nötr token. */
  readonly color: string | null;
}

export function joinDisciplineNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} ve ${names[names.length - 1]}`;
}

export function summarizeDisciplines(disciplines: readonly DisciplineLike[] | undefined): DisciplineSummary {
  const list = disciplines ?? [];
  if (list.length === 0) return { label: "Tümü (kısıtsız)", color: null };
  return {
    label: joinDisciplineNames(list.map((d) => d.name)),
    color: list.length === 1 ? list[0].color : null,
  };
}
