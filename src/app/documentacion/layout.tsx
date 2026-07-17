import { AppShell } from "@/components/app-shell";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { RootProvider } from "fumadocs-ui/provider/next";

import { BuscadorManual } from "./buscador-manual";
import { ARBOL_MANUALES } from "@/lib/manuales";

export default function DocumentacionLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <AppShell>
      <RootProvider>
        <DocsLayout
          tree={ARBOL_MANUALES}
          tabs={false}
          nav={{ enabled: false }}
          searchToggle={{ enabled: false }}
          themeSwitch={{ enabled: false }}
          sidebar={{
            banner: <BuscadorManual />,
            collapsible: false,
            prefetch: false,
          }}
        >
          {children}
        </DocsLayout>
      </RootProvider>
    </AppShell>
  );
}
