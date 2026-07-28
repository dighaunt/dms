/**
 * Pruebas de regresión de los huecos encontrados en revisión adversarial.
 *
 * Cada caso reproduce un ataque que ANTES de la migración 038 funcionaba. No
 * son pruebas de que las funciones hagan su trabajo —eso ya lo cubren las
 * otras suites— sino de que la base impida el atajo: escribir directo en las
 * tablas, saltándose las funciones que verifican PIN, arqueo y estados.
 *
 * La distinción importa. Un candado que sólo vive dentro de una función
 * protege a quien la llama; el dinero lo protege el candado que también
 * detiene a quien NO la llama.
 *
 * Aislamiento: mismo patrón que el resto de la suite, transacción y ROLLBACK.
 */
import assert from "node:assert/strict";
import test from "node:test";

import pg from "pg";

import { centinelaDeBase, SIN_BASE, URL_PRUEBAS } from "./base-pruebas.mts";

// Sin base no hay nada que probar aquí, y callarlo dejaría `npm test` en verde
// con cero cobertura de los candados que la 038 puso. El porqué del mecanismo
// está en la cabecera de `base-pruebas.mts`.
centinelaDeBase("el antifraude: los siete atajos que cierra la migración 038");

const HASH = "a".repeat(64);

const SEMILLA = `
INSERT INTO usuario (email, nombre, nivel) VALUES
 ('af-gerente@t.mx','Gerente Antifraude','N3'),
 ('af-custodio@t.mx','Custodio Antifraude','N2'),
 ('af-vendedor@t.mx','Vendedora Antifraude','N1')
ON CONFLICT (email) DO NOTHING;

INSERT INTO sucursal (clave, nombre, creada_por)
 VALUES ('AF','Sucursal Antifraude',(SELECT id FROM usuario WHERE email='af-gerente@t.mx'))
ON CONFLICT (clave) DO NOTHING;

INSERT INTO empleado (num_empleado, nombres, apellido_paterno, apellido_materno, puesto, sucursal_id, usuario_id, creado_por)
 VALUES ('AF-01','Vendedora','Antifraude',NULL,'Vendedor',(SELECT id FROM sucursal WHERE clave='AF'),
         (SELECT id FROM usuario WHERE email='af-vendedor@t.mx'),
         (SELECT id FROM usuario WHERE email='af-gerente@t.mx'))
ON CONFLICT (sucursal_id, num_empleado) DO NOTHING;
`;

const PINS = {
  gerente: { email: "af-gerente@t.mx", pin: "900001" },
  custodio: { email: "af-custodio@t.mx", pin: "900002" },
  vendedor: { email: "af-vendedor@t.mx", pin: "900003" },
} as const;

type Actor = keyof typeof PINS;

type Escenario = {
  cx: pg.Client;
  usuarios: Record<Actor, string>;
  sucursalId: string;
  empleadoId: string;
};

async function conEscenario(cuerpo: (esc: Escenario) => Promise<void>): Promise<void> {
  const cx = new pg.Client({ connectionString: URL_PRUEBAS });
  await cx.connect();
  try {
    await cx.query("BEGIN");
    await cx.query("SET search_path TO traza, public");
    await cx.query(SEMILLA);

    const usuarios = {} as Record<Actor, string>;
    for (const [actor, datos] of Object.entries(PINS) as [Actor, (typeof PINS)[Actor]][]) {
      const { rows } = await cx.query<{ id: string }>("SELECT id FROM usuario WHERE email = $1", [
        datos.email,
      ]);
      usuarios[actor] = rows[0].id;
      await cx.query("SELECT establecer_pin_firma($1, $2)", [rows[0].id, datos.pin]);
    }
    const sucursal = await cx.query<{ id: string }>("SELECT id FROM sucursal WHERE clave = 'AF'");
    const empleado = await cx.query<{ id: string }>(
      "SELECT id FROM empleado WHERE num_empleado = 'AF-01'",
    );

    await cuerpo({
      cx,
      usuarios,
      sucursalId: sucursal.rows[0].id,
      empleadoId: empleado.rows[0].id,
    });
  } finally {
    await cx.query("ROLLBACK").catch(() => undefined);
    await cx.end();
  }
}

