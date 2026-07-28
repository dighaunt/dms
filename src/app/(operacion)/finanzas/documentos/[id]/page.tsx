import Link from "next/link";
import { notFound } from "next/navigation";

import { IconoSilk, type NombreIconoSilk } from "@/components/iconos/silk";
import { Badge } from "@/components/ui/badge";
import { BlurFade } from "@/components/ui/blur-fade";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { firmasDe, firmasPendientes, obtenerDocumento } from "@/lib/finanzas/documentos";
import { obtenerDenominaciones, obtenerReciboCaja } from "@/lib/finanzas/cobranza";
import { etiquetaCustodia, importeEnCasillas, vinEnCasillas } from "@/lib/finanzas/formato";
import { sellosDe } from "@/lib/finanzas/sellos";

import { AccionesDocumento } from "./acciones";

export const dynamic = "force-dynamic";

const COLOR_ESTADO: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  BORRADOR: "outline",
  PENDIENTE_DE_FIRMA: "secondary",
  FIRMADO: "default",
  CANCELADO: "destructive",
};

/**
 * El estado del folio dicho también con una figura, porque es lo primero que se
 * busca al abrir la pantalla: el candado del folio ya firmado —inalterable— y
 * la señal de alto del cancelado se reconocen antes de leer la palabra.
 *
 * Va junto a la etiqueta y no dentro: estos iconos traen su propio color y
 * sobre el fondo teñido de la etiqueta se perderían. Y va sin `titulo` porque
 * la etiqueta de al lado ya dice el estado con todas sus letras: repetirlo sería
 * decírselo dos veces a quien usa lector de pantalla.
 */
const ICONO_ESTADO: Record<string, NombreIconoSilk> = {
  BORRADOR: "nota",
  PENDIENTE_DE_FIRMA: "reloj",
  FIRMADO: "candado",
  CANCELADO: "alto",
};

