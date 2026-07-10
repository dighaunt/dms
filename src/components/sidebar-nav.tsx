"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CirclePlusIcon, FolderOpenIcon, UsersIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type Item = {
  href: string;
  etiqueta: string;
  icono: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  exacto?: boolean;
};

const OPERACION: Item[] = [
  { href: "/expedientes", etiqueta: "Expedientes", icono: FolderOpenIcon },
  { href: "/expedientes/nuevo", etiqueta: "Abrir expediente", icono: CirclePlusIcon, exacto: true },
];

const ADMINISTRACION: Item[] = [
  { href: "/usuarios", etiqueta: "Usuarios", icono: UsersIcon },
];

function Seccion({ titulo, items }: { titulo: string; items: Item[] }) {
  const pathname = usePathname();
  return (
    <>
      <p className="px-2 pb-1.5 pt-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
        {titulo}
      </p>
      {items.map((item) => {
        const activo = item.exacto
          ? pathname === item.href
          : pathname === item.href ||
            (pathname.startsWith(item.href + "/") && pathname !== "/expedientes/nuevo");
        const Icono = item.icono;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
              activo
                ? "bg-accent font-medium text-foreground"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
            )}
          >
            <Icono className="size-4" strokeWidth={activo ? 2.2 : 1.8} />
            {item.etiqueta}
          </Link>
        );
      })}
    </>
  );
}

export function SidebarNav({ esAdmin }: { esAdmin: boolean }) {
  return (
    <nav className="flex flex-col gap-0.5 px-3">
      <Seccion titulo="Operación" items={OPERACION} />
      {esAdmin && <Seccion titulo="Administración" items={ADMINISTRACION} />}
    </nav>
  );
}
