import Link from "next/link";

import { IconoSilk } from "@/components/iconos/silk";
import { BlurFade } from "@/components/ui/blur-fade";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formasPago, listarEmpleados, listarSucursales } from "@/lib/finanzas/catalogos";

import { CapturaNomina } from "./captura-nomina";

export const dynamic = "force-dynamic";

export default async function NuevoReciboNominaPage() {
  const [sucursales, empleados, formas] = await Promise.all([
    listarSucursales({ soloActivas: true }),
    listarEmpleados({ soloActivos: true }),
    formasPago(),
  ]);

  // El trabajador sale del catálogo de personal, no de una casilla de texto: el
  // recibo es la constancia individual de pago de SU salario y tiene que poder
  // enlazarse con su número de empleado sin ambigüedad (LFT art. 804).
  if (sucursales.length === 0 || empleados.length === 0 || formas.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <IconoSilk nombre="listado" tamano={20} className="shrink-0" />
          Recibo de Pago de Nómina
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
                : empleados.length === 0
                  ? "No hay ningún trabajador dado de alta en el catálogo de personal, y el recibo es la constancia individual de pago de su salario."
                  : "No hay ninguna forma de pago dada de alta."}{" "}
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
            <IconoSilk nombre="listado" tamano={20} className="shrink-0" />
            Recibo de Pago de Nómina · CACM-RCI-06
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Constancia individual del pago de sueldo o salario. Complementa, no sustituye, el CFDI
            de nómina. El efectivo sale por su propio vale de egreso (CACM-RCI-05).
          </p>
        </div>
      </BlurFade>

      <BlurFade delay={0.1}>
        <CapturaNomina
          sucursales={sucursales.map((s) => ({ id: s.id, clave: s.clave, nombre: s.nombre }))}
          empleados={empleados.map((e) => ({
            id: e.id,
            numEmpleado: e.numEmpleado,
            nombre: e.nombre,
            puesto: e.puesto,
          }))}
          formasPago={formas.map((f) => ({ codigo: f.codigo, etiqueta: f.etiqueta }))}
        />
      </BlurFade>
    </div>
  );
}
