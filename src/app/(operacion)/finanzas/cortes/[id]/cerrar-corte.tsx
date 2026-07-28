"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { MINIMO_EXPLICACION_DIFERENCIA } from "@/lib/finanzas/calculos";
import type { PrevisualizacionArqueo } from "@/lib/finanzas/corte";
import { importeEnCasillas } from "@/lib/finanzas/formato";

type ResultadoPrevisualizacion =
  | { ok: true; datos: PrevisualizacionArqueo }
  | { ok: false; mensaje: string };

type Props = {
  corteId: number;
  /** Fecha del corte: propone la del depósito, que casi siempre es la misma. */
  fechaCorte: string;
  saldoCalculado: string;
  /**
   * Cambia cada vez que se registra un depósito o un resguardo. Se usa como
   * disparador para volver a previsualizar: si el saldo que debería existir
   * bajó, la diferencia que se está mirando ya no es la buena.
   */
  totalEgresos: string;
  armadoEn: string | null;
  /** Folios del día sin firmar. Con uno solo, el cierre no procede. */
  bloqueantes: string[];
  previsualizarAccion: (efectivoContado: string) => Promise<ResultadoPrevisualizacion>;
};

/** El importe negativo se lee mejor como "faltante de $X" que como "$-X". */
const sinSigno = (importe: string): string => importe.replace(/^-/, "");

const soloCifra = (valor: string): string => valor.replace(/[^\d.,]/g, "");

/**
 * Lo que el custodio DECLARA sobre el efectivo: a dónde lo mandó (depósitos y
 * resguardos) y cuánto quedó realmente en el cajón.
 *
 * Ninguno de los importes del corte se recaptura aquí. El efectivo contado es
 * el único dato tecleado del formato, y aparece separado del resto a propósito:
 * es lo que convierte el corte en una comprobación en lugar de una declaración.
 */
