/**
 * Pruebas de integración de las reglas 3 y 4 del manual contra Postgres.
 *
 * Estas dos reglas son las que dan certeza financiera y ninguna de las dos
 * vive en TypeScript: la utilidad de consigna es una columna GENERATED y la
 * segregación de firmantes del vale es un índice único parcial más un puñado
 * de disparadores. Probarlas con dobles de prueba comprobaría que el doble
 * hace lo que le pedimos, no que la base impida lo que debe impedir; por eso
 * aquí se habla con una base real y se invocan las funciones plpgsql tal como
 * las invoca la capa de servicios.
 *
 * Aislamiento: cada caso abre su propia conexión, siembra DENTRO de una
 * transacción y termina en ROLLBACK. Es la única forma de que el consecutivo
 * de folios, la UNIQUE de la sucursal y el VIN de la unidad no hagan que una
 * prueba dependa de si otra corrió antes.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import pg from "pg";

import {
  estadoValeEgreso,
  EXIGE_USUARIO_INTERNO_VALE,
  FIRMANTES_VALE_EGRESO,
  utilidadConsigna,
} from "./calculos.ts";
import { centinelaDeBase, SIN_BASE, URL_PRUEBAS } from "./base-pruebas.mts";

// Sin base no hay nada que probar aquí, y callarlo dejaría `npm test` en verde
// con cero cobertura de las reglas 3, 4 y 6. El porqué del mecanismo está en la
// cabecera de `base-pruebas.mts`.
centinelaDeBase("la utilidad de consigna y el vale de egreso: reglas 3, 4 y 6 del manual");

// ===== Actores =====
// El PIN se fija aquí y no se deriva del id: un id de seis dígitos truncaría
// el lpad de la semilla y la prueba fallaría por una razón que nada tiene que
// ver con lo que dice probar.
const ACTORES = {
  gerente: { email: "gerente@t.mx", pin: "100001" },
  custodio: { email: "custodio@t.mx", pin: "100002" },
  vendedor: { email: "vendedor@t.mx", pin: "100003" },
  socio: { email: "socio@t.mx", pin: "100004" },
  rh: { email: "rh@t.mx", pin: "100005" },
} as const;

type Actor = keyof typeof ACTORES;

/**
 * Semilla mínima: usuarios, sucursal, empleados, unidades con su ficha
 * contractual completa (la exige la migración 022) y un expediente CONSIGNADA
 * y otro PROPIA. Va en línea y no como archivo suelto para que la suite corra
 * en cualquier clon del repo.
 */
const SEMILLA = `
INSERT INTO usuario (email, nombre, nivel) VALUES
 ('gerente@t.mx','Gerente Prueba','N3'),
 ('custodio@t.mx','Custodio Prueba','N2'),
 ('vendedor@t.mx','Vendedora Prueba','N1'),
 ('socio@t.mx','Socio Prueba','N3'),
 ('rh@t.mx','Recursos Humanos Prueba','N2')
ON CONFLICT (email) DO NOTHING;

INSERT INTO sucursal (clave, nombre, creada_por)
 VALUES ('MTY','Matriz Monterrey',(SELECT id FROM usuario WHERE email='gerente@t.mx'))
ON CONFLICT (clave) DO NOTHING;

INSERT INTO empleado (num_empleado, nombre, puesto, sucursal_id, usuario_id, creado_por) VALUES
 ('E-01','Vendedora Prueba','Vendedor',(SELECT id FROM sucursal WHERE clave='MTY'),
  (SELECT id FROM usuario WHERE email='vendedor@t.mx'),(SELECT id FROM usuario WHERE email='gerente@t.mx')),
 ('E-02','Asesor Servicio','Asesor de servicio',(SELECT id FROM sucursal WHERE clave='MTY'),
  NULL,(SELECT id FROM usuario WHERE email='gerente@t.mx'))
ON CONFLICT (sucursal_id, num_empleado) DO NOTHING;

-- Desde la migración 040 el retiro de utilidades no apunta a un usuario sino a
-- un socio, y un socio se registra sobre una PERSONA del catálogo. Sembrarlo
-- aquí es lo que permite que el vale de retiro exista: sin la fila de socio
-- el CHECK vale_retiro_socio_exige_socio y la llave foránea lo rechazarían.
-- La persona queda enlazada al usuario 'socio@t.mx' porque en esta suite ese
-- mismo actor firma, pero el enlace es opcional por diseño: un accionista rara
-- vez opera el DMS.
INSERT INTO persona (nombre, id_tipo, id_numero, categoria, usuario_id, creada_por)
SELECT 'Socio Prueba','INE','IDMX-SOCIO-UE1','SOCIO',
       (SELECT id FROM usuario WHERE email='socio@t.mx'),
       (SELECT id FROM usuario WHERE email='gerente@t.mx')
WHERE NOT EXISTS (
  SELECT 1 FROM persona WHERE upper(trim(id_tipo)) = 'INE' AND upper(trim(id_numero)) = 'IDMX-SOCIO-UE1'
);

-- La participación se deja en NULL a propósito: es opcional en el modelo y así
-- la semilla no consume parte del 100 por ciento que otras pruebas reparten.
INSERT INTO socio (persona_id, acta_referencia, creado_por)
SELECT p.id, 'ACTA-CONSTITUTIVA-2019-01', (SELECT id FROM usuario WHERE email='gerente@t.mx')
  FROM persona p
 WHERE upper(trim(p.id_tipo)) = 'INE' AND upper(trim(p.id_numero)) = 'IDMX-SOCIO-UE1'
   AND NOT EXISTS (SELECT 1 FROM socio s WHERE s.persona_id = p.id);

INSERT INTO marca (nombre) VALUES ('Nissan') ON CONFLICT (nombre) DO NOTHING;
INSERT INTO modelo (marca_id, nombre)
 VALUES ((SELECT id FROM marca WHERE nombre='Nissan'),'Versa')
ON CONFLICT (marca_id, nombre) DO NOTHING;

INSERT INTO unidad (vin, modelo_id, anio_modelo, color, num_motor, kilometraje_ingreso,
                    version_tipo, placas, entidad_emisora, numero_factura_vigente,
                    numero_constancia_repuve, numero_tarjeta_circulacion, refrendos_anio, creado_por)
VALUES ('1N4AL3AP8JC123456',(SELECT id FROM modelo WHERE nombre='Versa'),2020,'Blanco','MOT123456',45000,
        'Sense','ABC1234','Nuevo Leon','F-99887','REP-5566','TC-4433',2026,
        (SELECT id FROM usuario WHERE email='gerente@t.mx')),
       ('3N1AB7AP5KY987654',(SELECT id FROM modelo WHERE nombre='Versa'),2021,'Gris','MOT654321',30000,
        'Advance','XYZ9876','Nuevo Leon','F-11223','REP-7788','TC-9911',2026,
        (SELECT id FROM usuario WHERE email='gerente@t.mx'))
ON CONFLICT (vin) DO NOTHING;

SELECT abrir_expediente('1N4AL3AP8JC123456','CONSIGNADA',(SELECT id FROM usuario WHERE email='gerente@t.mx'));
SELECT abrir_expediente('3N1AB7AP5KY987654','PROPIA',(SELECT id FROM usuario WHERE email='gerente@t.mx'));
`;

