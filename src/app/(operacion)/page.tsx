import Link from "next/link";
import { ArrowRightIcon, UsersIcon } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { getUsuarioSesion } from "@/lib/auth/usuario";
import { listarExpedientes } from "@/lib/db/consultas";
import { ACTUALIZACIONES_LEGALES } from "@/lib/actualizaciones-legales";
import { INDICE_ESTATICO, indiceExpedientes } from "@/lib/indice-busqueda";
import { AppShell } from "@/components/app-shell";
import { IconoSilk, type NombreIconoSilk } from "@/components/iconos/silk";
import { BlurFade } from "@/components/ui/blur-fade";
import { BuscadorGlobal } from "@/components/buscador-global";

export const dynamic = "force-dynamic";

type AccionRapida = {
  titulo: string;
  descripcion: string;
  href: string;
  /**
   * Un alias de Silk, o un componente monocromo para lo que Silk no dibuja.
   * Cada acceso repite el icono de su entrada en el menú lateral: quien ya
   * ubicó «Expedientes» ahí lo reconoce aquí sin volver a leer el rótulo.
   */
  icono: NombreIconoSilk | React.ComponentType<{ className?: string }>;
  soloAdmin?: boolean;
};

const ACCIONES_RAPIDAS: AccionRapida[] = [
  {
    titulo: "Abrir expediente",
    descripcion: "Registra una unidad nueva y emite su juego documental día 0.",
    href: "/expedientes/nuevo",
    icono: "agregar",
  },
  {
    titulo: "Ver expedientes",
    descripcion: "Consulta el estado documental y el ciclo de vida de cada unidad.",
    href: "/expedientes",
    icono: "expedientes",
  },
  {
    titulo: "Documentación",
    descripcion: "Mapa documental, cálculos del manual y formatos descargables.",
    href: "/documentacion",
    icono: "manuales",
  },
  // El libro es la entrada a Documentación; los manuales en sí son el
  // procedimiento escrito, y por eso llevan el guion y no otro libro.
  {
    titulo: "Manuales M-01 / M-02",
    descripcion: "Procedimientos, candados y el Anexo A de PLD y jurisprudencia.",
    href: "/manuales",
    icono: "guion",
  },
  // Silk no dibuja personas: Usuarios se queda con el juego monocromo.
  {
    titulo: "Usuarios",
    descripcion: "Administra accesos y niveles de autorización (N1/N2/N3).",
    href: "/usuarios",
    icono: UsersIcon,
    soloAdmin: true,
  },
  {
    titulo: "Modo riesgo",
    descripcion: "Resuelve excepciones documentales de expedientes legacy.",
    href: "/modo-riesgo",
    icono: "riesgo",
    soloAdmin: true,
  },
];

export default async function Dashboard() {
  const [usuario, expedientes] = await Promise.all([getUsuarioSesion(), listarExpedientes()]);

  const nombre = usuario?.nombre?.trim().split(/\s+/)[0] ?? "";
  const indice = [...indiceExpedientes(expedientes), ...INDICE_ESTATICO];
  const acciones = ACCIONES_RAPIDAS.filter((accion) => !accion.soloAdmin || usuario?.nivel === "N3");

  return (
    <AppShell>
      <div className="space-y-8">
        <BlurFade delay={0.05}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                {nombre ? `Hola, ${nombre}` : "Hola"}
              </h1>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                <IconoSilk nombre="fecha" tamano={14} className="shrink-0" />
                {format(new Date(), "EEEE d 'de' MMMM, yyyy", { locale: es })}
              </p>
            </div>
            {usuario && (
              <span className="inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
                {usuario.email} · Nivel {usuario.nivel}
              </span>
            )}
          </div>
        </BlurFade>

        <BlurFade delay={0.1}>
          <BuscadorGlobal indice={indice} />
        </BlurFade>

        <BlurFade delay={0.16}>
          <section aria-label="Accesos rápidos">
            <h2 className="text-sm font-medium text-muted-foreground">¿Qué quieres hacer?</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {acciones.map((accion) => {
                const Icono = accion.icono;
                return (
                  <Link
                    key={accion.href}
                    href={accion.href}
                    className="group flex flex-col rounded-xl border bg-background p-4 transition-colors hover:border-primary/40 hover:bg-accent/40"
                  >
                    {typeof Icono === "string" ? (
                      <IconoSilk nombre={Icono} tamano={20} />
                    ) : (
                      <Icono className="size-5 text-primary" />
                    )}
                    <span className="mt-3 text-sm font-semibold">{accion.titulo}</span>
                    <span className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {accion.descripcion}
                    </span>
                    <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                      Ir <ArrowRightIcon className="size-3" />
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        </BlurFade>

        <BlurFade delay={0.22}>
          <section aria-label="Actualizaciones legales">
            <div className="flex items-center gap-2">
              <IconoSilk nombre="aviso" className="shrink-0" />
              <h2 className="text-sm font-medium text-muted-foreground">Actualizaciones legales</h2>
            </div>
            <div className="mt-3 space-y-2">
              {ACTUALIZACIONES_LEGALES.map((actualizacion) => (
                <Link
                  key={actualizacion.titulo}
                  href={actualizacion.href}
                  className="block rounded-xl border bg-background p-4 transition-colors hover:border-primary/40 hover:bg-accent/40"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {actualizacion.etiqueta}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(`${actualizacion.fecha}T00:00:00`), "d MMM yyyy", { locale: es })}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-semibold">{actualizacion.titulo}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{actualizacion.resumen}</p>
                </Link>
              ))}
            </div>
          </section>
        </BlurFade>
      </div>
    </AppShell>
  );
}
