"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { InputMoneda } from "@/components/ui/input-moneda";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { aCentavos, deCentavos } from "@/lib/finanzas/calculos";
import { importeEnCasillas } from "@/lib/finanzas/formato";

/**
 * Un socio REGISTRADO. La utilidad le corresponde a quien tiene parte del
 * capital social —lo acredita un acta—, no a quien tiene cuenta en el sistema.
 */
export type SocioCandidato = {
  personaId: number;
  nombre: string;
  /** Lo retirado con vales RCI-05 ya firmados. */
  totalAnticipos: string;
  /** Lo que repartos formales anteriores ya le asignaron. */
  totalRepartido: string;
  saldoPorComprobar: string;
  tieneSaldoPorComprobar: boolean;
  /** Redactada por `posicionSocio`; null si nunca retiró ni recibió reparto. */
  etiquetaPosicion: string | null;
};

type Props = {
  socios: SocioCandidato[];
  /** Falso para quien no es N3: el formulario no se dibuja y se dice por qué. */
  puedeRegistrar: boolean;
  /** Ejercicios ya repartidos: la UNIQUE (ejercicio) no admite el segundo. */
  ejerciciosUsados: string[];
};

/** El mismo que el CHECK de la tabla y el zod del servicio. */
const PATRON_EJERCICIO = /^[0-9]{4}(-[ST][1-4])?$/;

type Renglon = { clave: number; socioPersonaId: string; monto: string };

/**
 * Alta del reparto formal de utilidades.
 *
 * ES LA ÚNICA MANERA DE BAJAR UN SALDO POR COMPROBAR. Mientras no exista un
 * reparto que lo respalde, cada retiro de socio es anticipo a cuenta (LGSM art.
 * 19) y la vista de anticipos sólo puede acusar. Esta pantalla es la absolución
 * y por eso pide lo que el artículo 19 exige antes de repartir: el ejercicio,
 * la fecha del balance que arrojó la utilidad y el acta de asamblea que lo
 * aprobó. Sin esos tres datos no hay manera de sostener que hubo utilidades.
 *
 * DOS COSAS SE DICEN ANTES DE GUARDAR, NO DESPUÉS:
 *
 *  · El reparto es INMUTABLE. `reparto_utilidades` y sus asignaciones llevan
 *    `bloquear_mutacion` en UPDATE y DELETE, así que un renglón equivocado no
 *    se corrige: se queda. Enterarse de eso por un error de la base sería
 *    enterarse tarde.
 *  · Un ejercicio se reparte UNA vez —la UNIQUE lo impide— así que los
 *    ejercicios ya usados se enseñan mientras se teclea.
 *
 * La suma de las asignaciones no puede exceder la utilidad repartible. Ese
 * candado no está en el esquema: lo comprueba el zod del servicio y se anticipa
 * aquí, porque repartir más de lo que el balance arroja no es reparto de
 * utilidades sino entrega de capital.
 */
