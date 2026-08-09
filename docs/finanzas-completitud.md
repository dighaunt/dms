# Auditoría de completitud — módulo Finanzas frente al Manual CACM-RCI

Revisión del 2026-07-28. Compara los siete formatos del manual contra lo modelado en
`migrations/034` a `038` y lo expuesto en `src/lib/finanzas/`, `src/app/(operacion)/finanzas/`
y `src/app/(operacion)/api/finanzas/`.

Es una auditoría. No se tocó una línea de código **al escribirla**; lo que vino después
está en el punto 6, al final, que dice qué se cerró y qué sigue abierto. El cuerpo del
informe se conserva tal como se levantó, sin corregir a toro pasado: un informe que se
reescribe conforme se arregla deja de servir para saber qué tan mal estaba la cosa.

---

## 0. Alcance, método y una advertencia sobre el manual

Se leyó el manual completo (8 páginas, `manual.txt`), las cinco migraciones del módulo
(034 a 038), los trece módulos de `src/lib/finanzas/`, los veintitrés endpoints, las once
pantallas y los seis archivos de prueba. Se ejecutó `npm test` y `node --test` archivo por
archivo para medir cobertura real.

**Advertencia que condiciona el punto 3 de este informe.** El manual disponible NO contiene
secciones numeradas 6 y 7. Sus ocho páginas son la portada con el índice de formatos y las
siete formas impresas; las reglas y validaciones viven repartidas como texto normativo dentro
de los encabezados, las declaraciones de cada Parte y las notas de pie. La numeración
"regla 3, 4, 5, 7" que usa el código (`src/lib/finanzas/calculos.ts`, líneas 35, 81, 122, 162)
no aparece en ninguna parte del manual: es una convención interna del repositorio.

Por tanto, el conjunto de ocho reglas y cuatro validaciones que se evalúa en el punto 3 es una
**reconstrucción**, hecha a partir de (a) los enunciados normativos del propio manual y (b) la
numeración que el código ya usa para las cuatro que sí tiene nombre. Está señalada la fuente
textual de cada una para que quien tenga el manual íntegro pueda cotejar el mapeo. Si la
sección 6 real dice otra cosa, la evaluación de coberturas sigue siendo válida —los candados y
las pruebas son los que son— pero la asignación regla-por-regla habría que rehacerla.

Convención de las tablas: **Sí** = modelado y capturable de punta a punta. **Derivado** = no es
columna propia porque se obtiene de otra tabla ya existente, que es lo correcto. **Parcial** =
está la columna, no está la vía de captura. **No** = no existe.

---

## 1. Los doce huecos, ordenados por riesgo financiero

| # | Hueco | Dónde | Consecuencia con dinero de por medio |
|---|---|---|---|
| H1 | Las 44 pruebas que sostienen las reglas nunca se ejecutan | `*.test.mts` con `skip: SIN_BASE` | `npm test` sale en verde con cero cobertura de los candados. Ver punto 4 |
| H2 | El RCI-02 y el RCI-03 se firman contra un hash que sólo contiene la cabecera | `contenido.ts:55` (caso `default`) | El consignante firma una huella que no incluye ni el precio de venta ni el monto que se le liquida |
| H3 | La ventana entre la primera firma y la última admite editar el contenido | `bloquear_detalle_documento_fin` sólo bloquea en `FIRMADO`/`CANCELADO` | Combinado con H2: se captura 100 000 al consignante, firma, se baja a 60 000, firman custodio y gerente. La huella del consignante no cambia |
| H4 | Nada compara los `hash_contenido` de las firmas del mismo folio | ninguna función, vista, ruta ni pantalla | Aun donde el hash sí cubre el contenido (RCI-01, 04, 05, 06, 07), la divergencia entre dos firmas no se detecta ni se muestra |
| H5 | No hay forma de registrar un reparto formal de utilidades | `registrarRepartoUtilidades` (`egresos.ts:826`) sin endpoint ni pantalla | La regla 5 no tiene salida: todo retiro de socio queda como anticipo por comprobar para siempre |
| H6 | La frontera del día se calcula en UTC | `src/lib/db/index.ts` no fija `TimeZone`; `armar_corte_caja` usa `::date` | Un cobro de las 19:00 en Monterrey (UTC-6) cae en el corte del día siguiente. El efectivo está en el cajón hoy y el corte de hoy no lo cuenta |
| H7 | "Otros ingresos" del RCI-07 no existe | `armar_corte_caja` tiene 3 orígenes de ingreso; `corte_caja_detalle.origen_documento_id` es `NOT NULL` | Un ingreso sin folio no se puede asentar. El custodio lo explicará como "sobrante" o no lo declarará |
| H8 | `folios_sin_firmar_del_dia` ignora el RCI-03 y filtra por `creado_en` | `037:196` | Una liquidación de consigna sin firmar no impide cerrar el día y su utilidad nunca entra al corte. Además un recibo creado ayer con cobro de hoy suma al corte de hoy pero no lo bloquea |
| H9 | Dos cortes del mismo día y sucursal si el turno va vacío | `UNIQUE (sucursal_id, fecha_corte, turno)` con `NULL` distintos | Dos rendiciones de cuentas del mismo día, y el encadenado de `saldo_inicial_corte` toma una arbitrariamente (`ORDER BY fecha_corte DESC LIMIT 1`) |
| H10 | Un folio llega a `FIRMADO` sin fila de detalle | `validar_arqueo_rci01` sale sin error si no hay recibo; `cerrar_si_firmas_completas` sólo cuenta firmas | Un RCI-01 firmado y sellado, con folio consumido y cero contenido |
| H11 | Las alertas se levantan y nunca se cierran; `CUSTODIA_PENDIENTE` nunca se levanta | `atenderAlerta` (`egresos.ts:1069`) sin endpoint; ningún `INSERT` con ese tipo | `alerta_finanzas.atendida_por/en/nota_atencion` son columnas muertas. El umbral de 4 horas de `HORAS_ALERTA_CUSTODIA` es sólo una etiqueta de pantalla |
| H12 | El RCI-02, 03, 04 y 06 no se imprimen | `ARMADORES` en `pdf/documento-pdf.ts:698` sólo trae 01, 05 y 07 | El recibo de nómina, que la LFT art. 804 obliga a conservar y exhibir en juicio, es justo uno de los que no tiene hoja |

