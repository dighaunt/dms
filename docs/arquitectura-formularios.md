# Motor documental de formularios PDF

## Fuente de verdad

- Los maestros oficiales viven en `public/formatos/*.pdf` y conservan su AcroForm.
- `scripts/extraer_catalogo_pdfs.py` inspecciona campos, widgets, opciones, páginas y acciones JavaScript y genera `src/lib/formularios/catalogo-generado.json`.
- `src/lib/formularios/catalogo.ts` añade semántica de negocio: datos de sistema, datos reutilizables, derivados, cardinalidades y dependencias.
- La aplicación no ejecuta JavaScript arbitrario del PDF. Reproduce en el servidor las reglas útiles (miles, moneda en letra, observaciones y dependencias) y conserva los scripts originales en el archivo resultante.

El inventario actual contiene 15 formatos y 567 campos operativos. Los botones de impresión o navegación del PDF no se presentan como datos del wizard.

Cuando cambie una revisión oficial, regenere el catálogo con:

```bash
python3 -m pip install pypdf pdfplumber
python3 scripts/extraer_catalogo_pdfs.py
```

El generador es determinista: el mismo paquete PDF produce el mismo JSON.

## Resolución de un campo

El orden es deliberado:

1. Snapshot del documento cuando el hecho ya quedó cerrado.
2. Dato maestro del sistema (folio, VIN, unidad, fechas y estado F-06).
3. Valor ya capturado para el campo.
4. Dato reusable del expediente (por ejemplo, RFC del comprador).
5. Regla condicional (`NO APLICA`, `SIN OBSERVACIONES`).
6. Derivado determinista (por ejemplo, importe con letra).

Un PDF final sólo se genera cuando cada campo operativo tiene valor. Las alternativas no elegidas de checkbox se resuelven como `Off`; eso es un valor explícito, no un hueco.

## Normalización

La migración `011_captura_formularios.sql` evita un documento JSON monolítico y separa relaciones independientes:

- `expediente_dato`: un concepto reusable por expediente.
- `documento_captura`: estado del proceso de captura.
- `documento_campo_valor`: snapshot actual de cada campo del documento.
- `expediente_dato_hist` y `documento_campo_valor_hist`: hechos históricos append-only.

Cada tabla tiene valores atómicos (1FN), depende de su clave completa (2FN), no mezcla dependencias transitivas (3FN), y sus determinantes funcionales son claves candidatas (BCNF). Los hechos multivaluados e históricos están separados (4FN). No se empaquetan relaciones independientes en una relación ternaria que luego requiera dependencias de reunión adicionales (5FN).

Los tipos se conservan en SQL mediante `TEXTO`, `NUMERO`, `FECHA`, `BOOLEANO` y `OPCION`, con un `CHECK` que permite exactamente una columna de valor compatible. Un trigger impide cambiar la captura después de que existe un escaneo y otro registra cada versión antes de ese cierre.

## Reglas críticas verificadas

- C-02 sin garantía rellena días, kilómetros y cobertura con `NO APLICA` y guiones.
- C-02 con garantía exige los tres datos.
- C-04 sin seguro cierra el número de póliza con `NO APLICA`.
- Importes generan texto como `UN MIL TRESCIENTOS PESOS 00/100 M.N.`.
- Fechas de captura se guardan tipadas y se presentan como `10 JULIO 2026`, con año de cuatro dígitos.
- Teléfonos exigen exactamente 10 dígitos; RFC, CURP, correo, hora y fecha se validan por patrón y longitud.
- Observaciones vacías se convierten en `SIN OBSERVACIONES`.
- F-06 toma su estatus de la máquina de estados del expediente y marca una sola opción.
- Los grupos que representan una sola elección, aunque el PDF original use checkboxes, se validan con cardinalidad exacta.
- Los campos de texto libre se cierran con guiones ASCII en función del ancho real del widget.
