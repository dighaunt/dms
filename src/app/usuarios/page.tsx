import { redirect } from "next/navigation";

import { getUsuarioSesion } from "@/lib/auth/usuario";
import { query } from "@/lib/db";
import { BlurFade } from "@/components/ui/blur-fade";
import { TablaUsuarios, type UsuarioFila } from "./tabla-usuarios";

export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  const sesion = await getUsuarioSesion();
  if (!sesion) redirect("/login");
  if (sesion.nivel !== "N3") redirect("/expedientes");

  const { rows: usuarios } = await query<UsuarioFila>(
    `SELECT id::int AS id, email, nombre, nivel, activo
       FROM traza.usuario
      ORDER BY id`,
  );

  return (
    <div className="space-y-6">
      <BlurFade delay={0.05}>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Usuarios</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Altas y niveles de autorización (N1 operación, N2 supervisión, N3
            administración global).
          </p>
        </div>
      </BlurFade>

      <BlurFade delay={0.12}>
        <TablaUsuarios usuarios={usuarios} miId={sesion.id} />
      </BlurFade>
    </div>
  );
}
