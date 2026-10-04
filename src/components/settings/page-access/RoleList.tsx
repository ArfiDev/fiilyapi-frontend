import { Fragment } from "react";
import { LockIcon } from "@/components/ui/icons";
import { cx } from "@/lib/cx";
import type { RoleResponse } from "@/lib/api/models";
import { NEW_ROLE_KEYS } from "./page-access-labels";
import { ROLES_EDIT } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";

interface RoleListProps {
  roles: readonly RoleResponse[];
  selectedId: string | null;
  onSelect: (roleId: string) => void;
  onCreate: () => void;
}

function userCountLabel(role: RoleResponse): string {
  return `${role.user_count} kullanıcı`;
}

/** Sol rol listesi: kilitli Sistem Yöneticisi kutusu · mevcut roller · ayraç · "Yeni" rozetli 6 rol · "+ Yeni rol". */
export function RoleList({ roles, selectedId, onSelect, onCreate }: RoleListProps) {
  // IZN-F2.x · + Yeni rol = ayarlar.rol_yonetimi Düzenler (bugün KAPISIZ → grant yoksa görünür).
  const canCreateRole = useButtonGate({ pages: ROLES_EDIT, need: "edit", fallback: true });
  const locked = roles.filter((role) => role.is_locked);
  const regular = roles.filter((role) => !role.is_locked && !NEW_ROLE_KEYS.has(role.key));
  const added = roles.filter((role) => !role.is_locked && NEW_ROLE_KEYS.has(role.key));
  return (
    <aside className="role-list" aria-label="Roller">
      <div className="role-list__label">Roller</div>
      {locked.map((role) => (
        <button
          key={role.id}
          type="button"
          aria-pressed={role.id === selectedId}
          className={cx("role-list__locked", role.id === selectedId && "role-list__locked--selected")}
          onClick={() => onSelect(role.id)}
        >
          <span className="role-list__locked-head">
            <span className="role-list__emoji" aria-hidden="true">
              {role.emoji}
            </span>
            <span>
              <span className="role-list__locked-name">{role.name}</span>
              <span className="role-list__locked-count">{userCountLabel(role)}</span>
            </span>
            <LockIcon className="role-list__lock" />
          </span>
          <span className="role-list__locked-note">her şey açık · değiştirilemez</span>
        </button>
      ))}
      {[regular, added].map((group, index) => (
        <Fragment key={index}>
          {index === 1 && group.length > 0 && regular.length > 0 && <div className="role-list__divider" />}
          {group.map((role) => (
            <button
              key={role.id}
              type="button"
              aria-pressed={role.id === selectedId}
              className={cx("role-list__item", role.id === selectedId && "role-list__item--selected")}
              onClick={() => onSelect(role.id)}
            >
              <span className="role-list__emoji" aria-hidden="true">
                {role.emoji}
              </span>
              <span className="role-list__text">
                <span className="role-list__name">{role.name}</span>
                <span className="role-list__count">{userCountLabel(role)}</span>
              </span>
              {NEW_ROLE_KEYS.has(role.key) && <span className="role-list__new">Yeni</span>}
            </button>
          ))}
        </Fragment>
      ))}
      {canCreateRole && (
        <button type="button" className="role-list__create" onClick={onCreate}>
          + Yeni rol
        </button>
      )}
    </aside>
  );
}
