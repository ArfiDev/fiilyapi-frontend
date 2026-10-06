import Link from "next/link";
import { ArrowRightIcon, LockIcon, inlineSymbolProps } from "@/components/ui/icons";
import { cx } from "@/lib/cx";
import type { RoleResponse } from "@/lib/api/models";
import { routes } from "@/lib/routes";
import { NEW_ROLE_KEYS } from "@/components/settings/page-access/page-access-labels";
import { ROLES_EDIT } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";

interface RoleCardProps {
  role: RoleResponse;
  onCopy: (role: RoleResponse) => void;
  onDelete: (role: RoleResponse) => void;
}

/** Sil yalnız kullanıcısı olmayan ve kilitli olmayan rolde sunulur. */
export function canDeleteRole(role: Pick<RoleResponse, "user_count" | "is_locked">): boolean {
  return !role.is_locked && role.user_count === 0;
}

export function RoleCard({ role, onCopy, onDelete }: RoleCardProps) {
  const isLocked = role.is_locked;
  // IZN-F2.x · rol sil = yalnız sistem yöneticisi; Kopyala = ayarlar.rol_yonetimi Düzenler. İkisi de bugün
  // KAPISIZ/durum kuralıdır → grant yoksa eski davranış (fallback true).
  const isSystemAdminOnly = useButtonGate({ pages: ROLES_EDIT, need: "sa" });
  const canCopyRole = useButtonGate({ pages: ROLES_EDIT, need: "edit" });
  return (
    <article className={cx("role-card", isLocked && "role-card--locked")} aria-label={role.name}>
      <div className="role-card__head">
        <span className="role-card__emoji" aria-hidden="true">
          {role.emoji}
        </span>
        <div>
          <h2 className="role-card__name">{role.name}</h2>
          <div className="role-card__count">{role.user_count} kullanıcı</div>
        </div>
        {isLocked && <LockIcon className="role-card__lock" />}
        {!isLocked && NEW_ROLE_KEYS.has(role.key) && <span className="role-card__new">Yeni</span>}
      </div>
      {isLocked ? (
        <>
          <p className="role-card__summary">her şey açık · değiştirilemez · silinemez</p>
          <p className="role-card__hint">Sistem rolü; yalnız bu rol kullanıcı, rol ve kayıt silebilir</p>
        </>
      ) : (
        <p className="role-card__summary">{role.description}</p>
      )}
      <div className="role-card__foot">
        {isLocked ? (
          <span className="role-card__locked-note">Sayfa İzinleri&apos;nde kilitli</span>
        ) : (
          <Link className="role-card__link" href={routes.settings.permissionMatrixForRole(role.id)}>
            Sayfa İzinleri&apos;ni aç <ArrowRightIcon {...inlineSymbolProps} />
          </Link>
        )}
        <div className="role-card__actions">
          {canDeleteRole(role) && isSystemAdminOnly && (
            <button
              type="button"
              className="role-card__delete"
              title="Kullanıcısı yok · yalnız Sistem Yöneticisi silebilir"
              onClick={() => onDelete(role)}
            >
              Sil
            </button>
          )}
          {canCopyRole && (
            <button type="button" className="role-card__copy" onClick={() => onCopy(role)}>
              Kopyala
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