export function CerrarCorte({
  corteId,
  fechaCorte,
  saldoCalculado,
  totalEgresos,
  armadoEn,
  bloqueantes,
  previsualizarAccion,
}: Props) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);

  const [efectivo, setEfectivo] = useState("");
  const [explicacion, setExplicacion] = useState("");
  /**
   * La previsualización se guarda junto con la cifra y el total de egresos
   * sobre los que se pidió. Así se vuelve obsoleta sola: en cuanto el custodio
   * teclea otro dígito o registra un depósito, la diferencia anterior deja de
   * mostrarse en lugar de quedarse en pantalla describiendo otro arqueo.
   */
  const [respuesta, setRespuesta] = useState<{
    entrada: string;
    contra: string;
    datos: PrevisualizacionArqueo | null;
    mensaje: string | null;
  } | null>(null);

  const [deposito, setDeposito] = useState({
    institucion: "",
    cuenta: "",
    monto: "",
    fechaDeposito: fechaCorte,
    comprobanteRef: "",
  });
  const [resguardo, setResguardo] = useState({ tipo: "TRANSITO", monto: "", detalle: "" });

  const contado = efectivo.trim();

  /**
   * La diferencia se calcula ANTES de intentar cerrar, no como respuesta a un
   * cierre fallido: mientras la caja sigue abierta todavía se puede volver a
   * contar el fajo. Se espera a que deje de teclear para no ir al servidor por
   * cada dígito.
   */
  useEffect(() => {
    if (contado === "") return;

    let vigente = true;
    const temporizador = setTimeout(async () => {
      const resultado = await previsualizarAccion(contado);
      // Una respuesta que llegó tarde describe una cifra que ya nadie está
      // mirando; mostrarla sería enseñar una diferencia falsa.
      if (!vigente) return;
      setRespuesta({
        entrada: contado,
        contra: totalEgresos,
        datos: resultado.ok ? resultado.datos : null,
        mensaje: resultado.ok ? null : resultado.mensaje,
      });
    }, 350);

    return () => {
      vigente = false;
      clearTimeout(temporizador);
    };
  }, [contado, totalEgresos, previsualizarAccion]);

  const alDia =
    respuesta !== null && respuesta.entrada === contado && respuesta.contra === totalEgresos;
  const previa = alDia ? respuesta.datos : null;
  const avisoPrevia = alDia ? respuesta.mensaje : null;
  const calculando = contado !== "" && !alDia;

  async function enviar(url: string, cuerpo: unknown, exito: string): Promise<boolean> {
    setOcupado(true);
    try {
      const envio = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
      const datos = await envio.json().catch(() => ({}));
      if (!envio.ok) throw new Error(datos.error ?? "La operación no se completó");
      toast.success(exito);
      router.refresh();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "La operación no se completó");
      return false;
    } finally {
      setOcupado(false);
    }
  }

  const depositoCompleto =
    deposito.institucion.trim().length >= 2 &&
    deposito.cuenta.trim().length >= 4 &&
    deposito.monto.trim() !== "" &&
    deposito.fechaDeposito !== "" &&
    deposito.comprobanteRef.trim().length >= 3;

  const resguardoCompleto = resguardo.monto.trim() !== "" && resguardo.detalle.trim().length >= 5;

  // El bloqueo puede llegar por dos caminos: los folios que traía la página al
  // renderizarse y los que la previsualización acaba de encontrar.
  const bloqueadoPorFolios = bloqueantes.length > 0 || (previa?.bloqueadoPorFoliosSinFirmar ?? false);
  const minimo = previa?.minimoCaracteresExplicacion ?? MINIMO_EXPLICACION_DIFERENCIA;
  const explicacionSuficiente = explicacion.trim().length >= minimo;
  const faltaExplicacion = (previa?.requiereExplicacion ?? false) && !explicacionSuficiente;
  const puedeCerrar = previa !== null && !bloqueadoPorFolios && !faltaExplicacion && !ocupado;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Depósitos bancarios y resguardos del día</CardTitle>
          <CardDescription>
            No son pagos a terceros: el dinero sigue siendo de la empresa y sólo cambió de lugar.
            Aun así salió del cajón, así que restan de los egresos y bajan el saldo que debería
            existir en caja. Al registrarlos, el corte se rearma solo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <h3 className="text-sm font-medium">b) Depósito bancario</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="institucion">Institución *</Label>
                <Input
                  id="institucion"
                  value={deposito.institucion}
                  onChange={(e) => setDeposito({ ...deposito, institucion: e.target.value })}
                  placeholder="BBVA, Banorte…"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cuenta">Cuenta *</Label>
                <Input
                  id="cuenta"
                  value={deposito.cuenta}
                  onChange={(e) => setDeposito({ ...deposito, cuenta: e.target.value })}
                  placeholder="últimos dígitos o CLABE"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="monto-deposito">Monto *</Label>
                <Input
                  id="monto-deposito"
                  value={deposito.monto}
                  onChange={(e) =>
                    setDeposito({ ...deposito, monto: soloCifra(e.target.value) })
                  }
                  inputMode="decimal"
                  placeholder="0.00"
                  className="font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fecha-deposito">Fecha del depósito *</Label>
                <Input
                  id="fecha-deposito"
                  type="date"
                  value={deposito.fechaDeposito}
                  onChange={(e) => setDeposito({ ...deposito, fechaDeposito: e.target.value })}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="comprobante">Comprobante (ficha o referencia) *</Label>
                <Input
                  id="comprobante"
                  value={deposito.comprobanteRef}
                  onChange={(e) => setDeposito({ ...deposito, comprobanteRef: e.target.value })}
                  placeholder="sin él no hay depósito que probar"
                />
              </div>
            </div>
            <Button
              size="sm"
              variant="secondary"
              disabled={ocupado || !depositoCompleto}
              onClick={async () => {
                const listo = await enviar(
                  `/api/finanzas/cortes/${corteId}/depositos`,
                  deposito,
                  "Depósito registrado; el corte se rearmó",
                );
                if (listo) {
                  setDeposito({
                    institucion: "",
                    cuenta: "",
                    monto: "",
                    fechaDeposito: fechaCorte,
                    comprobanteRef: "",
                  });
                }
              }}
            >
              Registrar depósito
            </Button>
          </div>

          <Separator />

          <div className="space-y-3">
            <h3 className="text-sm font-medium">c) y d) Resguardo de efectivo</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="tipo-resguardo">Tipo *</Label>
                <select
                  id="tipo-resguardo"
                  value={resguardo.tipo}
                  onChange={(e) => setResguardo({ ...resguardo, tipo: e.target.value })}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                >
                  <option value="TRANSITO">En tránsito / por depositar</option>
                  <option value="OTRO">Otro resguardo</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="monto-resguardo">Monto *</Label>
                <Input
                  id="monto-resguardo"
                  value={resguardo.monto}
                  onChange={(e) =>
                    setResguardo({ ...resguardo, monto: soloCifra(e.target.value) })
                  }
                  inputMode="decimal"
                  placeholder="0.00"
                  className="font-mono"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="detalle-resguardo">
                  Dónde está y bajo responsabilidad de quién *
                </Label>
                <Textarea
                  id="detalle-resguardo"
                  value={resguardo.detalle}
                  onChange={(e) => setResguardo({ ...resguardo, detalle: e.target.value })}
                  rows={2}
                  placeholder="Ej.: en la caja fuerte de gerencia a cargo de …"
                />
              </div>
            </div>
            <Button
              size="sm"
              variant="secondary"
              disabled={ocupado || !resguardoCompleto}
              onClick={async () => {
                const listo = await enviar(
                  `/api/finanzas/cortes/${corteId}/resguardos`,
                  resguardo,
                  "Resguardo registrado; el corte se rearmó",
                );
                if (listo) setResguardo({ tipo: "TRANSITO", monto: "", detalle: "" });
              }}
            >
              Registrar resguardo
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Arqueo real y cierre del día</CardTitle>
          <CardDescription>
            Cuenta el efectivo que está físicamente en la caja y escríbelo. Es el único importe de
            todo el corte que se teclea; el saldo que debería existir ya está calculado arriba.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="efectivo">Efectivo físico contado al cierre *</Label>
              <Input
                id="efectivo"
                value={efectivo}
                onChange={(e) => setEfectivo(soloCifra(e.target.value))}
                inputMode="decimal"
                placeholder="0.00"
                className="max-w-xs font-mono text-lg"
              />
              {previa && (
                <p className="text-xs text-muted-foreground">
                  {importeEnCasillas(previa.efectivoContado).letra}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <p className="text-sm text-muted-foreground">Saldo que debería existir en caja</p>
              <p className="font-mono text-lg tabular-nums">
                {importeEnCasillas(previa?.saldoCalculado ?? saldoCalculado).texto}
              </p>
            </div>
          </div>

          {avisoPrevia && <p className="text-sm text-destructive">{avisoPrevia}</p>}

          {contado === "" ? (
            <p className="text-sm text-muted-foreground">
              En cuanto escribas el efectivo contado verás aquí la diferencia, antes de intentar
              cerrar.
            </p>
          ) : calculando ? (
            <p className="text-sm text-muted-foreground">Calculando la diferencia…</p>
          ) : (
            previa && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  {previa.cuadra ? (
                    <Badge>El arqueo cuadra</Badge>
                  ) : (
                    <Badge variant={previa.esFaltante ? "destructive" : "secondary"}>
                      {previa.esFaltante ? "Faltante" : "Sobrante"} de{" "}
                      {importeEnCasillas(sinSigno(previa.diferencia)).texto}
                    </Badge>
                  )}
                </div>

                {previa.esFaltante && (
                  <Alert variant="destructive">
                    <AlertTitle>
                      Al cerrar se levantará una alerta GRAVE para el Gerente General
                    </AlertTitle>
                    <AlertDescription>
                      Falta efectivo respecto de lo que los folios firmados del día dicen que
                      debería haber. La explicación que escribas queda dentro de la alerta y es la
                      rendición de cuentas de quien tenía el dinero a su cargo.
                    </AlertDescription>
                  </Alert>
                )}

                {previa.esSobrante && (
                  <Alert>
                    <AlertTitle>Sobra efectivo: quedará registrado un aviso</AlertTitle>
                    <AlertDescription>
                      Un sobrante suele ser un cobro que no se documentó. Explícalo: dinero sin
                      folio que lo respalde tampoco tiene dueño.
                    </AlertDescription>
                  </Alert>
                )}

                {previa.armadoEn && (
                  <p className="text-xs text-muted-foreground">
                    Calculado sobre el armado de las{" "}
                    {new Date(previa.armadoEn).toLocaleString("es-MX")}. Al cerrar, el sistema
                    vuelve a armar el corte: si mientras tanto se firma otro folio del día, la
                    diferencia definitiva puede cambiar.
                  </p>
                )}
              </div>
            )
          )}

          <div className="space-y-1.5">
            <Label htmlFor="explicacion">
              Si hay diferencia, explicar
              {previa?.requiereExplicacion ? " *" : " (opcional mientras el arqueo cuadre)"}
            </Label>
            <Textarea
              id="explicacion"
              value={explicacion}
              onChange={(e) => setExplicacion(e.target.value)}
              rows={3}
              placeholder="En qué consiste la diferencia y qué se hizo al respecto"
              aria-invalid={faltaExplicacion}
            />
            {previa?.requiereExplicacion && (
              <p
                className={`text-xs ${faltaExplicacion ? "text-destructive" : "text-muted-foreground"}`}
              >
                Obligatoria porque el arqueo no cuadra: al menos {minimo} caracteres (llevas{" "}
                {explicacion.trim().length}).
              </p>
            )}
          </div>

          {bloqueadoPorFolios && (
            <Alert variant="destructive">
              <AlertTitle>No se puede cerrar el día todavía</AlertTitle>
              <AlertDescription>
                Quedan folios del día sin firmar
                {bloqueantes.length > 0 && `: ${bloqueantes.join(", ")}`}. Fírmalos o cancélalos
                —arriba está la lista con su enlace— y vuelve a contar.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              disabled={!puedeCerrar}
              onClick={() =>
                enviar(
                  `/api/finanzas/cortes/${corteId}/cerrar`,
                  { efectivoContado: contado, explicacion: explicacion.trim() || null },
                  "Día cerrado; el corte quedó pendiente de firma",
                )
              }
            >
              {ocupado ? "Cerrando…" : "Cerrar el día y mandar a firma"}
            </Button>
            {contado === "" && (
              <span className="text-xs text-muted-foreground">
                Escribe el efectivo contado para poder cerrar.
              </span>
            )}
            {faltaExplicacion && (
              <span className="text-xs text-muted-foreground">
                Falta la explicación de la diferencia.
              </span>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Al cerrar, el corte deja de ser borrador y pasa a firmas: lo elabora el Custodio
            Financiero, lo revisa y autoriza el Gerente General y el socio queda enterado.
            {armadoEn && ` Armado vigente de las ${new Date(armadoEn).toLocaleTimeString("es-MX")}.`}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
