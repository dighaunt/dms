"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserPlusIcon, UsersIcon } from "lucide-react";

import { IconoSilk } from "@/components/iconos/silk";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { patchJson, postJson } from "@/lib/cliente-api";
import { importeEnCasillas } from "@/lib/finanzas/formato";

export type PersonaEnPantalla = {
  id: number;
  nombre: string;
  idTipo: string | null;
  idNumero: string | null;
  rfc: string | null;
  telefono: string | null;
  domicilio: string | null;
  categoria: string;
  notas: string | null;
  activa: boolean;
  
  vales: number;
  totalPagado: string;
  ultimoPago: string | null;
};

const CATEGORIAS = [
  { valor: "PROVEEDOR", etiqueta: "Proveedor" },
  { valor: "EMPLEADO", etiqueta: "Empleado" },
  { valor: "SOCIO", etiqueta: "Socio" },
  { valor: "CLIENTE", etiqueta: "Cliente" },
  { valor: "OTRO", etiqueta: "Otro" },
] as const;

const TODAS = "todas";

const PATRON_RFC = /^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/;
const PATRON_TELEFONO = /^[0-9]{10}$/;

type Formulario = {
  nombre: string;
  idTipo: string;
  idNumero: string;
  rfc: string;
  telefono: string;
  domicilio: string;
  categoria: string;
  notas: string;
};

const FORMULARIO_VACIO: Formulario = {
  nombre: "",
  idTipo: "",
  idNumero: "",
  rfc: "",
  telefono: "",
  domicilio: "",
  categoria: "PROVEEDOR",
  notas: "",
};

function etiquetaCategoria(valor: string): string {
  return CATEGORIAS.find((c) => c.valor === valor)?.etiqueta ?? valor;
}

function opcional(valor: string): string | null {
  const limpio = valor.trim();
  return limpio === "" ? null : limpio;
}

function problemasDe(datos: Formulario): string[] {
  const problemas: string[] = [];
  if (datos.nombre.trim().length < 3) problemas.push("El nombre necesita al menos 3 caracteres.");

  const tipo = datos.idTipo.trim();
  const numero = datos.idNumero.trim();
  if ((tipo === "") !== (numero === "")) {
    problemas.push(
      "La identificación va completa o no va: una credencial sin número, o un número sin decir de qué credencial es, no identifica a nadie.",
    );
  }
  if (tipo !== "" && (tipo.length < 2 || tipo.length > 40)) {
    problemas.push("El tipo de identificación se escribe con entre 2 y 40 caracteres.");
  }
  if (numero !== "" && (numero.length < 3 || numero.length > 60)) {
    problemas.push("El número de identificación se escribe con entre 3 y 60 caracteres.");
  }
  if (datos.rfc.trim() !== "" && !PATRON_RFC.test(datos.rfc.trim().toUpperCase())) {
    problemas.push("El RFC no tiene la forma que exige el SAT (13 posiciones para persona física, 12 para moral).");
  }
  if (datos.telefono.trim() !== "" && !PATRON_TELEFONO.test(datos.telefono.trim())) {
    problemas.push("El teléfono son 10 dígitos, sin espacios ni guiones.");
  }
  return problemas;
}

function cuerpoDe(datos: Formulario) {
  return {
    nombre: datos.nombre.trim(),
    idTipo: opcional(datos.idTipo),
    idNumero: opcional(datos.idNumero),
    rfc: datos.rfc.trim() === "" ? null : datos.rfc.trim().toUpperCase(),
    telefono: opcional(datos.telefono),
    domicilio: opcional(datos.domicilio),
    categoria: datos.categoria,
    notas: opcional(datos.notas),
  };
}

