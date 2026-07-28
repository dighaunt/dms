/**
 * Iconos Silk.
 *
 * QUÉ SON. Los famfamfam Silk de Mark James (2006), recreados en SVG por frhun
 * en `frhun/silk-icon-scalable`. Se eligieron por ser el pariente vivo de Fugue
 * Icons —misma época, misma rejilla de 16 px, mismo carácter de icono de
 * escritorio a color— pero en vector, así que no se ven borrosos como se verían
 * los PNG originales en cualquier pantalla moderna.
 *
 * POR QUÉ UN SPRITE Y NO UN COMPONENTE POR ICONO. Cada icono trae degradados
 * declarados con `id`. Inlinear el mismo SVG dos veces en una página duplica
 * esos id, y el navegador resuelve `url(#…)` contra el PRIMERO que encuentra:
 * el segundo icono saldría pintado con los colores del primero. En un sprite
 * cada símbolo se define UNA vez y se reutiliza con `<use>`, así que el problema
 * no existe. Los id van además prefijados por alias, por si dos iconos
 * distintos usaran el mismo nombre interno.
 *
 * POR QUÉ ARCHIVO ESTÁTICO Y NO INCRUSTADO. El sprite pesa 275 KB. Incrustarlo
 * en el layout lo mandaría con CADA respuesta HTML; como archivo se pide una
 * sola vez y el navegador lo guarda en caché para toda la sesión.
 *
 * LO QUE ESTOS ICONOS NO HACEN. Traen su color propio —entre diez y veintiún
 * tonos cada uno—, de modo que NO heredan `currentColor`: no se tiñen de rojo
 * cuando algo falla ni de gris cuando un botón se deshabilita. Para el mueble de
 * la interfaz —chevrones, la equis de cerrar, la palomita de una casilla, las
 * flechas— se sigue usando un juego monocromo, que además es lo que los
 * componentes de base traen incrustado. Así funcionaban los programas de esa
 * época: iconos de aplicación a color, controles en gris.
 *
 * LO QUE SILK NO TIENE, y hay que resolver con el juego monocromo: persona,
 * usuario y grupo —la ausencia que más pesa en un sistema con pantallas de
 * personal y socios—, flechas, chevrones, ojo, y salir.
 *
 * LOS ALIAS NOMBRAN EL DIBUJO, NO EL ARCHIVO. Los nombres originales de Silk
 * engañan en varios casos, y confiar en ellos ya costó un error: `error.svg` es
 * un TRIÁNGULO ÁMBAR y `exclamation.svg` un CÍRCULO ROJO —al revés de lo que
 * sugieren—. Aquí se llaman `advertencia` y `alerta` respectivamente, que es lo
 * que se ve. Mismo criterio con `cesta` (una cesta de compra, no una caja de
 * efectivo) y `letreroNuevo` (el cartel naranja de NEW, que no sirve para
 * "crear"). En un sistema donde el color comunica gravedad, un alias que miente
 * acaba poniendo ámbar en un faltante de caja.
 *
 * LICENCIA CC-BY-SA 3.0: exige crédito visible a Mark James y a frhun, y la
 * cláusula ShareAlike alcanza a cualquier icono que se modifique. El crédito lo
 * pone `CreditoIconos`.
 */

/** Alias en español; el nombre original de Silk queda dentro del sprite. */
export const ICONOS_SILK = [
  "inicio", "expedientes", "finanzas", "reportes", "catalogos", "manuales", "riesgo", "sucursal",
  "dinero", "monedas", "peso", "cesta", "documento", "copia", "hoja", "hojaOk", "hojaMal", "guion",
  "nota", "tabla", "formulario", "listado", "calendario", "fecha", "reloj", "imprimir", "guardar",
  "paquete", "adjuntar", "enlace", "editar", "campo", "buscar", "lupa", "agregar", "quitar",
  "cancelar", "cerrar", "correcto", "palomita", "advertencia", "alerta", "informacion", "ayuda",
  "aviso", "idea", "enLinea", "fueraDeLinea", "alto", "candado", "llave", "baseDatos", "servidor",
  "disco", "grafica", "pastel", "tendencia", "sello", "estrella", "herramienta", "defecto",
  "etiquetaAzul", "etiquetaVerde", "etiquetaRoja", "etiquetaNaranja", "etiquetaAmarilla",
  "comentario", "correo", "imagen", "mundo", "capas", "monitor", "caja3d", "pestana", "letreroNuevo",
] as const;

export type NombreIconoSilk = (typeof ICONOS_SILK)[number];

/**
 * Un icono Silk.
 *
 * Lleva `aria-hidden` por omisión porque casi siempre acompaña a un texto que ya
 * dice lo mismo, y repetirlo con un lector de pantalla es ruido. Cuando el icono
 * va SOLO —un botón que no es más que el icono— hay que pasarle `titulo`, que lo
 * vuelve visible para la accesibilidad.
 *
 * El tamaño por omisión son 16 px, que es la rejilla para la que estos iconos
 * fueron dibujados y donde mejor se leen.
 */
export function IconoSilk({
  nombre,
  tamano = 16,
  titulo,
  className,
}: {
  nombre: NombreIconoSilk;
  tamano?: number;
  titulo?: string;
  className?: string;
}) {
  return (
    <svg
      width={tamano}
      height={tamano}
      className={className}
      role={titulo ? "img" : undefined}
      aria-hidden={titulo ? undefined : true}
      aria-label={titulo}
      focusable="false"
    >
      {titulo && <title>{titulo}</title>}
      <use href={`/silk.svg#silk-${nombre}`} />
    </svg>
  );
}

/**
 * Crédito de la licencia. No es cortesía: la CC-BY-SA 3.0 lo exige, y va en un
 * sitio donde alguien pueda encontrarlo —el pie de la aplicación o la página de
 * documentación—, no escondido en un comentario del código.
 */
export function CreditoIconos({ className }: { className?: string }) {
  return (
    <p className={className}>
      Iconos{" "}
      <a
        href="http://www.famfamfam.com/lab/icons/silk/"
        target="_blank"
        rel="noreferrer noopener"
        className="underline"
      >
        Silk
      </a>{" "}
      de Mark James, recreados en vector por{" "}
      <a
        href="https://github.com/frhun/silk-icon-scalable"
        target="_blank"
        rel="noreferrer noopener"
        className="underline"
      >
        frhun
      </a>
      . Licencia CC-BY-SA 3.0.
    </p>
  );
}
