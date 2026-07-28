import Link from "next/link";

import { IconoSilk } from "@/components/iconos/silk";
import { BlurFade } from "@/components/ui/blur-fade";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { query } from "@/lib/db";
import { conceptosEgreso, formasPago, listarSucursales } from "@/lib/finanzas/catalogos";
import { anticiposDeSocios } from "@/lib/finanzas/egresos";
import { listarSocios } from "@/lib/finanzas/personas";

import { CapturaVale } from "./captura-vale";

export const dynamic = "force-dynamic";

/** Un selector no se lee por miles de renglones; el tope acota lo que viaja. */
const TOPE_RECIBOS_NOMINA = 200;

type FilaReciboNomina = {
  documento_id: number;
  folio: string;
  folio_completo: string;
  trabajador: string;
  num_empleado: string;
  periodo_inicio: string;
  periodo_fin: string;
  neto_pagado: string;
  vales_vigentes: number;
};

export default async function NuevoValeEgresoPage() {
  const [sucursales, conceptos, formas, anticipos, socios, recibos] = await Promise.all([
    listarSucursales({ soloActivas: true }),
    conceptosEgreso(),
    formasPago(),
    anticiposDeSocios(),

    // Quién puede retirar utilidades sale del REGISTRO DE SOCIOS, no del padrón
    // de usuarios. Ser socio es tener parte del capital social —se acredita con
    // un acta— y tener cuenta en el DMS no lo es: llenar el selector con todos
    // los usuarios permitía cargarle el anticipo a quien no era y entregar un
    // retiro de utilidades a quien no tiene derecho a ninguna.
    listarSocios({ soloActivos: true }),

    // Recibos de nómina FIRMADOS, para no pedir que se teclee un folio.
    // Se cuentan los vales que ya los citan —sin contar los cancelados— para
    // poder advertir de un doble pago: no hay candado en el esquema que lo
    // impida, y pagar dos veces el mismo recibo es un egreso que después nadie
    // sabe explicar en el corte.
    query<FilaReciboNomina>(
      `SELECT v.id::int                 AS documento_id,
              v.folio,
              v.folio_completo,
              e.nombre                  AS trabajador,
              e.num_empleado,
              n.periodo_inicio::text    AS periodo_inicio,
              n.periodo_fin::text       AS periodo_fin,
              n.neto_pagado::text       AS neto_pagado,
              (SELECT count(*)::int
                 FROM traza.vale_egreso_rci05 ve
                 JOIN traza.v_documento_financiero dv ON dv.id = ve.documento_id
                WHERE ve.recibo_nomina_id = n.documento_id
                  AND dv.estado IS DISTINCT FROM 'CANCELADO') AS vales_vigentes
         FROM traza.v_documento_financiero v
         JOIN traza.recibo_nomina_rci06 n ON n.documento_id = v.id
         JOIN traza.empleado e            ON e.id = n.empleado_id
        WHERE v.tipo_codigo = 'CACM-RCI-06'
          AND v.estado = 'FIRMADO'
        ORDER BY n.periodo_fin DESC, v.id DESC
        LIMIT $1`,
      [TOPE_RECIBOS_NOMINA],
    ),
  ]);

  if (sucursales.length === 0 || conceptos.length === 0 || formas.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <IconoSilk nombre="nota" tamano={20} className="shrink-0" />
          Vale de Egreso de Caja
        </h1>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconoSilk nombre="aviso" className="shrink-0" />
              Falta configurar el catálogo
            </CardTitle>
            <CardDescription>
              {sucursales.length === 0
                ? "No hay ninguna sucursal dada de alta, y el folio es consecutivo por sucursal y por tipo."
                : conceptos.length === 0
                  ? "No hay ningún concepto de egreso dado de alta, y ningún efectivo puede salir sin decir por qué sale."
                  : "No hay ninguna forma de pago dada de alta, y de ella depende si la salida afecta o no el arqueo del corte."}{" "}
              Lo configura un administrador del sistema.{" "}
              <Link href="/finanzas" className="underline">
                Volver a Finanzas
              </Link>
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // La posición de cada socio se cruza por la persona: la vista ya incluye a
  // los de saldo cero, y quien acaba de darse de alta debe poder elegirse
  // aunque no tenga un solo movimiento.
  const posicionPorSocio = new Map(anticipos.map((a) => [a.socioPersonaId, a]));

  return (
    <div className="space-y-6">
      <BlurFade delay={0.05}>
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <IconoSilk nombre="nota" tamano={20} className="shrink-0" />
            Vale de Egreso de Caja · CACM-RCI-05
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ningún efectivo puede salir de caja sin este vale firmado y autorizado. El folio se
            emite al guardar; las tres firmas van después.
          </p>
        </div>
      </BlurFade>

      <BlurFade delay={0.1}>
        <CapturaVale
          sucursales={sucursales.map((s) => ({ id: s.id, clave: s.clave, nombre: s.nombre }))}
          conceptos={conceptos.map((c) => ({
            codigo: c.codigo,
            etiqueta: c.etiqueta,
            esAnticipoUtilidades: c.esAnticipoUtilidades,
          }))}
          formasPago={formas.map((f) => ({
            codigo: f.codigo,
            etiqueta: f.etiqueta,
            afectaCajaFisica: f.afectaCajaFisica,
          }))}
          socios={socios.map((s) => {
            const posicion = posicionPorSocio.get(s.personaId);
            return {
              personaId: s.personaId,
              nombre: s.nombre,
              participacionPct: s.participacionPct,
              // `etiqueta` la redacta `posicionSocio` en calculos.ts: es la
              // regla del artículo 19 dicha en palabras, y no se reescribe aquí.
              saldoPorComprobar: posicion?.saldoPorComprobar ?? "0.00",
              tieneSaldoPorComprobar: posicion?.tieneSaldoPorComprobar ?? false,
              etiquetaPosicion: posicion?.etiqueta ?? null,
            };
          })}
          recibosNomina={recibos.rows.map((r) => ({
            documentoId: r.documento_id,
            folio: r.folio,
            folioCompleto: r.folio_completo,
            trabajador: r.trabajador,
            numEmpleado: r.num_empleado,
            periodoInicio: r.periodo_inicio,
            periodoFin: r.periodo_fin,
            netoPagado: r.neto_pagado,
            yaTieneVale: r.vales_vigentes > 0,
          }))}
        />
      </BlurFade>
    </div>
  );
}
