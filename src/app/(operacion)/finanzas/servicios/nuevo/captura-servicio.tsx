"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { aCentavos } from "@/lib/finanzas/calculos";
import { etiquetaCustodia, importeEnCasillas } from "@/lib/finanzas/formato";

type Sucursal = { id: number; clave: string; nombre: string };
type Empleado = { id: number; numEmpleado: string; nombre: string; puesto: string | null };
type FormaPago = { codigo: string; etiqueta: string; afectaCajaFisica: boolean };

type Props = {
  sucursales: Sucursal[];
  empleados: Empleado[];
  formasPago: FormaPago[];
};

/** Longitud mínima que `esquemaIngresoServicio` exige a la descripción. */
const MINIMO_DESCRIPCION = 5;

/**
 * Momento actual en el formato que espera `<input type="datetime-local">`, que
 * es hora LOCAL sin huso. Se arma con las partes locales y no recortando
 * `toISOString()`, porque esa cadena ya está en UTC y en México adelantaría el
 * reloj seis horas.
 */
function ahoraLocal(): string {
  const ahora = new Date();
  const dosDigitos = (n: number) => String(n).padStart(2, "0");
  return (
    `${ahora.getFullYear()}-${dosDigitos(ahora.getMonth() + 1)}-${dosDigitos(ahora.getDate())}` +
    `T${dosDigitos(ahora.getHours())}:${dosDigitos(ahora.getMinutes())}`
  );
}

/**
 * Convierte lo tecleado en el `datetime-local` al instante con huso explícito
 * que exige `esquemaFechaHoraIso`.
 *
 * El navegador interpreta esa cadena en la hora local de quien captura, que es
 * la del mostrador donde se cobró; `toISOString()` la fija como instante. El
 * huso no es un detalle de formato: esa hora decide a qué corte de caja
 * pertenece el folio, y sin él la misma captura caería en un día u otro según
 * dónde corra el servidor.
 */
function aInstanteIso(valorLocal: string): string | null {
  const fecha = new Date(valorLocal);
  return Number.isNaN(fecha.getTime()) ? null : fecha.toISOString();
}

/** Deja pasar sólo lo que puede llegar a ser un importe: dígitos y un punto. */
function soloImporte(valor: string): string {
  return valor.replace(/[^\d.]/g, "");
}

/**
 * Captura del CACM-RCI-04, en el orden del papel: Parte I los datos del
 * servicio, Parte II el importe cobrado, Parte III la declaración de custodia.
 *
 * Lo que esta pantalla añade a la forma impresa es una sola cosa, y es la que
 * el manual considera importante: decir con todas sus letras que guardar el
 * recibo NO transfiere la custodia del dinero. En el papel esa transferencia
 * ocurre cuando el Custodio Financiero firma; aquí también, y por eso el
 * resumen muestra `etiquetaCustodia(false)` desde antes de guardar. Un recibo
 * capturado y sin esa firma es dinero que sigue siendo responsabilidad de quien
 * lo cobró.
 */