export function PanelPersonas({
  personas,
  puedeAdministrar,
}: {
  personas: PersonaEnPantalla[];
  puedeAdministrar: boolean;
}) {
  const router = useRouter();

  const [busqueda, setBusqueda] = useState("");
  const [categoria, setCategoria] = useState<string>(TODAS);
  const [verBajas, setVerBajas] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const [alta, setAlta] = useState<Formulario>(FORMULARIO_VACIO);
  const [editando, setEditando] = useState<PersonaEnPantalla | null>(null);
  const [edicion, setEdicion] = useState<Formulario>(FORMULARIO_VACIO);

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return personas.filter((persona) => {
      if (!verBajas && !persona.activa) return false;
      if (categoria !== TODAS && persona.categoria !== categoria) return false;
      if (texto === "") return true;
      return [persona.nombre, persona.idNumero, persona.rfc, persona.telefono]
        .filter((valor): valor is string => typeof valor === "string")
        .some((valor) => valor.toLowerCase().includes(texto));
    });
  }, [personas, busqueda, categoria, verBajas]);

  const problemasAlta = problemasDe(alta);
  const problemasEdicion = problemasDe(edicion);

  async function darDeAlta() {
    setOcupado("alta");
    try {
      const creada = await postJson<{ id: number; nombre: string }>(
        "/api/finanzas/catalogos/personas",
        cuerpoDe(alta),
      );
      if (!creada) return;
      toast.success(`${creada.nombre} quedó en el catálogo`);
      setAlta(FORMULARIO_VACIO);
      router.refresh();
    } finally {
      setOcupado(null);
    }
  }

  async function guardarEdicion() {
    if (!editando) return;
    setOcupado(`editar-${editando.id}`);
    try {
      const actualizada = await patchJson<{ nombre: string }>(
        `/api/finanzas/catalogos/personas/${editando.id}`,
        cuerpoDe(edicion),
      );
      if (!actualizada) return;
      toast.success(`${actualizada.nombre} quedó corregida`);
      setEditando(null);
      router.refresh();
    } finally {
      setOcupado(null);
    }
  }

  async function cambiarEstado(persona: PersonaEnPantalla) {
    setOcupado(String(persona.id));
    try {
      const actualizada = await patchJson<{ activa: boolean }>(
        `/api/finanzas/catalogos/personas/${persona.id}`,
        { activa: !persona.activa },
      );
      if (!actualizada) return;
      toast.success(
        actualizada.activa
          ? `${persona.nombre} vuelve a ofrecerse al capturar`
          : `${persona.nombre} deja de ofrecerse al capturar; sus vales siguen igual`,
      );
      router.refresh();
    } finally {
      setOcupado(null);
    }
  }

  function abrirEdicion(persona: PersonaEnPantalla) {
    setEditando(persona);
    setEdicion({
      nombre: persona.nombre,
      idTipo: persona.idTipo ?? "",
      idNumero: persona.idNumero ?? "",
      rfc: persona.rfc ?? "",
      telefono: persona.telefono ?? "",
      domicilio: persona.domicilio ?? "",
      categoria: persona.categoria,
      notas: persona.notas ?? "",
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            <UsersIcon className="size-4 shrink-0" />
            Personas
            <Badge variant="outline">{visibles.length}</Badge>
          </CardTitle>
          <CardDescription>
            Lo pagado a cada quien cuenta sólo los vales FIRMADOS: son los únicos que movieron
            dinero, y sólo los que citan esta ficha. Un pago capturado como texto libre no se le
            suma a nadie, y eso es exactamente lo que este catálogo existe para evitar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="buscar-persona">Buscar</Label>
              <Input
                id="buscar-persona"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Nombre, identificación, RFC o teléfono"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="filtro-categoria">Categoría</Label>
              <Select value={categoria} onValueChange={setCategoria}>
                <SelectTrigger id="filtro-categoria" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODAS}>Todas</SelectItem>
                  {CATEGORIAS.map((c) => (
                    <SelectItem key={c.valor} value={c.valor}>
                      {c.etiqueta}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button variant="outline" onClick={() => setVerBajas((previo) => !previo)}>
              {verBajas ? "Ocultar las dadas de baja" : "Ver también las dadas de baja"}
            </Button>
          </div>

          {visibles.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {personas.length === 0
                ? "El catálogo está vacío. Mientras tanto, en el vale de egreso el nombre se escribe libremente: nada se detiene por esto."
                : "Nadie coincide con lo que buscas."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Nombre</TableHead>
                    <TableHead>Identificación</TableHead>
                    <TableHead>Contacto</TableHead>
                    <TableHead className="text-right">Pagado</TableHead>
                    <TableHead>Estado</TableHead>
                    {puedeAdministrar && <TableHead className="text-right">Acciones</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibles.map((persona) => (
                    <TableRow key={persona.id} className={persona.activa ? undefined : "opacity-60"}>
                      <TableCell>
                        <span className="font-medium">{persona.nombre}</span>
                        <span className="block text-xs text-muted-foreground">
                          {etiquetaCategoria(persona.categoria)}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {persona.idTipo && persona.idNumero ? (
                          <>
                            {persona.idTipo}
                            <span className="block font-mono text-xs">{persona.idNumero}</span>
                          </>
                        ) : (

                          "Sin registrar"
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {persona.telefono ?? "—"}
                        {persona.rfc && (
                          <span className="block font-mono text-xs">{persona.rfc}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="font-mono tabular-nums">
                          {importeEnCasillas(persona.totalPagado).texto}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {persona.vales === 0
                            ? "sin vales firmados"
                            : `${persona.vales} vale${persona.vales === 1 ? "" : "s"}${
                                persona.ultimoPago
                                  ? ` · último ${new Date(persona.ultimoPago).toLocaleDateString("es-MX")}`
                                  : ""
                              }`}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={persona.activa ? "secondary" : "outline"}>
                          {persona.activa ? "Activa" : "Baja"}
                        </Badge>
                      </TableCell>
                      {puedeAdministrar && (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={ocupado !== null}
                              onClick={() => abrirEdicion(persona)}
                            >
                              Editar
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={ocupado !== null}
                              onClick={() => cambiarEstado(persona)}
                            >
                              {persona.activa ? "Dar de baja" : "Reactivar"}
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {personas.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Dar de baja a alguien no borra ni oculta nada: sus vales siguen citándolo y lo pagado
              se sigue sumando. Lo único que cambia es que deja de ofrecerse al capturar.
            </p>
          )}
        </CardContent>
      </Card>

      {puedeAdministrar ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlusIcon className="size-4 shrink-0" />
              Dar de alta a una persona
            </CardTitle>
            <CardDescription>
              Vale la pena para quien cobra más de una vez. La identificación puede quedar pendiente
              —se completa después—, pero sin ella el vale de egreso la pedirá de todas formas: no
              se puede pagar a alguien sin identificarlo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <CamposPersona datos={alta} onCambio={setAlta} prefijo="alta" />

            {alta.nombre !== "" && problemasAlta.length > 0 && (
              <ul className="space-y-1 text-xs text-destructive">
                {problemasAlta.map((problema) => (
                  <li key={problema}>{problema}</li>
                ))}
              </ul>
            )}

            <Button disabled={ocupado !== null || problemasAlta.length > 0} onClick={darDeAlta}>
              <UserPlusIcon className="size-4 shrink-0" />
              {ocupado === "alta" ? "Dando de alta…" : "Dar de alta"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Alert>
          <IconoSilk nombre="candado" />
          <AlertTitle>Alta reservada a la administración del sistema</AlertTitle>
          <AlertDescription>
            De estos nombres depende a quién se le suma cada pago, así que darlos de alta o
            corregirlos lo hace un administrador global (N3), igual que con sucursales y personal.
            Capturar un vale no depende de esto: el nombre de quien recibe se puede escribir
            libremente y el egreso queda igual de válido.
          </AlertDescription>
        </Alert>
      )}

      <Dialog
        open={editando !== null}
        onOpenChange={(abierto) => {
          if (!abierto && ocupado === null) setEditando(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IconoSilk nombre="editar" className="shrink-0" />
              Corregir la ficha de {editando?.nombre}
            </DialogTitle>
            <DialogDescription>
              Corregir la ficha NO reescribe lo ya firmado: cada vale guarda el nombre y la
              identificación como texto, tal como se capturaron el día del pago. Aquí sólo cambia lo
              que se ofrecerá la próxima vez.
            </DialogDescription>
          </DialogHeader>

          <CamposPersona datos={edicion} onCambio={setEdicion} prefijo="editar" />

          {problemasEdicion.length > 0 && (
            <ul className="space-y-1 text-xs text-destructive">
              {problemasEdicion.map((problema) => (
                <li key={problema}>{problema}</li>
              ))}
            </ul>
          )}

          <DialogFooter>
            <Button variant="outline" disabled={ocupado !== null} onClick={() => setEditando(null)}>
              Cancelar
            </Button>
            <Button
              disabled={ocupado !== null || problemasEdicion.length > 0}
              onClick={guardarEdicion}
            >
              <IconoSilk nombre="guardar" className="shrink-0" />
              {ocupado?.startsWith("editar-") ? "Guardando…" : "Guardar los cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CamposPersona({
  datos,
  onCambio,
  prefijo,
}: {
  datos: Formulario;
  onCambio: (datos: Formulario) => void;
  prefijo: string;
}) {
  const cambiar = (cambio: Partial<Formulario>) => onCambio({ ...datos, ...cambio });

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor={`${prefijo}-nombre`}>Nombre o razón social *</Label>
        <Input
          id={`${prefijo}-nombre`}
          value={datos.nombre}
          onChange={(e) => cambiar({ nombre: e.target.value })}
          maxLength={200}
          placeholder="Como aparece en su identificación o en su factura"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${prefijo}-categoria`}>Categoría</Label>
        <Select value={datos.categoria} onValueChange={(valor) => cambiar({ categoria: valor })}>
          <SelectTrigger id={`${prefijo}-categoria`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIAS.map((c) => (
              <SelectItem key={c.valor} value={c.valor}>
                {c.etiqueta}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Sirve para filtrar al capturar. Marcar &laquo;Socio&raquo; aquí no da de alta a nadie como
          socio: eso se hace en el registro de socios, con su acta.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${prefijo}-telefono`}>Teléfono</Label>
        <Input
          id={`${prefijo}-telefono`}
          value={datos.telefono}
          onChange={(e) => cambiar({ telefono: e.target.value.replace(/\D/g, "").slice(0, 10) })}
          inputMode="numeric"
          className="font-mono"
          placeholder="10 dígitos"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${prefijo}-id-tipo`}>Identificación — tipo</Label>
        <Input
          id={`${prefijo}-id-tipo`}
          value={datos.idTipo}
          onChange={(e) => cambiar({ idTipo: e.target.value })}
          maxLength={40}
          placeholder="INE, pasaporte, cédula…"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${prefijo}-id-numero`}>Identificación — número</Label>
        <Input
          id={`${prefijo}-id-numero`}
          value={datos.idNumero}
          onChange={(e) => cambiar({ idNumero: e.target.value })}
          maxLength={60}
          className="font-mono"
        />
        <p className="text-xs text-muted-foreground">
          Una identificación oficial designa a una sola persona: la base no admite dos fichas con la
          misma, y así es como el catálogo no se llena de duplicados.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${prefijo}-rfc`}>RFC</Label>
        <Input
          id={`${prefijo}-rfc`}
          value={datos.rfc}
          onChange={(e) => cambiar({ rfc: e.target.value.toUpperCase().slice(0, 13) })}
          className="font-mono uppercase"
          placeholder="opcional"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${prefijo}-domicilio`}>Domicilio</Label>
        <Textarea
          id={`${prefijo}-domicilio`}
          value={datos.domicilio}
          onChange={(e) => cambiar({ domicilio: e.target.value })}
          rows={2}
          placeholder="opcional"
        />
      </div>

      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor={`${prefijo}-notas`}>Notas</Label>
        <Textarea
          id={`${prefijo}-notas`}
          value={datos.notas}
          onChange={(e) => cambiar({ notas: e.target.value })}
          rows={2}
          placeholder="Lo que haga falta saber al pagarle"
        />
      </div>
    </div>
  );
}