/** Emite un folio y devuelve su id. */
async function emitir(esc: Escenario, tipo: string, usuario: string): Promise<string> {
  const { rows } = await esc.cx.query<{ id: string }>(
    "SELECT (emitir_folio_financiero($1, $2, $3)).id AS id",
    [tipo, esc.sucursalId, usuario],
  );
  return rows[0].id;
}

/**
 * Comprueba que una acción sea rechazada con el mensaje esperado.
 *
 * Va envuelta en un SAVEPOINT porque en Postgres un error aborta la
 * transacción entera: sin él, la primera comprobación dejaría la conexión
 * inservible y la siguiente fallaría por "current transaction is aborted" en
 * vez de por lo que dice probar.
 */
async function seRechaza(
  cx: pg.Client,
  accion: () => Promise<unknown>,
  fragmento: string,
): Promise<void> {
  await cx.query("SAVEPOINT intento");
  await assert.rejects(accion, (error: Error) => {
    assert.match(error.message, new RegExp(fragmento, "i"));
    return true;
  });
  await cx.query("ROLLBACK TO SAVEPOINT intento");
}

test(
  "A1 · no se puede firmar escribiendo en la tabla de firmas sin conocer el PIN",
  { skip: SIN_BASE },
  async () => {
    await conEscenario(async (esc) => {
      const doc = await emitir(esc, "CACM-RCI-01", esc.usuarios.vendedor);
      await esc.cx.query(
        `INSERT INTO recibo_caja_rci01 (documento_id,vendedor_empleado_id,vendedor_id_tipo,
           vendedor_id_numero,cliente_nombre,fecha_hora_cobro,folio_venta_texto,concepto_codigo,importe_total)
         VALUES ($1,$2,'INE','123456','Cliente',now(),'C-02-1','ENGANCHE',50000)`,
        [doc, esc.empleadoId],
      );
      await esc.cx.query("SELECT cambiar_estado_documento_fin($1,'PENDIENTE_DE_FIRMA',$2)", [
        doc,
        esc.usuarios.vendedor,
      ]);

      // El atacante no conoce el PIN del custodio, así que intenta la vía directa.
      await seRechaza(
        esc.cx,
        () =>
          esc.cx.query(
            `INSERT INTO firma_documento_financiero
               (documento_id,rol_firmante,metodo,usuario_id,hash_contenido)
             VALUES ($1,'RECIBIO_CUSTODIO','PIN_USUARIO',$2,$3)`,
            [doc, esc.usuarios.custodio, HASH],
          ),
        "verifica el PIN",
      );
    });
  },
);

test(
  "A2 · no se puede marcar un documento como FIRMADO sin una sola firma",
  { skip: SIN_BASE },
  async () => {
    await conEscenario(async (esc) => {
      const doc = await emitir(esc, "CACM-RCI-05", esc.usuarios.vendedor);
      await esc.cx.query(
        `INSERT INTO vale_egreso_rci05 (documento_id,fecha_hora,concepto_codigo,beneficiario_nombre,
           beneficiario_id_tipo,beneficiario_id_numero,forma_pago,importe)
         VALUES ($1,now(),'GASTO_OPERATIVO','Yo Mismo','INE','123456','EFECTIVO',999999)`,
        [doc],
      );

      await seRechaza(
        esc.cx,
        () =>
          esc.cx.query(
            `INSERT INTO documento_financiero_estado_hist (documento_id,estado,registrado_por)
             VALUES ($1,'FIRMADO',$2)`,
            [doc, esc.usuarios.vendedor],
          ),
        "solo cambia por las funciones",
      );
    });
  },
);

