import Link from "next/link";
import { notFound } from "next/navigation";

import { IconoSilk, type NombreIconoSilk } from "@/components/iconos/silk";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Ayuda } from "@/components/ui/ayuda";
import { Badge } from "@/components/ui/badge";
import { BlurFade } from "@/components/ui/blur-fade";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requerirUsuario } from "@/lib/api";
import {
  detalleCorte,
  foliosPendientesDelDia,
  obtenerCorte,
  previsualizarArqueo,
  ubicacionEfectivo,
  type GrupoDelCorte,
} from "@/lib/finanzas/corte";
import { listarDocumentos } from "@/lib/finanzas/documentos";
import { importeEnCasillas } from "@/lib/finanzas/formato";
import { ETIQUETA_ESTADO_DOCUMENTO, type EstadoDocumentoFinanciero } from "@/lib/finanzas/tipos";

import { CerrarCorte } from "./cerrar-corte";

export const dynamic = "force-dynamic";

const COLOR_ESTADO: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  BORRADOR: "outline",
  PENDIENTE_DE_FIRMA: "secondary",
  FIRMADO: "default",
  CANCELADO: "destructive",
};

/**
 * El estado del corte dicho también con una figura, igual que en la pantalla del
 * folio: el candado del corte firmado es lo que se busca de un vistazo. Va junto
 * a la etiqueta —no dentro— porque estos iconos traen su propio color, y sin
 * `titulo` porque la etiqueta de al lado ya nombra el estado.
 */
const ICONO_ESTADO: Record<EstadoDocumentoFinanciero, NombreIconoSilk> = {
  BORRADOR: "nota",
  PENDIENTE_DE_FIRMA: "reloj",
  FIRMADO: "candado",
  CANCELADO: "alto",
};

/** Los incisos con los que el papel numera la ubicación final del efectivo. */
const INCISO_UBICACION: Record<string, string> = {
  CAJA_FISICA: "a)",
  BANCO: "b)",
  TRANSITO: "c)",
  OTRO: "d)",
};

