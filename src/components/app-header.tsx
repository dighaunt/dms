import Link from "next/link";

import { getUsuarioSesion } from "@/lib/auth/usuario";
import { CerrarSesion } from "@/components/cerrar-sesion";

// Barra superior única (sin sidebar): identidad del sistema + usuario.
export async function AppHeader() {
  const usuario = await getUsuarioSesion();

  return (
    <header className="sticky top-0 z-10 border-b bg-background">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link href="/expedientes" className="flex items-baseline gap-2">
          <span className="text-sm font-semibold tracking-tight">CLIQUEALO</span>
          <span className="text-xs text-muted-foreground">
            Trazabilidad documental · M-01 Rev 3.0
          </span>
        </Link>
        {usuario && (
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {usuario.email}
              <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                {usuario.nivel}
              </span>
            </span>
            <CerrarSesion />
          </div>
        )}
      </div>
    </header>
  );
}