test(
  "A3 · un recibo cuyo arqueo no cuadra no se puede firmar, aunque nadie valide antes",
  { skip: SIN_BASE },
  async () => {
    await conEscenario(async (esc) => {
      const doc = await emitir(esc, "CACM-RCI-01", esc.usuarios.vendedor);
      await esc.cx.query(
        `INSERT INTO recibo_caja_rci01 (documento_id,vendedor_empleado_id,vendedor_id_tipo,
           vendedor_id_numero,cliente_nombre,fecha_hora_cobro,folio_venta_texto,concepto_codigo,importe_total)
         VALUES ($1,$2,'INE','123456','Cliente',now(),'C-02-2','ENGANCHE',50000)`,
        [doc, esc.empleadoId],
      );
      // Declara 50,000 y entrega 45,000 en billetes.
      await esc.cx.query(
        "INSERT INTO denominacion_rci01 (documento_id,denominacion,cantidad) VALUES ($1,1000,45)",
        [doc],
      );
      await esc.cx.query("SELECT cambiar_estado_documento_fin($1,'PENDIENTE_DE_FIRMA',$2)", [
        doc,
        esc.usuarios.vendedor,
      ]);

      await seRechaza(
        esc.cx,
        () =>
          esc.cx.query("SELECT firmar_documento_financiero($1,'ENTREGO_VENDEDOR',$2,$3,$4)", [
            doc,
            esc.usuarios.vendedor,
            PINS.vendedor.pin,
            HASH,
          ]),
        "denominaciones suma",
      );
    });
  },
);

test(
  "A4 · quien autoriza un vale no puede cobrarlo declarándose tercero",
  { skip: SIN_BASE },
  async () => {
    await conEscenario(async (esc) => {
      const doc = await emitir(esc, "CACM-RCI-05", esc.usuarios.gerente);
      await esc.cx.query(
        `INSERT INTO vale_egreso_rci05 (documento_id,fecha_hora,concepto_codigo,beneficiario_nombre,
           beneficiario_id_tipo,beneficiario_id_numero,forma_pago,importe)
         VALUES ($1,now(),'GASTO_OPERATIVO','Gerente Antifraude','INE','987654','EFECTIVO',80000)`,
        [doc],
      );
      await esc.cx.query("SELECT cambiar_estado_documento_fin($1,'PENDIENTE_DE_FIRMA',$2)", [
        doc,
        esc.usuarios.gerente,
      ]);
      await esc.cx.query("SELECT firmar_documento_financiero($1,'AUTORIZO_GERENTE',$2,$3,$4)", [
        doc,
        esc.usuarios.gerente,
        PINS.gerente.pin,
        HASH,
      ]);
      await esc.cx.query("SELECT firmar_documento_financiero($1,'ENTREGO_CUSTODIO',$2,$3,$4)", [
        doc,
        esc.usuarios.custodio,
        PINS.custodio.pin,
        HASH,
      ]);

      // El "beneficiario externo" lleva el nombre de quien ya autorizó.
      await seRechaza(
        esc.cx,
        () =>
          esc.cx.query(
            `SELECT firmar_documento_externo($1,'RECIBIO_BENEFICIARIO','Gerente Antifraude',
               'INE','987654',$2,$3,$4)`,
            [doc, esc.usuarios.custodio, PINS.custodio.pin, HASH],
          ),
        "ya firmo este documento con su usuario",
      );
    });
  },
);

test("A5 · no se puede fabricar un sello a mano", { skip: SIN_BASE }, async () => {
  await conEscenario(async (esc) => {
    const doc = await emitir(esc, "CACM-RCI-05", esc.usuarios.gerente);
    await seRechaza(
      esc.cx,
      () =>
        esc.cx.query(
          `INSERT INTO sello_accion (documento_id,accion_codigo,token,hash_contenido,estampado_por)
           VALUES ($1,'AUTORIZADO','CACM-ZZZZ-ZZZZ-ZZZZ',$2,$3)`,
          [doc, HASH, esc.usuarios.gerente],
        ),
      "solo se acuna junto al hecho",
    );
  });
});

