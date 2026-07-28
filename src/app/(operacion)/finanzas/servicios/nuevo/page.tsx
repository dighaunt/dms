import Link from "next/link";

import { BlurFade } from "@/components/ui/blur-fade";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formasPago, listarEmpleados, listarSucursales } from "@/lib/finanzas/catalogos";

import { CapturaServicio } from "./captura-servicio";

export const dynamic = "force-dynamic";

export default async function NuevoIngresoServicioPage() {
  const [sucursales, empleados, formas] = await Promise.all([
    listarSucursales({ soloActivas: true }),
    listarEmpleados({ soloActivos: true }),
    formasPago(),
  ]);

  // Sin sucursal no hay folio posible —el consecutivo corre por sucursal y por
  // tipo— y sin empleado no hay quién entregue el efectivo al custodio.
  // Decirlo aquí evita que alguien capture media hoja y se estrelle al guardar.
  if (sucursales.length === 0 || empleados.length === 0 || formas.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Recibo de Ingreso por Servicio</h1>
        <Card>
          <CardHeader>
            <CardTitle>Falta configurar el catálogo</CardTitle>
            <CardDescription>
              {sucursales.length === 0
                ? "No hay ninguna sucursal dada de alta, y el folio es consecutivo por sucursal y por tipo."
                : empleados.length === 0
                  ? "No hay ningún empleado dado de alta, y el recibo tiene que decir qué asesor o cajero de servicio cobró."
                  : "No hay ninguna forma de pago dada de alta, y de ella depende si el cobro entra o no al arqueo del corte."}{" "}
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

  return (
    <div className="space-y-6">
      <BlurFade delay={0.05}>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Recibo de Ingreso por Servicio · CACM-RCI-04
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cobranza del área de servicio / taller y su entrega al Custodio Financiero. El folio se
            emite al guardar; las firmas van después.
          </p>
        </div>
      </BlurFade>

      <BlurFade delay={0.1}>
        <CapturaServicio
          sucursales={sucursales.map((s) => ({ id: s.id, clave: s.clave, nombre: s.nombre }))}
          empleados={empleados.map((e) => ({
            id: e.id,
            numEmpleado: e.numEmpleado,
            nombre: e.nombre,
            puesto: e.puesto,
          }))}
          // `afectaCajaFisica` viaja porque cambia lo que la pantalla debe
          // decir: sólo el efectivo pasa físicamente al custodio y engorda el
          // arqueo del corte. Con tarjeta no hay dinero que entregar en mano.
          formasPago={formas.map((f) => ({
            codigo: f.codigo,
            etiqueta: f.etiqueta,
            afectaCajaFisica: f.afectaCajaFisica,
          }))}
        />
      </BlurFade>
    </div>
  );
}
