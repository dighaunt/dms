"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { MenuIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

// Barra superior móvil con el contenido del sidebar en un drawer.
// Se cierra automáticamente al navegar (ajuste de estado durante render).
export function SidebarMovil({ children }: { children: React.ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  const pathname = usePathname();
  const [rutaPrevia, setRutaPrevia] = useState(pathname);

  if (rutaPrevia !== pathname) {
    setRutaPrevia(pathname);
    setAbierto(false);
  }

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background px-4 lg:hidden">
      <Sheet open={abierto} onOpenChange={setAbierto}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Abrir menú">
            <MenuIcon className="size-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 p-0">
          <SheetTitle className="sr-only">Menú de navegación</SheetTitle>
          {children}
        </SheetContent>
      </Sheet>
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-semibold tracking-tight">CLIQUEALO</span>
        <span className="text-[11px] text-muted-foreground">Trazabilidad</span>
      </div>
    </header>
  );
}