H2 y H3 juntos son el hallazgo que más pesa: son el único punto del módulo donde alguien puede
cambiar una cifra ya consentida sin dejar rastro. Todo lo demás se detecta, se explica o se
sufre; eso no.

---

## 2. Formato por formato

### CACM-RCI-01 — Recibo de Caja Interno

| Campo del manual | Modelado en | Captura | Estado |
|---|---|---|---|
| Sucursal / Agencia | `documento_financiero.sucursal_id` | pantalla | Sí |
| Folio No. | `consecutivo` + vista `v_documento_financiero.folio` | `emitir_folio_financiero` | Sí |
| Formato / Rev. 07/2026 | `tipo_documento_financiero.revision` | semilla | Sí |
| Destino del ejemplar (Original–Contabilidad, Copia–Vendedor, Copia–Custodio) | — | — | **No.** Control de reparto de ejemplares; el PDF tampoco lo imprime |
| Tipo de recibo: Inicial / Complementario, sustituye Folio No. ___ | `documento_financiero.complementa_a` | endpoint `POST /documentos` acepta `complementaA` | **Parcial.** Ninguna pantalla lo manda y el PDF no imprime la casilla |
| 1. Nombre completo del vendedor * | `vendedor_empleado_id` → `empleado.nombre` | sí | Derivado |
| 2. No. de empleado | `empleado.num_empleado` | sí | Derivado |
| 3. Identificación oficial del vendedor * | `vendedor_id_tipo`, `vendedor_id_numero` | sí | Sí |
| 4. Nombre del cliente / comprador * | `cliente_nombre` | sí | Sí |
| 5. Vehículo (marca / submarca / modelo) | `vehiculo_descripcion` | sí | Sí (texto libre; no se deriva de `unidad` aunque haya VIN) |
| 6. Fecha y hora del cobro * | `fecha_hora_cobro timestamptz` | sí | Sí |
| 7. No. de serie (VIN), una casilla por carácter | `vin` FK a `unidad` | sí, con `casillasVin` | Sí |
| 8. No. de folio de venta / contrato * | `documento_venta_id` o `folio_venta_texto` | sólo el texto | **Parcial.** La rama que enlaza con el expediente nunca se usa |
| 9. Concepto (a Enganche, b Abono, c Liquidación total, d Otro) * | `concepto_codigo` + `concepto_otro` | sí | Sí |
| Parte II — Denominación / Cantidad / Subtotal | `denominacion_rci01` con `subtotal` GENERATED | sí | Sí |
| 10. Importe total entregado en efectivo * | `importe_total numeric(18,2)` | sí | Sí |
| Importe con letra * | derivado por `importeEnCasillas().letra` | no se teclea | Derivado, y así debe ser |
| Parte III — declaración de transferencia de custodia | firma `RECIBIO_CUSTODIO` | sí | Sí |
| ENTREGÓ–VENDEDOR: nombre, firma, identificación oficial | firma + campos 1 y 3 del cuerpo | sí | Sí |
| RECIBIÓ–CUSTODIO: nombre, **cargo**, firma, **identificación oficial** | sólo `usuario_id` | — | **No.** El `CHECK` de `firma_documento_financiero` prohíbe `firmante_id_*` cuando el método es `PIN_USUARIO`. Ni el cargo ni la identificación del custodio existen en ningún lado |
| TESTIGO (opcional): nombre, **cargo**, firma | firma externa con identificación | sí | Parcial: el cargo no se modela |
| Fecha y hora de la firma | `firmado_en` | automático | Sí |

### CACM-RCI-02 — Ingreso de Vehículo a Inventario

| Campo del manual | Modelado en | Captura | Estado |
|---|---|---|---|
| 1. Marca / submarca / modelo / año * | `expediente_id` → `unidad`/`modelo`/`marca` | precargado | Derivado |
| 2. No. de placas | `placas` | sí | Sí |
| 3. Color | `unidad.color` (migración 001) | precargado | Derivado. Es el color del maestro, no "el color al ingresar"; aceptable |
| 4. No. de serie (VIN) * | `unidad.vin` vía expediente | precargado | Derivado |
| 5. Kilometraje de ingreso | `kilometraje` | sí | Sí |
| 6. Ubicación física / lote | `ubicacion_fisica` | sí | Sí |
| 7. Fecha de ingreso * | `fecha_ingreso date` | sí | Sí |
| 8. No. de llaves entregadas | `num_llaves` | sí | Sí |
| 9. Nombre completo o razón social * | `propietario_nombre` | sí | Sí |
| 10. Identificación oficial * | `propietario_id_tipo/numero` | sí | Sí |
| 11. Teléfono | `propietario_telefono` con `~ '^[0-9]{10}$'` | sí | Sí |
| 12. Domicilio | `propietario_domicilio` | sí | Sí |
| 13. Tipo de operación * | `tipo_operacion` + trigger contra `expediente.origen` | sí | Sí. Buen candado |
| 14. Precio de compra pactado * | `precio_compra` | sí | Sí |
| 15. Forma de pago | `compra_forma_pago` | sí | Sí |
| 16. Fecha de pago | `compra_fecha_pago` | sí | Sí |
| 17. Precio mínimo de venta autorizado * | `precio_minimo_venta` | sí | Sí |
| 18. Comisión / margen (monto o %) * | `comision_monto` XOR `comision_pct` | sí | Sí |
| 19. Plazo de consignación (fecha límite) | `consigna_fecha_limite` | sí | Sí **como dato muerto.** Nada vigila el vencimiento: sin alerta, sin reporte, sin candado que impida liquidar fuera de plazo |
| ENTREGÓ–PROPIETARIO (+ identificación) | firma externa | sí | Sí |
| RECIBIÓ–INVENTARIO: nombre, **cargo**, firma, **identificación** | sólo `usuario_id` | — | **No** (mismo caso que el custodio del RCI-01) |
| AUTORIZÓ–GERENTE + Fecha | firma `AUTORIZO_GERENTE` | sí | Sí |
| Hoja impresa | — | — | **No.** Sin armador de PDF |
| Huella de lo firmado | `contenido.ts` caso `default` | — | **No.** Sólo cabecera. Ver H2 |

