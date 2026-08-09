import Link from "next/link";

import { IconoSilk } from "@/components/iconos/silk";
import { BlurFade } from "@/components/ui/blur-fade";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { conceptosCobro, listarEmpleados, listarSucursales } from "@/lib/finanzas/catalogos";

import { CapturaRecibo } from "./captura-recibo";

export const dynamic = "force-dynamic";

export default async function NuevoReciboPage() {
  const [sucursales, empleados, conceptos] = await Promise.all([
    listarSucursales({ soloActivas: true }),
    listarEmpleados({ soloActivos: true }),
    conceptosCobro(),
  ]);

  
  
  if (sucursales.length === 0 || empleados.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <IconoSilk nombre="dinero" tamano={20} className="shrink-0" />
          Recibo de Caja Interno
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
                : "No hay ningún empleado dado de alta, y el recibo tiene que decir quién entregó el efectivo."}{" "}
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
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <IconoSilk nombre="dinero" tamano={20} className="shrink-0" />
            Recibo de Caja Interno · CACM-RCI-01
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Entrega–recepción de efectivo por cobranza de venta de vehículo. El folio se emite al
            guardar; las firmas van después.
          </p>
        </div>
      </BlurFade>

      <BlurFade delay={0.1}>
        <CapturaRecibo
          sucursales={sucursales.map((s) => ({ id: s.id, nombre: s.nombre, clave: s.clave }))}
          empleados={empleados.map((e) => ({ id: e.id, nombre: `${e.numEmpleado} · ${e.nombre}` }))}
          conceptos={conceptos.map((c) => ({ codigo: c.codigo, etiqueta: c.etiqueta }))}
        />
      </BlurFade>
    </div>
  );
}