/** Los identificadores son bigint y el driver los entrega como texto; se dejan así. */
type Escenario = {
  cx: pg.Client;
  usuarios: Record<Actor, string>;
  sucursalId: string;
  expedienteConsignada: string;
  expedientePropia: string;
  empleadoVendedor: string;
  /** Persona dada de alta como socio vigente: a ella se carga el retiro. */
  socioPersonaId: string;
};

async function conEscenario(cuerpo: (esc: Escenario) => Promise<void>): Promise<void> {
  const cx = new pg.Client({ connectionString: URL_PRUEBAS });
  await cx.connect();
  try {
    await cx.query("BEGIN");
    await cx.query("SET search_path TO traza, public");
    await cx.query(SEMILLA);

    const usuarios = {} as Record<Actor, string>;
    for (const [actor, datos] of Object.entries(ACTORES) as [Actor, (typeof ACTORES)[Actor]][]) {
      const { rows } = await cx.query<{ id: string }>("SELECT id FROM usuario WHERE email = $1", [
        datos.email,
      ]);
      usuarios[actor] = rows[0].id;
      await cx.query("SELECT establecer_pin_firma($1, $2)", [rows[0].id, datos.pin]);
    }

    const sucursal = await cx.query<{ id: string }>("SELECT id FROM sucursal WHERE clave = 'MTY'");
    const expedientes = await cx.query<{ id: string; origen: string }>(
      "SELECT id, origen FROM expediente ORDER BY id",
    );
    const empleado = await cx.query<{ id: string }>(
      "SELECT id FROM empleado WHERE num_empleado = 'E-01'",
    );
    const socio = await cx.query<{ persona_id: string }>(
      `SELECT s.persona_id FROM socio s
         JOIN persona p ON p.id = s.persona_id
        WHERE upper(trim(p.id_tipo)) = 'INE' AND upper(trim(p.id_numero)) = 'IDMX-SOCIO-UE1'`,
    );

    await cuerpo({
      cx,
      usuarios,
      sucursalId: sucursal.rows[0].id,
      expedienteConsignada: expedientes.rows.filter((e) => e.origen === "CONSIGNADA")[0].id,
      expedientePropia: expedientes.rows.filter((e) => e.origen === "PROPIA")[0].id,
      empleadoVendedor: empleado.rows[0].id,
      socioPersonaId: socio.rows[0].persona_id,
    });
  } finally {
    // ROLLBACK y nunca COMMIT: es lo que hace repetible una prueba que consume
    // folios consecutivos, VIN únicos y una sucursal con clave única.
    await cx.query("ROLLBACK").catch(() => undefined);
    await cx.end();
  }
}

type ErrorPostgres = Error & { code?: string; constraint?: string };

/**
 * Ejecuta algo que DEBE ser rechazado por la base.
 *
 * El SAVEPOINT no es adorno: en Postgres cualquier error aborta la transacción
 * completa, y sin él la prueba no podría seguir comprobando nada después del
 * primer rechazo.
 */
