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
import { PinInput } from "@/components/ui/pin-input";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { patchJson, postJson } from "@/lib/cliente-api";
import type { Empleado, Sucursal } from "@/lib/finanzas/tipos";

export type UsuarioEnlazable = { id: number; nombre: string; email: string };

/**
 * Mismo patrón que `esquemaClaveSucursal` y que el CHECK de la columna. Se
 * repite aquí para poder decirlo mientras se teclea, nunca para decidir en su
 * lugar: quien acepta o rechaza la clave sigue siendo la base.
 */
const PATRON_CLAVE = /^[A-Z0-9]{2,8}$/;

/**
 * Seis dígitos, aunque la regla admite hasta doce: el cuadro con el que se
 * firma un documento verifica seis casillas, así que un PIN más largo quedaría
 * establecido y sería imposible de teclear a la hora de firmar.
 */
const LONGITUD_PIN = 6;

/** Radix no admite un SelectItem con valor vacío; "sin usuario" necesita uno. */
const SIN_USUARIO = "ninguno";

const TODAS = "todas";

export function AdministrarCatalogos({
  sucursales,
  empleados,
  usuarios,
  tienePin,
  esAdministrador,
  miNombre,
}: {
  sucursales: Sucursal[];
  empleados: Empleado[];
  usuarios: UsuarioEnlazable[];
  tienePin: boolean;
  esAdministrador: boolean;
  miNombre: string;
}) {
  return (
    // Quien no administra entra directo a lo único que sí es suyo: su PIN.
    <Tabs defaultValue={esAdministrador ? "sucursales" : "pin"}>
      <TabsList>
        <TabsTrigger value="sucursales">Sucursales</TabsTrigger>
        <TabsTrigger value="empleados">Personal</TabsTrigger>
        <TabsTrigger value="pin">Mi PIN de firma</TabsTrigger>
      </TabsList>

      <TabsContent value="sucursales">
        <PanelSucursales sucursales={sucursales} esAdministrador={esAdministrador} />
      </TabsContent>

      <TabsContent value="empleados">
        <PanelEmpleados
          sucursales={sucursales}
          empleados={empleados}
          usuarios={usuarios}
          esAdministrador={esAdministrador}
        />
      </TabsContent>

      <TabsContent value="pin">
        <PanelPin tienePin={tienePin} miNombre={miNombre} />
      </TabsContent>
    </Tabs>
  );
}

// ===== SUCURSALES =====

