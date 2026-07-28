import Link from "next/link";

import { BlurFade } from "@/components/ui/blur-fade";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listarSucursales } from "@/lib/finanzas/catalogos";
import { custodiaPendiente } from "@/lib/finanzas/cobranza";
import { corteDelDia, foliosPendientesDelDia } from "@/lib/finanzas/corte";
import { alertasAbiertas } from "@/lib/finanzas/egresos";
import { HORAS_ALERTA_CUSTODIA, custodiaEstaVencida, importeEnCasillas } from "@/lib/finanzas/formato";

import { VerificadorSello } from "./verificador-sello";

export const dynamic = "force-dynamic";

function hoy(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function FinanzasPage() {
  const sucursales = await listarSucursales({ soloActivas: true });

  // Sin sucursal no hay folios posibles: el consecutivo corre por sucursal y
  // tipo. Es lo primero que un administrador tiene que dar de alta.
  if (sucursales.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Finanzas</h1>
        <Card>
          <CardHeader>
            <CardTitle>Falta dar de alta la primera sucursal</CardTitle>
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

  const enTransito = pendientes.reduce(
    (suma, p) => suma + Number(p.importe ?? 0),
    0,
  );

  return (
    <div className="space-y-6">
      <BlurFade delay={0.05}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Finanzas</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Control interno de efectivo · {principal.nombre} ({principal.clave})
            </p>
          </div>
          <Button asChild>
            <Link href="/finanzas/recibos/nuevo">Nuevo recibo de caja</Link>
          </Button>
        </div>
      </BlurFade>

      {/* Regla 1: mientras el custodio no confirme, el dinero NO es de la
          empresa. La pantalla lo dice con esas palabras a propósito. */}
      <BlurFade delay={0.1}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
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
              <CardTitle>Corte del día</CardTitle>
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
                    <Link href={`/finanzas/cortes/${corte.documentoId}`}>Abrir corte</Link>
                  </Button>
                </>
              ) : (
                <p className="text-muted-foreground">
                  Todavía no se ha abierto el corte de hoy.
                </p>
              )}

              {sinFirmar.length > 0 && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
                  <p className="font-medium">
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
                Alertas abiertas
                {alertas.length > 0 && <Badge variant="destructive">{alertas.length}</Badge>}
              </CardTitle>
              <CardDescription>
                Faltantes de caja y retiros de socio sin reparto formal que los respalde.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {alertas.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin alertas pendientes de atender.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {alertas.map((a) => (
                    <li key={a.id} className="flex gap-2">
                      <Badge variant={a.severidad === "GRAVE" ? "destructive" : "secondary"}>
                        {a.severidad}
                      </Badge>
                      <span>{a.mensaje}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </BlurFade>
      </div>

      <BlurFade delay={0.25}>
        <VerificadorSello />
      </BlurFade>
    </div>
  );
}