export function CapturaServicio({ sucursales, empleados, formasPago }: Props) {
  const router = useRouter();
  const [guardando, setGuardando] = useState(false);

  const [sucursalId, setSucursalId] = useState<string>(String(sucursales[0]?.id ?? ""));

  // Parte I — datos del servicio, en el orden numerado de la forma.
  const [cliente, setCliente] = useState("");
  const [vehiculo, setVehiculo] = useState("");
  const [placas, setPlacas] = useState("");
  const [ordenServicio, setOrdenServicio] = useState("");
  const [fechaHora, setFechaHora] = useState(ahoraLocal());
  const [descripcion, setDescripcion] = useState("");
  const [cobradorId, setCobradorId] = useState<string>(String(empleados[0]?.id ?? ""));
  const [formaPago, setFormaPago] = useState(formasPago[0]?.codigo ?? "");

  // Parte II — importe cobrado.
  const [importe, setImporte] = useState("");

  const cobrador = useMemo(
    () => empleados.find((e) => String(e.id) === cobradorId) ?? null,
    [empleados, cobradorId],
  );
  const forma = useMemo(
    () => formasPago.find((f) => f.codigo === formaPago) ?? null,
    [formasPago, formaPago],
  );

  const centavos = aCentavos(importe);
  const importeValido = centavos !== null && centavos > 0n;
  const instante = aInstanteIso(fechaHora);

  const listo =
    sucursalId !== "" &&
    cobradorId !== "" &&
    formaPago !== "" &&
    cliente.trim().length >= 3 &&
    ordenServicio.trim().length >= 1 &&
    descripcion.trim().length >= MINIMO_DESCRIPCION &&
    instante !== null &&
    importeValido;

  async function guardar() {
    if (!listo || instante === null) return;
    setGuardando(true);
    try {
      // 1) El folio primero: el consecutivo lo entrega la base, nunca la UI.
      const emision = await fetch("/api/finanzas/documentos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tipo: "CACM-RCI-04", sucursalId: Number(sucursalId) }),
      });
      if (!emision.ok) throw new Error((await emision.json()).error ?? "No se pudo emitir el folio");
      const documento = await emision.json();

      // 2) El contenido de la hoja. El recibo no lleva arqueo por
      //    denominaciones: el taller cobra también con tarjeta o transferencia.
      const captura = await fetch(`/api/finanzas/documentos/${documento.id}/rci04`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clienteNombre: cliente,
          vehiculoDescripcion: vehiculo || null,
          placas: placas || null,
          ordenServicio,
          fechaHoraCobro: instante,
          descripcionServicio: descripcion,
          cobradorEmpleadoId: Number(cobradorId),
          formaPago,
          importeTotal: importe,
        }),
      });
      if (!captura.ok) throw new Error((await captura.json()).error ?? "No se pudo guardar");

      toast.success(`Folio ${documento.folio} capturado`);
      router.push(`/finanzas/documentos/${documento.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar el recibo");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Parte I · Datos del servicio</CardTitle>
            <CardDescription>
              Los campos siguen el orden de la forma impresa, para que quien ya la usa no tenga que
              reaprender nada.
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
              <Label htmlFor="orden">3. No. de orden de servicio *</Label>
              <Input
                id="orden"
                value={ordenServicio}
                onChange={(e) => setOrdenServicio(e.target.value)}
                maxLength={40}
                placeholder="OS-2026-0148"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="cliente">1. Nombre del cliente *</Label>
              <Input
                id="cliente"
                value={cliente}
                onChange={(e) => setCliente(e.target.value)}
                maxLength={160}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="vehiculo">2. Vehículo atendido (marca / modelo)</Label>
              <Input
                id="vehiculo"
                value={vehiculo}
                onChange={(e) => setVehiculo(e.target.value)}
                maxLength={200}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="placas">Placas</Label>
              <Input
                id="placas"
                value={placas}
                onChange={(e) => setPlacas(e.target.value.toUpperCase())}
                maxLength={20}
                className="font-mono uppercase"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="fecha-hora">4. Fecha y hora de cobro *</Label>
              <Input
                id="fecha-hora"
                type="datetime-local"
                value={fechaHora}
                onChange={(e) => setFechaHora(e.target.value)}
                aria-invalid={instante === null}
              />
              <p className="text-xs text-muted-foreground">
                Es la hora del cobro, no la de la captura: decide a qué corte de caja pertenece este
                folio.
              </p>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="descripcion">5. Descripción del servicio realizado *</Label>
              <Textarea
                id="descripcion"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                maxLength={1000}
                rows={3}
                placeholder="Afinación mayor, cambio de balatas delanteras…"
                aria-invalid={descripcion !== "" && descripcion.trim().length < MINIMO_DESCRIPCION}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cobrador">6. Nombre de quien cobra (asesor / cajero) *</Label>
              <select
                id="cobrador"
                value={cobradorId}
                onChange={(e) => setCobradorId(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                {empleados.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.numEmpleado} · {e.nombre}
                  </option>
                ))}
              </select>
              {/* 7. No. de empleado. En el papel es una casilla aparte; aquí ya
                  viene resuelta por el catálogo de personal, así que se muestra
                  en vez de pedirse: teclearla otra vez sólo abre la puerta a que
                  el número y el nombre acaben describiendo a dos personas. */}
              {cobrador && (
                <p className="text-xs text-muted-foreground">
                  7. No. de empleado <span className="font-mono">{cobrador.numEmpleado}</span>
                  {cobrador.puesto ? ` · ${cobrador.puesto}` : ""}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="forma-pago">8. Forma de pago *</Label>
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
                    ? "Entra al arqueo del corte: es dinero que pasa físicamente al Custodio Financiero."
                    : "No pasa por el cajón, así que no entra al arqueo del corte; el importe se cobró, pero no hay efectivo que entregar en mano."}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Parte II · Importe cobrado</CardTitle>
            <CardDescription>
              El importe con letra se arma solo a partir de la cifra, como en el papel se escribe
              debajo de ella.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="space-y-1.5">
              <Label htmlFor="importe">9. Importe total cobrado *</Label>
              <Input
                id="importe"
                value={importe}
                onChange={(e) => setImporte(soloImporte(e.target.value))}
                inputMode="decimal"
                placeholder="0.00"
                className="max-w-xs text-lg"
                aria-invalid={importe !== "" && !importeValido}
              />
              {importeValido ? (
                <p className="text-xs text-muted-foreground">
                  {importeEnCasillas(importe).letra}
                </p>
              ) : (
                importe !== "" && (
                  <p className="text-xs text-destructive">
                    El importe se escribe con dígitos y hasta dos decimales, y tiene que ser mayor
                    que cero.
                  </p>
                )
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Parte III · Declaración y transferencia de custodia</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Quien cobra declara entregar de forma física, voluntaria y completa el importe
              señalado, correspondiente íntegramente al servicio descrito. El Custodio Financiero
              declara recibirlo a su entera satisfacción y, a partir de la firma de este recibo,
              asume de manera exclusiva la custodia y responsabilidad sobre el efectivo, quedando
              quien lo entregó liberado de responsabilidad por cualquier extravío posterior.
            </p>
            <p className="text-xs">
              Fundamento: Código Civil Federal — depósito (Arts. 2516 y ss.); Código Penal Federal —
              abuso de confianza (Arts. 382–383); Ley Federal del Trabajo — falta de probidad como
              causa de rescisión sin responsabilidad para el patrón (Art. 47, fracc. II).
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="lg:sticky lg:top-6 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle>Resumen</CardTitle>
            <CardDescription>Orden {ordenServicio || "sin capturar"}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Importe</span>
              <span className="font-medium">
                {importeEnCasillas(importeValido ? importe : "0").texto}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cobró</span>
              <span className="font-medium">{cobrador?.nombre ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Forma de pago</span>
              <span className="font-medium">{forma?.etiqueta ?? "—"}</span>
            </div>

            {/* Regla 1 dicha antes de guardar: capturar el recibo no mueve la
                custodia. Mientras el custodio no firme, el dinero sigue siendo
                responsabilidad de quien lo cobró, y así se leerá en la ficha. */}
            <Alert>
              <AlertTitle>Guardar no confirma la custodia</AlertTitle>
              <AlertDescription>
                El folio nacerá con la etiqueta “{etiquetaCustodia(false)}”. La custodia se
                transfiere cuando el Custodio Financiero firma con su PIN desde la ficha del
                documento, no al guardar esta pantalla.
              </AlertDescription>
            </Alert>

            <div className="space-y-1 border-t pt-3">
              <p className="text-xs text-muted-foreground">Firmas que pedirá este formato</p>
              <div className="flex flex-wrap gap-1">
                <Badge variant="outline">Entregó — Asesor / Cajero</Badge>
                <Badge variant="outline">Recibió — Custodio Financiero</Badge>
                <Badge variant="outline">Testigo (opcional)</Badge>
              </div>
            </div>

            <Button className="w-full" disabled={guardando || !listo} onClick={guardar}>
              {guardando ? "Guardando…" : "Emitir folio y guardar"}
            </Button>
            <p className="text-xs text-muted-foreground">
              El folio consecutivo lo entrega la base al guardar, no esta pantalla. Después podrás
              enviarlo a firma.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
