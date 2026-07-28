import Link from "next/link";
import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { BlurFade } from "@/components/ui/blur-fade";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requerirUsuario } from "@/lib/api";
import { listarSucursales } from "@/lib/finanzas/catalogos";
import { abrirCorte, corteDelDia, foliosPendientesDelDia } from "@/lib/finanzas/corte";
import { importeEnCasillas } from "@/lib/finanzas/formato";
import { ETIQUETA_ESTADO_DOCUMENTO, type EstadoDocumentoFinanciero } from "@/lib/finanzas/tipos";

export const dynamic = "force-dynamic";

const COLOR_ESTADO: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  BORRADOR: "outline",
  PENDIENTE_DE_FIRMA: "secondary",
  FIRMADO: "default",
  CANCELADO: "destructive",
};

/** Un parámetro repetido en la URL llega como arreglo; se toma el primero. */
function unico(valor: string | string[] | undefined): string | undefined {
  if (valor === undefined) return undefined;
  const texto = Array.isArray(valor) ? valor[0] : valor;
  return texto?.trim() === "" ? undefined : texto;
}

function hoy(): string {
  return new Date().toISOString().slice(0, 10);
}

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;

export default async function CortesPage({
  searchParams,
}: {
  searchParams: Promise<{ [clave: string]: string | string[] | undefined }>;
}) {
  const parametros = await searchParams;
  const fechaCruda = unico(parametros.fecha);
  // La fecha decide qué folios jala el corte, así que se muestra siempre
  // editable: quien cierra a medianoche necesita poder pedir el día anterior.
  const fecha = fechaCruda && ES_FECHA.test(fechaCruda) ? fechaCruda : hoy();

  const sucursales = await listarSucursales({ soloActivas: true });

  if (sucursales.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Cortes de caja diarios</h1>
        <Card>
          <CardHeader>
            <CardTitle>Todavía no hay sucursales</CardTitle>
            <CardDescription>
              El corte se abre por sucursal y su folio es consecutivo por sucursal, así que no
              puede emitirse ninguno hasta que exista al menos una.{" "}
              <Link href="/finanzas" className="underline">
                Volver a Finanzas
              </Link>
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const tablero = await Promise.all(
    sucursales.map(async (sucursal) => ({
      sucursal,
      corte: await corteDelDia(sucursal.id, fecha),
      pendientes: await foliosPendientesDelDia(sucursal.id, fecha),
    })),
  );

  /**
   * Abre el corte del día, o lleva al que ya existe.
   *
   * La consulta previa no es una comodidad: `corte.ts` advierte que la UNIQUE
   * (sucursal, fecha, turno) no puede impedir un segundo corte SIN turno,
   * porque en SQL dos NULL no son iguales. Emitir otro folio aquí partiría el
   * día en dos rendiciones de cuentas incompletas.
   */
  async function abrirCorteDelDia(datos: FormData) {
    "use server";

    const { usuario } = await requerirUsuario();
    if (!usuario) throw new Error("Tu sesión terminó. Vuelve a entrar para abrir el corte.");

    const sucursalId = Number(datos.get("sucursal"));
    const dia = String(datos.get("fecha") ?? "");
    const turnoCrudo = String(datos.get("turno") ?? "").trim();
    const turno = turnoCrudo === "" ? null : turnoCrudo;

    const existente = await corteDelDia(sucursalId, dia, turno);
    const corte =
      existente ??
      // El custodio es quien abre: el corte es la rendición de cuentas de quien
      // tiene el efectivo a su cargo, no un trámite que se hace por otro.
      (await abrirCorte(
        { sucursalId, fecha: dia, turno, custodioUsuarioId: usuario.id },
        usuario.id,
      ));

    redirect(`/finanzas/cortes/${corte.documentoId}`);
  }

  return (
    <div className="space-y-6">
      <BlurFade delay={0.05}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Cortes de caja diarios</h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              CACM-RCI-07. Es la rendición de cuentas diaria de quien tiene el efectivo a su
              cargo: concentra los folios firmados del día y responde cuánto entró, cuánto salió y
              dónde quedó el dinero.
            </p>
          </div>
          <form method="get" className="flex items-end gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="fecha">Fecha del corte</Label>
              <Input id="fecha" name="fecha" type="date" defaultValue={fecha} className="w-44" />
            </div>
            <Button type="submit" variant="secondary">
              Ver
            </Button>
          </form>
        </div>
      </BlurFade>

      <div className="grid gap-6 md:grid-cols-2">
        {tablero.map(({ sucursal, corte, pendientes }, indice) => (
          <BlurFade key={sucursal.id} delay={0.1 + indice * 0.05}>
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  {sucursal.clave} · {sucursal.nombre}
                  {corte?.estado && (
                    <Badge variant={COLOR_ESTADO[corte.estado] ?? "outline"}>
                      {ETIQUETA_ESTADO_DOCUMENTO[corte.estado as EstadoDocumentoFinanciero] ??
                        corte.estado}
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  {fecha}
                  {corte?.turno ? ` · turno ${corte.turno}` : ""}
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4 text-sm">
                {corte ? (
                  <>
                    <p className="font-mono text-xs text-muted-foreground">
                      {corte.folioCompleto}
                    </p>
                    <dl className="grid grid-cols-2 gap-y-1">
                      <dt className="text-muted-foreground">Ingresos del día</dt>
                      <dd className="text-right font-mono tabular-nums">
                        {importeEnCasillas(corte.totalIngresos).texto}
                      </dd>
                      <dt className="text-muted-foreground">Egresos del día</dt>
                      <dd className="text-right font-mono tabular-nums">
                        {importeEnCasillas(corte.totalEgresos).texto}
                      </dd>
                      <dt className="font-medium">Debería existir en caja</dt>
                      <dd className="text-right font-mono font-medium tabular-nums">
                        {importeEnCasillas(corte.saldoCalculado).texto}
                      </dd>
                      {corte.efectivoContado !== null && (
                        <>
                          <dt className="text-muted-foreground">Arqueo real</dt>
                          <dd className="text-right font-mono tabular-nums">
                            {importeEnCasillas(corte.efectivoContado).texto}
                          </dd>
                        </>
                      )}
                    </dl>

                    {corte.diferencia !== null && corte.diferencia !== "0.00" && (
                      <Badge variant="destructive">
                        Diferencia {importeEnCasillas(corte.diferencia).texto}
                      </Badge>
                    )}

                    <Button asChild size="sm" variant="secondary">
                      <Link href={`/finanzas/cortes/${corte.documentoId}`}>
                        {corte.estado === "BORRADOR" ? "Contar y cerrar el día" : "Ver el corte"}
                      </Link>
                    </Button>
                  </>
                ) : (
                  <form action={abrirCorteDelDia} className="space-y-3">
                    <p className="text-muted-foreground">
                      El corte de este día todavía no se abre. Al abrirlo se emite su folio
                      RCI-07; los importes no se capturan, los jala de los folios firmados.
                    </p>
                    <input type="hidden" name="sucursal" value={sucursal.id} />
                    <input type="hidden" name="fecha" value={fecha} />
                    <div className="space-y-1.5">
                      <Label htmlFor={`turno-${sucursal.id}`}>Turno (opcional)</Label>
                      <Input
                        id={`turno-${sucursal.id}`}
                        name="turno"
                        placeholder="matutino, vespertino…"
                        className="max-w-xs"
                      />
                    </div>
                    <Button type="submit" size="sm">
                      Abrir el corte del día
                    </Button>
                  </form>
                )}

                {pendientes.length > 0 && (
                  <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
                    <p className="font-medium">
                      {pendientes.length} folio(s) del día sin firmar
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Mientras exista uno, el día no se puede cerrar: se estaría rindiendo cuentas
                      de dinero que todavía no tiene dueño.
                    </p>
                    <p className="mt-1 font-mono text-xs">
                      {pendientes.map((f) => f.folio).join(" · ")}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </BlurFade>
        ))}
      </div>

      <Link href="/finanzas" className="inline-block text-sm underline">
        Volver a Finanzas
      </Link>
    </div>
  );
}
