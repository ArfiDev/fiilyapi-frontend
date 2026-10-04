"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { RoleFormModal } from "@/components/settings/RoleFormModal";
import { ROLES_EDIT } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";

/** Sayfa başlığının sağındaki "+ Yeni rol" (mevcut `RoleFormModal` oluşturma akışı). */
export function RoleCreateButton() {
  const [isOpen, setIsOpen] = useState(false);
  // IZN-F2.x · + Yeni rol = ayarlar.rol_yonetimi Düzenler (bugün KAPISIZ → grant yoksa görünür).
  const canCreateRole = useButtonGate({ pages: ROLES_EDIT, need: "edit", fallback: true });
  if (!canCreateRole) return null;
  return (
    <>
      <Button variant="primary" onClick={() => setIsOpen(true)}>
        + Yeni rol
      </Button>
      {isOpen && <RoleFormModal mode="create" onClose={() => setIsOpen(false)} />}
    </>
  );
}
