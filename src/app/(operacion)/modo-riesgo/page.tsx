import { redirect } from "next/navigation";
import { ShieldAlertIcon } from "lucide-react";

import { getUsuarioSesion } from "@/lib/auth/usuario";
import { query } from "@/lib/db";
import { BlurFade } from "@/components/ui/blur-fade";
import { PanelModoRiesgo } from "./panel";

export const dynamic = "force-dynamic";

export type SolicitudRiesgo = {
  id: number;
  expediente_id: number;
  numero_expediente: string;
  vin: string;
  tipo_codigo: string;
  motivo: string;
  solicitado_en: string;
  solicitado_por_nombre: string;
  decision_id: number | null;
  autorizada: boolean | null;
  motivo_rechazo: string | null;
  decidido_en: string | null;
  decidido_por_nombre: string | null;
};

export default async function ModoRiesgoPage() {
  const sesion = await getUsuarioSesion();
  if (!sesion) redirect("/login");
  if (sesion.nivel !== "N3") redirect("/expedientes");

  const { rows: solicitudes } = await query<SolicitudRiesgo>(
    `SELECT id::int AS id, expediente_id, numero_expediente, vin, tipo_codigo, motivo,
            solicitado_en::text AS solicitado_en, solicitado_por_nombre,
            decision_id::int AS decision_id, autorizada, motivo_rechazo,
            decidido_en::text AS decidido_en, decidido_por_nombre
       FROM public.solicitudes_riesgo
      ORDER BY solicitado_en DESC`,
  );

  return (
    <div className="space-y-6">
      <BlurFade delay={0.05}>
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <ShieldAlertIcon className="size-5 text-muted-foreground" />
            Modo riesgo
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cola de solicitudes de excepción documental legacy para unidades
            que nunca tuvieron el paquete físico día 0. Es un procedimiento de
            dos personas: aquí decides sobre lo que otro usuario solicitó
            desde su expediente — nunca puedes decidir tu propia solicitud.
          </p>
        </div>
      </BlurFade>

      <BlurFade delay={0.12}>
        <PanelModoRiesgo solicitudes={solicitudes} />
      </BlurFade>
    </div>
  );
}
