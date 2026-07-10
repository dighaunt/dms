"use client";

import { useRouter } from "next/navigation";
import { LogOutIcon } from "lucide-react";

import { cerrarSesion } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";

export function CerrarSesion() {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="w-full justify-start gap-2 text-muted-foreground"
      onClick={async () => {
        await cerrarSesion();
        router.push("/login");
        router.refresh();
      }}
    >
      <LogOutIcon className="size-4" />
      Cerrar sesión
    </Button>
  );
}