export default async function DocumentoFinancieroPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();

  const documento = await obtenerDocumento(id);
  if (!documento) notFound();

  const [firmas, pendientes, sellos] = await Promise.all([
    firmasDe(id),
    firmasPendientes(id),
    sellosDe(id),
  ]);

  // Todas las firmas de un folio deben haber firmado el MISMO contenido. El
  // disparador `firma_exige_mismo_contenido` (migración 039) impide que se
  // produzca una discrepancia nueva, pero un folio firmado antes de ese
  // candado —o restaurado de un respaldo viejo— sí puede traerla, y entonces
  // hay un documento consentido en dos versiones distintas. Eso no se detecta
  // solo: hay que enseñarlo.
  const huellas = new Set(firmas.map((f) => f.hashContenido));
  const firmasDiscrepantes = huellas.size > 1;

  const esRecibo = documento.tipoCodigo === "CACM-RCI-01";
  const recibo = esRecibo ? await obtenerReciboCaja(id) : null;
  const arqueo = esRecibo ? await obtenerDenominaciones(id) : null;
  const custodiaConfirmada = firmas.some((f) => f.rol === "RECIBIO_CUSTODIO");

  return (
    <div className="space-y-6">
      <BlurFade delay={0.05}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-1.5 font-mono text-sm text-muted-foreground">
              <IconoSilk nombre="documento" className="shrink-0" />
              {documento.folioCompleto}
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">{documento.nombreTipo}</h1>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <IconoSilk nombre="sucursal" className="shrink-0" />
              {documento.sucursalNombre} · emitido{" "}
              {new Date(documento.creadoEn).toLocaleString("es-MX")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {ICONO_ESTADO[documento.estado ?? "BORRADOR"] && (
              <IconoSilk
                nombre={ICONO_ESTADO[documento.estado ?? "BORRADOR"]}
                className="shrink-0"
              />
            )}
            <Badge variant={COLOR_ESTADO[documento.estado ?? "BORRADOR"]}>
              {documento.estado}
            </Badge>
          </div>
        </div>
      </BlurFade>

      {esRecibo && (
        <BlurFade delay={0.1}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <IconoSilk nombre="hoja" className="shrink-0" />
                Contenido
              </CardTitle>
              {/* Regla 1 hecha texto: mientras el custodio no firme, el dinero
                  no es de la empresa. */}
              <CardDescription>{etiquetaCustodia(custodiaConfirmada)}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
              {recibo ? (
                <>
                  <Dato titulo="Cliente" valor={recibo.clienteNombre} />
                  <Dato titulo="Concepto" valor={recibo.conceptoCodigo} />
                  <Dato
                    titulo="Importe"
                    valor={importeEnCasillas(recibo.importeTotal).texto}
                    detalle={importeEnCasillas(recibo.importeTotal).letra}
                  />
                  <Dato
                    titulo="Cobrado"
                    valor={new Date(recibo.fechaHoraCobro).toLocaleString("es-MX")}
                  />
                  {recibo.vin && (
                    <div className="sm:col-span-2">
                      <p className="text-xs text-muted-foreground">VIN</p>
                      <p className="font-mono text-xs">{vinEnCasillas(recibo.vin)}</p>
                    </div>
                  )}
                  {arqueo && arqueo.renglones.length > 0 && (
                    <div className="sm:col-span-2">
                      <p className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <IconoSilk nombre="monedas" className="shrink-0" />
                        Arqueo
                      </p>
                      <ul className="space-y-0.5 font-mono text-xs">
                        {arqueo.renglones.map((r) => (
                          <li key={r.denominacion}>
                            {importeEnCasillas(r.denominacion).texto} × {r.cantidad} ={" "}
                            {importeEnCasillas(r.subtotal).texto}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground sm:col-span-2">
                  El folio está emitido pero todavía no se ha capturado su contenido.
                </p>
              )}
            </CardContent>
          </Card>
        </BlurFade>
      )}

      {firmasDiscrepantes && (
        <BlurFade delay={0.12}>
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="flex items-start gap-2 text-destructive">
                <IconoSilk nombre="alerta" className="mt-0.5 shrink-0" />
                Las firmas de este folio no firmaron lo mismo
              </CardTitle>
              <CardDescription>
                Se registraron {huellas.size} huellas de contenido distintas. Significa que el
                documento cambió entre una firma y otra, así que al menos una de las personas
                consintió una versión que ya no es ésta. No lo corrijas encima: cancela el folio
                explicando el motivo y emite un complementario, que es lo que el manual manda para
                enmendar sin tachaduras.
              </CardDescription>
            </CardHeader>
          </Card>
        </BlurFade>
      )}

      <BlurFade delay={0.15}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {/* La pluma: firmar es el acto, no el papel. */}
              <IconoSilk nombre="editar" className="shrink-0" />
              Firmas
            </CardTitle>
            <CardDescription>
              Una sola persona no puede ocupar dos roles del mismo documento, y todas firman el
              mismo contenido: si cambia entre una firma y la siguiente, la segunda se rechaza.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {firmas.map((f) => (
              <div key={f.rol} className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{f.rolEtiqueta}</Badge>
                <span>{f.usuarioNombre ?? f.firmanteNombre}</span>
                {f.metodo === "AUTOGRAFA_PRESENCIAL" && (
                  <span className="text-xs text-muted-foreground">
                    presencial · atestiguó {f.atestiguadoPorNombre}
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  {new Date(f.firmadoEn).toLocaleString("es-MX")}
                </span>
              </div>
            ))}
            {pendientes.map((p) => (
              <div key={p.rol} className="flex items-center gap-2 text-muted-foreground">
                <Badge variant="outline">{p.etiqueta}</Badge>
                <span className="text-xs">
                  pendiente{p.obligatoria ? "" : " · opcional"}
                </span>
              </div>
            ))}
            {firmas.length === 0 && pendientes.length === 0 && (
              <p className="text-muted-foreground">Este formato no requiere firmas.</p>
            )}
          </CardContent>
        </Card>
      </BlurFade>

      {sellos.length > 0 && (
        <BlurFade delay={0.2}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <IconoSilk nombre="sello" className="shrink-0" />
                Sellos
              </CardTitle>
              <CardDescription>
                Cada cuño lleva su token verificable. No puede existir un sello sin la firma que lo
                justifica.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {sellos.map((s) => (
                <div key={s.token} className="flex flex-wrap items-center gap-2">
                  <Badge>{s.leyenda}</Badge>
                  <span className="font-mono text-xs">{s.token}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(s.estampadoEn).toLocaleString("es-MX")}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </BlurFade>
      )}

      <BlurFade delay={0.25}>
        <AccionesDocumento
          documentoId={id}
          estado={documento.estado ?? "BORRADOR"}
          pendientes={pendientes.map((p) => ({
            rol: p.rol,
            etiqueta: p.etiqueta,
            obligatoria: p.obligatoria,
            exigeUsuarioInterno: p.exigeUsuarioInterno,
          }))}
        />
      </BlurFade>

      <Link href="/finanzas" className="inline-block text-sm underline">
        Volver a Finanzas
      </Link>
    </div>
  );
}

function Dato({
  titulo,
  valor,
  detalle,
}: {
  titulo: string;
  valor: string;
  detalle?: string;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p className="font-medium">{valor}</p>
      {detalle && <p className="text-xs text-muted-foreground">{detalle}</p>}
    </div>
  );
}
