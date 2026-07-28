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
  ComboboxPersona,
  PERSONA_SIN_CAPTURAR,
  personaDeTextoLibre,
  type PersonaCapturada,
} from "@/components/ui/combobox-persona";
import { Input } from "@/components/ui/input";
import { InputMoneda } from "@/components/ui/input-moneda";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { aCentavos, deCentavos, estadoValeEgreso } from "@/lib/finanzas/calculos";
import { importeEnCasillas } from "@/lib/finanzas/formato";
import { CATALOGO_ROL_FIRMANTE, type RolFirmante } from "@/lib/finanzas/tipos";

type Sucursal = { id: number; clave: string; nombre: string };
type Concepto = { codigo: string; etiqueta: string; esAnticipoUtilidades: boolean };
type FormaPago = { codigo: string; etiqueta: string; afectaCajaFisica: boolean };

/**
 * Un socio REGISTRADO, no un usuario del sistema. Ser socio es tener parte del
 * capital social y se acredita con un acta; tener cuenta en el DMS no es lo
 * mismo ni se le parece, y confundirlos permitía entregar un "retiro de
 * utilidades" a quien no tiene derecho a utilidad alguna.
 */
type Socio = {
  personaId: number;
  nombre: string;
  participacionPct: string | null;
  saldoPorComprobar: string;
  tieneSaldoPorComprobar: boolean;
  /** Redactada por `posicionSocio`; null si nunca ha retirado ni recibido reparto. */
  etiquetaPosicion: string | null;
};

type ReciboNomina = {
  documentoId: number;
  folio: string;
  folioCompleto: string;
  trabajador: string;
  numEmpleado: string;
  periodoInicio: string;
  periodoFin: string;
  netoPagado: string;
  /** Ya existe otro vale no cancelado que cita este recibo. */
  yaTieneVale: boolean;
};

type Props = {
  sucursales: Sucursal[];
  conceptos: Concepto[];
  formasPago: FormaPago[];
  socios: Socio[];
  recibosNomina: ReciboNomina[];
};

/** Conceptos con regla propia en el CHECK de `vale_egreso_rci05`. */
const CONCEPTO_OTRO = "OTRO";
const CONCEPTO_NOMINA = "PAGO_NOMINA";
const CONCEPTO_RETIRO_SOCIO = "RETIRO_UTILIDADES_SOCIO";

/** Momento actual en el formato local sin huso que espera `datetime-local`. */
function ahoraLocal(): string {
  const ahora = new Date();
  const dosDigitos = (n: number) => String(n).padStart(2, "0");
  return (
    `${ahora.getFullYear()}-${dosDigitos(ahora.getMonth() + 1)}-${dosDigitos(ahora.getDate())}` +
    `T${dosDigitos(ahora.getHours())}:${dosDigitos(ahora.getMinutes())}`
  );
}

/**
 * Convierte lo tecleado al instante con huso explícito que exige
 * `esquemaFechaHoraIso`. Esa hora decide a qué corte de caja pertenece el
 * egreso, y el corte sólo jala los vales de SU fecha.
 */
function aInstanteIso(valorLocal: string): string | null {
  const fecha = new Date(valorLocal);
  return Number.isNaN(fecha.getTime()) ? null : fecha.toISOString();
}

/**
 * Captura del CACM-RCI-05, en el orden del papel: Parte I los datos del egreso,
 * Parte II el importe, Parte III la declaración y la autorización.
 *
 * Es el formato con más reglas del manual y la pantalla está construida para
 * ayudarlas en vez de estorbarlas:
 *
 *  · TRES FIRMANTES DISTINTOS (regla 4). Autorizó, entregó y recibió no se
 *    firman aquí —se rubrican desde la ficha del documento, con PIN o de forma
 *    presencial— pero sí se anuncian aquí, calculados con `estadoValeEgreso`
 *    sobre un vale todavía sin firmas. Quien captura sale de esta pantalla
 *    sabiendo a quién tiene que ir a buscar; enterarse después, frente al
 *    lector de PIN, es lo que hace que un vale se quede sin firmar.
 *
 *  · PAGO DE NÓMINA. El inciso c) del papel pide citar el recibo CACM-RCI-06.
 *    En vez de pedir que se teclee ese folio se ofrece la lista de recibos ya
 *    FIRMADOS: un folio tecleado a mano puede no existir, puede estar en
 *    borrador o puede ser el de otro trabajador, y el vale acabaría amparando
 *    un pago que ningún recibo respalda.
 *
 *  · RETIRO DE UTILIDADES POR SOCIO. Lo que sale se registra como ANTICIPO A
 *    CUENTA DE UTILIDADES mientras no exista un reparto formal que lo respalde
 *    (LGSM art. 19), y la pantalla lo dice con todas sus letras ANTES de que el
 *    dinero salga, no en un informe posterior.
 */
