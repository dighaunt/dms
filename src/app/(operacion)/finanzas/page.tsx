import Link from "next/link";
import { HandshakeIcon, UsersIcon } from "lucide-react";

import { IconoSilk } from "@/components/iconos/silk";
import { BlurFade } from "@/components/ui/blur-fade";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getUsuarioSesion } from "@/lib/auth/usuario";
import { aCentavos, deCentavos } from "@/lib/finanzas/calculos";
import { listarSucursales } from "@/lib/finanzas/catalogos";
import { custodiaPendiente } from "@/lib/finanzas/cobranza";
import { corteDelDia, foliosPendientesDelDia } from "@/lib/finanzas/corte";
import { ETIQUETA_ALERTA_FINANZAS, alertasAbiertas } from "@/lib/finanzas/egresos";
import { HORAS_ALERTA_CUSTODIA, custodiaEstaVencida, importeEnCasillas } from "@/lib/finanzas/formato";

import { AtenderAlerta } from "./atender-alerta";
import { VerificadorSello } from "./verificador-sello";

export const dynamic = "force-dynamic";

function hoy(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Los siete formatos del manual y la pantalla desde la que se emite cada uno.
 * El orden es el del manual, no el de uso: quien tiene la forma impresa
 * enfrente busca por código, y encontrarlo fuera de orden hace dudar de si es
 * el mismo documento.
 *
 * Cada formato lleva un icono distinto porque esta lista se recorre con la
 * vista, no se lee renglón por renglón: el billete es la cobranza, la caja
 * abierta es el inventario, el peso es la liquidación al consignante, la llave
 * inglesa es el taller, el vale amarillo es la salida de dinero, la lista es la
 * nómina y las monedas apiladas son el corte del día —las mismas del menú
 * lateral—. Dos formatos con el mismo icono no ayudarían a nadie, así que
 * ninguno se repite.
 */
const FORMATOS = [
  {
    codigo: "CACM-RCI-01",
    nombre: "Recibo de Caja Interno",
    resumen: "Efectivo cobrado en una venta de vehículo, del vendedor al Custodio Financiero.",
    href: "/finanzas/recibos/nuevo",
    icono: "dinero",
  },
  {
    codigo: "CACM-RCI-02",
    nombre: "Ingreso de Vehículo a Inventario",
    resumen: "Cómo entra la unidad: compra directa o consignación de un tercero.",
    href: "/finanzas/consignacion/nuevo",
    icono: "caja3d",
  },
  {
    codigo: "CACM-RCI-03",
    nombre: "Liquidación de Venta en Consignación",
    resumen: "Lo que se paga al consignante y la utilidad neta que queda a la empresa.",
    href: "/finanzas/consignacion/liquidar",
    icono: "peso",
  },
  {
    codigo: "CACM-RCI-04",
    nombre: "Recibo de Ingreso por Servicio",
    resumen: "Efectivo cobrado en servicio o taller, entregado al Custodio Financiero.",
    href: "/finanzas/servicios/nuevo",
    icono: "herramienta",
  },
  {
    codigo: "CACM-RCI-05",
    nombre: "Vale de Egreso de Caja",
    resumen: "Toda salida de dinero: comisiones, proveedores, gastos y retiros de socio.",
    href: "/finanzas/egresos/nuevo",
    icono: "nota",
  },
  {
    codigo: "CACM-RCI-06",
    nombre: "Recibo de Pago de Nómina",
    resumen: "Constancia individual del pago de sueldo a cada trabajador.",
    href: "/finanzas/nomina/nuevo",
    icono: "listado",
  },
  {
    codigo: "CACM-RCI-07",
    nombre: "Corte de Caja Diario",
    resumen: "Rendición de cuentas del día: cuánto entró, cuánto salió y dónde quedó.",
    href: "/finanzas/cortes",
    icono: "monedas",
  },
] as const;

export default async function FinanzasPage() {
  const [sesion, sucursales] = await Promise.all([
    getUsuarioSesion(),
    listarSucursales({ soloActivas: true }),
  ]);

  /**
   * Atender una alerta es supervisar a quien tenía el dinero a su cargo, así
   * que se reserva a N2 y N3. El candado real vive en la ruta; esto sólo decide
   * si se dibuja el botón o se explica a quién hay que ir a buscar.
   */
  const puedeAtenderAlertas = sesion?.nivel === "N2" || sesion?.nivel === "N3";

  // Sin sucursal no hay folios posibles: el consecutivo corre por sucursal y
  // tipo. Es lo primero que un administrador tiene que dar de alta.
  if (sucursales.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <IconoSilk nombre="finanzas" tamano={20} className="shrink-0" />
          Finanzas
        </h1>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconoSilk nombre="aviso" className="shrink-0" />
              Falta dar de alta la primera sucursal
            </CardTitle>
            <CardDescription>
              El folio de cada formato es consecutivo por sucursal y por tipo, así que ningún
              documento puede emitirse hasta que exista al menos una. La da de alta un
              administrador del sistema.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const principal = sucursales[0];
  const fecha = hoy();

  const [pendientes, corte, sinFirmar, alertas] = await Promise.all([
    custodiaPendiente({ sucursalId: principal.id }),
    corteDelDia(principal.id, fecha),
    foliosPendientesDelDia(principal.id, fecha),
    alertasAbiertas({ sucursalId: principal.id }),
  ]);

  // En centavos y con BigInt: sumar importes como Number reintroduce justo el
  // error de punto flotante que `calculos.ts` existe para evitar, y este total
  // es el que se coteja contra el efectivo que hay físicamente en el cajón.
  const enTransito = deCentavos(
    pendientes.reduce((suma, p) => suma + (aCentavos(p.importe ?? "0") ?? 0n), 0n),
  );

  return (
    <div className="space-y-6">
      <BlurFade delay={0.05}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              <IconoSilk nombre="finanzas" tamano={20} className="shrink-0" />
              Finanzas
            </h1>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <IconoSilk nombre="sucursal" className="shrink-0" />
              Control interno de efectivo · {principal.nombre} ({principal.clave})
            </p>
          </div>
          <Button asChild>
            <Link href="/finanzas/recibos/nuevo">
              <IconoSilk nombre="agregar" className="shrink-0" />
              Nuevo recibo de caja
            </Link>
          </Button>
        </div>
      </BlurFade>

      {/* Regla 1: mientras el custodio no confirme, el dinero NO es de la
          empresa. La pantalla lo dice con esas palabras a propósito. */}
      <BlurFade delay={0.1}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconoSilk nombre="dinero" className="shrink-0" />
              Dinero en tránsito
              {pendientes.length > 0 && (
                <Badge variant="secondary">{pendientes.length}</Badge>
              )}
            </CardTitle>
            <CardDescription>
              Entregado por quien cobró y todavía sin confirmar por el Custodio Financiero. Hasta
              esa confirmación sigue bajo responsabilidad de quien lo entregó, no de la empresa.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {pendientes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hay cobros esperando confirmación de custodia.
              </p>
            ) : (
              <>
                <p className="mb-3 text-sm">
                  Total sin confirmar:{" "}
                  <span className="font-semibold">{importeEnCasillas(enTransito).texto}</span>
                </p>
                <ul className="divide-y text-sm">
                  {pendientes.map((p) => (
                    <li key={p.documentoId} className="flex flex-wrap items-center gap-2 py-2">
                      <Link
                        href={`/finanzas/documentos/${p.documentoId}`}
                        className="font-mono hover:underline"
                      >
                        {p.folio}
                      </Link>
                      <span className="text-muted-foreground">
                        {p.importe ? importeEnCasillas(p.importe).texto : "sin capturar"}
                      </span>
                      {custodiaEstaVencida(p.horasEnTransito) && (
                        <Badge variant="destructive">
                          {p.horasEnTransito} h sin confirmar
                        </Badge>
                      )}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-muted-foreground">
                  Se señala a partir de {HORAS_ALERTA_CUSTODIA} horas.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </BlurFade>

      <div className="grid gap-6 md:grid-cols-2">
        <BlurFade delay={0.15}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <IconoSilk nombre="monedas" className="shrink-0" />
                Corte del día
              </CardTitle>
              <CardDescription>
                {fecha} · el corte jala los folios firmados; el único dato que se teclea es el
                efectivo contado.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {corte ? (
                <>
                  <p>
                    Folio <span className="font-mono">{corte.folio}</span> ·{" "}
                    <Badge variant="outline">{corte.estado}</Badge>
                  </p>
                  <p className="text-muted-foreground">
                    Ingresos {importeEnCasillas(corte.totalIngresos).texto} · Egresos{" "}
                    {importeEnCasillas(corte.totalEgresos).texto}
                  </p>
                  <Button asChild variant="secondary" size="sm">
                    <Link href={`/finanzas/cortes/${corte.documentoId}`}>
                      <IconoSilk nombre="monedas" className="shrink-0" />
                      Abrir corte
                    </Link>
                  </Button>
                </>
              ) : (
                <p className="text-muted-foreground">
                  Todavía no se ha abierto el corte de hoy.
                </p>
              )}

              {sinFirmar.length > 0 && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
                  <p className="flex items-start gap-2 font-medium">
                    <IconoSilk nombre="advertencia" className="mt-0.5 shrink-0" />
                    El día no puede cerrarse: {sinFirmar.length} folio(s) sin firmar
                  </p>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    {sinFirmar.map((f) => f.folio).join(" · ")}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </BlurFade>

        <BlurFade delay={0.2}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <IconoSilk nombre="riesgo" className="shrink-0" />
                Alertas abiertas
                {alertas.length > 0 && <Badge variant="destructive">{alertas.length}</Badge>}
              </CardTitle>
              <CardDescription>
                Faltantes de caja y retiros de socio sin reparto formal que los respalde. Atender
                una alerta no la borra: la explica, con nombre, hora y nota de quien la revisó.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {alertas.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin alertas pendientes de atender.</p>
              ) : (
                <ul className="space-y-3 text-sm">
                  {alertas.map((a) => (
                    <li key={a.id} className="space-y-1.5">
                      <div className="flex flex-wrap items-start gap-2">
                        <Badge variant={a.severidad === "GRAVE" ? "destructive" : "secondary"}>
                          {a.severidad}
                        </Badge>
                        <span className="flex-1">{a.mensaje}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{ETIQUETA_ALERTA_FINANZAS[a.tipo] ?? a.tipo}</span>
                        <span>·</span>
                        <span>{new Date(a.creadaEn).toLocaleString("es-MX")}</span>
                        {a.folio && (
                          <>
                            <span>·</span>
                            <Link
                              href={`/finanzas/documentos/${a.documentoId}`}
                              className="font-mono hover:underline"
                            >
                              {a.folio}
                            </Link>
                          </>
                        )}
                        <AtenderAlerta
                          alertaId={a.id}
                          mensaje={a.mensaje}
                          etiquetaTipo={ETIQUETA_ALERTA_FINANZAS[a.tipo] ?? a.tipo}
                          severidad={a.severidad}
                          puedeAtender={puedeAtenderAlertas}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </BlurFade>
      </div>

      <BlurFade delay={0.25}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconoSilk nombre="formulario" className="shrink-0" />
              Emitir un formato
            </CardTitle>
            <CardDescription>
              Los siete formatos de control interno. El folio es consecutivo por sucursal y por
              tipo, y se consume al emitirlo: se abre uno cuando ya se va a llenar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 sm:grid-cols-2">
              {FORMATOS.map((formato) => (
                <li key={formato.codigo}>
                  <Link
                    href={formato.href}
                    className="flex h-full gap-3 rounded-md border p-3 transition-colors hover:border-foreground/30 hover:bg-accent/50"
                  >
                    <IconoSilk nombre={formato.icono} tamano={20} className="mt-0.5 shrink-0" />
                    <span className="flex flex-col gap-1">
                      <span className="font-mono text-xs text-muted-foreground">
                        {formato.codigo}
                      </span>
                      <span className="text-sm font-medium">{formato.nombre}</span>
                      <span className="text-xs text-muted-foreground">{formato.resumen}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>

            <Separator className="my-4" />

            <div className="flex flex-wrap gap-2">
              <Button asChild variant="secondary" size="sm">
                <Link href="/finanzas/cortes">
                  <IconoSilk nombre="monedas" className="shrink-0" />
                  Cortes de caja
                </Link>
              </Button>
              {/* No es un formato del manual, pero sin él la regla 5 no cierra:
                  es el único hecho que convierte el anticipo de un socio en
                  utilidad repartida. */}
              <Button asChild variant="secondary" size="sm">
                <Link href="/finanzas/repartos">
                  {/* El pastel partido es lo que es un reparto de utilidades. */}
                  <IconoSilk nombre="pastel" className="shrink-0" />
                  Reparto de utilidades
                </Link>
              </Button>
              <Button asChild variant="secondary" size="sm">
                <Link href="/finanzas/reportes">
                  <IconoSilk nombre="reportes" className="shrink-0" />
                  Reportes
                </Link>
              </Button>
              <Button asChild variant="secondary" size="sm">
                <Link href="/finanzas/catalogos">
                  <IconoSilk nombre="llave" className="shrink-0" />
                  Catálogos y PIN de firma
                </Link>
              </Button>
              {/* Silk no tiene ningún icono de persona ni de grupo, así que
                  estas dos entradas —y sólo éstas— se quedan con el juego
                  monocromo, que sí los trae. */}
              <Button asChild variant="secondary" size="sm">
                <Link href="/finanzas/catalogos/personas">
                  <UsersIcon className="shrink-0" />
                  Personas
                </Link>
              </Button>
              {/* Ser socio es tener parte del capital social y se acredita con
                  un acta; no se deduce de tener cuenta en el sistema. */}
              <Button asChild variant="secondary" size="sm">
                <Link href="/finanzas/catalogos/socios">
                  <HandshakeIcon className="shrink-0" />
                  Socios
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </BlurFade>

      <BlurFade delay={0.3}>
        <VerificadorSello />
      </BlurFade>
    </div>
  );
}