test(
  "A6 · cerrado el corte, ya no se puede borrar la explicación del faltante",
  { skip: SIN_BASE },
  async () => {
    await conEscenario(async (esc) => {
      const doc = await emitir(esc, "CACM-RCI-07", esc.usuarios.custodio);
      await esc.cx.query(
        `INSERT INTO corte_caja_rci07 (documento_id,sucursal_id,fecha_corte,turno,custodio_usuario_id)
         VALUES ($1,$2,current_date,'AF',$3)`,
        [doc, esc.sucursalId, esc.usuarios.custodio],
      );
      // Sin movimientos el saldo calculado es 0; se declara un sobrante para
      // que exista una diferencia que explicar.
      await esc.cx.query("SELECT cerrar_corte_caja($1,$2,$3,$4)", [
        doc,
        "1500.00",
        esc.usuarios.custodio,
        "Sobrante detectado al cierre, se investiga con camaras",
      ]);

      const antes = await esc.cx.query<{ estado: string }>(
        "SELECT estado_documento_fin($1) AS estado",
        [doc],
      );
      assert.equal(antes.rows[0].estado, "PENDIENTE_DE_FIRMA");

      await seRechaza(
        esc.cx,
        () =>
          esc.cx.query(
            "UPDATE corte_caja_rci07 SET explicacion_diferencia = NULL WHERE documento_id = $1",
            [doc],
          ),
        "ya fue cerrado",
      );
    });
  },
);

test(
  "A7 · un documento firmado no se puede cancelar por la puerta de atrás",
  { skip: SIN_BASE },
  async () => {
    await conEscenario(async (esc) => {
      const doc = await emitir(esc, "CACM-RCI-05", esc.usuarios.gerente);
      await esc.cx.query(
        `INSERT INTO vale_egreso_rci05 (documento_id,fecha_hora,concepto_codigo,beneficiario_nombre,
           beneficiario_id_tipo,beneficiario_id_numero,forma_pago,importe)
         VALUES ($1,now(),'GASTO_OPERATIVO','Proveedor Real','RFC','XAXX010101000','EFECTIVO',5000)`,
        [doc],
      );
      await esc.cx.query("SELECT cambiar_estado_documento_fin($1,'PENDIENTE_DE_FIRMA',$2)", [
        doc,
        esc.usuarios.gerente,
      ]);
      await esc.cx.query("SELECT firmar_documento_financiero($1,'AUTORIZO_GERENTE',$2,$3,$4)", [
        doc,
        esc.usuarios.gerente,
        PINS.gerente.pin,
        HASH,
      ]);
      await esc.cx.query("SELECT firmar_documento_financiero($1,'ENTREGO_CUSTODIO',$2,$3,$4)", [
        doc,
        esc.usuarios.custodio,
        PINS.custodio.pin,
        HASH,
      ]);
      const estado = await esc.cx.query<{ estado: string }>(
        `SELECT firmar_documento_externo($1,'RECIBIO_BENEFICIARIO','Proveedor Real','RFC',
           'XAXX010101000',$2,$3,$4) AS estado`,
        [doc, esc.usuarios.custodio, PINS.custodio.pin, HASH],
      );
      assert.equal(estado.rows[0].estado, "FIRMADO", "el flujo legítimo debe seguir funcionando");

      await seRechaza(
        esc.cx,
        () =>
          esc.cx.query(
            `INSERT INTO documento_financiero_estado_hist (documento_id,estado,motivo,registrado_por)
             VALUES ($1,'CANCELADO','sin dejar rastro',$2)`,
            [doc, esc.usuarios.gerente],
          ),
        "solo cambia por las funciones",
      );

      // Y el importe tampoco se puede tocar (esto ya estaba cubierto; se
      // conserva para que la protección no se pierda en un refactor).
      await seRechaza(
        esc.cx,
        () =>
          esc.cx.query("UPDATE vale_egreso_rci05 SET importe = importe * 10 WHERE documento_id = $1", [
            doc,
          ]),
        "ya no admite cambios",
      );
    });
  },
);