async function rechaza(
  esc: Escenario,
  accion: () => Promise<unknown>,
  esperado: { codigo?: string; mensaje?: RegExp; restriccion?: RegExp },
): Promise<void> {
  await esc.cx.query("SAVEPOINT antes_del_rechazo");
  let error: ErrorPostgres | null = null;
  try {
    await accion();
  } catch (e) {
    error = e as ErrorPostgres;
  }
  await esc.cx.query("ROLLBACK TO SAVEPOINT antes_del_rechazo");

  assert.ok(error, "se esperaba que la base rechazara la operación y la aceptó");
  if (esperado.codigo) {
    assert.equal(error.code, esperado.codigo, `mensaje recibido: ${error.message}`);
  }
  if (esperado.mensaje) assert.match(error.message, esperado.mensaje);
  if (esperado.restriccion) assert.match(error.constraint ?? "", esperado.restriccion);
}

// ===== Utilidades de armado =====

/**
 * El hash de contenido es la huella de lo que quien firma tuvo delante.
 *
 * Depende SÓLO del documento, nunca del rol ni de quién firma: dos personas
 * que firman el mismo folio firman lo mismo, o no están firmando lo mismo.
 * Desde la migración 039 eso no es una convención de la prueba sino un
 * candado —el disparador `firma_exige_mismo_contenido` rechaza la segunda
 * firma cuya huella no coincida con la de la primera—, y era el hueco que más
 * pesaba de la auditoría: el único punto donde se podía cambiar una cifra ya
 * consentida sin dejar rastro.
 *
 * Los sellos son otra cosa y su hash sí varía por acción: un sello acredita un
 * hecho del expediente, no el consentimiento de una persona.
 */
function hashDe(...partes: string[]): string {
  return createHash("sha256").update(partes.join("|")).digest("hex");
}

async function emitirFolio(esc: Escenario, tipo: string, usuarioId: string): Promise<string> {
  const { rows } = await esc.cx.query<{ id: string }>(
    "SELECT id FROM emitir_folio_financiero($1, $2, $3)",
    [tipo, esc.sucursalId, usuarioId],
  );
  return rows[0].id;
}

async function mandarAFirma(esc: Escenario, documentoId: string, actor: Actor): Promise<void> {
  await esc.cx.query("SELECT cambiar_estado_documento_fin($1, 'PENDIENTE_DE_FIRMA', $2)", [
    documentoId,
    esc.usuarios[actor],
  ]);
}

async function firmarInterno(
  esc: Escenario,
  documentoId: string,
  rol: string,
  actor: Actor,
): Promise<string> {
  const { rows } = await esc.cx.query<{ estado: string }>(
    "SELECT firmar_documento_financiero($1, $2, $3, $4, $5, $6) AS estado",
    [documentoId, rol, esc.usuarios[actor], ACTORES[actor].pin, hashDe(documentoId), "prueba"],
  );
  return rows[0].estado;
}

async function firmarPresencial(
  esc: Escenario,
  documentoId: string,
  rol: string,
  nombre: string,
  atestigua: Actor,
): Promise<string> {
  const { rows } = await esc.cx.query<{ estado: string }>(
    `SELECT firmar_documento_externo($1, $2, $3, 'INE', 'IDMX0099887', $4, $5, $6, NULL, 'prueba') AS estado`,
    [documentoId, rol, nombre, esc.usuarios[atestigua], ACTORES[atestigua].pin, hashDe(documentoId)],
  );
  return rows[0].estado;
}

async function estadoDe(esc: Escenario, documentoId: string): Promise<string> {
  const { rows } = await esc.cx.query<{ estado: string }>(
    "SELECT estado_documento_fin($1) AS estado",
    [documentoId],
  );
  return rows[0].estado;
}

const CONSIGNANTE = "Propietario Consignante";

/** RCI-02 de ingreso de unidad, opcionalmente firmado por sus tres firmantes. */
async function ingresarUnidad(
  esc: Escenario,
  opciones: {
    expedienteId: string;
    tipoOperacion: "CONSIGNACION" | "COMPRA_DIRECTA";
    firmar: boolean;
  },
): Promise<string> {
  const documentoId = await emitirFolio(esc, "CACM-RCI-02", esc.usuarios.gerente);

  if (opciones.tipoOperacion === "CONSIGNACION") {
    await esc.cx.query(
      `INSERT INTO ingreso_vehiculo_rci02
         (documento_id, expediente_id, fecha_ingreso, propietario_nombre,
          propietario_id_tipo, propietario_id_numero, tipo_operacion,
          precio_minimo_venta, comision_pct)
       VALUES ($1, $2, current_date, $3, 'INE', 'IDMX0099887', 'CONSIGNACION', $4, $5)`,
      [documentoId, opciones.expedienteId, CONSIGNANTE, "180000.00", "10.00"],
    );
  } else {
    await esc.cx.query(
      `INSERT INTO ingreso_vehiculo_rci02
         (documento_id, expediente_id, fecha_ingreso, propietario_nombre,
          propietario_id_tipo, propietario_id_numero, tipo_operacion,
          precio_compra, compra_forma_pago, compra_fecha_pago)
       VALUES ($1, $2, current_date, 'Vendedor Particular', 'INE', 'IDMX0055443',
               'COMPRA_DIRECTA', $3, 'TRANSFERENCIA', current_date)`,
      [documentoId, opciones.expedienteId, "150000.00"],
    );
  }

  if (opciones.firmar) {
    await mandarAFirma(esc, documentoId, "gerente");
    await firmarPresencial(esc, documentoId, "ENTREGO_PROPIETARIO", CONSIGNANTE, "gerente");
    await firmarInterno(esc, documentoId, "RECIBIO_INVENTARIO", "custodio");
    const estado = await firmarInterno(esc, documentoId, "AUTORIZO_GERENTE", "gerente");
    assert.equal(estado, "FIRMADO", "el ingreso de la unidad debía quedar firmado");
  }

  return documentoId;
}

