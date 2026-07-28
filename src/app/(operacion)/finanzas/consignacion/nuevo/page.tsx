import Link from "next/link";

import { BlurFade } from "@/components/ui/blur-fade";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formasPago, listarSucursales } from "@/lib/finanzas/catalogos";
import { datosPrecargadosDeExpediente } from "@/lib/finanzas/consignacion";

import { CapturaIngreso } from "./captura-ingreso";

export const dynamic = "force-dynamic";

/**
 * El RCI-02 no se abre en el aire: va anclado a un expediente ya abierto, del
 * que salen VIN, marca, modelo y año. Por eso la unidad llega por la barra de
 * direcciones (?expediente=123) y no por un selector: quien captura viene del
 * expediente, y elegir aquí "otra" unidad sería justamente la manera de que el
 * folio financiero y el expediente acaben describiendo dos coches distintos.
 */
export default async function NuevoIngresoPage({
  searchParams,
}: {
  searchParams: Promise<{ expediente?: string | string[] }>;
}) {
  const crudo = (await searchParams).expediente;
  const texto = Array.isArray(crudo) ? crudo[0] : crudo;
  const numero = Number(texto);
  const expedienteId =
    texto !== undefined && Number.isSafeInteger(numero) && numero > 0 ? numero : null;

  if (expedienteId === null) {
    return (
      <Aviso titulo="Abre el ingreso desde el expediente de la unidad">
        Este formato describe una unidad concreta, así que se captura sobre un expediente ya
        abierto: de ahí salen el VIN, la marca, el modelo y el año, sin volver a teclearlos.
      </Aviso>
    );
  }

  const ficha = await datosPrecargadosDeExpediente(expedienteId);
  if (!ficha) {
    return (
      <Aviso titulo="Ese expediente no existe">
        No hay ningún expediente con ese número, o todavía no tiene unidad asociada.
      </Aviso>
    );
  }

  // Una unidad entra al piso una sola vez. Si ya tiene su RCI-02, lo que
  // procede es corregir aquel folio —o emitir un complementario—, no abrir un
  // segundo ingreso que contaría la misma entrada dos veces.
  if (ficha.yaTieneIngreso) {
    return (
      <Aviso titulo={`El expediente ${ficha.numeroExpediente} ya tiene su ingreso a inventario`}>
        La unidad {ficha.marca} {ficha.modelo} {ficha.anio} ya entró al piso con un CACM-RCI-02. Si
        hay algo que corregir, se hace sobre aquel folio: un segundo ingreso registraría dos veces
        la misma entrada.
      </Aviso>
    );
  }

  const [sucursales, formas] = await Promise.all([
    listarSucursales({ soloActivas: true }),
    formasPago({ soloActivos: true }),
  ]);

  if (sucursales.length === 0) {
    return (
      <Aviso titulo="Falta dar de alta la primera sucursal">
        El folio es consecutivo por sucursal y por tipo, así que ningún documento puede emitirse
        hasta que exista al menos una. La da de alta un administrador del sistema.
      </Aviso>
    );
  }

  return (
    <div className="space-y-6">
      <BlurFade delay={0.05}>
        <div>
          <p className="font-mono text-sm text-muted-foreground">
            Expediente {ficha.numeroExpediente}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Ingreso de Vehículo a Inventario · CACM-RCI-02
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Control de entrada de unidades. El folio se emite al guardar; las firmas van después.
          </p>
        </div>
      </BlurFade>

      <BlurFade delay={0.1}>
        <CapturaIngreso
          ficha={{
            expedienteId: ficha.expedienteId,
            numeroExpediente: ficha.numeroExpediente,
            origen: ficha.origen,
            tipoOperacion: ficha.tipoOperacionSugerido,
            vin: ficha.vin,
            marca: ficha.marca,
            modelo: ficha.modelo,
            anio: ficha.anio,
            color: ficha.color,
            numMotor: ficha.numMotor,
            kilometrajeIngreso: ficha.kilometrajeIngreso,
          }}
          sucursales={sucursales.map((s) => ({ id: s.id, clave: s.clave, nombre: s.nombre }))}
          formasPago={formas.map((f) => ({ codigo: f.codigo, etiqueta: f.etiqueta }))}
        />
      </BlurFade>
    </div>
  );
}

function Aviso({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        Ingreso de Vehículo a Inventario · CACM-RCI-02
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
