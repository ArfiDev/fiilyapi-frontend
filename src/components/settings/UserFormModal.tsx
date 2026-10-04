"use client";

import { useRef, useState } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
import { Modal } from "./Modal";
import { useRoles } from "@/lib/api/hooks/useRoles";
import { useCreateUser, useUpdateUser } from "@/lib/api/hooks/useUserMutations";
import { backendErrorMessage } from "@/lib/api/error-message";
import type { UserResponse, UserStatus } from "@/lib/api/models";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

interface UserFormModalProps {
  mode: "create" | "edit";
  user?: UserResponse;
  onClose: () => void;
}

export function UserFormModal({ mode, user, onClose }: UserFormModalProps) {
  const rolesQuery = useRoles();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();

  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState(user?.full_name ?? "");
  const [title, setTitle] = useState(user?.title ?? "");
  const [roleId, setRoleId] = useState(user?.role_id ?? "");
  const [status, setStatus] = useState<UserStatus>(user?.status ?? "active");
  const [formError, setFormError] = useState<string | null>(null);

  // SEKME-F1.3b · dirty: tercih 2 (edit) / tercih 1 (create). `user` senkron
  // prop'tur (ASYNC TABAN DEĞİL). `password` yalnız create'te gösterilir ve
  // edit'te dirty hesabına GİRMEZ (envanter notu — parola alanı edit'te yok).
  const initialRef = useRef({
    fullName: user?.full_name ?? "",
    email: user?.email ?? "",
    title: user?.title ?? "",
    roleId: user?.role_id ?? "",
    status: user?.status ?? "active",
  });
  const isDirty =
    fullName !== initialRef.current.fullName ||
    title !== initialRef.current.title ||
    roleId !== initialRef.current.roleId ||
    status !== initialRef.current.status ||
    (mode === "create" && (email !== initialRef.current.email || password.length > 0));
  // KURAL 7 · Modal'a isDirty VERİLMEZ, doğrudan bağlanır.
  useUnsavedChanges(isDirty, "Kullanıcı");

  // IZN-F1.2 — atanamaz roller seçicide görünmez (yalnız `is_assignable` okunur);
  // kullanıcının ZATEN atanmış rolü atanamaz olsa da listede kalır, yoksa düzenleme
  // formunda seçili değer kaybolur ve kayıt yanlışlıkla "Rol seçin" hatasına düşerdi.
  const selectableRoles = (rolesQuery.data ?? []).filter(
    (role) => role.is_assignable !== false || role.id === user?.role_id,
  );

  const isPending = createUser.isPending || updateUser.isPending;

  function validate(): string | null {
    if (!fullName.trim()) return "Ad soyad zorunludur.";
    if (mode === "create") {
      if (!EMAIL_RE.test(email)) return "Geçerli bir e-posta girin.";
      if (password.length < MIN_PASSWORD) return `Parola en az ${MIN_PASSWORD} karakter olmalıdır.`;
    }
    if (!roleId) return "Rol seçin.";
    return null;
  }

  function handleSubmit() {
    const problem = validate();
    if (problem) {
      setFormError(problem);
      return;
    }
    setFormError(null);
    if (mode === "create") {
      createUser.mutate(
        { email, password, full_name: fullName, title, role_id: roleId, status },
        { onSuccess: onClose, onError: (err) => setFormError(backendErrorMessage(err)) },
      );
    } else if (user) {
      updateUser.mutate(
        { id: user.id, body: { full_name: fullName, title, role_id: roleId, status } },
        { onSuccess: onClose, onError: (err) => setFormError(backendErrorMessage(err)) },
      );
    }
  }

  return (
    <Modal
      title={mode === "create" ? "Yeni Kullanıcı" : "Kullanıcıyı Düzenle"}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            Vazgeç
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={isPending}>
            Kaydet
          </Button>
        </>
      }
    >
      <div className="settings-form">
        <Field label="Ad Soyad" required>
          {(control) => (
            <Input {...control} value={fullName} onChange={(e) => setFullName(e.target.value)} />
          )}
        </Field>
        {mode === "create" && (
          <>
            <Field label="E-posta" required>
              {(control) => (
                <Input {...control} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              )}
            </Field>
            <Field label="Parola" required hint={`En az ${MIN_PASSWORD} karakter.`}>
              {(control) => (
                <Input
                  {...control}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              )}
            </Field>
          </>
        )}
        <Field label="Unvan">
          {(control) => <Input {...control} value={title} onChange={(e) => setTitle(e.target.value)} />}
        </Field>
        <Field label="Rol" required>
          {(control) => (
            <Select {...control} value={roleId} onChange={(e) => setRoleId(e.target.value)}>
              <option value="">Seçin…</option>
              {selectableRoles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Durum">
          {(control) => (
            <Select {...control} value={status} onChange={(e) => setStatus(e.target.value as UserStatus)}>
              <option value="active">Aktif</option>
              <option value="on_leave">İzinli</option>
              <option value="passive">Pasif</option>
            </Select>
          )}
        </Field>
        {formError && <p className="settings-note settings-note--error">{formError}</p>}
      </div>
    </Modal>
  );
}