/** Alta de una unidad y su expediente adicionales, cuando un caso necesita dos. */
async function abrirExpedienteExtra(
  esc: Escenario,
  vin: string,
  origen: "CONSIGNADA" | "PROPIA",
): Promise<string> {
  await esc.cx.query(
    `INSERT INTO unidad (vin, modelo_id, anio_modelo, color, num_motor, kilometraje_ingreso,
                         version_tipo, placas, entidad_emisora, numero_factura_vigente,
                         numero_constancia_repuve, numero_tarjeta_circulacion, refrendos_anio, creado_por)
     VALUES ($1, (SELECT id FROM modelo WHERE nombre = 'Versa'), 2022, 'Negro', 'MOT777888', 22000,
             'Exclusive', 'JKL5544', 'Nuevo Leon', 'F-33445', 'REP-1122', 'TC-6677', 2026, $2)`,
    [vin, esc.usuarios.gerente],
  );
  const { rows } = await esc.cx.query<{ id: string }>(
    "SELECT id FROM abrir_expediente($1, $2, $3)",
    [vin, origen, esc.usuarios.gerente],
  );
  return rows[0].id;
}

async function insertarLiquidacion(
  esc: Escenario,
  documentoId: string,
  ingresoId: string,
  precioVenta: string,
  montoConsignante: string,
): Promise<void> {
  await esc.cx.query(
    `INSERT INTO liquidacion_consigna_rci03
       (documento_id, ingreso_rci02_id, consignante_nombre, precio_venta_final,
        monto_consignante, forma_ingreso_tesoreria)
     VALUES ($1, $2, $3, $4, $5, 'EFECTIVO')`,
    [documentoId, ingresoId, CONSIGNANTE, precioVenta, montoConsignante],
  );
}

async function leerLiquidacion(
  esc: Escenario,
  documentoId: string,
): Promise<{ gastos_total: string; utilidad_neta: string }> {
  const { rows } = await esc.cx.query<{ gastos_total: string; utilidad_neta: string }>(
    "SELECT gastos_total, utilidad_neta FROM liquidacion_consigna_rci03 WHERE documento_id = $1",
    [documentoId],
  );
  return rows[0];
}

async function insertarVale(
  esc: Escenario,
  documentoId: string,
  opciones: {
    concepto: string;
    importe: string;
    beneficiario?: string;
    reciboNominaId?: string | null;
    /** Persona registrada como socio; desde la 040 el vale ya no apunta a un usuario. */
    socioPersonaId?: string | null;
  },
): Promise<void> {
  await esc.cx.query(
    `INSERT INTO vale_egreso_rci05
       (documento_id, fecha_hora, concepto_codigo, beneficiario_nombre, beneficiario_id_tipo,
        beneficiario_id_numero, recibo_nomina_id, socio_persona_id, forma_pago, importe)
     VALUES ($1, now(), $2, $3, 'INE', 'IDMX7654321', $4, $5, 'EFECTIVO', $6)`,
    [
      documentoId,
      opciones.concepto,
      opciones.beneficiario ?? "Vendedora Prueba",
      opciones.reciboNominaId ?? null,
      opciones.socioPersonaId ?? null,
      opciones.importe,
    ],
  );
}

/** Vale de comisión listo para firmar: es el egreso más común del formato. */
async function valeParaFirmar(esc: Escenario, importe = "5000.00"): Promise<string> {
  const documentoId = await emitirFolio(esc, "CACM-RCI-05", esc.usuarios.custodio);
  await insertarVale(esc, documentoId, { concepto: "COMISION_VENDEDOR", importe });
  await mandarAFirma(esc, documentoId, "custodio");
  return documentoId;
}

// =====================================================================
// REGLA 3 — la utilidad de consigna la calcula el sistema, no el usuario
// =====================================================================

test(
  "regla 3: la utilidad neta sale de la resta del sistema sin que nadie la teclee",
  { skip: SIN_BASE },
  async () => {
    await conEscenario(async (esc) => {
      const ingresoId = await ingresarUnidad(esc, {
        expedienteId: esc.expedienteConsignada,
        tipoOperacion: "CONSIGNACION",
        firmar: true,
      });

      const liquidacionId = await emitirFolio(esc, "CACM-RCI-03", esc.usuarios.custodio);
      await insertarLiquidacion(esc, liquidacionId, ingresoId, "200000.00", "175000.00");

      const fila = await leerLiquidacion(esc, liquidacionId);
      assert.equal(fila.gastos_total, "0.00");
      assert.equal(fila.utilidad_neta, "25000.00");

      // El espejo de pantalla y la autoridad de la base tienen que coincidir:
      // si divergen, el usuario firma un número distinto al que se guarda.
      const espejo = utilidadConsigna({ precioVenta: "200000.00", montoConsignante: "175000.00" });
      assert.equal(espejo?.utilidadNeta, fila.utilidad_neta);
    });
  },
);

