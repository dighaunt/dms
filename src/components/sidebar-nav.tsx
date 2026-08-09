"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UsersIcon } from "lucide-react";

import { IconoSilk, type NombreIconoSilk } from "@/components/iconos/silk";
import { cn } from "@/lib/utils";

type Item = {
  href: string;
  etiqueta: string;
  
  icono: NombreIconoSilk | React.ComponentType<{ className?: string; strokeWidth?: number }>;
  exacto?: boolean;
  
  sangria?: boolean;
};

const OPERACION: Item[] = [
  { href: "/", etiqueta: "Inicio", icono: "inicio", exacto: true },
  { href: "/expedientes", etiqueta: "Expedientes", icono: "expedientes" },
  
  { href: "/expedientes/nuevo", etiqueta: "Abrir expediente", icono: "agregar", exacto: true },
  { href: "/finanzas", etiqueta: "Finanzas", icono: "finanzas" },

  

  
  { href: "/finanzas/cortes", etiqueta: "Corte de caja", icono: "monedas", sangria: true },
  { href: "/finanzas/reportes", etiqueta: "Reportes", icono: "reportes", sangria: true },
  { href: "/finanzas/catalogos", etiqueta: "Catálogos", icono: "catalogos", sangria: true },
  { href: "/documentacion", etiqueta: "Documentación", icono: "manuales" },
];

const ADMINISTRACION: Item[] = [
  { href: "/usuarios", etiqueta: "Usuarios", icono: UsersIcon },
  { href: "/modo-riesgo", etiqueta: "Modo riesgo", icono: "riesgo" },
];

function hrefActivo(pathname: string, items: Item[]): string | null {
  let activo: string | null = null;
  for (const item of items) {
    const cubre = item.exacto
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(item.href + "/");
    if (cubre && (activo === null || item.href.length > activo.length)) {
      activo = item.href;
    }
  }
  return activo;
}

function Seccion({
  titulo,
  items,
  activo,
}: {
  titulo: string;
  items: Item[];
  activo: string | null;
}) {
  return (
    <>
      <p className="px-2 pb-1.5 pt-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
        {titulo}
      </p>
      {items.map((item) => {
        const esActivo = item.href === activo;
        const Icono = item.icono;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={esActivo ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-md py-1.5 text-sm transition-colors",
              item.sangria ? "ml-3 border-l pl-3 pr-2" : "px-2",
              esActivo
                ? "bg-accent font-medium text-foreground"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
            )}
          >
            {typeof Icono === "string" ? (
              <IconoSilk nombre={Icono} className="shrink-0" />
            ) : (
              <Icono className="size-4 shrink-0" strokeWidth={esActivo ? 2.2 : 1.8} />
            )}
            {item.etiqueta}
          </Link>
        );
      })}
    </>
  );
}

export function SidebarNav({ esAdmin }: { esAdmin: boolean }) {
  const pathname = usePathname();

  const visibles = esAdmin ? [...OPERACION, ...ADMINISTRACION] : OPERACION;
  const activo = hrefActivo(pathname, visibles);

  return (
    <nav className="flex flex-col gap-0.5 px-3">
      <Seccion titulo="Operación" items={OPERACION} activo={activo} />
      {esAdmin && <Seccion titulo="Administración" items={ADMINISTRACION} activo={activo} />}
    </nav>
  );
}