export function RegistrarReparto({ socios, puedeRegistrar, ejerciciosUsados }: Props) {
  const router = useRouter();
  const [guardando, setGuardando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  const [ejercicio, setEjercicio] = useState(String(new Date().getFullYear()));
  const [fechaBalance, setFechaBalance] = useState("");
  const [utilidadRepartible, setUtilidadRepartible] = useState("");
  const [actaReferencia, setActaReferencia] = useState("");

  // El primer renglón se propone con el socio que más debe comprobar: es el
  // saldo que este reparto existe para descargar.
  const [renglones, setRenglones] = useState<Renglon[]>(() => [
    {
      clave: 1,
      socioPersonaId: String(socios.find((s) => s.tieneSaldoPorComprobar)?.personaId ?? ""),
      monto: "",
    },
  ]);
  const [siguienteClave, setSiguienteClave] = useState(2);

  const porId = useMemo(
    () => new Map(socios.map((socio) => [String(socio.personaId), socio])),
    [socios],
  );

  const repartibleCentavos = aCentavos(utilidadRepartible);
  const asignadoCentavos = renglones.reduce(
    (acumulado, renglon) => acumulado + (aCentavos(renglon.monto) ?? 0n),
    0n,
  );

  const excedeLoRepartible =
    repartibleCentavos !== null && asignadoCentavos > repartibleCentavos;
  const remanente =
    repartibleCentavos === null ? null : deCentavos(repartibleCentavos - asignadoCentavos);

  const elegidos = renglones.map((r) => r.socioPersonaId).filter((id) => id !== "");
  const hayRepetidos = new Set(elegidos).size !== elegidos.length;

  const ejercicioValido = PATRON_EJERCICIO.test(ejercicio.trim());
  const ejercicioYaRepartido = ejerciciosUsados.includes(ejercicio.trim());

  const renglonesCompletos =
    renglones.length > 0 &&
    renglones.every((renglon) => {
      const centavos = aCentavos(renglon.monto);
      return renglon.socioPersonaId !== "" && centavos !== null && centavos > 0n;
    });

  const listo =
    puedeRegistrar &&
    ejercicioValido &&
    !ejercicioYaRepartido &&
    fechaBalance !== "" &&
    repartibleCentavos !== null &&
    repartibleCentavos >= 0n &&
    actaReferencia.trim().length >= 3 &&
    renglonesCompletos &&
    !hayRepetidos &&
    !excedeLoRepartible;

  function cambiarRenglon(clave: number, cambio: Partial<Renglon>) {
    setRenglones((previos) =>
      previos.map((renglon) => (renglon.clave === clave ? { ...renglon, ...cambio } : renglon)),
    );
  }

  function agregarRenglon() {
    // Se propone el siguiente socio con saldo por comprobar que no esté ya en
    // la lista: es a quien le toca descargarse, y teclearlo a mano sólo abre la
    // puerta a repartirle a quien no debía nada mientras el que debe sigue igual.
    const yaElegidos = new Set(renglones.map((r) => r.socioPersonaId));
    const propuesto = socios.find(
      (socio) => socio.tieneSaldoPorComprobar && !yaElegidos.has(String(socio.personaId)),
    );
    setRenglones((previos) => [
      ...previos,
      { clave: siguienteClave, socioPersonaId: String(propuesto?.personaId ?? ""), monto: "" },
    ]);
    setSiguienteClave((n) => n + 1);
  }

  function quitarRenglon(clave: number) {
    setRenglones((previos) => previos.filter((renglon) => renglon.clave !== clave));
  }

  async function guardar() {
    if (!listo) return;
    setGuardando(true);
    try {
      const envio = await fetch("/api/finanzas/repartos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ejercicio: ejercicio.trim(),
          fechaBalance,
          utilidadRepartible,
          actaReferencia: actaReferencia.trim(),
          asignaciones: renglones.map((renglon) => ({
            socioPersonaId: Number(renglon.socioPersonaId),
            monto: renglon.monto,
          })),
        }),
      });
      const datos = await envio.json().catch(() => ({}));
      if (!envio.ok) throw new Error(datos.error ?? "No se pudo registrar el reparto");

      toast.success(
        `Reparto del ejercicio ${datos.ejercicio} asentado; los anticipos de los socios quedaron respaldados`,
      );
      setConfirmando(false);
      setFechaBalance("");
      setUtilidadRepartible("");
      setActaReferencia("");
      setRenglones([{ clave: siguienteClave, socioPersonaId: "", monto: "" }]);
      setSiguienteClave((n) => n + 1);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo registrar el reparto");
    } finally {
      setGuardando(false);
    }
  }

  if (!puedeRegistrar) {
    return (
      <Alert>
        <AlertTitle>El reparto lo autoriza un socio o el Gerente General</AlertTitle>
        <AlertDescription>
          Asentar un reparto formal no es una captura de operación: es aplicar un acuerdo de
          asamblea sobre un balance aprobado, y queda inmutable con el nombre de quien lo autorizó.
          Por eso lo reserva el sistema al nivel N3. Puedes consultar aquí la posición de cada socio
          y los repartos ya registrados.
        </AlertDescription>
      </Alert>
    );
  }

  // Un selector de socios vacío no explica nada. Lo que falta no es capturar:
  // es registrar quién tiene parte del capital social, con su acta.
  if (socios.length === 0) {
    return (
      <Alert>
        <AlertTitle>Todavía no hay socios registrados</AlertTitle>
        <AlertDescription className="space-y-2">
          <p>
            Un reparto asigna utilidades a quien tiene parte del capital social, y eso se acredita
            con un acta —no se deduce de tener cuenta en el sistema—. Mientras no haya nadie dado de
            alta como socio no hay a quién repartirle.
          </p>
          <p>
            <Link href="/finanzas/catalogos/socios" className="underline">
              Registrar a los socios
            </Link>
          </p>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Registrar un reparto formal</CardTitle>
        <CardDescription>
          Es el único hecho que convierte el anticipo de un socio en utilidad repartida. Lo que se
          asiente aquí baja el saldo por comprobar de cada socio en la misma cantidad.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* La inmutabilidad se anuncia arriba del formulario, no al guardar:
            la base la impone con bloquear_mutacion y para entonces ya es tarde. */}
        <Alert>
          <AlertTitle>Un reparto asentado no se corrige ni se borra</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>
              La tabla del reparto y la de sus asignaciones son inmutables por diseño: la base
              rechaza cualquier UPDATE o DELETE sobre ellas. Un balance aprobado y su reparto son un
              hecho de la sociedad, no un borrador, y si algo sale mal la salida es asentar otro
              reparto que lo complemente —nunca reescribir éste—.
            </p>
            <p className="text-xs">
              Revisa los importes y el socio de cada renglón antes de confirmar. Además, cada
              ejercicio se reparte una sola vez.
            </p>
          </AlertDescription>
        </Alert>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ejercicio">Ejercicio o período *</Label>
            <Input
              id="ejercicio"
              value={ejercicio}
              onChange={(e) => setEjercicio(e.target.value)}
              placeholder="2026, 2026-S1, 2026-T3"
              aria-invalid={ejercicio !== "" && (!ejercicioValido || ejercicioYaRepartido)}
            />
            {!ejercicioValido && ejercicio !== "" ? (
              <p className="text-xs text-destructive">
                Se escribe como 2026, o 2026-S1 / 2026-T3 para un semestre o trimestre.
              </p>
            ) : ejercicioYaRepartido ? (
              <p className="text-xs text-destructive">
                Ese ejercicio ya tiene un reparto asentado y no admite un segundo.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Un ejercicio se reparte una sola vez.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fecha-balance">Fecha del balance *</Label>
            <Input
              id="fecha-balance"
              type="date"
              value={fechaBalance}
              onChange={(e) => setFechaBalance(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              La del estado financiero que arroja la utilidad, no la del pago.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="utilidad">Utilidad repartible según el balance *</Label>
            <InputMoneda
              id="utilidad"
              valor={utilidadRepartible}
              onValorChange={setUtilidadRepartible}
              placeholder="0.00"
              className="font-mono text-lg tabular-nums"
              aria-invalid={utilidadRepartible !== "" && repartibleCentavos === null}
            />
            {repartibleCentavos !== null && utilidadRepartible !== "" ? (
              <p className="text-xs text-muted-foreground">
                {importeEnCasillas(utilidadRepartible).letra}
              </p>
            ) : (
              utilidadRepartible !== "" && (
                <p className="text-xs text-destructive">
                  Se escribe con dígitos y hasta dos decimales.
                </p>
              )
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="acta">Acta de asamblea que aprobó el balance *</Label>
            <Input
              id="acta"
              value={actaReferencia}
              onChange={(e) => setActaReferencia(e.target.value)}
              maxLength={200}
              placeholder="Ej.: Acta de Asamblea Ordinaria núm. 14 del 12/03/2026"
            />
            <p className="text-xs text-muted-foreground">
              Sin acta no hay utilidad que repartir: hay caja, que es otra cosa.
            </p>
          </div>
        </div>

        <Separator />

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-medium">Asignación por socio</h3>
              <p className="text-xs text-muted-foreground">
                Cada renglón descarga el saldo por comprobar del socio en esa cantidad.
              </p>
            </div>
            <Button size="sm" variant="secondary" onClick={agregarRenglon}>
              Agregar socio
            </Button>
          </div>

          <ul className="space-y-3">
            {renglones.map((renglon) => {
              const socio = porId.get(renglon.socioPersonaId) ?? null;
              const monto = aCentavos(renglon.monto);
              const saldo = socio ? aCentavos(socio.saldoPorComprobar) : null;
              const saldoRestante =
                saldo !== null && monto !== null
                  ? deCentavos(saldo - monto > 0n ? saldo - monto : 0n)
                  : null;
              const cubreDeMas = saldo !== null && monto !== null && monto > saldo;

              return (
                <li key={renglon.clave} className="rounded-md border p-3">
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px_auto] sm:items-end">
                    <div className="space-y-1.5">
                      <Label htmlFor={`socio-${renglon.clave}`}>Socio *</Label>
                      <select
                        id={`socio-${renglon.clave}`}
                        value={renglon.socioPersonaId}
                        onChange={(e) =>
                          cambiarRenglon(renglon.clave, { socioPersonaId: e.target.value })
                        }
                        className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                      >
                        <option value="">— elige al socio —</option>
                        {socios.map((candidato) => (
                          <option key={candidato.personaId} value={candidato.personaId}>
                            {candidato.nombre}
                            {candidato.tieneSaldoPorComprobar
                              ? ` · ${importeEnCasillas(candidato.saldoPorComprobar).texto} por comprobar`
                              : ""}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor={`monto-${renglon.clave}`}>Monto asignado *</Label>
                      <InputMoneda
                        id={`monto-${renglon.clave}`}
                        valor={renglon.monto}
                        onValorChange={(valor) => cambiarRenglon(renglon.clave, { monto: valor })}
                        placeholder="0.00"
                        className="font-mono tabular-nums"
                        aria-invalid={renglon.monto !== "" && (monto === null || monto <= 0n)}
                      />
                    </div>

                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={renglones.length === 1}
                      onClick={() => quitarRenglon(renglon.clave)}
                    >
                      Quitar
                    </Button>
                  </div>

                  {socio && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {socio.tieneSaldoPorComprobar ? (
                        <>
                          Lleva {importeEnCasillas(socio.totalAnticipos).texto} retirado y{" "}
                          {importeEnCasillas(socio.totalRepartido).texto} respaldado:{" "}
                          <span className="font-medium">
                            {importeEnCasillas(socio.saldoPorComprobar).texto} por comprobar
                          </span>
                          {saldoRestante !== null &&
                            `. Con este renglón le quedarían ${importeEnCasillas(saldoRestante).texto}.`}
                        </>
                      ) : (
                        (socio.etiquetaPosicion ??
                        "No tiene anticipos previos ni reparto formal registrado.")
                      )}
                    </p>
                  )}

                  {cubreDeMas && (
                    <p className="mt-1 text-xs text-amber-700 dark:text-amber-500">
                      La asignación excede lo que este socio tenía por comprobar. Es válido —la
                      utilidad puede corresponderle aunque no haya retirado— pero conviene
                      verificarlo: el sobrante no se le devuelve, queda como reparto a su favor.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>

          {hayRepetidos && (
            <Alert variant="destructive">
              <AlertTitle>Un socio aparece dos veces</AlertTitle>
              <AlertDescription>
                La llave de la tabla es (reparto, socio): súmalo en un solo renglón.
              </AlertDescription>
            </Alert>
          )}

          {excedeLoRepartible && (
            <Alert variant="destructive">
              <AlertTitle>Las asignaciones exceden la utilidad del balance</AlertTitle>
              <AlertDescription>
                Se están asignando {importeEnCasillas(deCentavos(asignadoCentavos)).texto} contra
                una utilidad repartible de {importeEnCasillas(utilidadRepartible).texto}. Repartir
                de más no es reparto de utilidades sino entrega de capital: el artículo 19 de la
                LGSM lo impide y la sociedad puede repetir contra quien lo recibió.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <Separator />

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="text-sm">
            <p className="text-muted-foreground">
              Asignado {importeEnCasillas(deCentavos(asignadoCentavos)).texto} de{" "}
              {importeEnCasillas(repartibleCentavos === null ? "0" : utilidadRepartible).texto}
            </p>
            {remanente !== null && !excedeLoRepartible && (
              <p className="text-xs text-muted-foreground">
                Quedarían {importeEnCasillas(remanente).texto} de utilidad sin asignar.
              </p>
            )}
          </div>
          <Button disabled={!listo || guardando} onClick={() => setConfirmando(true)}>
            Revisar y asentar
          </Button>
        </div>
      </CardContent>

      <Dialog open={confirmando} onOpenChange={(estado) => !guardando && setConfirmando(estado)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Asentar el reparto del ejercicio {ejercicio.trim()}</DialogTitle>
            <DialogDescription>
              Lo que confirmes queda inmutable: la base rechaza cualquier corrección posterior sobre
              el reparto y sus asignaciones. Revísalo ahora.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Balance del</span>
              <span className="font-medium">{fechaBalance || "—"}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Utilidad repartible</span>
              <span className="font-medium">
                {importeEnCasillas(utilidadRepartible || "0").texto}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Acta</span>
              <span className="text-right font-medium">{actaReferencia.trim() || "—"}</span>
            </div>

            <Separator />

            <ul className="space-y-1">
              {renglones.map((renglon) => (
                <li key={renglon.clave} className="flex justify-between gap-4">
                  <span>{porId.get(renglon.socioPersonaId)?.nombre ?? "—"}</span>
                  <span className="font-mono tabular-nums">
                    {importeEnCasillas(renglon.monto || "0").texto}
                  </span>
                </li>
              ))}
            </ul>

            <div className="flex justify-between gap-4 border-t pt-2">
              <span className="text-muted-foreground">Sin asignar</span>
              <span className="font-mono tabular-nums">
                {importeEnCasillas(remanente ?? "0").texto}
              </span>
            </div>

            <p className="text-xs text-muted-foreground">
              Quedará a tu nombre como quien lo autorizó. Los saldos por comprobar de estos socios
              bajarán en cuanto se guarde.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" disabled={guardando} onClick={() => setConfirmando(false)}>
              Volver a revisar
            </Button>
            <Button disabled={guardando || !listo} onClick={guardar}>
              {guardando ? "Asentando…" : "Asentar definitivamente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {ejerciciosUsados.length > 0 && (
        <CardContent className="pt-0">
          <p className="text-xs text-muted-foreground">
            Ejercicios ya repartidos:{" "}
            {ejerciciosUsados.map((e) => (
              <Badge key={e} variant="outline" className="mr-1 font-mono">
                {e}
              </Badge>
            ))}
          </p>
        </CardContent>
      )}
    </Card>
  );
}