test(
  "regla 3: agregar y quitar gastos recalcula la utilidad por disparador",
  { skip: SIN_BASE },
  async () => {
    await conEscenario(async (esc) => {
      const ingresoId = await ingresarUnidad(esc, {
        expedienteId: esc.expedienteConsignada,
        tipoOperacion: "CONSIGNACION",
        firmar: true,
      });
      const liquidacionId = await emitirFolio(esc, "CACM-RCI-03", esc.usuarios.custodio);
      await insertarLiquidacion(esc, liquidacionId, ingresoId, "200000.00", "175000.00");

      const gastos = [
        { concepto: "Detallado y limpieza", importe: "3000.00" },
        { concepto: "Traslado a la agencia", importe: "2000.00" },
      ];
      for (const gasto of gastos) {
        await esc.cx.query(
          "INSERT INTO gasto_liquidacion_rci03 (documento_id, concepto, importe) VALUES ($1, $2, $3)",
          [liquidacionId, gasto.concepto, gasto.importe],
        );
      }

      const conGastos = await leerLiquidacion(esc, liquidacionId);
      assert.equal(conGastos.gastos_total, "5000.00");
      assert.equal(conGastos.utilidad_neta, "20000.00");
      assert.equal(
        utilidadConsigna({ precioVenta: "200000.00", montoConsignante: "175000.00", gastos })
          ?.utilidadNeta,
        conGastos.utilidad_neta,
      );

      // El disparador también tiene que mirar hacia atrás: borrar un gasto mal
      // capturado devuelve la utilidad a su valor anterior.
      await esc.cx.query(
        "DELETE FROM gasto_liquidacion_rci03 WHERE documento_id = $1 AND concepto = $2",
        [liquidacionId, "Traslado a la agencia"],
      );
      const sinTraslado = await leerLiquidacion(esc, liquidacionId);
      assert.equal(sinTraslado.gastos_total, "3000.00");
      assert.equal(sinTraslado.utilidad_neta, "22000.00");
    });
  },
);

test(
  "regla 3: la utilidad neta es columna GENERATED y no admite un UPDATE directo",
  { skip: SIN_BASE },
  async () => {
    await conEscenario(async (esc) => {
      const ingresoId = await ingresarUnidad(esc, {
        expedienteId: esc.expedienteConsignada,
        tipoOperacion: "CONSIGNACION",
        firmar: true,
      });
      const liquidacionId = await emitirFolio(esc, "CACM-RCI-03", esc.usuarios.custodio);
      await insertarLiquidacion(esc, liquidacionId, ingresoId, "200000.00", "175000.00");

      await rechaza(
        esc,
        () =>
          esc.cx.query(
            "UPDATE liquidacion_consigna_rci03 SET utilidad_neta = $1 WHERE documento_id = $2",
            ["999999.00", liquidacionId],
          ),
        { codigo: "428C9", mensaje: /utilidad_neta/ },
      );

      // Tampoco por la puerta de atrás: sin gastos_total el número no se mueve.
      assert.equal((await leerLiquidacion(esc, liquidacionId)).utilidad_neta, "25000.00");
    });
  },
);

test(
  "regla 3: un ajuste de utilidad con nota de auditoría corta se rechaza",
  { skip: SIN_BASE },
  async () => {
    await conEscenario(async (esc) => {
      const ingresoId = await ingresarUnidad(esc, {
        expedienteId: esc.expedienteConsignada,
        tipoOperacion: "CONSIGNACION",
        firmar: true,
      });
      const liquidacionId = await emitirFolio(esc, "CACM-RCI-03", esc.usuarios.custodio);
      await insertarLiquidacion(esc, liquidacionId, ingresoId, "200000.00", "175000.00");

      const insertarAjuste = (monto: string, nota: string) =>
        esc.cx.query(
          `INSERT INTO ajuste_utilidad_rci03 (documento_id, monto_ajuste, nota_auditoria, autorizado_por)
           VALUES ($1, $2, $3, $4)`,
          [liquidacionId, monto, nota, esc.usuarios.gerente],
        );

      await rechaza(esc, () => insertarAjuste("-500.00", "error de dedo"), {
        codigo: "23514",
        restriccion: /nota_auditoria/,
      });

      // Contraste: la misma corrección con su explicación completa sí entra, lo
      // que confirma que el rechazo fue por la nota y no por el ajuste en sí.
      await insertarAjuste(
        "-500.00",
        "Se descontó una refacción que el consignante pagó por su cuenta segun factura F-3321",
      );
      const { rows } = await esc.cx.query<{ total: string }>(
        "SELECT count(*)::text AS total FROM ajuste_utilidad_rci03 WHERE documento_id = $1",
        [liquidacionId],
      );
      assert.equal(rows[0].total, "1");
    });
  },
);