### CACM-RCI-03 — Liquidación de Venta en Consignación

| Campo del manual | Modelado en | Captura | Estado |
|---|---|---|---|
| 1. Folio de Ingreso a Inventario (RCI-02) * | `ingreso_rci02_id` + `UNIQUE` | sí | Sí. Una consigna se liquida una sola vez |
| 2. Vehículo (marca / modelo / VIN) | derivado del RCI-02 | precargado | Derivado |
| 3. Nombre del consignante * | `consignante_nombre` | sí | Sí |
| 4. Folio del RCI-01 de la venta | `recibo_rci01_id` | sí | Sí |
| 5. Precio de venta final * | `precio_venta_final` | sí | Sí |
| 6. (–) Monto a liquidar al consignante * | `monto_consignante`, con `CHECK (<= precio_venta_final)` | sí | Sí |
| 7. (–) Gastos asociados | `gasto_liquidacion_rci03` + trigger que mantiene `gastos_total` | sí | Sí |
| 8. (=) Utilidad neta * | columna `GENERATED ALWAYS` | no se teclea | Sí. El mejor candado del módulo |
| 9. Forma de ingreso a tesorería *, con Institución y Cuenta | `forma_ingreso_tesoreria` + `institucion_bancaria` + `cuenta_bancaria`, con `CHECK` condicional | sí | Sí |
| (fuera del manual) Ajuste de utilidad con nota de auditoría | `ajuste_utilidad_rci03` | endpoint `POST /documentos/[id]/rci03` | **Parcial.** Existe la ruta, no existe la pantalla |
| CONSIGNANTE–RECIBE (+ identificación) | firma externa | sí | Sí |
| CUSTODIO–CALCULÓ Y ENTREGÓ: nombre, **cargo**, firma + fecha y hora | `usuario_id` + `firmado_en` | sí | Parcial: sin cargo |
| AUTORIZÓ–GERENTE / SOCIO + Fecha | firma | sí | Sí |
| Hoja impresa | — | — | **No.** Sin armador de PDF |
| Huella de lo firmado | caso `default` | — | **No.** Sólo cabecera. Éste es el peor sitio donde podía faltar: es el documento donde un tercero declara recibir una cantidad |

### CACM-RCI-04 — Recibo de Ingreso por Servicio

| Campo del manual | Modelado en | Captura | Estado |
|---|---|---|---|
| 1. Nombre del cliente * | `cliente_nombre` | sí | Sí |
| 2. Vehículo atendido (marca / modelo / placas) | `vehiculo_descripcion` + `placas` | sí | Sí |
| 3. No. de orden de servicio * | `orden_servicio` | sí | Sí, **sin unicidad.** Nada impide cobrar dos veces la misma orden |
| 4. Fecha y hora de cobro * | `fecha_hora_cobro` | sí | Sí |
| 5. Descripción del servicio realizado * | `descripcion_servicio` | sí | Sí |
| 6. Nombre de quien cobra * | `cobrador_empleado_id` | sí | Derivado |
| 7. No. de empleado | `empleado.num_empleado` | sí | Derivado |
| 8. Forma de pago * (Efectivo / Tarjeta / Transferencia) | `forma_pago` FK con `afecta_caja_fisica` | sí | Sí |
| 9. Importe total cobrado * | `importe_total` | sí | Sí |
| Importe con letra * | derivado | no se teclea | Derivado |
| ENTREGÓ–ASESOR: nombre, firma, **identificación oficial** | sólo `usuario_id` | — | **No.** A diferencia del RCI-01, que sí guarda la identificación del vendedor en el cuerpo, aquí la del asesor no existe |
| RECIBIÓ–CUSTODIO: nombre, **cargo**, firma, **identificación** | sólo `usuario_id` | — | **No** |
| TESTIGO (opcional) + fecha y hora | firma externa | sí | Sí |
| Parte II — desglose de denominaciones | — | — | Correcto que no exista: el manual no lo pide para el RCI-04 |
| Hoja impresa | — | — | **No.** Sin armador de PDF |

### CACM-RCI-05 — Vale de Egreso de Caja

| Campo del manual | Modelado en | Captura | Estado |
|---|---|---|---|
| 1. Fecha y hora * | `fecha_hora timestamptz` | sí | Sí |
| 2. Folio relacionado (venta, liquidación, factura, etc.) | `folio_relacionado_id` o `folio_relacionado_texto` | sólo el texto | **Parcial.** El enlace duro a otro folio financiero nunca se usa; la trazabilidad RCI-03 → RCI-05 que exige la declaración del RCI-03 queda como cadena de texto |
| 3. Nombre de quien recibe el efectivo * | `beneficiario_nombre` | sí | Sí |
| 4. Identificación oficial de quien recibe * | `beneficiario_id_tipo/numero` | sí | Sí |
| 5. Concepto (a comisión, b retiro de socio, c nómina con ref. RCI-06, d proveedor, e gasto, f otro) * | `concepto_codigo` + `concepto_otro` + `recibo_nomina_id`, con `CHECK` por inciso | sí | Sí. El inciso c) y el b) tienen candado propio |
| 6. Importe entregado * | `importe` | sí | Sí |
| Importe con letra * | derivado | no se teclea | Derivado |
| (fuera del manual) Forma de pago | `forma_pago` | sí | Añadido deliberado: decide si el egreso toca el cajón. Ver la nota de riesgo abajo |
| AUTORIZÓ–GERENTE GENERAL / SOCIO + Fecha | firma | sí | Sí |
| ENTREGÓ–CUSTODIO: nombre, **cargo**, firma + fecha y hora | `usuario_id` + `firmado_en` | sí | Parcial: sin cargo |
| RECIBIÓ–BENEFICIARIO (+ identificación) | firma externa | sí | Sí |
| Hoja impresa | `armarRci05` | — | Sí |

