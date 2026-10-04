"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Select } from "@/components/ui";
import { CheckIcon, inlineSymbolProps } from "@/components/ui/icons";
import { SettingsCard } from "@/components/settings/primitives/SettingsCard";
import { roleVisual } from "@/components/settings/primitives/role-visuals";
import { useModules } from "@/lib/api/hooks/useModules";
import { useRoles } from "@/lib/api/hooks/useRoles";
import { useAllRolePermissions } from "@/lib/api/hooks/useRolePermissions";
import { usePermissionMutation } from "@/lib/api/hooks/usePermissionMutation";
import {
  PRESETS,
  PRESET_DESCRIPTIONS,
  matchPreset,
  presetToUpdate,
  type PresetKey,
} from "@/lib/api/permission-presets";
import { isForbidden } from "@/lib/api/unwrap";
import { backendErrorMessage } from "@/lib/api/error-message";
import { cx } from "@/lib/cx";
import { AccessDenied } from "../AccessDenied";
import type { ModuleGroup, ModuleResponse, PermissionCell } from "@/lib/api/models";
import "../settings.css";
import "./permission-matrix.css";

const SYSTEM_ADMIN_KEY = "system_admin";

const GROUP_ORDER: ModuleGroup[] = ["GENEL", "SAHA", "STOK_SATINALMA", "MALI", "SISTEM"];
const GROUP_LABELS: Record<ModuleGroup, string> = {
  GENEL: "Genel",
  SAHA: "Saha",
  STOK_SATINALMA: "Stok & Satınalma",
  MALI: "Mali",
  SISTEM: "Sistem",
};

function groupModules(modules: ModuleResponse[]): { group: ModuleGroup; items: ModuleResponse[] }[] {
  return GROUP_ORDER.map((group) => ({
    group,
    items: modules.filter((m) => m.group === group).sort((a, b) => a.sort_order - b.sort_order),
  })).filter((section) => section.items.length > 0);
}