test(
  "regla 3: no se liquida como consigna una unidad que entró por compra directa",
  { skip: SIN_BASE },
  async () => {
    await conEscenario(async (esc) => {
      // El ingreso se firma a propósito: así el único motivo posible de rechazo
      // es el tipo de operación, no que faltaran firmas.
      const ingresoId = await ingresarUnidad(esc, {
        expedienteId: esc.expedientePropia,
        tipoOperacion: "COMPRA_DIRECTA",
        firmar: true,
      });
      assert.equal(await estadoDe(esc, ingresoId), "FIRMADO");

      const liquidacionId = await emitirFolio(esc, "CACM-RCI-03", esc.usuarios.custodio);
      await rechaza(
        esc,
        () => insertarLiquidacion(esc, liquidacionId, ingresoId, "200000.00", "175000.00"),
        { codigo: "P0001", mensaje: /compra directa/i },
      );
    });
  },
);

test(
  "regla 3: no se liquida contra un ingreso en consignación que aún no está firmado",
  { skip: SIN_BASE },
  async () => {
    await conEscenario(async (esc) => {
      // Segundo expediente CONSIGNADA: el de la semilla ya no sirve porque
      // ingreso_vehiculo_rci02 es único por expediente. Y tiene que ser
      // CONSIGNADA, no PROPIA: con una unidad propia chocaríamos primero con la
      // validación de tipo de operación y la prueba no probaría lo que dice.
      const expedienteId = await abrirExpedienteExtra(esc, "5N1AR2MN4EC456789", "CONSIGNADA");
      const ingresoId = await ingresarUnidad(esc, {
        expedienteId,
        tipoOperacion: "CONSIGNACION",
        firmar: false,
      });
      assert.equal(await estadoDe(esc, ingresoId), "BORRADOR");

      const liquidacionId = await emitirFolio(esc, "CACM-RCI-03", esc.usuarios.custodio);
      await rechaza(
        esc,
        () => insertarLiquidacion(esc, liquidacionId, ingresoId, "200000.00", "175000.00"),
        { codigo: "P0001", mensaje: /firmado antes de liquidarla/i },
      );

      // Mismo ingreso, ya firmado: la liquidación entra. El candado era el
      // estado del RCI-02 y nada más.
      await mandarAFirma(esc, ingresoId, "gerente");
      await firmarPresencial(esc, ingresoId, "ENTREGO_PROPIETARIO", CONSIGNANTE, "gerente");
      await firmarInterno(esc, ingresoId, "RECIBIO_INVENTARIO", "custodio");
      await firmarInterno(esc, ingresoId, "AUTORIZO_GERENTE", "gerente");

      await insertarLiquidacion(esc, liquidacionId, ingresoId, "200000.00", "175000.00");
      assert.equal((await leerLiquidacion(esc, liquidacionId)).utilidad_neta, "25000.00");
    });
  },
);

// =====================================================================
// REGLA 4 — ningún egreso sin vale con tres firmantes distintos
// =====================================================================

test(
  "regla 4: el vale con sus tres roles en tres personas distintas queda FIRMADO",
  { skip: SIN_BASE },
  async () => {
    await conEscenario(async (esc) => {
      const valeId = await valeParaFirmar(esc);

      assert.equal(
        await firmarInterno(esc, valeId, "AUTORIZO_GERENTE", "gerente"),
        "PENDIENTE_DE_FIRMA",
      );
      assert.equal(
        await firmarInterno(esc, valeId, "ENTREGO_CUSTODIO", "custodio"),
        "PENDIENTE_DE_FIRMA",
      );
      assert.equal(
        await firmarInterno(esc, valeId, "RECIBIO_BENEFICIARIO", "vendedor"),
        "FIRMADO",
      );
      assert.equal(await estadoDe(esc, valeId), "FIRMADO");

      const { rows: firmas } = await esc.cx.query<{
        rol_firmante: string;
        usuario_id: string | null;
      }>(
        "SELECT rol_firmante, usuario_id FROM firma_documento_financiero WHERE documento_id = $1",
        [valeId],
      );
      assert.equal(new Set(firmas.map((f) => f.usuario_id)).size, 3);
      assert.deepEqual(
        estadoValeEgreso(
          // El nulo se conserva como nulo: `Number(null)` daría 0, un usuario
          // que no existe, y el espejo dejaría de ver lo que la base ve.
          firmas.map((f) => ({
            rolFirmante: f.rol_firmante,
            usuarioId: f.usuario_id === null ? null : Number(f.usuario_id),
          })),
        ),
        {
          completo: true,
          rolesFaltantes: [],
          firmantesDuplicados: false,
          rolesSinUsuarioAtribuible: [],
        },
      );
    });
  },
);

test(
  "regla 4: la base es la autoridad de qué roles pide el vale y cuáles llevan usuario",
  { skip: SIN_BASE },
  async () => {
    await conEscenario(async (esc) => {
      // `calculos.ts` copia estas dos cosas para poder anunciar en pantalla qué
      // firma falta y con qué formulario se pide, sin un viaje a la base. La
      // copia sólo vale mientras coincida, y quien manda es esto.
      const { rows } = await esc.cx.query<{
        rol_firmante: string;
        exige_usuario_interno: boolean;
      }>(
        `SELECT fr.rol_firmante, rf.exige_usuario_interno
           FROM firma_requerida fr
           JOIN rol_firmante rf ON rf.codigo = fr.rol_firmante
          WHERE fr.tipo_codigo = 'CACM-RCI-05' AND fr.obligatoria
          ORDER BY fr.orden`,
      );

      assert.deepEqual(
        rows.map((f) => f.rol_firmante),
        [...FIRMANTES_VALE_EGRESO],
        "el espejo del vale ya no pide los mismos roles que firma_requerida",
      );
      assert.deepEqual(
        Object.fromEntries(rows.map((f) => [f.rol_firmante, f.exige_usuario_interno])),
        EXIGE_USUARIO_INTERNO_VALE,
        "el espejo del vale ya no coincide con rol_firmante.exige_usuario_interno",
      );
    });
  },
);

