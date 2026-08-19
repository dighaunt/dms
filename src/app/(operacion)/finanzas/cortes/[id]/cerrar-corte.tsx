"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { IconoSilk } from "@/components/iconos/silk";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { InputMoneda } from "@/components/ui/input-moneda";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { MINIMO_EXPLICACION_DIFERENCIA, aCentavos } from "@/lib/finanzas/calculos";
import type { PrevisualizacionArqueo } from "@/lib/finanzas/corte";
import { importeEnCasillas } from "@/lib/finanzas/formato";

type ResultadoPrevisualizacion =
  | { ok: true; datos: PrevisualizacionArqueo }
  | { ok: false; mensaje: string };

type Props = {
  corteId: number;
  
  fechaCorte: string;
  saldoCalculado: string;
  
  totalEgresos: string;
  armadoEn: string | null;
  
  bloqueantes: string[];
  previsualizarAccion: (efectivoContado: string) => Promise<ResultadoPrevisualizacion>;
};

const sinSigno = (importe: string): string => importe.replace(/^-/, "");

/**
 * Un importe que el servidor va a aceptar: completo y mayor que cero.
 *
 * `aCentavos` devuelve null ante "1234." —el punto decimal solo, que
 * `InputMoneda` deja pasar porque es un estado normal de a medio teclear— y
 * ante el cero devuelve 0n. Ambos revientan contra `esquemaImporteMonetario`,
 * y sin este filtro el botón se habilita con la cifra a medias: el POST vuelve
 * con un 400 que culpa a quien capturó de un formato que la pantalla misma le
 * dejó escribir.
 */
function esImportePositivo(valor: string): boolean {
  const centavos = aCentavos(valor);
  return centavos !== null && centavos > 0n;
}

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

  const contadoCompleto = /^\d+(?:\.\d{1,2})?$/.test(contado);

  useEffect(() => {
    if (contado === "" || !contadoCompleto) return;

    let vigente = true;
    const temporizador = setTimeout(async () => {
      const resultado = await previsualizarAccion(contado);

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
  }, [contado, contadoCompleto, totalEgresos, previsualizarAccion]);

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
    esImportePositivo(deposito.monto) &&
    deposito.fechaDeposito !== "" &&
    deposito.comprobanteRef.trim().length >= 3;

  const resguardoCompleto =
    esImportePositivo(resguardo.monto) && resguardo.detalle.trim().length >= 5;

  
  const bloqueadoPorFolios = bloqueantes.length > 0 || (previa?.bloqueadoPorFoliosSinFirmar ?? false);
  const minimo = previa?.minimoCaracteresExplicacion ?? MINIMO_EXPLICACION_DIFERENCIA;
  const explicacionSuficiente = explicacion.trim().length >= minimo;
  const faltaExplicacion = (previa?.requiereExplicacion ?? false) && !explicacionSuficiente;
  const puedeCerrar = previa !== null && !bloqueadoPorFolios && !faltaExplicacion && !ocupado;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconoSilk nombre="dinero" className="shrink-0" />
            Depósitos bancarios y resguardos del día
          </CardTitle>
          <CardDescription>
            No son pagos a terceros: el dinero sigue siendo de la empresa y sólo cambió de lugar.
            Aun así salió del cajón, así que restan de los egresos y bajan el saldo que debería
            existir en caja. Al registrarlos, el corte se rearma solo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-medium">
              <IconoSilk nombre="dinero" className="shrink-0" />
              b) Depósito bancario
            </h3>
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
                <InputMoneda
                  id="monto-deposito"
                  valor={deposito.monto}
                  onValorChange={(valor) => setDeposito({ ...deposito, monto: valor })}
                  placeholder="0.00"
                  className="font-mono tabular-nums"
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
              <IconoSilk nombre="agregar" className="shrink-0" />
              Registrar depósito
            </Button>
          </div>

          <Separator />

          <div className="space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-medium">
              {}
              <IconoSilk nombre="candado" className="shrink-0" />
              c) y d) Resguardo de efectivo
            </h3>
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
                <InputMoneda
                  id="monto-resguardo"
                  valor={resguardo.monto}
                  onValorChange={(valor) => setResguardo({ ...resguardo, monto: valor })}
                  placeholder="0.00"
                  className="font-mono tabular-nums"
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
              <IconoSilk nombre="agregar" className="shrink-0" />
              Registrar resguardo
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconoSilk nombre="monedas" className="shrink-0" />
            Arqueo real y cierre del día
          </CardTitle>
          <CardDescription>
            Cuenta el efectivo que está físicamente en la caja y escríbelo. Es el único importe de
            todo el corte que se teclea; el saldo que debería existir ya está calculado arriba.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="efectivo">
                Efectivo físico contado al cierre *
              </Label>
              <InputMoneda
                id="efectivo"
                valor={efectivo}
                onValorChange={setEfectivo}
                placeholder="0.00"
                className="max-w-xs font-mono text-lg tabular-nums"
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
                {}
                <div className="flex flex-wrap items-center gap-2">
                  <IconoSilk
                    nombre={previa.cuadra ? "correcto" : previa.esFaltante ? "alerta" : "aviso"}
                    className="shrink-0"
                  />
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
                    <IconoSilk nombre="riesgo" className="shrink-0" />
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
                    <IconoSilk nombre="aviso" className="shrink-0" />
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
            <Label htmlFor="explicacion" className="gap-1.5">
              <IconoSilk nombre="comentario" className="shrink-0" />
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
              <IconoSilk nombre="alto" className="shrink-0" />
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
              {ocupado ? (
                "Cerrando…"
              ) : (
                <>
                  {}
                  <IconoSilk nombre="candado" className="shrink-0" />
                  Cerrar el día y mandar a firma
                </>
              )}
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