export default async function CorteDeCajaPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();

  const corte = await obtenerCorte(id);
  if (!corte) notFound();

  const [detalle, ubicacion, sinFirmar] = await Promise.all([
    detalleCorte(id),
    ubicacionEfectivo(id),
    foliosPendientesDelDia(corte.sucursalId, corte.fechaCorte),
  ]);

  /**
   * Los folios que bloquean el cierre los nombra `foliosPendientesDelDia` —la
   * misma función que consulta `cerrar_corte_caja`, para que la pantalla y el
   * candado nunca discrepen—, pero devuelve el folio y no su id. `listarDocumentos`
   * se usa sólo para resolver el enlace: no decide nada, sólo permite ir a
   * firmar el folio en lugar de salir a buscarlo.
   */
  const documentosDelDia =
    sinFirmar.length === 0
      ? []
      : await listarDocumentos({
          sucursalId: corte.sucursalId,
          desde: corte.fechaCorte,
          hasta: corte.fechaCorte,
          estado: ["BORRADOR", "PENDIENTE_DE_FIRMA"],
          limite: 1000,
        });
  const idPorFolio = new Map(documentosDelDia.map((documento) => [documento.folio, documento.id]));
  const bloqueantes = sinFirmar.map((folio) => ({
    ...folio,
    documentoId: idPorFolio.get(folio.folio) ?? null,
  }));

  /**
   * Previsualiza el arqueo con el efectivo que se está tecleando.
   *
   * Es una lectura, no un intento de cierre: deja ver la diferencia —y si va a
   * levantar alerta— mientras todavía se puede volver a contar el fajo. La
   * cifra que manda sigue siendo la de `cerrar_corte_caja`, que rearma el corte
   * antes de comparar.
   */
  async function previsualizar(efectivoContado: string) {
    "use server";

    const { usuario } = await requerirUsuario();
    if (!usuario) {
      return { ok: false as const, mensaje: "Tu sesión terminó. Vuelve a entrar para continuar." };
    }

    try {
      const datos = await previsualizarArqueo(id, efectivoContado);
      if (!datos) return { ok: false as const, mensaje: "Este corte ya no existe." };
      return { ok: true as const, datos };
    } catch (error) {
      // Lo esperable aquí es un importe mal escrito; cualquier otra cosa es un
      // defecto y se registra del lado del servidor, sin ensuciar la pantalla.
      console.error("No se pudo previsualizar el arqueo del corte:", error);
      return {
        ok: false as const,
        mensaje: "Escribe el efectivo contado como cifra, por ejemplo 12,450.00",
      };
    }
  }

  // `emitir_folio_financiero` siempre asienta BORRADOR; la vista declara el
  // estado nulo para no mentir sobre su LEFT JOIN. Se resuelve una sola vez
  // para que la captura no dependa de ese hueco teórico.
  const estado: EstadoDocumentoFinanciero = corte.estado ?? "BORRADOR";
  const esBorrador = estado === "BORRADOR";
  const ingresos = detalle.grupos.filter((grupo) => grupo.naturaleza === "INGRESO");
  const egresos = detalle.grupos.filter((grupo) => grupo.naturaleza === "EGRESO");
  const hayDiferencia = corte.diferencia !== null && corte.diferencia !== "0.00";
  const esFaltante = corte.diferencia !== null && corte.diferencia.startsWith("-");
  /**
   * El saldo calculado es una columna GENERATED sin candado de signo, y puede
   * quedar en negativo de forma legítima: basta declarar un depósito antes de
   * que estén firmados los folios de ingreso con los que entró ese dinero. No
   * es un error que haya que ocultar, pero mostrado a secas parece uno.
   */
  const saldoEnNegativo = corte.saldoCalculado.startsWith("-");

  return (
    <div className="space-y-6">
      <BlurFade delay={0.05}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-1.5 font-mono text-sm text-muted-foreground">
              <IconoSilk nombre="documento" className="shrink-0" />
              {corte.folioCompleto}
            </p>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              <IconoSilk nombre="monedas" tamano={20} className="shrink-0" />
              Corte de caja diario
            </h1>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <IconoSilk nombre="sucursal" className="shrink-0" />
              {corte.sucursalClave} · {corte.fechaCorte}
              {corte.turno ? ` · turno ${corte.turno}` : ""} · custodio {corte.custodioNombre}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <IconoSilk nombre={ICONO_ESTADO[estado]} className="shrink-0" />
            <Badge variant={COLOR_ESTADO[estado] ?? "outline"}>
              {ETIQUETA_ESTADO_DOCUMENTO[estado]}
            </Badge>
          </div>
        </div>
      </BlurFade>

      {/* La regla central del formato, dicha con todas sus letras: si el
          custodio pudiera teclear estos importes, el corte dejaría de ser una
          comprobación y sería una declaración. */}
      <BlurFade delay={0.1}>
        <Alert>
          <IconoSilk nombre="informacion" className="shrink-0" />
          <AlertTitle>Este corte jala los folios; no se recaptura nada</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-2 text-xs">
            <Ayuda titulo="Cómo se arma este corte" etiqueta="Cómo se arma esto">
              Los ingresos y los egresos de abajo salen de los folios FIRMADOS de esta sucursal y
              esta fecha, y no se pueden editar aquí: para corregir un importe se corrige su
              folio. El saldo inicial viene encadenado del corte anterior. El único dato que
              teclea el custodio es el efectivo físico contado.
            </Ayuda>
            {corte.armadoEn && (
              <span>Último armado: {new Date(corte.armadoEn).toLocaleString("es-MX")}</span>
            )}
          </AlertDescription>
        </Alert>
      </BlurFade>

      {bloqueantes.length > 0 && (
        <BlurFade delay={0.12}>
          <Alert variant="destructive">
            {/* El alto: no es un aviso, es un candado que impide cerrar el día. */}
            <IconoSilk nombre="alto" className="shrink-0" />
            <AlertTitle>
              El día no puede cerrarse: {bloqueantes.length} folio(s) del día sin firmar
            </AlertTitle>
            <AlertDescription>
              <span>
                Cerrar el corte con folios sin firmar sería rendir cuentas de dinero que todavía no
                tiene dueño. Firma o cancela cada uno y vuelve aquí.
              </span>
              <ul className="mt-2 space-y-1">
                {bloqueantes.map((folio) => (
                  <li key={folio.folio} className="flex flex-wrap items-center gap-2">
                    {folio.documentoId === null ? (
                      <span className="font-mono">{folio.folio}</span>
                    ) : (
                      <Link
                        href={`/finanzas/documentos/${folio.documentoId}`}
                        className="font-mono underline"
                      >
                        {folio.folio}
                      </Link>
                    )}
                    <span className="text-xs">
                      {folio.tipoEtiqueta} · {folio.estadoEtiqueta}
                    </span>
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        </BlurFade>
      )}

      <BlurFade delay={0.15}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconoSilk nombre="dinero" className="shrink-0" />
              Parte I · Ingresos del día
              <Ayuda titulo="Qué entra en los ingresos del día">
                Ventas de contado (RCI-01), utilidad neta de consignas (RCI-03) e ingresos por
                servicio (RCI-04), con los folios que los respaldan.
              </Ayuda>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TablaDeGrupos
              grupos={ingresos}
              total={detalle.totalIngresos}
              etiquetaTotal="TOTAL INGRESOS DEL DÍA"
              vacio="Ningún folio de ingreso firmado en esta fecha."
            />
          </CardContent>
        </Card>
      </BlurFade>

      <BlurFade delay={0.2}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {/* El vale amarillo: cada salida de dinero sale por su RCI-05. */}
              <IconoSilk nombre="nota" className="shrink-0" />
              Parte II · Egresos del día
              <Ayuda titulo="Qué entra en los egresos del día">
                Nómina y comisiones, retiros de socios y pagos a proveedores salen por su vale
                RCI-05. El depósito bancario y los resguardos también restan: son efectivo que ya
                no está en el cajón.
              </Ayuda>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <TablaDeGrupos
              grupos={egresos}
              total={detalle.totalEgresosFolios}
              etiquetaTotal="Subtotal de vales de egreso"
              vacio="Ningún vale de egreso firmado en esta fecha."
            />

            <Separator />

            {/* Los tres sumandos por separado: sin esto, la Parte II parecería
                descuadrar contra el total que usa el cálculo del saldo. */}
            <dl className="space-y-1 text-sm">
              <Renglon etiqueta="Vales de egreso firmados" importe={detalle.totalEgresosFolios} />
              <Renglon
                etiqueta="Depósitos bancarios del día"
                importe={detalle.totalDepositos}
                detalle="Efectivo que salió de caja al banco"
              />
              <Renglon
                etiqueta="Resguardos declarados"
                importe={detalle.totalResguardos}
                detalle="En tránsito por depositar u otro resguardo"
              />
              <Renglon
                etiqueta="TOTAL EGRESOS DEL DÍA"
                importe={detalle.totalEgresos}
                destacado
              />
            </dl>
          </CardContent>
        </Card>
      </BlurFade>

      <BlurFade delay={0.25}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconoSilk nombre="monedas" className="shrink-0" />
              Parte III · Saldo y ubicación del efectivo
            </CardTitle>
            <CardDescription>¿Dónde está el dinero al cierre del día?</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <dl className="space-y-1 text-sm">
              <Renglon
                etiqueta="Saldo inicial de caja"
                importe={corte.saldoInicial}
                detalle="Efectivo contado en el corte anterior firmado; encadenado, no capturado"
              />
              <Renglon etiqueta="(+) Total ingresos del día" importe={corte.totalIngresos} />
              <Renglon etiqueta="(−) Total egresos del día" importe={corte.totalEgresos} />
              <Renglon
                etiqueta="(=) Saldo que debería existir en caja"
                importe={corte.saldoCalculado}
                destacado
              />
              <Separator className="my-2" />
              {corte.efectivoContado === null ? (
                <div className="flex justify-between gap-4 py-1">
                  <dt className="text-muted-foreground">
                    Efectivo físico contado al cierre (arqueo real)
                  </dt>
                  <dd className="text-right text-muted-foreground">pendiente de contar</dd>
                </div>
              ) : (
                <>
                  <Renglon
                    etiqueta="Efectivo físico contado al cierre (arqueo real)"
                    importe={corte.efectivoContado}
                    destacado
                  />
                  <Renglon
                    etiqueta="Diferencia (sobrante / faltante)"
                    importe={corte.diferencia ?? "0.00"}
                    detalle={
                      !hayDiferencia
                        ? "El arqueo cuadró con el saldo calculado"
                        : esFaltante
                          ? "Faltante: quedó levantada una alerta GRAVE para el Gerente General"
                          : "Sobrante: quedó registrado un aviso"
                    }
                    destacado
                  />
                </>
              )}
            </dl>

            {saldoEnNegativo && (
              <Alert>
                <IconoSilk nombre="advertencia" className="shrink-0" />
                <AlertTitle>El saldo que debería existir en caja quedó en negativo</AlertTitle>
                <AlertDescription>
                  Salió del cajón más efectivo —depósitos, resguardos y vales de egreso— del que
                  los folios FIRMADOS de este día alcanzan a respaldar. Casi siempre significa que
                  faltan por firmar los folios de ingreso con los que ese dinero entró: en cuanto
                  se firmen, el corte se rearma y el saldo sube. No impide seguir capturando, pero
                  mientras siga negativo el arqueo no va a cuadrar.
                </AlertDescription>
              </Alert>
            )}

            {corte.explicacionDiferencia && (
              <div className="rounded-md border p-3 text-sm">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <IconoSilk nombre="comentario" className="shrink-0" />
                  Explicación del custodio
                </p>
                <p className="mt-1">{corte.explicacionDiferencia}</p>
              </div>
            )}

            <div>
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium">
                Ubicación final del efectivo al cierre
                <Ayuda titulo="Por qué banco y resguardos no se suman aquí también">
                  La caja física es el arqueo. El banco y los resguardos ya se restaron de los
                  egresos porque ese efectivo salió del cajón: aquí sólo se dice dónde quedó.
                </Ayuda>
              </h3>
              {ubicacion.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Todavía no hay nada que ubicar: no se ha contado la caja ni se ha registrado
                  ningún depósito o resguardo.
                </p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {ubicacion.map((lugar, indice) => (
                    <li
                      key={`${lugar.ubicacion}-${indice}`}
                      className="flex flex-wrap items-baseline justify-between gap-2 border-b py-1 last:border-b-0"
                    >
                      <span>
                        <span className="text-muted-foreground">
                          {INCISO_UBICACION[lugar.ubicacion] ?? "·"}{" "}
                        </span>
                        {lugar.etiqueta}
                        {lugar.institucion && (
                          <span className="text-muted-foreground">
                            {" "}
                            — {lugar.institucion} · cuenta {lugar.cuenta}
                            {lugar.fecha ? ` · ${lugar.fecha}` : ""}
                            {lugar.detalle ? ` · ficha ${lugar.detalle}` : ""}
                          </span>
                        )}
                        {!lugar.institucion && lugar.detalle && (
                          <span className="text-muted-foreground"> — {lugar.detalle}</span>
                        )}
                      </span>
                      <span className="font-mono tabular-nums">
                        {importeEnCasillas(lugar.monto).texto}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>
      </BlurFade>

      {esBorrador ? (
        <BlurFade delay={0.3}>
          <CerrarCorte
            corteId={corte.documentoId}
            fechaCorte={corte.fechaCorte}
            saldoCalculado={corte.saldoCalculado}
            totalEgresos={corte.totalEgresos}
            armadoEn={corte.armadoEn}
            bloqueantes={bloqueantes.map((folio) => folio.folio)}
            previsualizarAccion={previsualizar}
          />
        </BlurFade>
      ) : (
        <BlurFade delay={0.3}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <IconoSilk nombre="candado" className="shrink-0" />
                El día ya está cerrado
                <Ayuda titulo="Qué sigue después de cerrar">
                  El arqueo quedó asentado y el corte pasó a firmas: lo elabora el Custodio
                  Financiero, lo revisa y autoriza el Gerente General y el socio queda enterado.
                  Para rehacer el arqueo hay que regresar el folio a borrador.
                </Ayuda>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Button asChild variant="secondary">
                <Link href={`/finanzas/documentos/${corte.documentoId}`}>
                  <IconoSilk nombre="sello" className="shrink-0" />
                  Ver firmas y sellos del folio
                </Link>
              </Button>
            </CardContent>
          </Card>
        </BlurFade>
      )}

      <div className="flex gap-4 text-sm">
        <Link href="/finanzas/cortes" className="underline">
          Todos los cortes
        </Link>
        <Link href={`/finanzas/documentos/${corte.documentoId}`} className="underline">
          Folio del corte
        </Link>
      </div>
    </div>
  );
}

/** Renglón de importe alineado como en la forma impresa: concepto y cifra. */
function Renglon({
  etiqueta,
  importe,
  detalle,
  destacado = false,
}: {
  etiqueta: string;
  importe: string;
  detalle?: string;
  destacado?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 py-1">
      <dt className={destacado ? "font-medium" : "text-muted-foreground"}>
        {etiqueta}
        {detalle && <span className="block text-xs text-muted-foreground">{detalle}</span>}
      </dt>
      <dd className={`text-right font-mono tabular-nums ${destacado ? "font-semibold" : ""}`}>
        {importeEnCasillas(importe).texto}
      </dd>
    </div>
  );
}

/**
 * Un concepto por bloque con los folios que lo respaldan, como la columna
 * "Folio(s) relacionado(s)" del papel. El folio es un enlace porque la pregunta
 * que sigue siempre es "¿de dónde salió esta cifra?".
 */
function TablaDeGrupos({
  grupos,
  total,
  etiquetaTotal,
  vacio,
}: {
  grupos: GrupoDelCorte[];
  total: string;
  etiquetaTotal: string;
  vacio: string;
}) {
  if (grupos.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">{vacio}</p>
        <div className="flex justify-between border-t pt-2 text-sm font-medium">
          <span>{etiquetaTotal}</span>
          <span className="font-mono tabular-nums">{importeEnCasillas(total).texto}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {grupos.map((grupo) => (
        <div key={grupo.conceptoGrupo}>
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-medium">{grupo.etiqueta}</h3>
            <span className="font-mono text-sm tabular-nums">
              {importeEnCasillas(grupo.subtotal).texto}
            </span>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-56">Folio relacionado</TableHead>
                <TableHead>Formato</TableHead>
                <TableHead className="text-right">Importe</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {grupo.folios.map((folio) => (
                <TableRow key={folio.id}>
                  <TableCell>
                    {/* Un renglón sin folio es el "Otros ingresos" del papel:
                        no hay documento al que ir, y lo que lo respalda es la
                        explicación escrita y el nombre de quien la escribió. */}
                    {folio.origenDocumentoId === null ? (
                      <span className="text-xs text-muted-foreground">Sin folio</span>
                    ) : (
                      <Link
                        href={`/finanzas/documentos/${folio.origenDocumentoId}`}
                        className="font-mono text-xs underline"
                      >
                        {folio.folio}
                      </Link>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {folio.tipoEtiqueta ?? folio.concepto}
                    {folio.capturadoPorNombre && (
                      <span className="block text-[11px]">
                        capturado por {folio.capturadoPorNombre}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {importeEnCasillas(folio.importe).texto}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ))}

      <div className="flex justify-between border-t pt-2 text-sm font-semibold">
        <span>{etiquetaTotal}</span>
        <span className="font-mono tabular-nums">{importeEnCasillas(total).texto}</span>
      </div>
    </div>
  );
}
