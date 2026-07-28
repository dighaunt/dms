import Link from "next/link";

import { BlurFade } from "@/components/ui/blur-fade";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formasPago, listarSucursales } from "@/lib/finanzas/catalogos";
import { unidadesEnConsignacion } from "@/lib/finanzas/consignacion";
import { listarDocumentos } from "@/lib/finanzas/documentos";

import { CapturaLiquidacion } from "./captura-liquidacion";

export const dynamic = "force-dynamic";

/**
 * Liquidación de una venta en consigna (CACM-RCI-03).
 *
 * Sólo se ofrecen las unidades cuyo CACM-RCI-02 está FIRMADO: liquidar contra
 * un ingreso en borrador sería repartir dinero bajo condiciones que el
 * consignante todavía no aceptó, y el disparador `validar_liquidacion_rci03` lo
 * rechazaría de todas formas. Se muestran aparte las que ya tienen una
 * liquidación abierta, para que nadie emita un segundo folio por la misma venta.
 */
export default async function LiquidarConsignaPage({
  searchParams,
}: {
  searchParams: Promise<{ ingreso?: string | string[] }>;
}) {
  const crudo = (await searchParams).ingreso;
  const texto = Array.isArray(crudo) ? crudo[0] : crudo;
  const numero = Number(texto);
  const ingresoPreseleccionado =
    texto !== undefined && Number.isSafeInteger(numero) && numero > 0 ? numero : null;

  const [unidades, sucursales, formas, recibos] = await Promise.all([
    unidadesEnConsignacion(),
    listarSucursales({ soloActivas: true }),
    formasPago({ soloActivos: true }),
    // El recibo de la venta es opcional en el papel, pero citarlo por su folio
    // es lo que permite después cuadrar el dinero que entró con la utilidad que
    // se declara. Sólo los firmados: un recibo sin firmar no acredita nada.
    listarDocumentos({ tipo: "CACM-RCI-01", estado: "FIRMADO", limite: 100 }),
  ]);

  const liquidables = unidades.filter(
    (u) =>
      u.ingresoDocumentoId !== null &&
      u.ingresoEstado === "FIRMADO" &&
      u.liquidacionDocumentoId === null,
  );
  const enCurso = unidades.filter((u) => u.liquidacionDocumentoId !== null && !u.liquidada);
  const sinIngresoFirmado = unidades.filter(
    (u) => u.ingresoDocumentoId === null || u.ingresoEstado !== "FIRMADO",
  );

  if (sucursales.length === 0 || formas.length === 0) {
    return (
      <Aviso titulo="Falta configurar el catálogo">
        {sucursales.length === 0
          ? "No hay ninguna sucursal dada de alta, y el folio es consecutivo por sucursal y por tipo."
          : "No hay ninguna forma de pago dada de alta, y la liquidación tiene que decir cómo entra la utilidad a tesorería."}{" "}
        Lo configura un administrador del sistema.
      </Aviso>
    );
  }

  if (liquidables.length === 0) {
    return (
      <Aviso titulo="No hay ninguna consigna lista para liquidar">
        Una unidad se puede liquidar cuando su ingreso a inventario (CACM-RCI-02) está firmado y
        todavía no tiene liquidación.
        {sinIngresoFirmado.length > 0 &&
          ` Hay ${sinIngresoFirmado.length} unidad(es) en consignación cuyo ingreso aún no está firmado.`}
        {enCurso.length > 0 &&
          ` Otras ${enCurso.length} ya tienen su liquidación abierta: la corrección se hace sobre ese folio.`}
      </Aviso>
    );
  }

  return (
    <div className="space-y-6">
      <BlurFade delay={0.05}>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Liquidación de Venta en Consignación · CACM-RCI-03
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cálculo de lo que se paga al consignante y de la utilidad neta de la empresa. El folio
            se emite al guardar; las firmas van después.
          </p>
        </div>
      </BlurFade>

      {enCurso.length > 0 && (
        <BlurFade delay={0.08}>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Liquidaciones ya abiertas</CardTitle>
              <CardDescription>
                Estas unidades no aparecen abajo porque ya tienen su folio: emitir otro registraría
                dos veces la misma venta.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1 text-sm">
                {enCurso.map((u) => (
                  <li key={u.expedienteId} className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/finanzas/documentos/${u.liquidacionDocumentoId}`}
                      className="font-mono hover:underline"
                    >
                      {u.ingresoFolio ?? `Expediente ${u.numeroExpediente}`}
                    </Link>
                    <span className="text-muted-foreground">
                      {u.marca} {u.modelo} {u.anio}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </BlurFade>
      )}

      <BlurFade delay={0.1}>
        <CapturaLiquidacion
          consignas={liquidables.map((u) => ({
            // El filtro de arriba ya garantizó que existe; el tipo lo declara
            // nulo porque la consulta lo trae con LEFT JOIN.
            ingresoDocumentoId: u.ingresoDocumentoId as number,
            ingresoFolio: u.ingresoFolio ?? "",
            numeroExpediente: u.numeroExpediente,
            vin: u.vin,
            marca: u.marca,
            modelo: u.modelo,
            anio: u.anio,
            precioMinimoVenta: u.precioMinimoVenta,
            comisionMonto: u.comisionMonto,
            comisionPct: u.comisionPct,
            consignaFechaLimite: u.consignaFechaLimite,
          }))}
          recibos={recibos.map((d) => ({ id: d.id, folio: d.folio }))}
          sucursales={sucursales.map((s) => ({ id: s.id, clave: s.clave, nombre: s.nombre }))}
          formasPago={formas.map((f) => ({
            codigo: f.codigo,
            etiqueta: f.etiqueta,
            afectaCajaFisica: f.afectaCajaFisica,
          }))}
          ingresoPreseleccionado={ingresoPreseleccionado}
        />
      </BlurFade>
    </div>
  );
}

function Aviso({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        Liquidación de Venta en Consignación · CACM-RCI-03
      </h1>
      <Card>
        <CardHeader>
          <CardTitle>{titulo}</CardTitle>
          <CardDescription>{children}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/finanzas" className="text-sm underline">
            Volver a Finanzas
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