Nota de riesgo sobre `forma_pago`: el papel dice "ningún efectivo puede salir de caja sin este
vale". El modelo permite `TRANSFERENCIA`, y entonces el vale existe pero no aparece en la
Parte II del corte. Es defendible —una transferencia no vacía el cajón— pero significa que el
renglón "Pagos a proveedores / gastos operativos (CACM-RCI-05)" del RCI-07 sólo refleja
efectivo, cosa que el manual no dice. Está documentado en la cabecera de `037`; conviene que
alguien de Tesorería lo confirme por escrito, porque es una interpretación, no una lectura.

### CACM-RCI-06 — Recibo de Pago de Nómina

| Campo del manual | Modelado en | Captura | Estado |
|---|---|---|---|
| 1. Nombre completo del trabajador * | `empleado_id` → `empleado.nombre` | sí | Derivado |
| 2. Puesto | `empleado.puesto` | catálogo de personal | Derivado |
| 3. No. de empleado | `empleado.num_empleado` | sí | Derivado |
| 4. Periodo de pago (del ___ al ___) * | `periodo_inicio`, `periodo_fin` + `UNIQUE(empleado, periodo)` | sí | Sí. La `UNIQUE` impide pagar dos veces el mismo periodo |
| Percepciones: Sueldo / Comisiones / Otras | tres columnas | sí | Sí |
| 5. Total percepciones * | `GENERATED` | no se teclea | Sí |
| Deducciones: ISR / IMSS-INFONAVIT / Otras | tres columnas | sí | Sí |
| 6. Total deducciones * | `GENERATED` | no se teclea | Sí |
| 7. Neto pagado * | `GENERATED`, con `CHECK` de que no sea negativo | no se teclea | Sí |
| Importe con letra * | derivado | no se teclea | Derivado |
| 8. Forma de pago * (Efectivo / Transferencia / Cheque) | `forma_pago` | sí | Sí |
| RECIBÍ CONFORME–TRABAJADOR (+ identificación) | firma externa | sí | Sí |
| ENTREGÓ–CUSTODIO / RH: nombre, **cargo**, firma + fecha y hora | `usuario_id` | sí | Parcial: sin cargo |
| TESTIGO (opcional) + Fecha | firma externa | sí | Sí |
| Hoja impresa | — | — | **No.** Sin armador de PDF. Es el documento que el art. 804 de la LFT obliga a conservar y exhibir |

### CACM-RCI-07 — Corte de Caja Diario

| Campo del manual | Modelado en | Captura | Estado |
|---|---|---|---|
| Sucursal / Turno | `sucursal_id`, `turno text` | sí | Parcial: turno es texto libre sin catálogo, y su `NULL` rompe la `UNIQUE` del día (H9) |
| Fecha del corte * / Folio | `fecha_corte`, folio | sí | Sí |
| Parte I — Ventas de contado (RCI-01) | `armar_corte_caja`, grupo `VENTAS_CONTADO` | jalado | Sí |
| Parte I — Liquidaciones de consigna, utilidad neta (RCI-03) | grupo `UTILIDAD_CONSIGNA` | jalado | Sí, con dos matices: sólo si `afecta_caja_fisica` y sólo si la utilidad es positiva. Una consigna con pérdida desaparece del corte |
| Parte I — Ingresos por servicio (RCI-04) | grupo `SERVICIO` | jalado | Sí |
| **Parte I — Otros ingresos** | — | — | **No.** No hay grupo, y `corte_caja_detalle.origen_documento_id` es `NOT NULL`: un ingreso sin folio es inexpresable (H7) |
| Folio(s) relacionado(s) por renglón | `corte_caja_detalle` | jalado | Sí |
| TOTAL INGRESOS DEL DÍA * | `total_ingresos` | calculado | Sí |
| Parte II — Nómina y comisiones (RCI-05 / RCI-06) | grupo `NOMINA_Y_COMISIONES` | jalado | Sí. Correctamente cuenta el vale y no el recibo, para no duplicar |
| Parte II — Retiro de utilidades por socios | grupo `RETIRO_SOCIOS` | jalado | Sí |
| Parte II — Pagos a proveedores / gastos | grupo `PROVEEDORES_Y_GASTOS` | jalado | Sí, sólo lo pagado en efectivo |
| Parte II — Depósito bancario del día | `deposito_corte_rci07` con institución, cuenta, monto, fecha y comprobante | sí | Sí |
| TOTAL EGRESOS DEL DÍA * | `total_egresos` | calculado | Sí |
| Parte III — Saldo inicial (corte anterior) | `saldo_inicial_corte()` | encadenado | Sí. No se teclea, que es lo correcto |
| Parte III — (=) Saldo que debería existir | `GENERATED` | calculado | Sí |
| Parte III — Efectivo físico contado (arqueo real) | `efectivo_contado` | sí, único dato que se teclea | Sí |
| Parte III — Diferencia (sobrante / faltante) | `GENERATED` | calculado | Sí |
| Ubicación a) En caja física | vista `v_corte_ubicacion_efectivo` | derivado | Sí |
| Ubicación b) Depositado en banco (institución / cuenta / fecha) | `deposito_corte_rci07` | sí | Sí |
| Ubicación c) En tránsito / por depositar | `resguardo_corte_rci07` tipo `TRANSITO` | sí | Sí |
| Ubicación d) Otro resguardo (especificar) | `resguardo_corte_rci07` tipo `OTRO` | sí | Sí |
| Si hay diferencia, explicar | `explicacion_diferencia`, mínimo 10 caracteres | sí | Sí |
| ELABORÓ–CUSTODIO + fecha y hora | firma `ELABORO_CUSTODIO` | sí | Sí, pero **nada obliga** a que sea el mismo que `corte_caja_rci07.custodio_usuario_id` |
| REVISÓ Y AUTORIZÓ–GERENTE GENERAL + Fecha | firma `REVISO_GERENTE`, obligatoria | sí | Sí |
| SOCIO / PROPIETARIO–ENTERADO + Fecha | firma `ENTERADO_SOCIO`, **`obligatoria = false`** | sí | **Divergencia.** El papel marca "(opcional)" sólo en los testigos del 01, 04 y 06. Aquí no lo marca, y la semilla la hizo opcional. El corte cierra sin que ningún socio se dé por enterado |

