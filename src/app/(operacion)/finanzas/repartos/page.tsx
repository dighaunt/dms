import Link from "next/link";
import { redirect } from "next/navigation";
import { HandshakeIcon } from "lucide-react";

import { IconoSilk } from "@/components/iconos/silk";
import { Badge } from "@/components/ui/badge";
import { BlurFade } from "@/components/ui/blur-fade";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getUsuarioSesion } from "@/lib/auth/usuario";
import { anticiposDeSocios, listarRepartosUtilidades } from "@/lib/finanzas/egresos";
import { importeEnCasillas } from "@/lib/finanzas/formato";
import { listarSocios } from "@/lib/finanzas/personas";

import { RegistrarReparto, type SocioCandidato } from "./registrar-reparto";

export const dynamic = "force-dynamic";

/**
 * Reparto formal de utilidades — la salida de la regla 5.
 *
 * El manual (y detrás de él el artículo 19 de la LGSM) dice que el retiro de un
 * socio es un ANTICIPO A CUENTA hasta que un balance aprobado arroje utilidades
 * repartibles. El módulo sabía levantar ese saldo —cada vale RCI-05 firmado con
 * concepto de retiro lo engrosa, y un disparador avisa al gerente— pero no
 * tenía manera de bajarlo: `v_anticipo_utilidades_socio` sólo sabía acusar.
 *
 * Esta pantalla es la absolución, y por eso enseña las dos mitades juntas: la
 * posición de cada socio arriba y los repartos que la respaldan abajo. Una
 * cifra por comprobar sin el documento que la explique no es rendición de
 * cuentas.
 */
