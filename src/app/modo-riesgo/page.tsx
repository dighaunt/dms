import { redirect } from "next/navigation";

import { getUsuarioSesion } from "@/lib/auth/usuario";
import { listarExpedientes } from "@/lib/db/consultas";
import { BlurFade } from "@/components/ui/blur-fade";
import { PanelModoRiesgo } from "./panel";

export const dynamic = "force-dynamic";

export default async function ModoRiesgoPage() {
  const sesion = await getUsuarioSesion();
  if (!sesion) redirect("/login");
  if (sesion.nivel !== "N3") redirect("/expedientes");

  const expedientes = await listarExpedientes();

  return (
    <div className="space-y-6">
      <BlurFade delay={0.05}>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Modo riesgo</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Autoriza, expediente por expediente y documento por documento, la
            excepción para unidades legacy que nunca tuvieron el paquete
            físico día 0. Es un procedimiento de dos personas: aquí solo se
            emite el token — otro usuario, distinto de ti, lo consume para
            declarar la excepción en el expediente.
          </p>
        </div>
      </BlurFade>

      <BlurFade delay={0.12}>
        <PanelModoRiesgo expedientes={expedientes} />
      </BlurFade>
    </div>
  );
}