---

## 3. Las ocho reglas y las cuatro validaciones

Recordatorio del punto 0: esta numeración es reconstruida. La columna "origen en el manual"
cita la línea que la sostiene.

### Reglas

| # | Regla | Origen en el manual | Dónde vive el candado | Prueba que la cubre | Veredicto |
|---|---|---|---|---|---|
| R1 | Folio consecutivo obligatorio, sin huecos, por formato y sucursal | pie de las 7 formas: "Folio consecutivo obligatorio" | `contador_folio_financiero` + `emitir_folio_financiero` con `UPDATE ... RETURNING` que serializa; `UNIQUE (tipo, sucursal, consecutivo)`; el borrador abandonado se cancela con motivo, no se borra | `folios-firmas.test.mts`: "el consecutivo corre por sucursal y por tipo", "tres folios seguidos son 1, 2 y 3 sin huecos", "un folio cancelado conserva su número" | Candado sólido. **Prueba no ejecutada** |
| R2 | La custodia del efectivo se transfiere con la firma del Custodio Financiero, y hasta entonces responde quien entregó | RCI-01 Parte III; RCI-04 Parte III | Firma `RECIBIO_CUSTODIO` con PIN propio; ruta `firmas` fuerza `usuario.id` de la sesión y no acepta firmar por otro; vista `v_custodia_pendiente`; `etiquetaCustodia()` | `formato.test.mts`: "etiquetaCustodia no da por resguardado el dinero que nadie ha aceptado" y "custodiaEstaVencida avisa a partir de las cuatro horas" — ambas sobre TypeScript puro | **Candado sí, cobertura no.** Las dos pruebas que corren verifican etiquetas de pantalla. Que el PIN del custodio sea imprescindible lo prueba `folios-firmas.test.mts` y `antifraude.test.mts` A1, que no se ejecutan. La alerta `CUSTODIA_PENDIENTE` no la levanta nadie (H11) |
| R3 | La utilidad de consigna la calcula el sistema: precio − consignante − gastos | RCI-03 Parte II, renglones 5 a 8 | `utilidad_neta` es `GENERATED ALWAYS ... STORED`; `gastos_total` lo mantiene el trigger `gasto_rci03_recalcula`; corregir exige `ajuste_utilidad_rci03` con nota de 20 caracteres y autor | `reglas-utilidad-egreso.test.mts`, 6 casos, incluido "no admite un UPDATE directo" | Candado excelente. **Prueba no ejecutada** |
| R4 | Ningún egreso sin vale firmado por tres personas distintas | RCI-05 encabezado y Parte III | `firma_requerida` con los 3 roles obligatorios; índice único parcial `(documento_id, usuario_id)`; migración 038 cierra la evasión por "declararse tercero" comparando nombres normalizados en ambas direcciones | `reglas-utilidad-egreso.test.mts`, 6 casos; `antifraude.test.mts` A4 | Candado sólido tras 038. **Prueba no ejecutada.** Y el espejo en TypeScript tiene una prueba que enseña lo contrario: ver punto 4 |
| R5 | El retiro de un socio es anticipo a cuenta de utilidades hasta que un balance las arroje | RCI-05 Parte III; fundamento LGSM art. 19 | `concepto_egreso.es_anticipo_utilidades`; `CHECK` que exige `socio_usuario_id`; vista `v_anticipo_utilidades_socio`; trigger `avisar_retiro_socio_sin_respaldo`; `reparto_utilidades` inmutable | `reglas-socios-corte.test.mts`, 5 casos | Candado correcto y **sin salida**: no hay endpoint ni pantalla para registrar el reparto formal (H5), así que el saldo por comprobar nunca puede bajar en producción. **Prueba no ejecutada** |
| R6 | La consignación no transmite la propiedad: no es inventario propio y obliga a rendir cuentas por el RCI-03 | RCI-02 Parte IV; portada, fundamento Cód. Comercio 273–308 | Trigger `validar_ingreso_vehiculo_rci02` contra `expediente.origen`; `validar_liquidacion_rci03` exige tipo `CONSIGNACION` y RCI-02 ya `FIRMADO`; `UNIQUE (ingreso_rci02_id)` | `reglas-utilidad-egreso.test.mts`: "no se liquida como consigna una unidad que entró por compra directa" y "no se liquida contra un ingreso que aún no está firmado" | Candado sólido. **Prueba no ejecutada.** El plazo de consignación (campo 19) no lo vigila nada |
| R7 | El corte concentra los folios del día y toda diferencia se explica o el día no cierra | RCI-07 Parte I a III y declaración final | `armar_corte_caja` (jala, no recaptura); `cerrar_corte_caja` exige explicación ≥10 si hay diferencia y levanta alerta `GRAVE` en faltante / `AVISO` en sobrante; `folios_sin_firmar_del_dia`; migración 038 congela la cabecera al cerrar, no al firmar | `reglas-socios-corte.test.mts`, 6 casos; `antifraude.test.mts` A6 | Candado bueno con tres agujeros reales: la frontera del día es UTC (H6), el barrido de folios sin firmar ignora el RCI-03 y usa `creado_en` (H8), y dos cortes del mismo día conviven si el turno va vacío (H9). **Prueba no ejecutada** |
| R8 | Sin tachaduras ni enmendaduras; conservar sin alteraciones; la corrección se hace con un complementario | RCI-01 instrucción de llenado y nota de pie ("conservar sin alteraciones por al menos 5 años") | `bloquear_mutacion` en documento, historial, firmas, sellos y repartos; `bloquear_detalle_documento_fin` en las 8 tablas de detalle; `complementa_a` con `UNIQUE` y sólo sobre firmado; migración 038 protege las tablas con banderas locales a la transacción | `folios-firmas.test.mts`: "tras FIRMADO el contenido del detalle no admite UPDATE", "el complementario hereda tipo y sucursal", "sólo se complementa un documento ya firmado"; `antifraude.test.mts` A2 y A7 | Candado sólido **después** de firmar; abierto **durante** la firma (H3), y la huella que debería delatarlo no cubre el contenido en el RCI-02 y el RCI-03 (H2) ni se compara nunca (H4). No hay política de retención a 5 años. **Prueba no ejecutada** |