test(
  "regla 4: un rol de la empresa no se levanta como rúbrica presencial sin usuario",
  { skip: SIN_BASE },
  async () => {
    await conEscenario(async (esc) => {
      const valeId = await valeParaFirmar(esc);
      await firmarInterno(esc, valeId, "AUTORIZO_GERENTE", "gerente");

      // Es el ataque que la migración 038 cerró y que el espejo en TypeScript
      // daba por válido: declarar al Custodio Financiero como si fuera un
      // tercero que firmó en papel. El vale quedaría con sus tres firmas y con
      // la entrega del efectivo atribuida a nadie.
      await rechaza(
        esc,
        () => firmarPresencial(esc, valeId, "ENTREGO_CUSTODIO", "Custodio Prueba", "gerente"),
        { codigo: "P0001", mensaje: /personal de la empresa/i },
      );
      await rechaza(
        esc,
        () => firmarPresencial(esc, valeId, "AUTORIZO_GERENTE", "Otro Gerente", "gerente"),
        { codigo: "P0001", mensaje: /personal de la empresa/i },
      );

      // El beneficiario sí puede: es el único de los tres que no es personal de
      // la empresa, y sin esa puerta no habría manera de pagarle a un proveedor.
      await firmarInterno(esc, valeId, "ENTREGO_CUSTODIO", "custodio");
      assert.equal(
        await firmarPresencial(esc, valeId, "RECIBIO_BENEFICIARIO", "Proveedor Externo", "custodio"),
        "FIRMADO",
      );

      // Y el espejo dice lo mismo que la base sobre el vale que sí se logró.
      const { rows: firmas } = await esc.cx.query<{
        rol_firmante: string;
        usuario_id: string | null;
      }>(
        "SELECT rol_firmante, usuario_id FROM firma_documento_financiero WHERE documento_id = $1",
        [valeId],
      );
      const estado = estadoValeEgreso(
        firmas.map((f) => ({
          rolFirmante: f.rol_firmante,
          usuarioId: f.usuario_id === null ? null : Number(f.usuario_id),
        })),
      );
      assert.deepEqual(estado.rolesSinUsuarioAtribuible, []);
      assert.equal(estado.completo, true);
    });
  },
);

test(
  "regla 4: la misma persona no puede ocupar dos roles del mismo vale",
  { skip: SIN_BASE },
  async () => {
    await conEscenario(async (esc) => {
      const valeId = await valeParaFirmar(esc);
      await firmarInterno(esc, valeId, "AUTORIZO_GERENTE", "gerente");

      // Quien autoriza el gasto no puede además declarar que lo entregó: es la
      // segregación de funciones que hace del vale una prueba y no un recibo
      // que una sola persona se firma a sí misma.
      await rechaza(esc, () => firmarInterno(esc, valeId, "ENTREGO_CUSTODIO", "gerente"), {
        codigo: "23505",
        restriccion: /un_rol_por_usuario/,
      });

      assert.equal(await estadoDe(esc, valeId), "PENDIENTE_DE_FIRMA");
    });
  },
);

test(
  "regla 4: un rol interno no puede levantarse como firma presencial de tercero",
  { skip: SIN_BASE },
  async () => {
    await conEscenario(async (esc) => {
      const valeId = await valeParaFirmar(esc);

      // Sin este candado bastaría con teclear el nombre del gerente para dar por
      // autorizado un egreso que el gerente nunca vio.
      await rechaza(
        esc,
        () =>
          firmarPresencial(esc, valeId, "AUTORIZO_GERENTE", "Gerente Prueba", "custodio"),
        { codigo: "P0001", mensaje: /personal de la empresa/i },
      );

      // El rol de tercero sí admite esa vía: el beneficiario externo no tiene
      // usuario, y el custodio que lo atestigua responde con su PIN.
      assert.equal(
        await firmarPresencial(esc, valeId, "RECIBIO_BENEFICIARIO", "Refacciones del Norte SA", "custodio"),
        "PENDIENTE_DE_FIRMA",
      );
    });
  },
);

