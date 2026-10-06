"use client";

import { useRef, useState } from "react";
import { Button, Checkbox, Field, Input, Select } from "@/components/ui";
import { Modal } from "@/components/settings/Modal";
import { ConfirmDialog } from "@/components/settings/ConfirmDialog";
import { PasswordResetModal } from "@/components/settings/PasswordResetModal";
import { UserAvatar } from "@/components/settings/primitives/UserAvatar";
import { useSession } from "@/components/shell/SessionProvider";
import { useRoles } from "@/lib/api/hooks/useRoles";
import { useCanReadRoles } from "@/lib/auth/useCanReadRoles";
import { useProjects, PROJECT_LIST_MAX_LIMIT } from "@/lib/api/hooks/useProjects";
import { useEvDisciplines } from "@/lib/api/hooks/useEvDisciplines";
import { useUserAccess, useSetUserAccess } from "@/lib/api/hooks/useUserAccess";
import { useCreateUser, useDeleteUser, useUpdateUser } from "@/lib/api/hooks/useUserMutations";
import { backendErrorMessage } from "@/lib/api/error-message";
import { useButtonGate } from "@/lib/auth/usePagePermission";
import { USERS_EDIT } from "@/lib/auth/page-gates";
import { statusLabel } from "@/lib/settings/status";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";
import type { DisciplineRef, UserResponse, UserStatus } from "@/lib/api/models";
import { ProjectTeamTable } from "./ProjectTeamTable";
import { SYSTEM_ADMIN_ROLE_KEY, selectableRoles } from "./user-access-roles";
import {
  EMPTY_ACCESS_DRAFT,
  draftFromAccess,
  isSameAccess,
  toAccessInput,
  validateAccess,
  withAllProjects,
  withRole,
  type AccessDraft,
} from "./user-access-draft";
import "@/components/settings/discipline-assignment.css"; // .dsc-info ortak
import "./user-access-modal.css";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;
const STATUSES: readonly UserStatus[] = ["active", "on_leave", "passive"];

interface UserAccessModalProps {
  /** Verilirse DÜZENLE; verilmezse YENİ KULLANICI (POST /users, ardından PUT /users/{id}/access). */
  user?: UserResponse;
  onClose: () => void;
}

type SubDialog = "password" | "delete" | null;

/**
 * IZN-F3.2 · Kullanıcıyı düzenle / ekle (mockup "Ayarlar - Kullanıcılar (TASLAK)" Durum 2-3).
 *
 * Ana rol + "Tüm projelere erişir" + proje ekibi (proje başına rol ve disiplin) TEK taslakta tutulur;
 * Kaydet = tek `PUT /users/{id}/access` (ATOMİK) + ad/unvan/durum değiştiyse `PATCH /users/{id}`.
 * Sunucu taslağı `draft === null` iken GÖSTERİLİR (efektle tohumlama yok); dokununca taslak kendi
 * durumudur, yeniden getirme onu EZMEZ.
 */