export function CapturaVale({
  sucursales,
  conceptos,
  formasPago,
  socios,
  recibosNomina,
}: Props) {
  const router = useRouter();
  const [guardando, setGuardando] = useState(false);

  const [sucursalId, setSucursalId] = useState<string>(String(sucursales[0]?.id ?? ""));

  // Parte I — datos del egreso, en el orden numerado de la forma.
  const [fechaHora, setFechaHora] = useState(ahoraLocal());
  const [folioRelacionado, setFolioRelacionado] = useState("");
  const [beneficiario, setBeneficiario] = useState<PersonaCapturada>(PERSONA_SIN_CAPTURAR);
  const [idTipo, setIdTipo] = useState("INE");
  const [idNumero, setIdNumero] = useState("");
  /** La ficha elegida no traía identificación y el vale sí la exige. */
  const [fichaSinIdentificacion, setFichaSinIdentificacion] = useState(false);
  const [conceptoCodigo, setConceptoCodigo] = useState(conceptos[0]?.codigo ?? "");
  const [conceptoOtro, setConceptoOtro] = useState("");
  const [reciboNominaId, setReciboNominaId] = useState("");
  const [socioPersonaId, setSocioPersonaId] = useState("");

  // Parte II — importe y forma en que sale.
  const [formaPago, setFormaPago] = useState(formasPago[0]?.codigo ?? "");
  const [importe, setImporte] = useState("");

  const concepto = useMemo(
    () => conceptos.find((c) => c.codigo === conceptoCodigo) ?? null,
    [conceptos, conceptoCodigo],
  );
  const forma = useMemo(
    () => formasPago.find((f) => f.codigo === formaPago) ?? null,
    [formasPago, formaPago],
  );
  const recibo = useMemo(
    () => recibosNomina.find((r) => String(r.documentoId) === reciboNominaId) ?? null,
    [recibosNomina, reciboNominaId],
  );
  const socio = useMemo(
    () => socios.find((s) => String(s.personaId) === socioPersonaId) ?? null,
    [socios, socioPersonaId],
  );

  const esNomina = conceptoCodigo === CONCEPTO_NOMINA;
  const esOtro = conceptoCodigo === CONCEPTO_OTRO;

  /**
   * Se pregunta por el socio tanto cuando el código es el del manual —que es lo
   * que exige el CHECK de la tabla— como cuando el catálogo marcó el concepto
   * con `es_anticipo_utilidades`. La bandera es la que dispara el aviso de
   * retiro sin respaldo, y un aviso que no puede nombrar al socio no le sirve a
   * nadie: no habría a quién cargarle el anticipo cuando se haga el reparto.
   */
  const esRetiroSocio =
    conceptoCodigo === CONCEPTO_RETIRO_SOCIO || concepto?.esAnticipoUtilidades === true;

  const centavos = aCentavos(importe);
  const importeValido = centavos !== null && centavos > 0n;
  const instante = aInstanteIso(fechaHora);

  /** El neto del recibo citado y el importe del vale deberían ser el mismo dinero. */
  const netoRecibo = recibo ? aCentavos(recibo.netoPagado) : null;
  const importeDifiereDelNeto =
    esNomina && netoRecibo !== null && centavos !== null && centavos !== netoRecibo;

  /**
   * Lo que el socio quedaría debiendo si este vale llega a firmarse. Se suma en
   * centavos enteros y se devuelve a decimal con `deCentavos`: la vista de
   * anticipos sólo cuenta los vales FIRMADOS, así que esto es una proyección y
   * la pantalla lo dice.
   */
  const saldoProyectado = useMemo(() => {
    if (!socio || centavos === null || centavos <= 0n) return null;
    const saldo = aCentavos(socio.saldoPorComprobar);
    return saldo === null ? null : deCentavos(saldo + centavos);
  }, [socio, centavos]);

  /**
   * Las tres firmas que le faltan a un vale recién capturado. Se calcula con la
   * MISMA función que la ficha usará sobre las firmas reales, pasándole una
   * lista vacía: así lo que se anuncia aquí y lo que se exige después no pueden
   * separarse.
   */
  const firmasQueFaltan = useMemo(() => {
    const estado = estadoValeEgreso([]);
    return estado.rolesFaltantes.map((rol) => ({
      rol,
      etiqueta: CATALOGO_ROL_FIRMANTE[rol as RolFirmante].etiqueta,
      exigeUsuarioInterno: CATALOGO_ROL_FIRMANTE[rol as RolFirmante].exigeUsuarioInterno,
    }));
  }, []);

  const listo =
    sucursalId !== "" &&
    conceptoCodigo !== "" &&
    formaPago !== "" &&
    instante !== null &&
    beneficiario.nombre.trim().length >= 3 &&
    idTipo.trim().length >= 2 &&
    idNumero.trim().length >= 3 &&
    importeValido &&
    (!esOtro || conceptoOtro.trim().length >= 3) &&
    (!esNomina || reciboNominaId !== "") &&
    (!esRetiroSocio || socioPersonaId !== "");

  /**
   * Al elegir un recibo de nómina se copian el trabajador y su neto: son los
   * datos del pago que este vale ampara y volver a teclearlos sólo abre la
   * puerta a que el vale y el recibo digan cosas distintas. Quedan editables
   * porque quien recibe puede no ser el trabajador —un apoderado, por ejemplo—
   * y porque el papel admite entregas parciales.
   */
  function elegirRecibo(valor: string) {
    setReciboNominaId(valor);
    const elegido = recibosNomina.find((r) => String(r.documentoId) === valor);
    if (!elegido) return;
    // Como texto libre: el nombre lo dicta el recibo, no el catálogo. Si esa
    // persona además tiene ficha, quien captura la elige y el enlace se pone.
    setBeneficiario(personaDeTextoLibre(elegido.trabajador));
    setFichaSinIdentificacion(false);
    setImporte(elegido.netoPagado);
    // El folio del recibo NO se copia además al campo 2: el enlace ya vive en
    // su propia columna, y escribirlo dos veces crearía dos versiones del mismo
    // dato que un día pueden decir cosas distintas.
  }

  /**
   * Al elegir una ficha del catálogo se copia su identificación, si la tiene.
   * Los campos NO se bloquean: el catálogo admite fichas sin identificación y
   * el vale la exige siempre, y además la credencial con la que alguien cobra
   * hoy puede no ser la que quedó registrada.
   */
  function copiarIdentificacion(persona: { idTipo: string | null; idNumero: string | null }) {
    if (persona.idTipo && persona.idNumero) {
      setIdTipo(persona.idTipo);
      setIdNumero(persona.idNumero);
      setFichaSinIdentificacion(false);
      return;
    }
    setFichaSinIdentificacion(true);
  }

  function cambiarConcepto(codigo: string) {
    setConceptoCodigo(codigo);
    // Lo que el concepto nuevo no usa se limpia: un recibo de nómina colgado de
    // un pago a proveedor, o un socio colgado de una comisión, serían datos que
    // nadie tecleó a propósito y que la forma impresa no tiene dónde poner.
    if (codigo !== CONCEPTO_NOMINA) setReciboNominaId("");
    if (codigo !== CONCEPTO_RETIRO_SOCIO) {
      const nuevo = conceptos.find((c) => c.codigo === codigo);
      if (!nuevo?.esAnticipoUtilidades) setSocioPersonaId("");
    }
    if (codigo !== CONCEPTO_OTRO) setConceptoOtro("");
  }

  async function guardar() {
    if (!listo || instante === null) return;
    setGuardando(true);
    try {
      // 1) El folio primero: el consecutivo lo entrega la base, nunca la UI.
      const emision = await fetch("/api/finanzas/documentos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tipo: "CACM-RCI-05", sucursalId: Number(sucursalId) }),
      });
      if (!emision.ok) throw new Error((await emision.json()).error ?? "No se pudo emitir el folio");
      const documento = await emision.json();

      const captura = await fetch(`/api/finanzas/documentos/${documento.id}/rci05`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fechaHora: instante,
          conceptoCodigo,
          conceptoOtro: esOtro ? conceptoOtro : null,
          folioRelacionadoTexto: folioRelacionado || null,
          reciboNominaId: esNomina ? Number(reciboNominaId) : null,
          // El nombre viaja como TEXTO siempre: es lo que la persona firma, y
          // si mañana se corrige la ficha del catálogo el vale firmado no debe
          // cambiar en silencio. El enlace va aparte y sólo sirve para sumar.
          beneficiarioNombre: beneficiario.nombre,
          beneficiarioPersonaId: beneficiario.personaId,
          beneficiarioIdTipo: idTipo,
          beneficiarioIdNumero: idNumero,
          socioPersonaId: esRetiroSocio ? Number(socioPersonaId) : null,
          formaPago,
          importe,
        }),
      });
      if (!captura.ok) throw new Error((await captura.json()).error ?? "No se pudo guardar");

      toast.success(`Folio ${documento.folio} capturado · faltan sus tres firmas`);
      router.push(`/finanzas/documentos/${documento.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar el vale");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Parte I · Datos del egreso</CardTitle>
            <CardDescription>
              Los campos siguen el orden de la forma impresa. El concepto decide qué más hay que
              acreditar: no es una etiqueta, es lo que hace legal la salida del dinero.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="sucursal">Sucursal / Agencia *</Label>
              <select
                id="sucursal"
                value={sucursalId}
                onChange={(e) => setSucursalId(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                {sucursales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.clave} · {s.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="fecha-hora">1. Fecha y hora *</Label>
              <Input
                id="fecha-hora"
                type="datetime-local"
                value={fechaHora}
                onChange={(e) => setFechaHora(e.target.value)}
                aria-invalid={instante === null}
              />
              <p className="text-xs text-muted-foreground">
                Decide a qué corte de caja pertenece este egreso.
              </p>
            </div>

            {/* 5. Concepto. En el papel son seis casillas y quien llena marca
                una; aquí el catálogo lo administra el sistema, así que se
                presenta como selector y no como lista fija. */}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="concepto">5. Concepto del egreso *</Label>
              <select
                id="concepto"
                value={conceptoCodigo}
                onChange={(e) => cambiarConcepto(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                {conceptos.map((c) => (
                  <option key={c.codigo} value={c.codigo}>
                    {c.etiqueta}
                  </option>
                ))}
              </select>
            </div>

            {esOtro && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="concepto-otro">f) Especifica el concepto *</Label>
                <Input
                  id="concepto-otro"
                  value={conceptoOtro}
                  onChange={(e) => setConceptoOtro(e.target.value)}
                  maxLength={160}
                  placeholder="al menos 3 caracteres"
                />
              </div>
            )}

            {/* c) Pago de nómina: el papel pide el folio del CACM-RCI-06. Se
                ofrece la lista de recibos firmados en vez de una casilla de
                texto, porque un folio tecleado puede no existir o estar en
                borrador, y entonces el vale ampararía un pago sin respaldo. */}
            {esNomina && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="recibo-nomina">
                  c) Recibo de nómina que ampara el pago (CACM-RCI-06) *
                </Label>
                {recibosNomina.length === 0 ? (
                  <Alert variant="destructive">
                    <AlertTitle>No hay recibos de nómina firmados</AlertTitle>
                    <AlertDescription>
                      Un pago de nómina tiene que citar el recibo del trabajador, y sólo sirve uno
                      ya firmado. Captura y firma primero su CACM-RCI-06, o elige otro concepto si
                      esta salida de efectivo no es nómina.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <>
                    <select
                      id="recibo-nomina"
                      value={reciboNominaId}
                      onChange={(e) => elegirRecibo(e.target.value)}
                      className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                    >
                      <option value="">— elige el recibo del trabajador —</option>
                      {recibosNomina.map((r) => (
                        <option key={r.documentoId} value={r.documentoId}>
                          {r.folio} · {r.trabajador} · {r.periodoInicio} a {r.periodoFin} ·{" "}
                          {importeEnCasillas(r.netoPagado).texto}
                          {r.yaTieneVale ? " · ya tiene vale" : ""}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-muted-foreground">
                      Sólo aparecen recibos ya firmados. Al elegir uno se copian el trabajador y su
                      neto; quedan editables porque quien recibe puede no ser el trabajador.
                    </p>
                  </>
                )}

                {recibo?.yaTieneVale && (
                  // No hay candado en el esquema que lo impida, así que la
                  // advertencia es lo único que separa de un doble egreso que
                  // después nadie sabe explicar en el corte.
                  <Alert variant="destructive">
                    <AlertTitle>Ese recibo ya tiene un vale de egreso</AlertTitle>
                    <AlertDescription>
                      Existe otro vale no cancelado que cita el folio {recibo.folioCompleto}. Si
                      emites éste, la nómina de {recibo.trabajador} habrá salido dos veces de la
                      caja. Verifica antes de continuar.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}

            {/* b) Retiro de utilidades por socio. La regla del artículo 19 se
                dice ANTES de que el dinero salga, no en un informe posterior. */}
            {esRetiroSocio && (
              <div className="space-y-3 sm:col-span-2">
                {/* Aquí SÓLO aparecen los socios registrados. Antes se llenaba
                    con todos los usuarios del sistema, y elegir mal era
                    cuestión de un clic: el anticipo se le cargaba a quien no
                    era, o la caja entregaba un "retiro de utilidades" a alguien
                    que no tiene parte del capital social. */}
                {socios.length === 0 ? (
                  <Alert variant="destructive">
                    <AlertTitle>Todavía no hay ningún socio dado de alta</AlertTitle>
                    <AlertDescription className="space-y-2">
                      <p>
                        Ser socio es tener parte del capital social, y eso se acredita con un acta;
                        no se deduce de tener cuenta en el sistema. Mientras no haya socios
                        registrados no hay a quién cargarle este retiro cuando llegue el reparto, y
                        el vale no puede emitirse.
                      </p>
                      <p>
                        <Link href="/finanzas/catalogos/socios" className="underline">
                          Registrar a los socios
                        </Link>{" "}
                        o elige otro concepto si esta salida de efectivo no es un retiro de socio.
                      </p>
                    </AlertDescription>
                  </Alert>
                ) : (
                  <div className="space-y-1.5">
                    <Label htmlFor="socio">b) Socio / accionista que retira *</Label>
                    <select
                      id="socio"
                      value={socioPersonaId}
                      onChange={(e) => setSocioPersonaId(e.target.value)}
                      className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                    >
                      <option value="">— indica quién retira —</option>
                      {socios.map((s) => (
                        <option key={s.personaId} value={s.personaId}>
                          {s.nombre}
                          {s.participacionPct !== null ? ` · ${s.participacionPct}%` : ""}
                          {s.tieneSaldoPorComprobar
                            ? ` · ${importeEnCasillas(s.saldoPorComprobar).texto} por comprobar`
                            : ""}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-muted-foreground">
                      Sólo los socios dados de alta en el registro. Sin este dato no habría a quién
                      cargarle el anticipo cuando se haga el reparto formal.
                    </p>
                  </div>
                )}

                <Alert>
                  <AlertTitle>
                    Este importe se registra como ANTICIPO A CUENTA DE UTILIDADES
                  </AlertTitle>
                  <AlertDescription className="space-y-2">
                    <p>
                      No es utilidad repartida. El reparto de utilidades sólo procede después de un
                      balance aprobado que efectivamente las arroje, y mientras ese reparto formal
                      no exista, lo que el socio retira es un anticipo a cuenta:{" "}
                      <span className="font-medium">saldo por comprobar</span>, dinero que se debe a
                      la sociedad, y nunca un gasto cerrado.
                    </p>
                    <p className="text-xs">
                      Fundamento: artículo 19 de la Ley General de Sociedades Mercantiles. Un
                      reparto hecho en contravención de ese artículo no queda firme: la sociedad y
                      sus acreedores pueden repetir contra quien recibió el dinero, y los
                      administradores que lo pagaron responden solidariamente.
                    </p>
                    <p className="text-xs">
                      El vale no se bloquea —la empresa puede necesitar entregar el efectivo— pero
                      quedará un aviso para el gerente mientras no haya reparto que lo respalde.
                    </p>
                  </AlertDescription>
                </Alert>

                {socio && (
                  <div className="rounded-md border bg-muted/40 p-4 text-sm">
                    <p className="text-xs text-muted-foreground">
                      Posición de {socio.nombre} antes de este retiro
                    </p>
                    {socio.tieneSaldoPorComprobar ? (
                      <>
                        <p className="mt-1 text-lg font-semibold">
                          {importeEnCasillas(socio.saldoPorComprobar).texto}
                        </p>
                        <p className="text-xs text-muted-foreground">{socio.etiquetaPosicion}</p>
                        {saldoProyectado !== null && (
                          <p className="mt-2 text-xs">
                            Con este vale el saldo por comprobar subiría a{" "}
                            <span className="font-medium">
                              {importeEnCasillas(saldoProyectado).texto}
                            </span>{" "}
                            —cuando el folio quede firmado, que es lo que la vista de anticipos
                            cuenta.
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="mt-1 text-muted-foreground">
                        {socio.etiquetaPosicion ??
                          "No tiene anticipos previos ni reparto formal registrado."}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            <Separator className="sm:col-span-2" />

            {/* 3. Quien recibe. Se escribe libremente o se elige del catálogo,
                en el mismo campo: a veces se le paga a alguien una sola vez y
                darlo de alta sería un estorbo, y a veces es el proveedor de
                todas las semanas al que hay que poder sumarle lo pagado. */}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="beneficiario">3. Nombre de quien recibe el efectivo *</Label>
              <ComboboxPersona
                id="beneficiario"
                valor={beneficiario}
                onChange={setBeneficiario}
                onElegirFicha={copiarIdentificacion}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="id-tipo">4. Identificación oficial — tipo *</Label>
              <Input id="id-tipo" value={idTipo} onChange={(e) => setIdTipo(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="id-numero">Número *</Label>
              <Input
                id="id-numero"
                value={idNumero}
                onChange={(e) => setIdNumero(e.target.value)}
                placeholder="al menos 3 caracteres"
              />
            </div>

            {fichaSinIdentificacion && (
              <p className="text-xs text-muted-foreground sm:col-span-2">
                Esa ficha del catálogo no tiene identificación registrada. El vale sí la exige:
                captúrala de la credencial que quien cobra tenga en la mano —es de ella de la que
                responde el documento, no del catálogo—.
              </p>
            )}

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="folio-relacionado">
                2. Folio relacionado (venta, liquidación, factura…)
              </Label>
              <Input
                id="folio-relacionado"
                value={folioRelacionado}
                onChange={(e) => setFolioRelacionado(e.target.value)}
                maxLength={60}
                placeholder="opcional"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Parte II · Importe entregado</CardTitle>
            <CardDescription>
              El importe con letra se arma solo a partir de la cifra, como en el papel se escribe
              debajo de ella.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="importe">6. Importe entregado *</Label>
              <InputMoneda
                id="importe"
                valor={importe}
                onValorChange={setImporte}
                placeholder="0.00"
                className="font-mono text-lg tabular-nums"
                aria-invalid={importe !== "" && !importeValido}
              />
              {importeValido ? (
                <p className="text-xs text-muted-foreground">{importeEnCasillas(importe).letra}</p>
              ) : (
                importe !== "" && (
                  <p className="text-xs text-destructive">
                    El importe se escribe con dígitos y hasta dos decimales, y tiene que ser mayor
                    que cero.
                  </p>
                )
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="forma-pago">Forma en que sale *</Label>
              <select
                id="forma-pago"
                value={formaPago}
                onChange={(e) => setFormaPago(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                {formasPago.map((f) => (
                  <option key={f.codigo} value={f.codigo}>
                    {f.etiqueta}
                  </option>
                ))}
              </select>
              {forma && (
                <p className="text-xs text-muted-foreground">
                  {forma.afectaCajaFisica
                    ? "Sale del cajón: resta del arqueo del corte de caja del día."
                    : "No sale del cajón, así que no resta del arqueo del corte; el egreso existe, pero el efectivo físico no se mueve."}
                </p>
              )}
            </div>

            {importeDifiereDelNeto && recibo && (
              <Alert className="sm:col-span-2">
                <AlertTitle>El importe no coincide con el neto del recibo</AlertTitle>
                <AlertDescription>
                  El recibo {recibo.folio} de {recibo.trabajador} tiene un neto de{" "}
                  {importeEnCasillas(recibo.netoPagado).texto} y este vale entrega{" "}
                  {importeEnCasillas(importe).texto}. Si es un pago parcial está bien; si es un
                  error, se corrige aquí y no después de que el dinero salga.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Parte III · Declaración y autorización</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Quien recibe el efectivo declara recibirlo completo y a su entera satisfacción, y que
              su destino es exclusivamente el señalado en el concepto de este vale. El Custodio
              Financiero declara haber entregado el importe autorizado, dejando constancia de la
              salida de efectivo de la caja de la empresa. Tratándose de retiro de utilidades por
              socios o accionistas, dicho importe se registra como{" "}
              <span className="font-medium">anticipo a cuenta de utilidades</span> hasta que exista
              un balance que efectivamente arroje utilidades repartibles.
            </p>
            <p className="text-xs">
              Fundamento: artículo 19 de la Ley General de Sociedades Mercantiles; obligación de
              rendición de cuentas de todo mandatario o comisionista; Código Penal Federal — abuso
              de confianza (Arts. 382–383) aplicable a quien disponga de efectivo sin este vale.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="lg:sticky lg:top-6 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle>Resumen</CardTitle>
            <CardDescription>{concepto?.etiqueta ?? "sin concepto"}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Importe</span>
              <span className="font-medium">
                {importeEnCasillas(importeValido ? importe : "0").texto}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Recibe</span>
              <span className="text-right font-medium">
                {beneficiario.nombre.trim() || "—"}
                {beneficiario.personaId !== null && (
                  <span className="block text-xs font-normal text-muted-foreground">
                    enlazado al catálogo
                  </span>
                )}
              </span>
            </div>
            {esNomina && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Recibo citado</span>
                <span className="font-mono text-xs">{recibo?.folio ?? "—"}</span>
              </div>
            )}
            {esRetiroSocio && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Socio</span>
                <span className="font-medium">{socio?.nombre ?? "—"}</span>
              </div>
            )}

            {/* Regla 4 anunciada antes de emitir el folio: sin las tres firmas
                de tres personas distintas, este vale no autoriza ninguna salida
                de efectivo. Se firma desde la ficha del documento, no aquí. */}
            <div className="space-y-2 border-t pt-3">
              <p className="text-xs text-muted-foreground">
                Firmas que faltarán al guardar — las tres son obligatorias y de personas distintas
              </p>
              <ul className="space-y-1">
                {firmasQueFaltan.map((f) => (
                  <li key={f.rol} className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{f.etiqueta}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {f.exigeUsuarioInterno ? "con su PIN" : "presencial, con identificación"}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                Se rubrican desde la ficha del documento. Una misma persona no puede ocupar dos de
                estos roles: la base lo rechaza al firmar.
              </p>
            </div>

            {esRetiroSocio && (
              <Alert>
                <AlertTitle>Anticipo, no reparto</AlertTitle>
                <AlertDescription>
                  Al firmarse, este importe engrosará el saldo por comprobar del socio hasta que un
                  reparto formal lo respalde (LGSM art. 19).
                </AlertDescription>
              </Alert>
            )}

            <Button className="w-full" disabled={guardando || !listo} onClick={guardar}>
              {guardando ? "Guardando…" : "Emitir folio y guardar"}
            </Button>
            <p className="text-xs text-muted-foreground">
              El folio consecutivo lo entrega la base al guardar, no esta pantalla. Ningún efectivo
              puede salir de caja hasta que el vale esté firmado y autorizado.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
