import Link from "next/link";
import { ArrowLeftIcon, BookOpenCheckIcon, LayoutDashboardIcon } from "lucide-react";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { RootProvider } from "fumadocs-ui/provider/next";

import { BuscadorManual } from "./buscador-manual";
import { ARBOL_MANUALES } from "@/lib/manuales";

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
              <BookOpenCheckIcon className="size-4 text-primary" />
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
                <ArrowLeftIcon className="size-4" />
                Volver a documentación
              </Link>
              <Link
                href="/"
                className="flex items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <LayoutDashboardIcon className="size-4" />
                Ir al dashboard
              </Link>
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
