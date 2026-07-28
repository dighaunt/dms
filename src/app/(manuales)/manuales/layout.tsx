import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { RootProvider } from "fumadocs-ui/provider/next";

import { BuscadorManual } from "./buscador-manual";
import { ARBOL_MANUALES } from "@/lib/manuales";
import { CreditoIconos, IconoSilk } from "@/components/iconos/silk";

export default function ManualesLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <RootProvider theme={{ enabled: false }} search={{ enabled: false }}>
      <DocsLayout
        tree={ARBOL_MANUALES}
        tabs={false}
        nav={{
          title: (
            <span className="inline-flex items-center gap-2">
              <IconoSilk nombre="guion" className="shrink-0" />
              CLIQUEALO · Manuales
            </span>
          ),
          url: "/manuales",
        }}
        searchToggle={{ enabled: false }}
        themeSwitch={{ enabled: false }}
        containerProps={{ className: "bg-background" }}
        sidebar={{
          banner: <BuscadorManual />,
          footer: (
            <div className="flex flex-col gap-1">
              <Link
                href="/documentacion"
                className="flex items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {/* Silk no tiene flechas: el regreso se queda monocromo y sigue
                    el color del enlace al pasar el puntero. */}
                <ArrowLeftIcon className="size-4" />
                Volver a documentación
              </Link>
              <Link
                href="/"
                className="flex items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <IconoSilk nombre="inicio" className="shrink-0" />
                Ir al dashboard
              </Link>
              {/*
                Los manuales cuelgan de su propio layout raíz: no pasan por
                AppShell, así que el crédito que pide la CC-BY-SA no llegaría
                aquí solo. Va al pie de la barra, que es la única pieza que
                esta sección dibuja una vez por pantalla.
              */}
              <CreditoIconos className="mt-2 px-2 text-[11px] leading-relaxed text-muted-foreground" />
            </div>
          ),
          collapsible: false,
          prefetch: false,
        }}
      >
        {children}
      </DocsLayout>
    </RootProvider>
  );
}
