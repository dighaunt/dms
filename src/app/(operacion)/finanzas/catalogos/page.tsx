import { redirect } from "next/navigation";

import { BlurFade } from "@/components/ui/blur-fade";
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
