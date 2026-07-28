import Link from "next/link";
import { redirect } from "next/navigation";

import { BlurFade } from "@/components/ui/blur-fade";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getUsuarioSesion } from "@/lib/auth/usuario";
import { query } from "@/lib/db";
import { listarEmpleados, listarSucursales, tienePinDeFirma } from "@/lib/finanzas/catalogos";

import { AdministrarCatalogos, type UsuarioEnlazable } from "./administrar";

export const dynamic = "force-dynamic";

export default async function CatalogosFinanzasPage() {
  const sesion = await getUsuarioSesion();
  if (!sesion) redirect("/login");

  // La pantalla NO se le cierra a quien no es N3: el PIN de firma se establece
  // aquí y es de cada quien. Lo que se reserva a N3 es escribir los catálogos,
  // y el candado real vive en las rutas; esto sólo decide qué se dibuja.
  const esAdministrador = sesion.nivel === "N3";

  const [sucursales, empleados, tienePin, usuarios] = await Promise.all([
    // Con inactivas e inactivos: es la única pantalla desde la que se puede
    // reactivar lo que se dio de baja, así que tiene que poder verlo.
    listarSucursales({ soloActivas: false }),
    listarEmpleados({ soloActivos: false }),
    tienePinDeFirma(sesion.id),

    // El padrón de usuarios sólo se carga para quien va a poder enlazarlo a una
    // ficha de personal; a los demás no les hace falta ver quién tiene cuenta.
    esAdministrador
      ? query<UsuarioEnlazable>(
          `SELECT u.id::int AS id, u.nombre, u.email
             FROM traza.usuario u
            WHERE u.activo
            ORDER BY u.nombre`,
        ).then(({ rows }) => rows)
      : Promise.resolve([] as UsuarioEnlazable[]),
  ]);

  return (
    <div className="space-y-6">
      <BlurFade delay={0.05}>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Catálogos de Finanzas</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sucursales, personal y PIN de firma. Nada del módulo puede emitirse sin esto: el folio
            corre por sucursal y ningún documento se cierra sin una rúbrica que lo respalde.
          </p>
        </div>
      </BlurFade>

      {/* Personas y socios viven en su propia pantalla y no en una pestaña
          más: son catálogos que se consultan mientras se captura —"¿a este
          proveedor ya se le dio de alta?", "¿quién figura como socio?"— y
          poder llegar a ellos con una liga es parte de que sirvan. */}
      <BlurFade delay={0.08}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Link href="/finanzas/catalogos/personas" className="block">
            <Card className="h-full transition-colors hover:border-foreground/30 hover:bg-accent/50">
              <CardHeader>
                <CardTitle>Personas</CardTitle>
                <CardDescription>
                  A quién se le paga, y cuánto se le ha pagado. Sirve para no reteclear al proveedor
                  de todas las semanas; en el vale el nombre se puede seguir escribiendo libremente.
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>

          <Link href="/finanzas/catalogos/socios" className="block">
            <Card className="h-full transition-colors hover:border-foreground/30 hover:bg-accent/50">
              <CardHeader>
                <CardTitle>Socios</CardTitle>
                <CardDescription>
                  Quién tiene parte del capital social, con el acta que lo acredita. De aquí sale el
                  selector del retiro de utilidades: no es la lista de usuarios del sistema.
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        </div>
      </BlurFade>

      <BlurFade delay={0.12}>
        <AdministrarCatalogos
          sucursales={sucursales}
          empleados={empleados}
          usuarios={usuarios}
          tienePin={tienePin}
          esAdministrador={esAdministrador}
          miNombre={sesion.nombre}
        />
      </BlurFade>
    </div>
  );
}
