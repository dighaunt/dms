import Link from "next/link";

import { BlurFade } from "@/components/ui/blur-fade";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listarSucursales } from "@/lib/finanzas/catalogos";
import {
  esquemaRangoReporte,
  panelDeReportes,
  rangoPorOmision,
} from "@/lib/finanzas/reportes";

import { PanelReportesUI } from "./panel-reportes";

export const dynamic = "force-dynamic";

/** Un parámetro repetido en la URL llega como arreglo; se toma el primero. */
function unico(valor: string | string[] | undefined): string | undefined {
  if (valor === undefined) return undefined;
  const texto = Array.isArray(valor) ? valor[0] : valor;
  return texto?.trim() === "" ? undefined : texto;
}

export default async function ReportesPage({
  searchParams,
}: {
  searchParams: Promise<{ [clave: string]: string | string[] | undefined }>;
}) {
  const parametros = await searchParams;
  const omision = rangoPorOmision();

  const sucursalCruda = unico(parametros.sucursal);
  const sucursalId = sucursalCruda === undefined ? null : Number(sucursalCruda);

  // La URL la puede teclear cualquiera. Un rango imposible no debe tumbar la
  // pantalla: se cae al rango por omisión y el panel muestra cuál se usó.
  const propuesto = {
    sucursalId: Number.isSafeInteger(sucursalId) && (sucursalId ?? 0) > 0 ? sucursalId : null,
    desde: unico(parametros.desde) ?? omision.desde,
    hasta: unico(parametros.hasta) ?? omision.hasta,
  };
  const validado = esquemaRangoReporte.safeParse(propuesto);
  const filtro = validado.success
    ? validado.data
    : { sucursalId: propuesto.sucursalId, ...omision };

  const [sucursales, panel] = await Promise.all([
    listarSucursales({ soloActivas: false }),
    panelDeReportes(filtro),
  ]);

  if (sucursales.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Reportes de Finanzas</h1>
        <Card>
          <CardHeader>
            <CardTitle>Todavía no hay nada que reportar</CardTitle>
            <CardDescription>
              No existe ninguna sucursal dada de alta, así que no se ha emitido ningún folio. Los
              reportes se arman con documentos firmados.{" "}
              <Link href="/finanzas" className="underline">
                Volver a Finanzas
              </Link>
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <BlurFade delay={0.05}>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reportes de Finanzas</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ingresos, egresos, diferencias de caja, ubicación del efectivo y utilidades por
            repartir. Sólo se cuentan documentos firmados: un borrador no es un ingreso.
          </p>
        </div>
      </BlurFade>

      <BlurFade delay={0.1}>
        <PanelReportesUI
          sucursales={sucursales.map((s) => ({
            id: s.id,
            clave: s.clave,
            nombre: s.nombre,
            activa: s.activa,
          }))}
          filtro={filtro}
          panel={panel}
          rangoInvalido={!validado.success}
        />
      </BlurFade>
    </div>
  );
}
