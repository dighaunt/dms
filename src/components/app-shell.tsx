import { getUsuarioSesion } from "@/lib/auth/usuario";
import { CerrarSesion } from "@/components/cerrar-sesion";
import { SidebarMovil } from "@/components/sidebar-movil";
import { SidebarNav } from "@/components/sidebar-nav";
import { Separator } from "@/components/ui/separator";

function ContenidoSidebar({
  usuario,
}: {
  usuario: Awaited<ReturnType<typeof getUsuarioSesion>>;
}) {
  const iniciales = (usuario?.nombre ?? "?")
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex h-full flex-col bg-sidebar">
      <div className="flex items-center gap-2.5 px-5 pb-4 pt-5">
        <div className="flex size-7 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
          C
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold tracking-tight">CLIQUEALO</p>
          <p className="text-[11px] text-muted-foreground">Trazabilidad · M-01 Rev 3.0</p>
        </div>
      </div>
      <Separator />
      <div className="flex-1 overflow-y-auto pb-4">
        <SidebarNav esAdmin={usuario?.nivel === "N3"} />
      </div>
      <Separator />
      <div className="space-y-2 p-3">
        {usuario && (
          <div className="flex items-center gap-2.5 rounded-md px-2 py-1.5">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
              {iniciales}
            </div>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-xs font-medium">{usuario.nombre}</p>
              <p className="truncate text-[11px] text-muted-foreground">
                {usuario.email}
                <span className="ml-1 rounded bg-muted px-1 font-mono text-[10px]">
                  {usuario.nivel}
                </span>
              </p>
            </div>
          </div>
        )}
        <CerrarSesion />
      </div>
    </div>
  );
}

// Shell estilo WorkOS/Notion: sidebar fija en escritorio, drawer en móvil.
export async function AppShell({ children }: { children: React.ReactNode }) {
  const usuario = await getUsuarioSesion();

  return (
    <div className="flex min-h-svh flex-col lg:flex-row">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 border-r lg:block">
        <ContenidoSidebar usuario={usuario} />
      </aside>
      <SidebarMovil>
        <ContenidoSidebar usuario={usuario} />
      </SidebarMovil>
      <div className="flex-1 lg:pl-60">
        <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-8 sm:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