### Validaciones

| # | Validación | Origen en el manual | Dónde vive | Prueba | Veredicto |
|---|---|---|---|---|---|
| V1 | Los campos con (*) son obligatorios | instrucción de llenado de las 7 formas | `NOT NULL` y `CHECK` de longitud en cada tabla de detalle; espejo en los esquemas zod de `cobranza/consignacion/egresos/corte` para señalar el campo exacto | ninguna directa | **Sin prueba.** Y el candado tiene un hueco: un folio puede llegar a `FIRMADO` sin ninguna fila de detalle (H10), con lo cual todos los obligatorios están ausentes y nada protesta |
| V2 | El desglose de denominaciones debe sumar el importe declarado | RCI-01 Parte II frente al renglón 10 | `validar_arqueo_rci01`, invocada en `enviarAFirma` y —desde 038— dentro de `validar_firma_admisible`, que es la vía que no se puede saltar | `antifraude.test.mts` A3 | Candado correcto tras 038. **Prueba no ejecutada.** Sale sin error si no existe la fila del recibo |
| V3 | El importe con letra debe corresponder al importe en número | RCI-01, 04, 05 y 06: "Importe con letra *" | No se valida: se **deriva**. `importeEnCasillas().letra` lo produce desde la cifra y nadie lo teclea | `formato.test.mts`: "importeEnCasillas escribe el importe con letra que exigen RCI-01, 04, 05 y 06", más `numeros.test.mts` | **La única de las doce que está cubierta por una prueba que efectivamente corre.** Y es la forma más fuerte de resolverla: si nadie lo teclea, no puede discrepar |
| V4 | El VIN se escribe a 17 caracteres, un carácter por casilla | RCI-01 campo 7; RCI-02 campo 4 | `esquemaVin` + `vinEsValido` (17, sin I/O/Q); en la base, FK a `unidad(vin)` | `formato.test.mts`, 7 casos sobre `casillasVin`/`vinEsValido` | Cubierta y ejecutada. Matiz: el largo lo impone TypeScript, no la base; `unidad.vin` sí es la autoridad de existencia pero no del formato |

Resumen de cobertura efectiva: de doce reglas y validaciones, **dos** (V3 y V4) tienen prueba que
se ejecuta hoy, y ambas son de presentación. Las diez que mueven dinero dependen de pruebas que
existen, están bien escritas y no corren.

---

## 4. Pruebas que no prueban lo que dicen

**4.1. Las 44 pruebas de integración se saltan en silencio.**

Los cuatro archivos que prueban los candados abren con:

```
const SIN_BASE = URL_PRUEBAS ? false : "sin DATABASE_URL_TEST";
```

y cada `test()` lleva `{ skip: SIN_BASE }`. `DATABASE_URL_TEST` no está en `.env`, no está en
`.env.example` y no hay `.github/workflows` que la fije. Medición de hoy:

| Archivo | Pasan | Se saltan |
|---|---|---|
| `antifraude.test.mts` | 0 | 7 |
| `folios-firmas.test.mts` | 0 | 14 |
| `reglas-socios-corte.test.mts` | 0 | 11 |
| `reglas-utilidad-egreso.test.mts` | 0 | 12 |
| `calculos.test.mts` | 30 | 0 |
| `formato.test.mts` | 21 | 0 |
| **`npm test`** | **65** | **44** |

`npm test` sale con `fail 0` y da la impresión de un módulo probado. Lo que corre es
exclusivamente TypeScript puro: aritmética de centavos y formato de presentación. Ninguna
prueba ejecutada toca un `CHECK`, un trigger, un índice único ni una función plpgsql, que es
donde vive el 100 % de la fuerza del módulo. Esto no es un defecto de las pruebas —están bien
construidas, usan `SAVEPOINT` para que un error no arrastre a la siguiente, y `totalesEsperados`
lee una tabla de expectativas declarada en el fixture en lugar de reimplementar el filtro de
`armar_corte_caja`, que es exactamente como debe hacerse—. Es un defecto de arranque: el
interruptor está apagado y nada avisa.

**4.2. Una prueba concreta que acaba probando lo contrario de lo que dice.**

`src/lib/finanzas/calculos.test.mts:219`

```
test("estadoValeEgreso no confunde dos terceros presenciales con un firmante repetido", ...)
```

Construye un vale con `AUTORIZO_GERENTE: usuarioId 4`, `ENTREGO_CUSTODIO: usuarioId null` y
`RECIBIO_BENEFICIARIO: usuarioId null`, y afirma `completo: true`.

