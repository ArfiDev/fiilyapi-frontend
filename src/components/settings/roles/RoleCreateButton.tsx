"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { RoleFormModal } from "@/components/settings/RoleFormModal";

/** Sayfa başlığının sağındaki "+ Yeni rol" (mevcut `RoleFormModal` oluşturma akışı). */
export function RoleCreateButton() {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <Button variant="primary" onClick={() => setIsOpen(true)}>
        + Yeni rol
      </Button>
      {isOpen && <RoleFormModal mode="create" onClose={() => setIsOpen(false)} />}
    </>
  );
}