function PanelSucursales({
  sucursales,
  esAdministrador,
}: {
  sucursales: Sucursal[];
  esAdministrador: boolean;
}) {
  const router = useRouter();
  const [clave, setClave] = useState("");
  const [nombre, setNombre] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);

  const claveValida = PATRON_CLAVE.test(clave);
  const claveRepetida = sucursales.some((s) => s.clave === clave);
  const nombreValido = nombre.trim().length >= 3;

  async function darDeAlta() {
    setOcupado("alta");
    try {
      const creada = await postJson<Sucursal>("/api/finanzas/catalogos/sucursales", {
        clave,
        nombre: nombre.trim(),
      });
      if (!creada) return;
      toast.success(`Sucursal ${creada.clave} dada de alta`);
      setClave("");
      setNombre("");
      router.refresh();
    } finally {
      setOcupado(null);
    }
  }

  async function cambiarEstado(sucursal: Sucursal) {
    setOcupado(String(sucursal.id));
    try {
      const actualizada = await patchJson<Sucursal>("/api/finanzas/catalogos/sucursales", {
        id: sucursal.id,
        activa: !sucursal.activa,
      });
      if (!actualizada) return;
      toast.success(
        actualizada.activa
          ? `${actualizada.clave} vuelve a admitir folios`
          : `${actualizada.clave} ya no admite folios nuevos`,
      );
      router.refresh();
    } finally {
      setOcupado(null);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Sucursales</CardTitle>
          <CardDescription>
            El consecutivo de cada formato corre por sucursal y por tipo, así que sin al menos una
            no puede emitirse ningún documento.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sucursales.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavía no hay ninguna sucursal dada de alta.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Clave</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Estado</TableHead>
                  {esAdministrador && <TableHead className="text-right">Acciones</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sucursales.map((s) => (
                  <TableRow key={s.id} className={s.activa ? undefined : "opacity-60"}>
                    <TableCell className="font-mono font-medium">{s.clave}</TableCell>
                    <TableCell>{s.nombre}</TableCell>
                    <TableCell>
                      <Badge variant={s.activa ? "secondary" : "outline"}>
                        {s.activa ? "Opera" : "Dada de baja"}
                      </Badge>
                    </TableCell>
                    {esAdministrador && (
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={ocupado !== null}
                          onClick={() => cambiarEstado(s)}
                        >
                          {s.activa ? "Dar de baja" : "Reactivar"}
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {esAdministrador ? (
        <Card>
          <CardHeader>
            <CardTitle>Dar de alta una sucursal</CardTitle>
            <CardDescription>
              La clave se escribe dentro del folio (CACM-RCI-01-MTY-0001) y queda impresa en todo
              lo que se emita, así que no se puede cambiar después: hacerlo reescribiría la cita de
              documentos que ya circulan en papel. Elígela pensando en cómo se leerá dentro de dos
              años.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
              <div className="space-y-1.5">
                <Label htmlFor="clave">Clave *</Label>
                <Input
                  id="clave"
                  value={clave}
                  // Se sube a mayúscula al teclear porque así se guardará: ver
                  // "mty" en la casilla y "MTY" en el folio confunde.
                  onChange={(e) => setClave(e.target.value.toUpperCase().slice(0, 8))}
                  className="font-mono uppercase"
                  placeholder="MTY"
                  aria-invalid={clave !== "" && (!claveValida || claveRepetida)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nombre-sucursal">Nombre *</Label>
                <Input
                  id="nombre-sucursal"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Monterrey Centro"
                />
              </div>
            </div>

            {clave !== "" && !claveValida && (
              <p className="text-xs text-destructive">
                La clave son de 2 a 8 letras mayúsculas o dígitos, sin espacios ni guiones.
              </p>
            )}
            {claveRepetida && (
              <p className="text-xs text-destructive">
                Ya existe una sucursal con esa clave. Dos series de folios no pueden llamarse igual.
              </p>
            )}

            <Button
              disabled={ocupado !== null || !claveValida || claveRepetida || !nombreValido}
              onClick={darDeAlta}
            >
              {ocupado === "alta" ? "Dando de alta…" : "Dar de alta"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Alert>
          <AlertTitle>Alta reservada a la administración del sistema</AlertTitle>
          <AlertDescription>
            Abrir o cerrar una sucursal abre y cierra una serie de folios. Solicítalo a un
            administrador global (N3).
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

// ===== PERSONAL =====

function PanelEmpleados({
  sucursales,
  empleados,
  usuarios,
  esAdministrador,
}: {
  sucursales: Sucursal[];
  empleados: Empleado[];
  usuarios: UsuarioEnlazable[];
  esAdministrador: boolean;
}) {
  const router = useRouter();
  const activas = useMemo(() => sucursales.filter((s) => s.activa), [sucursales]);

  const [filtro, setFiltro] = useState<string>(TODAS);
  const [numEmpleado, setNumEmpleado] = useState("");
  const [nombre, setNombre] = useState("");
  const [puesto, setPuesto] = useState("");
  const [sucursalId, setSucursalId] = useState<string>(String(activas[0]?.id ?? ""));
  const [usuarioId, setUsuarioId] = useState<string>(SIN_USUARIO);
  const [guardando, setGuardando] = useState(false);

  const porSucursal = useMemo(
    () => new Map(sucursales.map((s) => [s.id, s])),
    [sucursales],
  );

  const visibles = useMemo(
    () => (filtro === TODAS ? empleados : empleados.filter((e) => String(e.sucursalId) === filtro)),
    [empleados, filtro],
  );

  /**
   * La base declara `usuario_id` UNIQUE: un usuario no puede colgar de dos
   * fichas. Ofrecer los ya enlazados sólo llevaría a un choque al guardar.
   */
  const enlazables = useMemo(() => {
    const tomados = new Set(empleados.map((e) => e.usuarioId).filter((id) => id !== null));
    return usuarios.filter((u) => !tomados.has(u.id));
  }, [empleados, usuarios]);

  const numeroRepetido = empleados.some(
    (e) =>
      String(e.sucursalId) === sucursalId &&
      e.numEmpleado.trim().toUpperCase() === numEmpleado.trim().toUpperCase(),
  );

  const listoParaGuardar =
    numEmpleado.trim() !== "" && nombre.trim().length >= 3 && sucursalId !== "" && !numeroRepetido;

  async function darDeAlta() {
    setGuardando(true);
    try {
      const creado = await postJson<Empleado>("/api/finanzas/catalogos/empleados", {
        numEmpleado: numEmpleado.trim(),
        nombre: nombre.trim(),
        puesto: puesto.trim() || null,
        sucursalId: Number(sucursalId),
        usuarioId: usuarioId === SIN_USUARIO ? null : Number(usuarioId),
      });
      if (!creado) return;
      toast.success(`${creado.nombre} dado de alta`);
      setNumEmpleado("");
      setNombre("");
      setPuesto("");
      setUsuarioId(SIN_USUARIO);
      router.refresh();
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Personal</CardTitle>
          <CardDescription>
            Quien aparece como vendedor en un RCI-01 o como trabajador en un recibo de nómina sale
            de aquí.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-xs space-y-1.5">
            <Label htmlFor="filtro-sucursal">Ver sucursal</Label>
            <Select value={filtro} onValueChange={setFiltro}>
              <SelectTrigger id="filtro-sucursal" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODAS}>Todas las sucursales</SelectItem>
                {sucursales.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.clave} · {s.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {visibles.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay personal dado de alta en esa sucursal.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>No.</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Puesto</TableHead>
                  <TableHead>Sucursal</TableHead>
                  <TableHead>Usuario del sistema</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibles.map((e) => {
                  const sucursal = porSucursal.get(e.sucursalId);
                  const usuario = usuarios.find((u) => u.id === e.usuarioId);
                  return (
                    <TableRow key={e.id} className={e.activo ? undefined : "opacity-60"}>
                      <TableCell className="font-mono">{e.numEmpleado}</TableCell>
                      <TableCell className="font-medium">{e.nombre}</TableCell>
                      <TableCell className="text-muted-foreground">{e.puesto ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {sucursal ? sucursal.clave : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {e.usuarioId === null ? "Sin cuenta" : (usuario?.email ?? "Enlazado")}
                      </TableCell>
                      <TableCell>
                        <Badge variant={e.activo ? "secondary" : "outline"}>
                          {e.activo ? "Activo" : "Baja"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {!esAdministrador ? (
        <Alert>
          <AlertTitle>Alta reservada a la administración del sistema</AlertTitle>
          <AlertDescription>
            El personal se da de alta desde la administración global (N3), porque de esta lista
            dependen los nombres impresos en los recibos.
          </AlertDescription>
        </Alert>
      ) : activas.length === 0 ? (
        <Alert>
          <AlertTitle>Primero hace falta una sucursal</AlertTitle>
          <AlertDescription>
            Cada ficha de personal pertenece a una sucursal. Da de alta al menos una en la pestaña
            anterior.
          </AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Dar de alta personal</CardTitle>
            <CardDescription>
              El usuario del sistema es opcional y casi siempre sobra: el trabajador que cobra un
              recibo de nómina no tiene por qué operar la aplicación. Sólo se enlaza cuando la
              misma persona además entra al sistema, para que quien firma con su PIN y quien
              aparece impreso sean reconociblemente el mismo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="num-empleado">Número de empleado *</Label>
                <Input
                  id="num-empleado"
                  value={numEmpleado}
                  onChange={(e) => setNumEmpleado(e.target.value.slice(0, 20))}
                  className="font-mono"
                  placeholder="0142"
                  aria-invalid={numeroRepetido}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="nombre-empleado">Nombre completo *</Label>
                <Input
                  id="nombre-empleado"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Como aparece en su identificación"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="puesto">Puesto</Label>
                <Input
                  id="puesto"
                  value={puesto}
                  onChange={(e) => setPuesto(e.target.value)}
                  placeholder="Vendedor"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sucursal-empleado">Sucursal *</Label>
                <Select value={sucursalId} onValueChange={setSucursalId}>
                  <SelectTrigger id="sucursal-empleado" className="w-full">
                    <SelectValue placeholder="Elige una sucursal" />
                  </SelectTrigger>
                  <SelectContent>
                    {activas.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.clave} · {s.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="usuario-empleado">Usuario del sistema (opcional)</Label>
                <Select value={usuarioId} onValueChange={setUsuarioId}>
                  <SelectTrigger id="usuario-empleado" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SIN_USUARIO}>Sin usuario del sistema</SelectItem>
                    {enlazables.map((u) => (
                      <SelectItem key={u.id} value={String(u.id)}>
                        {u.nombre} · {u.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {numeroRepetido && (
              <p className="text-xs text-destructive">
                Esa sucursal ya tiene un empleado con ese número. El par sucursal + número es
                irrepetible.
              </p>
            )}

            <Button disabled={guardando || !listoParaGuardar} onClick={darDeAlta}>
              {guardando ? "Dando de alta…" : "Dar de alta"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ===== PIN DE FIRMA =====

function PanelPin({ tienePin, miNombre }: { tienePin: boolean; miNombre: string }) {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [guardando, setGuardando] = useState(false);

  const completo = pin.length === LONGITUD_PIN;
  const confirmacionCompleta = confirmacion.length === LONGITUD_PIN;
  // Se compara ANTES de enviar: un PIN mal tecleado dos veces distintas no
  // tiene por qué llegar al servidor, y el error se explica aquí sin que el
  // valor salga de esta pantalla.
  const coinciden = completo && pin === confirmacion;

  async function guardar() {
    setGuardando(true);
    try {
      const respuesta = await postJson<{ establecido: boolean }>(
        "/api/finanzas/catalogos/pin",
        { pin },
      );
      // Se limpian las dos casillas pase lo que pase: el PIN sólo debe vivir en
      // este estado los segundos que dura el envío.
      setPin("");
      setConfirmacion("");
      if (!respuesta) return;
      toast.success(tienePin ? "Tu PIN de firma quedó cambiado" : "Tu PIN de firma quedó listo");
      router.refresh();
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Mi PIN de firma
            <Badge variant={tienePin ? "secondary" : "destructive"}>
              {tienePin ? "Establecido" : "Sin establecer"}
            </Badge>
          </CardTitle>
          <CardDescription>
            Es la rúbrica de {miNombre}: con él se firman los formatos y sin él ningún documento
            que te toque puede cerrarse. Sólo tú lo estableces y sólo el tuyo —ni un administrador
            puede ponerte uno—, y se guarda cifrado, así que nadie puede leerlo ni recuperarlo. Si
            se te olvida, se establece otro desde aquí.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!tienePin && (
            <Alert>
              <AlertTitle>Todavía no puedes firmar</AlertTitle>
              <AlertDescription>
                Establece tu PIN antes de capturar: quedarte a medias de una firma con el documento
                ya emitido obliga a cancelarlo.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-1.5">
            <Label>{tienePin ? "Nuevo PIN" : "PIN"} · {LONGITUD_PIN} dígitos</Label>
            <PinInput
              longitud={LONGITUD_PIN}
              valor={pin}
              onChange={setPin}
              disabled={guardando}
              aria-label="Nuevo PIN de firma"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Repítelo</Label>
            <PinInput
              longitud={LONGITUD_PIN}
              valor={confirmacion}
              onChange={setConfirmacion}
              disabled={guardando}
              aria-label="Confirmación del PIN de firma"
            />
            {confirmacionCompleta && !coinciden && (
              <p className="text-xs text-destructive">
                Los dos PIN no son iguales. Bórralos y captúralos de nuevo.
              </p>
            )}
          </div>

          <Button disabled={guardando || !coinciden} onClick={guardar}>
            {guardando ? "Guardando…" : tienePin ? "Cambiar mi PIN" : "Establecer mi PIN"}
          </Button>

          <p className="text-xs text-muted-foreground">
            Elige algo que no sea tu fecha de nacimiento ni una serie corrida. Firmar con el PIN de
            otra persona, aunque te lo preste, deja el documento a nombre de quien no estuvo ahí.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