El problema es que ese estado no puede existir: en `rol_firmante`, `ENTREGO_CUSTODIO` tiene
`exige_usuario_interno = true` (migración 034, línea 206), y `firmar_documento_externo` lo
rechaza con "El rol % corresponde a personal de la empresa". Es decir, la prueba afirma que es
válido justo el escenario del ataque A4 —un rol interno levantado como firma presencial sin
usuario atribuible—, que la migración 038 se escribió para cerrar. La prueba pasa, pero lo que
demuestra es que `estadoValeEgreso()` **no** implementa la regla 4: no verifica que los roles
internos tengan usuario, sólo cuenta duplicados entre los `usuarioId` no nulos, y por
construcción los terceros nunca colisionan. Como ayuda de pantalla es inofensivo; como prueba
titulada "regla 4" es engañoso, y es la única prueba de la regla 4 que hoy se ejecuta.

**4.3. El resto de `calculos.test.mts` prueba el espejo, no el candado.**

Las 30 pruebas que corren verifican `utilidadConsigna`, `posicionSocio` y `arqueoCorte`. El
propio encabezado de `calculos.ts` lo dice: "La autoridad sobre estos números es la base de
datos". Son reimplementaciones para poder dibujar antes de guardar. Probarlas es correcto y
útil —la aritmética en `BigInt` sobre centavos merece cobertura—, pero titularlas "Regla 3",
"Regla 5" y "Regla 7" hace pensar que la regla está cubierta cuando lo cubierto es su copia.
Si mañana alguien borrara la palabra `GENERATED` de `utilidad_neta`, las 30 seguirían en verde.

---

## 5. Qué queda pendiente

Ordenado por lo que evita perder dinero primero.

**Bloqueante**

1. Encender las pruebas: fijar `DATABASE_URL_TEST` y hacer que la ausencia de base **falle**
   en lugar de saltar, o al menos que un caso centinela falle. Un `skip` silencioso sobre 44
   pruebas de control interno es peor que no tenerlas, porque tranquiliza.
2. Extender `hashDelDocumento` a `CACM-RCI-02` y `CACM-RCI-03` (H2). Hoy el caso `default`
   firma una cabecera.
3. Verificar que todas las firmas de un folio compartan `hash_contenido`, y negarse a cerrar
   —o al menos marcar el folio— cuando difieran (H3, H4). Es barato: la comparación cabe en
   `cerrar_si_firmas_completas`.
4. Endpoint y pantalla para `registrarRepartoUtilidades` (H5). Sin eso la regla 5 sólo sabe
   acusar, nunca absolver.

**Alto**

5. Fijar la zona horaria de la conexión, o guardar en el corte la zona con la que se calculó el
   día (H6).
6. Añadir "Otros ingresos" al RCI-07: hace falta un renglón de detalle que admita
   `origen_documento_id` nulo con concepto y explicación obligatorios (H7).
7. Incluir el `CACM-RCI-03` en `folios_sin_firmar_del_dia` y decidir de una vez si el día se
   define por `creado_en` o por la fecha del hecho, para las dos consultas a la vez (H8).
8. Cerrar la `UNIQUE` del corte: `NULLS NOT DISTINCT` o un turno por omisión no nulo (H9).
9. Impedir el paso a `PENDIENTE_DE_FIRMA` cuando no exista la fila de detalle del tipo (H10).

**Medio**

10. Endpoint y pantalla para `atenderAlerta`, y quien levante la alerta `CUSTODIA_PENDIENTE`
    que hoy sólo está declarada (H11).
11. Armadores de PDF para RCI-02, 03, 04 y 06 (H12). Empezar por el 06 por la LFT art. 804.
12. Decidir qué se hace con la identificación oficial y el cargo de los firmantes internos:
    o se modelan, o se documenta por qué el usuario y el PIN los sustituyen. Hoy el manual pide
    un dato que el sistema no puede guardar.
13. Ofrecer `complementaA` desde la pantalla y pintar la casilla "Inicial / Complementario" del
    RCI-01 en el PDF; hoy el mecanismo de corrección sin tachaduras existe y no se alcanza.
14. Capturar `folio_relacionado_id` en el RCI-05 y `documento_venta_id` en el RCI-01 y el
    RCI-03: las tres columnas están, ninguna se llena.

**Bajo, pero anotado**

15. Vigilancia del plazo de consignación (RCI-02 campo 19), hoy un dato muerto.
16. Unicidad de `orden_servicio` en el RCI-04.
17. Pantalla para el ajuste de utilidad del RCI-03 (la ruta ya existe).
18. Administración de `concepto_cobro`, `concepto_egreso` y `forma_pago_fin` desde la pantalla
    de catálogos: la migración 035 los hizo tablas y no enums precisamente para no exigir un
    despliegue, y hoy dar de alta un concepto sigue exigiendo un `INSERT` a mano.
19. Amarrar `corte_caja_rci07.custodio_usuario_id` con quien firma `ELABORO_CUSTODIO`.
20. Revisar con Tesorería dos decisiones de interpretación que el código tomó solo: que
    `ENTERADO_SOCIO` sea firma opcional en el RCI-07, y que un vale pagado por transferencia no
    aparezca en la Parte II del corte.
21. `trazo_ruta` está en la tabla, `react-signature-canvas` está en `package.json`, y ninguna
    pantalla de finanzas levanta un trazo. O se usa o se documenta que la rúbrica autógrafa vive
    en el papel.
22. No hay política de conservación a 5 años, que el pie de las siete formas exige.

---

## 6. Qué se cerró después de la auditoría

Añadido el 2026-07-28, después del informe. Las correcciones de base viven en
`migrations/039_finanzas_huecos_auditoria.sql`; el resto, en el código que se cita.

### Cerrados