test(
  "regla 4: un vale de nómina sin su recibo RCI-06 referenciado se rechaza",
  { skip: SIN_BASE },
  async () => {
    await conEscenario(async (esc) => {
      const valeId = await emitirFolio(esc, "CACM-RCI-05", esc.usuarios.custodio);

      await rechaza(
        esc,
        () => insertarVale(esc, valeId, { concepto: "PAGO_NOMINA", importe: "8000.00" }),
        { codigo: "23514", restriccion: /vale_egreso_rci05/ },
      );

      // Con el recibo del trabajador citado, el mismo vale entra: el enlace es
      // lo que permite rastrear qué nómina pagó ese efectivo.
      const reciboId = await emitirFolio(esc, "CACM-RCI-06", esc.usuarios.rh);
      await esc.cx.query(
        `INSERT INTO recibo_nomina_rci06
           (documento_id, empleado_id, periodo_inicio, periodo_fin, percepcion_sueldo, forma_pago)
         VALUES ($1, $2, date_trunc('month', current_date)::date, current_date, $3, 'EFECTIVO')`,
        [reciboId, esc.empleadoVendedor, "8000.00"],
      );

      await insertarVale(esc, valeId, {
        concepto: "PAGO_NOMINA",
        importe: "8000.00",
        reciboNominaId: reciboId,
      });
      const { rows } = await esc.cx.query<{ recibo_nomina_id: string }>(
        "SELECT recibo_nomina_id FROM vale_egreso_rci05 WHERE documento_id = $1",
        [valeId],
      );
      assert.equal(rows[0].recibo_nomina_id, reciboId);
    });
  },
);

test(
  "regla 4: un retiro de utilidades sin socio identificado se rechaza",
  { skip: SIN_BASE },
  async () => {
    await conEscenario(async (esc) => {
      const valeId = await emitirFolio(esc, "CACM-RCI-05", esc.usuarios.custodio);

      // Sin socio no hay a quién cargarle el anticipo cuando llegue el reparto
      // formal, y el retiro se volvería un gasto sin dueño. Desde la migración
      // 040 el candado tiene nombre propio —`vale_retiro_socio_exige_socio`— y
      // apunta al registro de socios, no a la tabla de usuarios.
      await rechaza(
        esc,
        () =>
          insertarVale(esc, valeId, {
            concepto: "RETIRO_UTILIDADES_SOCIO",
            importe: "30000.00",
            beneficiario: "Socio Prueba",
          }),
        { codigo: "23514", restriccion: /vale_retiro_socio_exige_socio/ },
      );

      // Tampoco basta con señalar a cualquiera del catálogo: la columna apunta a
      // `socio`, no a `persona`. Estar en la libreta de a quién se le paga no
      // convierte a nadie en dueño de parte del capital.
      //
      // Quien lo rechaza es el disparador `exigir_socio_vigente`, que corre
      // ANTES que la llave foránea; por eso el error es P0001 y no un 23503.
      // Y por eso mismo el mensaje tiene que distinguir a quien NUNCA fue socio
      // de quien lo fue y ya no: decirle "ya no figura" a alguien que jamás
      // figuró manda a buscar en el registro una baja que no existe.
      const { rows: ajena } = await esc.cx.query<{ id: string }>(
        `INSERT INTO persona (nombre, categoria, creada_por)
         VALUES ('Proveedor Que No Es Socio', 'PROVEEDOR', $1) RETURNING id`,
        [esc.usuarios.gerente],
      );
      await rechaza(
        esc,
        () =>
          insertarVale(esc, valeId, {
            concepto: "RETIRO_UTILIDADES_SOCIO",
            importe: "30000.00",
            beneficiario: "Socio Prueba",
            socioPersonaId: ajena[0].id,
          }),
        { codigo: "P0001", mensaje: /no está registrada como socio|no esta registrada como socio/i },
      );

      await insertarVale(esc, valeId, {
        concepto: "RETIRO_UTILIDADES_SOCIO",
        importe: "30000.00",
        beneficiario: "Socio Prueba",
        socioPersonaId: esc.socioPersonaId,
      });
      const { rows } = await esc.cx.query<{ socio_persona_id: string }>(
        "SELECT socio_persona_id FROM vale_egreso_rci05 WHERE documento_id = $1",
        [valeId],
      );
      assert.equal(rows[0].socio_persona_id, esc.socioPersonaId);
    });
  },
);

test(
  "regla 4: un vale ya FIRMADO no admite otra firma ni edición de su contenido",
  { skip: SIN_BASE },
  async () => {
    await conEscenario(async (esc) => {
      const valeId = await valeParaFirmar(esc);
      await firmarInterno(esc, valeId, "AUTORIZO_GERENTE", "gerente");
      await firmarInterno(esc, valeId, "ENTREGO_CUSTODIO", "custodio");
      assert.equal(await firmarInterno(esc, valeId, "RECIBIO_BENEFICIARIO", "vendedor"), "FIRMADO");

      // Refirmar un rol ya cerrado: el documento firmado sólo se corrige con un
      // folio complementario, nunca reabriéndolo.
      await rechaza(esc, () => firmarInterno(esc, valeId, "RECIBIO_BENEFICIARIO", "socio"), {
        codigo: "P0001",
        mensaje: /ya esta firmado/i,
      });

      await rechaza(
        esc,
        () =>
          esc.cx.query("UPDATE vale_egreso_rci05 SET importe = $1 WHERE documento_id = $2", [
            "50000.00",
            valeId,
          ]),
        { codigo: "P0001", mensaje: /no admite cambios/i },
      );

      await rechaza(
        esc,
        () => esc.cx.query("DELETE FROM vale_egreso_rci05 WHERE documento_id = $1", [valeId]),
        { codigo: "P0001", mensaje: /no admite cambios/i },
      );

      const { rows } = await esc.cx.query<{ importe: string }>(
        "SELECT importe FROM vale_egreso_rci05 WHERE documento_id = $1",
        [valeId],
      );
      assert.equal(rows[0].importe, "5000.00");
    });
  },
);