export function UserAccessModal({ user, onClose }: UserAccessModalProps) {
  const isEdit = user !== undefined;
  const { me, refresh } = useSession();
  const rolesQuery = useRoles(useCanReadRoles());
  const projectsQuery = useProjects({ limit: PROJECT_LIST_MAX_LIMIT });
  const disciplinesQuery = useEvDisciplines();
  const accessQuery = useUserAccess(user?.id ?? "");
  const setAccess = useSetUserAccess();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();
  // Parola sıfırlama: bugünkü SA kapısı (IZN-F2.x). Silme ise FAIL-CLOSED: yalnız `me.is_system_admin === true`.
  const canResetPassword = useButtonGate({ pages: USERS_EDIT, need: "sa", fallback: true });
  const isSystemAdmin = me?.is_system_admin === true;
  const canDelete = isSystemAdmin;
  // GECE KARARI (IZN-F3.1e): kişi KENDİ kaydını açtıysa ve Sistem Yöneticisi değilse erişim alanları salt okunur
  // (backend: "kendi erişimini değiştiremez"). Unvan/durum bugünkü gibi.
  const isAccessLocked = user !== undefined && me?.id === user.id && !isSystemAdmin;

  const [draft, setDraft] = useState<AccessDraft | null>(null);
  const [title, setTitle] = useState(user?.title ?? "");
  const [status, setStatus] = useState<UserStatus>(user?.status ?? "active");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [createdUser, setCreatedUser] = useState<UserResponse | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [subDialog, setSubDialog] = useState<SubDialog>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const initialRef = useRef({ title: user?.title ?? "", status: user?.status ?? "active" });

  const baseline: AccessDraft | null = isEdit
    ? accessQuery.data
      ? draftFromAccess(accessQuery.data)
      : null
    : EMPTY_ACCESS_DRAFT;
  const current = draft ?? baseline;
  const isLoadingAccess = isEdit && baseline === null;

  const hasAccessChange = draft !== null && baseline !== null && !isSameAccess(draft, baseline);
  const hasProfileChange = title !== initialRef.current.title || status !== initialRef.current.status;
  const hasIdentityInput = !isEdit && (fullName !== "" || email !== "" || password !== "");
  const isDirty = hasAccessChange || hasProfileChange || hasIdentityInput;
  useUnsavedChanges(isDirty, "Kullanıcı");

  const isPending = setAccess.isPending || createUser.isPending || updateUser.isPending || deleteUser.isPending;
  const roles = rolesQuery.data;
  const mainRoleName = roles?.find((role) => role.id === current?.roleId)?.name;
  // Ana rolü Sistem Yöneticisi olan kişide ekip satırı OLMAZ (backend 422): tablo yerine not; gönderimde ekip boş.
  const isSystemAdminRole = roles?.find((role) => role.id === current?.roleId)?.key === SYSTEM_ADMIN_ROLE_KEY;
  const roleKey = roles?.find((role) => role.id === (user?.role_id ?? ""))?.key ?? "";
  const catalog: DisciplineRef[] = (disciplinesQuery.data ?? []).map(({ id, code, name, color }) => ({ id, code, name, color }));
  const isIdentityLocked = createdUser !== null;

  // Alt diyalog açıkken Escape/arka plan tıklaması ana modalı KAPATMAZ (Modal dinleyicisi belgeye bağlıdır).
  function requestClose() {
    if (subDialog !== null || isPending) return;
    onClose();
  }

  function patchDraft(next: AccessDraft) {
    setFormError(null);
    setDraft(next);
  }

  function validateCreate(access: AccessDraft): string | null {
    if (!fullName.trim()) return "Ad soyad zorunludur.";
    if (!EMAIL_RE.test(email)) return "Geçerli bir e-posta girin.";
    if (password.length < MIN_PASSWORD) return `Parola en az ${MIN_PASSWORD} karakter olmalıdır.`;
    return validateAccess(access);
  }

  async function saveCreate(access: AccessDraft) {
    let target = createdUser;
    if (target === null) {
      try {
        target = await createUser.mutateAsync({
          email,
          password,
          full_name: fullName.trim(),
          title,
          role_id: access.roleId,
          status,
        });
        setCreatedUser(target);
      } catch (error) {
        setFormError(backendErrorMessage(error));
        return;
      }
    }
    try {
      await setAccess.mutateAsync({ id: target.id, body: toAccessInput(access) });
    } catch (error) {
      setFormError(`Kullanıcı oluşturuldu, ancak erişim kaydedilemedi: ${backendErrorMessage(error)}`);
      return;
    }
    onClose();
  }

  async function saveEdit(target: UserResponse, access: AccessDraft) {
    const savesAccess = hasAccessChange && !isAccessLocked;
    if (savesAccess) {
      try {
        await setAccess.mutateAsync({ id: target.id, body: toAccessInput(access) });
      } catch (error) {
        setFormError(backendErrorMessage(error));
        return;
      }
    }
    if (hasProfileChange) {
      try {
        await updateUser.mutateAsync({
          id: target.id,
          body: {
            ...(title !== initialRef.current.title ? { title } : {}),
            ...(status !== initialRef.current.status ? { status } : {}),
          },
        });
      } catch (error) {
        const reason = backendErrorMessage(error);
        setFormError(savesAccess ? `Erişim kaydedildi, ancak unvan/durum kaydedilemedi: ${reason}` : reason);
        return;
      }
    }
    // Kendi erişimini değiştiren yönetici: kabuktaki `me` (menü, izin kapıları) tazelenir.
    if (savesAccess && me?.id === target.id) void refresh?.();
    onClose();
  }

  async function submit() {
    if (current === null || isPending) return;
    setFormError(null);
    const access: AccessDraft = isSystemAdminRole ? { ...current, members: [] } : current;
    if (!isEdit) {
      const problem = validateCreate(access);
      if (problem) return setFormError(problem);
      return saveCreate(access);
    }
    const problem = validateAccess(access);
    if (problem) return setFormError(problem);
    return saveEdit(user, access);
  }

  function confirmDelete() {
    if (!user) return;
    setDeleteError(null);
    deleteUser.mutate(user.id, {
      onSuccess: onClose,
      onError: (error) => setDeleteError(backendErrorMessage(error)),
    });
  }

  const subtitle = isEdit ? `${user.full_name} · ${user.title || (mainRoleName ?? "")}` : undefined;
  const isUserCreatedButUnsaved = createdUser !== null && formError !== null;

  return (
    <>
      <Modal
        title={isEdit ? "Kullanıcıyı düzenle" : "Yeni kullanıcı"}
        subtitle={subtitle}
        leading={isEdit ? <UserAvatar roleKey={roleKey} name={user.full_name} /> : undefined}
        className="uac-modal"
        onClose={requestClose}
        footer={
          <>
            {isEdit && (
              <>
                <Button
                  variant="secondary"
                  className="uac-btn-warn"
                  disabled={isPending}
                  onClick={() => setStatus(status === "passive" ? "active" : "passive")}
                >
                  {status === "passive" ? "Aktifleştir" : "Pasifleştir"}
                </Button>
                {canResetPassword && (
                  <Button variant="ghost" disabled={isPending} onClick={() => setSubDialog("password")}>
                    Parola sıfırla
                  </Button>
                )}
                {canDelete && (
                  <span className="uac-footer__delete">
                    <Button variant="secondary" className="uac-btn-danger" disabled={isPending} onClick={() => setSubDialog("delete")}>
                      Sil
                    </Button>
                    <span className="uac-footer__note">yalnız Sistem Yöneticisi</span>
                  </span>
                )}
              </>
            )}
            <span className="uac-footer__spacer" />
            <Button variant="secondary" onClick={requestClose} disabled={isPending}>
              Vazgeç
            </Button>
            <Button variant="primary" className="uac-footer__save" onClick={submit} disabled={isPending || current === null}>
              {isPending ? "Kaydediliyor…" : "Kaydet"}
            </Button>
          </>
        }
      >
        <div className="uac-body">
          <div className="uac-row">
            <Field label={isEdit ? <>Ad Soyad <span className="uac-readonly">· salt okunur</span></> : "Ad Soyad"} required={!isEdit}>
              {(control) => (
                <Input
                  {...control}
                  value={isEdit ? user.full_name : fullName}
                  readOnly={isEdit}
                  disabled={isIdentityLocked}
                  onChange={(event) => setFullName(event.target.value)}
                />
              )}
            </Field>
            <Field label={isEdit ? <>E-posta <span className="uac-readonly">· salt okunur</span></> : "E-posta"} required={!isEdit}>
              {(control) => (
                <Input
                  {...control}
                  type={isEdit ? "text" : "email"}
                  value={isEdit ? user.email : email}
                  readOnly={isEdit}
                  disabled={isIdentityLocked}
                  onChange={(event) => setEmail(event.target.value)}
                />
              )}
            </Field>
            {!isEdit && (
              <Field label="Parola" required hint={`En az ${MIN_PASSWORD} karakter.`}>
                {(control) => (
                  <Input
                    {...control}
                    type="password"
                    value={password}
                    disabled={isIdentityLocked}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                )}
              </Field>
            )}
          </div>

          <div className="uac-row uac-row--role">
            <Field label="Ana rol" required hint="Şirket geneli sayfalar (Muhasebe, İK, Ayarlar vb.) bu rolle açılır.">
              {(control) => (
                <Select
                  {...control}
                  value={current?.roleId ?? ""}
                  disabled={current === null || isIdentityLocked || isAccessLocked}
                  onChange={(event) => current && patchDraft(withRole(current, event.target.value))}
                >
                  <option value="">Seçin…</option>
                  {selectableRoles(roles, baseline?.roleId ?? user?.role_id ?? "", false, isSystemAdmin).map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Unvan">
              {(control) => (
                <Input {...control} value={title} disabled={isIdentityLocked} onChange={(event) => setTitle(event.target.value)} />
              )}
            </Field>
            <Field label="Durum">
              {(control) => (
                <Select
                  {...control}
                  value={status}
                  disabled={isIdentityLocked}
                  onChange={(event) => setStatus(event.target.value as UserStatus)}
                >
                  {STATUSES.map((value) => (
                    <option key={value} value={value}>
                      {statusLabel(value)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>

          <label className={current?.allProjects ? "uac-all uac-all--on" : "uac-all"}>
            <Checkbox
              checked={current?.allProjects ?? false}
              // GECE KARARI: "Tüm projelere erişir" yalnız Sistem Yöneticisi değiştirir; değer görünür kalır.
              disabled={current === null || !isSystemAdmin || isAccessLocked}
              onChange={(event) => current && patchDraft(withAllProjects(current, event.target.checked))}
            />
            <span className="uac-all__text">
              <span className="uac-all__title">Tüm projelere erişir</span>
              <span className="uac-all__desc">
                İşaretlenirse kişi bütün projeleri görür; proje tablosu kullanılmaz ve disiplin kısıtı olmaz.
              </span>
              {!isSystemAdmin && <span className="uac-all__hint">yalnız Sistem Yöneticisi</span>}
            </span>
          </label>

          {isLoadingAccess && !accessQuery.isError && <p className="settings-note">Yükleniyor…</p>}
          {isLoadingAccess && accessQuery.isError && (
            <p className="settings-note settings-note--error" role="alert">
              Erişim bilgisi yüklenemedi.{" "}
              <button type="button" className="uac-link" onClick={() => void accessQuery.refetch()}>
                Tekrar dene
              </button>
            </p>
          )}

          {current?.allProjects && (
            <div className="uac-all-box">
              <span className="uac-all-box__title">Tüm projelere erişir · disiplin kısıtı yok</span>
              <span className="uac-all-box__text">
                Yeni açılan projeleri de otomatik görür. Proje başına rol ve disiplin tablosu kullanılmaz; proje içi
                sayfalar da ana rolle{mainRoleName ? ` (${mainRoleName})` : ""} açılır.
              </span>
            </div>
          )}

          {isAccessLocked && (
            <div className="dsc-info" role="note">
              <span className="dsc-info__mark" aria-hidden="true">
                i
              </span>
              <span>Kendi erişiminizi değiştiremezsiniz · Sistem Yöneticisi değiştirir</span>
            </div>
          )}

          {current !== null && !current.allProjects && isSystemAdminRole && (
            <div className="uac-all-box">
              <span className="uac-all-box__title">Sistem Yöneticisi tüm projelere erişir</span>
              <span className="uac-all-box__text">Bu rolde proje ekibi tutulmaz; proje içi sayfalar da ana rolle açılır.</span>
            </div>
          )}

          {current !== null && !current.allProjects && !isSystemAdminRole && (
            <>
              <ProjectTeamTable
                draft={current}
                roles={roles}
                projects={projectsQuery.data?.items ?? []}
                catalog={catalog}
                disabled={isPending || isAccessLocked}
                onChange={patchDraft}
              />
              <div className="dsc-info">
                <span className="dsc-info__mark" aria-hidden="true">
                  i
                </span>
                <span>
                  Proje içi sayfalar <b>o projedeki rolle</b>, şirket geneli sayfalar <b>ana rolle</b> açılır. Disiplin
                  boş bırakılırsa kişi o projede tüm disiplinleri görür.
                </span>
              </div>
            </>
          )}

          {formError !== null && (
            <p className="settings-note settings-note--error" role="alert">
              {formError}
              {isUserCreatedButUnsaved && (
                <>
                  {" "}
                  <button type="button" className="uac-link" onClick={() => void submit()}>
                    Yeniden dene
                  </button>
                </>
              )}
            </p>
          )}
        </div>
      </Modal>

      {subDialog === "password" && user && <PasswordResetModal user={user} onClose={() => setSubDialog(null)} />}
      {subDialog === "delete" && user && (
        <ConfirmDialog
          title="Kullanıcıyı Sil"
          message={`"${user.full_name}" kullanıcısını silmek istediğinize emin misiniz?`}
          confirmLabel="Sil"
          danger
          isPending={deleteUser.isPending}
          errorText={deleteError}
          onConfirm={confirmDelete}
          onClose={() => {
            setSubDialog(null);
            setDeleteError(null);
          }}
        />
      )}
    </>
  );
}