export function PermissionMatrix() {
  const router = useRouter();
  const modulesQuery = useModules();
  const rolesQuery = useRoles();

  // IZN-F1.2 — atanamaz roller (yeni sayfa-izin rolleri) eski matriste sütun olmaz;
  // yalnız `is_assignable` okunur, rol anahtarı elle kodlanmaz.
  const roles = (rolesQuery.data ?? []).filter((role) => role.is_assignable !== false);
  const roleIds = roles.map((role) => role.id);
  const permQueries = useAllRolePermissions(roleIds);
  const mutation = usePermissionMutation();
  const [cellError, setCellError] = useState<string | null>(null);

  // Kayıt 281 — `permQueries` (rol başına izin hücreleri) bu bekleyişe
  // dahil değildi: modüller+roller gelir gelmez matris etkileşime açılıyor,
  // henüz yüklenmemiş roller için hücreler `[]`e düşüyor ve kullanıcı GERÇEK
  // değeri görmeden yazabiliyordu.
  if (modulesQuery.isLoading || rolesQuery.isLoading || permQueries.some((q) => q.isLoading)) {
    return <p className="settings-note">Yükleniyor…</p>;
  }
  const permForbidden = permQueries.some((q) => isForbidden(q.error));
  if (isForbidden(modulesQuery.error) || isForbidden(rolesQuery.error) || permForbidden) {
    return <AccessDenied />;
  }
  if (modulesQuery.isError || rolesQuery.isError || !modulesQuery.data || !rolesQuery.data) {
    return <p className="settings-note settings-note--error">İzin matrisi yüklenemedi.</p>;
  }

  // rol_id -> (module_key -> hucre) haritasi
  const permByRole: Record<string, Record<string, PermissionCell>> = {};
  roleIds.forEach((roleId, index) => {
    const cells = permQueries[index]?.data ?? [];
    const map: Record<string, PermissionCell> = {};
    for (const cell of cells) map[cell.module_key] = cell;
    permByRole[roleId] = map;
  });

  const sections = groupModules(modulesQuery.data);

  function currentPresetKey(roleId: string, moduleKey: string): PresetKey | "" {
    const cell = permByRole[roleId]?.[moduleKey];
    const level = cell?.access_level ?? "none";
    const scope = cell?.scope ?? "all";
    return matchPreset(level, scope)?.key ?? "";
  }

  function handleChange(roleId: string, moduleKey: string, value: string) {
    if (value === "") return;
    setCellError(null);
    mutation.mutate(
      { roleId, moduleKey, update: presetToUpdate(value as PresetKey) },
      { onError: (e) => setCellError(backendErrorMessage(e)) },
    );
  }

  return (
    <div className="matrix-wrap">
      <section className="matrix-legend" aria-labelledby="matrix-legend-title">
        <p id="matrix-legend-title" className="matrix-legend__title">
          Erişim düzeyleri
        </p>
        <p className="matrix-legend__hint">
          Her hücre, rolün o modülde ne yapabileceğini belirler. Silme yalnızca “Süper” düzeyindedir.
        </p>
        <dl className="matrix-legend__list">
          {PRESETS.map((preset) => (
            <div key={preset.key} className="matrix-legend__item">
              <dt className="matrix-legend__term">{preset.label}</dt>
              <dd className="matrix-legend__desc">{PRESET_DESCRIPTIONS[preset.key]}</dd>
            </div>
          ))}
        </dl>
      </section>

      {cellError && <p className="settings-note settings-note--error">{cellError}</p>}

      <SettingsCard bodyPad="flush">
        <div className="matrix-scroll">
          <table className="matrix-table">
            <thead>
              <tr>
                <th className="matrix-col-head">Modül / Sayfa</th>
                {roles.map((role) => (
                  <th
                    key={role.id}
                    className="matrix-role-head"
                    style={{ color: roleVisual(role.key).headText }}
                  >
                    <span className="matrix-role-head__emoji" aria-hidden="true">
                      {role.emoji}
                    </span>
                    {role.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sections.map((section) => (
                <Fragment key={section.group}>
                  <tr
                    className={
                      section.group === "GENEL" ? "matrix-group-row--dark" : "matrix-group-row--muted"
                    }
                  >
                    <th colSpan={roles.length + 1}>{GROUP_LABELS[section.group]}</th>
                  </tr>
                  {section.items.map((module) => (
                    <tr key={module.id}>
                      <th className="matrix-module-name" scope="row">
                        {module.name}
                      </th>
                      {roles.map((role) => {
                        const presetKey = currentPresetKey(role.id, module.key);
                        const readOnly = role.key === SYSTEM_ADMIN_KEY;
                        if (readOnly) {
                          const label = PRESETS.find((p) => p.key === presetKey)?.label ?? "Özel";
                          const isFull = presetKey === "super" || presetKey === "full";
                          return (
                            <td
                              key={role.id}
                              className={cx("matrix-cell--readonly", isFull && "matrix-cell--full")}
                            >
                              {/* `✓` glif değil ikondur (F-SEM); "tam
                                  erişim" anlamı ikonun YANINDAKİ etikette
                                  zaten yazılıdır, bilgi kaybı yok. */}
                              {isFull && (
                                <>
                                  <CheckIcon {...inlineSymbolProps} />{" "}
                                </>
                              )}
                              {label}
                            </td>
                          );
                        }
                        return (
                          <td key={role.id}>
                            <Select
                              aria-label={`${module.name} — ${role.name}`}
                              value={presetKey}
                              onChange={(e) => handleChange(role.id, module.key, e.target.value)}
                            >
                              {presetKey === "" && (
                                <option value="" disabled>
                                  Özel
                                </option>
                              )}
                              {PRESETS.map((preset) => (
                                <option key={preset.key} value={preset.key}>
                                  {preset.label}
                                </option>
                              ))}
                            </Select>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </SettingsCard>

      {/* Kozmetik eylem çubuğu: matris zaten hücre bazında otomatik kaydediyor (usePermissionMutation). */}
      <div className="matrix-actions">
        <Button variant="secondary" onClick={() => router.back()}>
          İptal
        </Button>
        <Button variant="primary" onClick={() => router.refresh()}>
          Değişiklikleri Kaydet
        </Button>
      </div>
    </div>
  );
}
