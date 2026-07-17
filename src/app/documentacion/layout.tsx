import Link from "next/link";
import { ArrowLeftIcon, BookOpenCheckIcon } from "lucide-react";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { RootProvider } from "fumadocs-ui/provider/next";

import { BuscadorManual } from "./buscador-manual";
import { ARBOL_MANUALES } from "@/lib/manuales";

export default function DocumentacionLayout({
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
          url: "/documentacion",
        }}
        searchToggle={{ enabled: false }}
        themeSwitch={{ enabled: false }}
        containerProps={{ className: "bg-background" }}
        sidebar={{
          banner: <BuscadorManual />,
          footer: (
            <Link
              href="/expedientes"
              className="flex items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <ArrowLeftIcon className="size-4" />
              Volver a expedientes
            </Link>
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