| # | Cómo quedó |
|---|---|
| H2 | `hashDelDocumento` cubre ya el RCI-02 y el RCI-03 (`contenido.ts`). El caso `default` sigue existiendo, pero ahora los siete formatos están enumerados antes que él, de modo que agregar un octavo obliga a decidir qué se firma de él en vez de caer en la cabecera por descuido |
| H3 | Disparador `firma_exige_mismo_contenido` sobre `firma_documento_financiero`: la segunda firma se rechaza si la huella no coincide con la de la primera. Va como disparador y no dentro de `firmar_documento_*` por la misma razón que la 038 — el candado que sólo vive en la función protege a quien la llama |
| H4 | Vista `v_firma_discrepante` para los folios que ya traigan la divergencia, y aviso en rojo en la pantalla del documento cuando sus firmas no comparten huella |
| H6 | `sucursal.zona_horaria`, validada contra el catálogo IANA por disparador. `armar_corte_caja` y `folios_sin_firmar_del_dia` miden el día con `AT TIME ZONE`, y cada corte guarda en `zona_horaria` la que se usó para armarlo, así que un corte viejo se relee con su propia frontera aunque la agencia se mude |
| H7 | `corte_caja_detalle.origen_documento_id` admite nulo, con `CHECK` que entonces exige concepto de ≥10 caracteres y quién lo capturó. `agregar_otro_ingreso_corte` + `POST /api/finanzas/cortes/[id]/otros-ingresos`. `armar_corte_caja` ya no borra los renglones sin folio al rearmar: no tendría de dónde volver a leerlos |
| H8 | El RCI-03 entra al barrido, y las dos consultas —la que suma y la que bloquea— miden por la fecha del hecho en la zona de la sucursal. Un borrador todavía sin detalle cae de vuelta a `creado_en` para que no se escape |
| H9 | El turno vacío se normaliza a cadena vacía y la unicidad pasa a índice sobre `(sucursal_id, fecha_corte, turno)`. Dos cortes del mismo día ya no conviven |
| H10 | `documento_fin_tiene_detalle()`, exigida en `cambiar_estado_documento_fin` al pasar a `PENDIENTE_DE_FIRMA` y otra vez en `cerrar_si_firmas_completas`. Un folio ya no llega a firmado en blanco |
| H12 | Los siete formatos imprimen. `ARMADORES` dejó de ser parcial: es un `Record` completo sobre `TipoRci`, así que un formato nuevo sin hoja no compila |
| H5 | `POST /api/finanzas/repartos` y la pantalla `/finanzas/repartos`, con la posición de cada socio. La regla 5 ya puede absolver, no sólo acusar |
| H11 | `POST /api/finanzas/alertas/[id]/atender` y la acción en el panel, con nota obligatoria |

Un efecto secundario que conviene registrar, porque es el que más dice del estado en que
estaba el módulo: al aplicar la 039 a la base de pruebas, **30 de las 109 pruebas
empezaron a fallar**. Ninguna por un defecto de la migración. Los fixtures montaban
exactamente los dos estados que los candados nuevos vuelven imposibles —un folio firmado
sin detalle (`reciboFirmado`, cuyo comentario lo decía con todas sus letras) y firmas del
mismo folio con huellas distintas (`hashDe(documentoId, rol)`, un hash por rol)—. Es decir,
las pruebas llevaban meses describiendo como normal lo que la auditoría encontró como
hueco. Se corrigieron los fixtures, no los candados.

### El punto 4: las pruebas

| Hallazgo | Cómo quedó |
|---|---|
| H1 · 44 pruebas saltadas en silencio | Un caso centinela por suite que **falla** cuando no hay base, con el título diciendo qué regla del manual queda sin probar y el comando exacto para levantarla. El salto sigue siendo posible, pero ya no por omisión: hay que pedirlo con `PERMITIR_PRUEBAS_SIN_BASE=1`, y aun así queda anotado. Documentado en `.env.example` y en el README |
| 4.2 · la prueba que demostraba lo contrario de su título | `estadoValeEgreso` no implementaba la regla 4 —contaba duplicados entre `usuarioId` no nulos, y los nulos nunca colisionan—. Se le añadió `EXIGE_USUARIO_INTERNO_VALE`, espejo de la 034, y el caso engañoso se sustituyó por dos correctos. Además hay dos pruebas nuevas contra Postgres: una le pregunta a `firma_requerida` + `rol_firmante` si el espejo sigue coincidiendo, para que la copia no derive del original en silencio |
| 4.3 · pruebas del espejo tituladas como el candado | Retituladas: cada apartado dice ahora dónde vive el candado real y qué suite lo cubre. No se borró ninguna |

Cobertura después de todo esto: **117 pruebas, 117 pasan, 0 saltadas**. Las ocho nuevas
cubren, entre otras cosas, el ataque H3+H4 completo —la vendedora firma 5 000, alguien baja
la cifra a 3 000 *cuadrando el arqueo* para que no lo delate `validar_arqueo_rci01`, y la
segunda firma se rechaza— y el folio en blanco de H10.

### Sigue abierto

De la lista del punto 5 quedan pendientes los puntos 12 a 22, más:
- **Punto 12** —cargo e identificación oficial de los firmantes internos— no se puede
  cerrar desde la hoja impresa, que es donde se notó: el `CHECK` de
  `firma_documento_financiero` prohíbe `firmante_id_*` cuando el método es `PIN_USUARIO`.
  O se modela, o se documenta por qué el usuario y el PIN los sustituyen. Es una decisión
  de la empresa, no del código.
- **Punto 20** sigue esperando a Tesorería: que `ENTERADO_SOCIO` sea firma opcional en el
  RCI-07 y que un vale pagado por transferencia no aparezca en la Parte II del corte son
  dos interpretaciones que el código tomó solo.
- **Punto 22**, la conservación a cinco años que el pie de las siete formas exige, no
  tiene todavía política escrita ni mecanismo.
