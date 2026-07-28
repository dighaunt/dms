"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UsersIcon } from "lucide-react";

import { IconoSilk, type NombreIconoSilk } from "@/components/iconos/silk";
import { cn } from "@/lib/utils";

type Item = {
  href: string;
  etiqueta: string;
  /**
   * Un alias de Silk, o un componente monocromo para lo que Silk no dibuja.
   * Silk no tiene persona ni grupo, y Usuarios es la única entrada que los
   * necesita: ahí se queda el juego monocromo.
   */
  icono: NombreIconoSilk | React.ComponentType<{ className?: string; strokeWidth?: number }>;
  exacto?: boolean;
  /** Se dibuja recorrido: cuelga de la entrada inmediatamente anterior. */
  sangria?: boolean;
};

const OPERACION: Item[] = [
  { href: "/", etiqueta: "Inicio", icono: "inicio", exacto: true },
  { href: "/expedientes", etiqueta: "Expedientes", icono: "expedientes" },
  // El más (verde) contra la carpeta de la entrada anterior: se lee «uno nuevo».
  { href: "/expedientes/nuevo", etiqueta: "Abrir expediente", icono: "agregar", exacto: true },
  { href: "/finanzas", etiqueta: "Finanzas", icono: "finanzas" },
  // Las tres secciones de Finanzas que tienen pantalla propia. Los siete
  // formatos NO se listan aquí: se emiten desde el panel, que es donde se ve
  // el estado del día que decide cuál toca.
  //
  // El corte lleva monedas y no «caja»: ese alias es una cesta de compra y aquí
  // leería a tienda, no a efectivo contado.
  { href: "/finanzas/cortes", etiqueta: "Corte de caja", icono: "monedas", sangria: true },
  { href: "/finanzas/reportes", etiqueta: "Reportes", icono: "reportes", sangria: true },
  { href: "/finanzas/catalogos", etiqueta: "Catálogos", icono: "catalogos", sangria: true },
  { href: "/documentacion", etiqueta: "Documentación", icono: "manuales" },
];

const ADMINISTRACION: Item[] = [
  { href: "/usuarios", etiqueta: "Usuarios", icono: UsersIcon },
  { href: "/modo-riesgo", etiqueta: "Modo riesgo", icono: "riesgo" },
];

/**
 * Devuelve el href que debe resaltarse: de todos los que cubren la ruta
 * actual, el más específico.
 *
 * Hace falta desde que Finanzas tiene subsecciones. Con la comparación por
 * prefijo a secas, estar en /finanzas/cortes encendía "Finanzas" y "Corte de
 * caja" a la vez, y no se sabía dónde se está parado. Elegir el href más
 * largo resuelve el caso general y de paso vuelve innecesaria la excepción
 * que se había escrito a mano para /expedientes/nuevo.
 */
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
  // El resaltado se decide sobre lo que este usuario alcanza a ver: si no es
  // administrador, /usuarios no puede ganar la comparación.
  const visibles = esAdmin ? [...OPERACION, ...ADMINISTRACION] : OPERACION;
  const activo = hrefActivo(pathname, visibles);

  return (
    <nav className="flex flex-col gap-0.5 px-3">
      <Seccion titulo="Operación" items={OPERACION} activo={activo} />
      {esAdmin && <Seccion titulo="Administración" items={ADMINISTRACION} activo={activo} />}
    </nav>
  );
}