export default async function RepartosUtilidadesPage() {
  const sesion = await getUsuarioSesion();
  if (!sesion) redirect("/login");

  /**
   * Asentar el reparto es aplicar un acuerdo de asamblea, no capturar una
   * operación: lo autoriza un socio o el Gerente General, que es como entra al
   * sistema el nivel N3. La consulta queda abierta —la posición de cada socio
   * ya se enseña en la captura del vale, antes de entregar el dinero— y el
   * candado real vive en la ruta; esto sólo decide qué se dibuja.
   */
  const puedeRegistrar = sesion.nivel === "N3";

  const [posiciones, repartos, socios] = await Promise.all([
    anticiposDeSocios(),
    listarRepartosUtilidades(),

    // A quién se le puede repartir lo dice el REGISTRO DE SOCIOS, no el padrón
    // de usuarios del sistema: la utilidad le corresponde a quien tiene parte
    // del capital social, y eso se acredita con un acta. La posición de cada
    // uno se cruza después, por la persona.
    puedeRegistrar ? listarSocios({ soloActivos: true }) : Promise.resolve([]),
  ]);

  const posicionPorSocio = new Map(posiciones.map((p) => [p.socioPersonaId, p]));

  const candidatos: SocioCandidato[] = socios.map((socio) => {
    const posicion = posicionPorSocio.get(socio.personaId);
    return {
      personaId: socio.personaId,
      nombre: socio.nombre,
      totalAnticipos: posicion?.totalAnticipos ?? "0.00",
      totalRepartido: posicion?.totalRepartido ?? "0.00",
      saldoPorComprobar: posicion?.saldoPorComprobar ?? "0.00",
      tieneSaldoPorComprobar: posicion?.tieneSaldoPorComprobar ?? false,
      // La etiqueta la redacta `posicionSocio` en calculos.ts: es la regla del
      // artículo 19 dicha en palabras, y no se reescribe aquí.
      etiquetaPosicion: posicion?.etiqueta ?? null,
    };
  });

  const conSaldo = posiciones.filter((p) => p.tieneSaldoPorComprobar).length;

  return (
    <div className="space-y-6">
      <BlurFade delay={0.05}>
        <div>
          {/* El pastel partido es lo que es un reparto de utilidades; es el
              mismo icono con el que se llega desde el panel de Finanzas. */}
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <IconoSilk nombre="pastel" tamano={20} className="shrink-0" />
            Reparto de utilidades
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            El retiro de un socio es un anticipo a cuenta de utilidades hasta que un balance
            aprobado las arroje (LGSM art. 19). El reparto formal es el único hecho que convierte
            ese anticipo en utilidad repartida.{" "}
            <Link href="/finanzas" className="underline">
              Volver a Finanzas
            </Link>
          </p>
        </div>
      </BlurFade>

      <BlurFade delay={0.1}>
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              <HandshakeIcon className="size-4 shrink-0" />
              Posición de cada socio
              {conSaldo > 0 && <Badge variant="secondary">{conSaldo} con saldo</Badge>}
            </CardTitle>
            <CardDescription>
              Cuánto ha retirado con vales ya firmados, cuánto le respaldan los repartos formales y
              cuánto le queda por comprobar. El saldo es acumulado histórico, no del periodo: es una
              cuenta corriente entre el socio y la sociedad.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {posiciones.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Todavía no hay ningún socio dado de alta. Ser socio se acredita con un acta y no se
                deduce de tener cuenta en el sistema:{" "}
                <Link href="/finanzas/catalogos/socios" className="underline">
                  regístralos primero
                </Link>
                .
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Socio</TableHead>
                      <TableHead className="text-right">Retirado (anticipos)</TableHead>
                      <TableHead className="text-right">Respaldado por repartos</TableHead>
                      <TableHead className="text-right">Por comprobar</TableHead>
                      <TableHead>Situación</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {posiciones.map((p) => (
                      <TableRow key={p.socioPersonaId}>
                        <TableCell className="font-medium">{p.socioNombre}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {importeEnCasillas(p.totalAnticipos).texto}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {importeEnCasillas(p.totalRepartido).texto}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums font-semibold">
                          {importeEnCasillas(p.saldoPorComprobar).texto}
                        </TableCell>
                        <TableCell>
                          <Badge variant={p.tieneSaldoPorComprobar ? "destructive" : "secondary"}>
                            {p.etiqueta}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </BlurFade>

      <BlurFade delay={0.15}>
        <RegistrarReparto
          socios={candidatos}
          puedeRegistrar={puedeRegistrar}
          ejerciciosUsados={repartos.map((reparto) => reparto.ejercicio)}
        />
      </BlurFade>

      <BlurFade delay={0.2}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconoSilk nombre="listado" className="shrink-0" />
              Repartos registrados
            </CardTitle>
            <CardDescription>
              Del balance más reciente al más antiguo. Cada uno es inmutable: no admite corrección
              ni baja, sólo otro reparto que lo complemente.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {repartos.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Todavía no se ha asentado ningún reparto formal. Mientras no exista uno, todo retiro
                de socio queda como saldo por comprobar.
              </p>
            ) : (
              <ul className="space-y-4">
                {repartos.map((reparto) => (
                  <li key={reparto.id} className="rounded-md border p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="font-mono">
                          {reparto.ejercicio}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          Balance del {reparto.fechaBalance}
                        </span>
                      </div>
                      <span className="font-mono text-sm tabular-nums">
                        {importeEnCasillas(reparto.utilidadRepartible).texto} repartibles
                      </span>
                    </div>

                    <p className="mt-2 text-sm">{reparto.actaReferencia}</p>

                    <ul className="mt-3 divide-y text-sm">
                      {reparto.asignaciones.map((asignacion) => (
                        <li
                          key={asignacion.socioPersonaId}
                          className="flex justify-between gap-4 py-1.5"
                        >
                          <span>{asignacion.socioNombre}</span>
                          <span className="font-mono tabular-nums">
                            {importeEnCasillas(asignacion.montoAsignado).texto}
                          </span>
                        </li>
                      ))}
                    </ul>

                    <p className="mt-3 text-xs text-muted-foreground">
                      Sin asignar {importeEnCasillas(reparto.remanenteSinAsignar).texto} · autorizó{" "}
                      {reparto.autorizadoPorNombre} el{" "}
                      {new Date(reparto.creadoEn).toLocaleString("es-MX")}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </BlurFade>
    </div>
  );
}
