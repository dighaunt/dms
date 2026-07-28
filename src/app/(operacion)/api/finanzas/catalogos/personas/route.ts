import { requerirUsuario } from "@/lib/api";
import {
  creado,
  cuerpo,
  numeroDeConsulta,
  requerirNivelMinimo,
  responder,
  textoDeConsulta,
} from "@/lib/finanzas/api";
import {
  type EntradaCrearPersona,
  type FiltroPersonas,
  crearPersona,
  listarPersonas,
} from "@/lib/finanzas/personas";

/**
 * Catálogo de personas: a quién se le paga o de quién se recibe.
 *
 * Leerlo basta con tener sesión —el buscador del beneficiario de un vale se
 * arma con esto y sin él la captura vuelve al texto libre, que es lo que hacía
 * imposible sumar cuánto se le ha pagado a un proveedor—. Escribirlo pide N3,
 * el mismo nivel que ya piden las otras dos rutas de este catálogo
 * (sucursales y personal): dar de alta gente a la que la empresa paga de forma
 * recurrente es administración del sistema, no captura de operación.
 */
const MENSAJE_N3 =
  "Solo un administrador global (N3) puede dar de alta personas en el catálogo de beneficiarios";

/**
 * Búsqueda para el combobox del beneficiario.
 *
 * `busqueda` es parte del nombre, sin distinguir mayúsculas. `categoria`
 * acota el selector (proveedores, empleados…) y `limite` lo recorta, porque
 * quien llama esto suele ser un cuadro de texto que se refresca en cada tecla.
 * `incluirInactivas=1` es para la pantalla de administración: una captura
 * nueva sólo debe poder elegir a quien sigue dado de alta.
 */
export async function GET(request: Request) {
  const { error } = await requerirUsuario();
  if (error) return error;

  const url = new URL(request.url);
  const filtro = {
    busqueda: textoDeConsulta(url, "busqueda"),
    categoria: textoDeConsulta(url, "categoria"),
    soloActivas: textoDeConsulta(url, "incluirInactivas") !== "1",
    limite: numeroDeConsulta(url, "limite"),
  } as FiltroPersonas;

  return responder(() => listarPersonas(filtro));
}

/**
 * Alta de una persona.
 *
 * El cuerpo viaja sin remodelar: la autoridad de validación es
 * `esquemaCrearPersona` del servicio. Dos personas no pueden compartir
 * identificación oficial —el índice único lo impide y llega como 409—, porque
 * un catálogo con duplicados deja de servir para lo único que se creó: saber
 * cuánto se le ha pagado a alguien.
 *
 * Quien da el alta sale de la sesión y jamás del cuerpo. No confundir con
 * `usuarioId`, que es de quién es la ficha y sólo existe cuando esa persona
 * además opera el sistema.
 */
export async function POST(request: Request) {
  const { usuario, error } = await requerirNivelMinimo("N3", MENSAJE_N3);
  if (error) return error;

  const datos = (await cuerpo(request)) as EntradaCrearPersona;

  return responder(() => crearPersona(datos, usuario.id), creado);
}
