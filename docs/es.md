# OCEA Smart Building

Lee los contadores de su vivienda desde el **espacio de residente de OCEA
Smart Building** (<https://espace-resident.ocea-sb.com>): agua fría, agua
caliente y calefacción, cuando OCEA lee a distancia los contadores de su
edificio.

> **Sin relación con OCEA Smart Building.** OCEA no ofrece una API pública:
> la integración lee el portal como lo hace su navegador, y puede dejar de
> funcionar si OCEA lo modifica.
>
> **Desarrollada sin cuenta: sus comentarios son bienvenidos.** Cuéntenos en
> el foro de Gladys lo que ve, sobre todo si su calefacción se mide con
> repartidores de costes.

## Lo que obtiene

Un dispositivo por vivienda de su cuenta (varios si tiene varias), con una
funcionalidad por fluido mostrado en el portal:

| Funcionalidad                        | Unidad     | Observaciones                                |
| ------------------------------------ | ---------- | -------------------------------------------- |
| Agua fría                            | m³         | índice acumulado                             |
| Agua caliente                        | m³         | índice acumulado                             |
| Calefacción (energía)                | kWh        | con un contador de energía térmica (CETC)    |
| Calefacción (unidades de repartidor) | sin unidad | con repartidores de costes en los radiadores |

**¿Contador de energía o repartidores?** Un contador de energía térmica (CETC)
mide la energía que recibe la vivienda, en kWh. Los repartidores de costes de
calefacción, uno por radiador, no miden energía: cuentan **unidades** que solo
indican qué parte de la factura de calefacción del edificio corresponde a la
vivienda. Por eso la integración presenta las unidades de repartidor como un
simple contador sin unidad, nunca en kWh.

## Configuración

1. Abra la pestaña **Configuración** de la integración.
2. Introduzca el **correo electrónico** y la **contraseña** de su espacio de
   residente de OCEA. Sus viviendas se encuentran a partir de la cuenta.
3. Ajuste si es necesario el **intervalo de lectura** (6 horas por defecto, de
   1 a 24) y el **idioma** de los nombres de los contadores.
4. Pulse **Guardar configuración**, abra la pestaña **Descubrir** y añada su
   vivienda con **Añadir a Gladys**.

El botón **Probar la conexión y leer ahora** se conecta de inmediato a OCEA e
indica el número de viviendas y de contadores encontrados.

## Frecuencia de las lecturas

Los contadores de OCEA envían su índice una vez, o algunas veces, al día. La
integración lee el portal **cada 6 horas por defecto**, como máximo cada hora:
leer más a menudo no aporta datos más recientes y solo carga el portal. La
última lectura se conserva: reiniciar Gladys no vuelve a leer OCEA antes del
final del intervalo. Un valor que no cambia se envía de nuevo a Gladys al
menos cada 12 horas, para que nunca aparezca «Sin valor reciente».

## Gráficos y supervisión de energía

- **Agua**: el índice de cada contador se guarda en el historial de la
  funcionalidad y se traza en el gráfico del dispositivo.
- **Calefacción en kWh (CETC)**: el índice es el de un contador de energía,
  que la supervisión de energía de Gladys convierte por sí misma en consumo
  por media hora y en coste. Gladys coloca un nuevo índice de energía **bajo
  su contador eléctrico principal** (si está definido): en **Integraciones →
  Supervisión de energía**, coloque el índice de la calefacción en **sin padre
  (raíz)**; si no, su calefacción se suma a su electricidad. Como el índice
  llega cada pocas horas, el consumo de esas horas cae en una sola media hora.
- **Calefacción en unidades de repartidor**: solo un gráfico de historial del
  contador. Estas unidades no son energía y no entran en la supervisión de
  energía.

## Widget del panel

El widget **Consumo OCEA** muestra, para la vivienda elegida, el consumo del
mes en curso por fluido. La integración lo calcula a partir de los índices
leídos: el primer mes solo cuenta a partir de la primera lectura, y el widget
indica desde cuándo cuenta.

## Límites

- Solo lo que muestra el panel del portal: un valor por fluido, sin detalle
  por radiador ni por contador, sin alertas.
- Las lecturas tienen el retraso de las de OCEA (a menudo el día anterior).
- La integración se desarrolló sin cuenta: el caso de los repartidores, en
  particular, se basa en hipótesis. Sus comentarios ayudan.

## Privacidad

El correo electrónico y la contraseña permanecen en la configuración de
Gladys. La integración guarda el token de sesión de OCEA y las últimas
lecturas en su volumen `/data`, y nunca escribe identificadores ni tokens en
sus registros.

## En caso de problema

- **«OCEA ha rechazado el correo electrónico o la contraseña»**: compruébelos
  en el portal y guárdelos de nuevo. Mientras tanto, la integración deja de
  intentarlo, para no bloquear nunca su cuenta.
- **«El portal de OCEA no ha respondido»**: puede que OCEA esté en
  mantenimiento. La integración lo vuelve a intentar en 30 minutos.
- Abra la pestaña **Registros** de la integración para ver lo que ha pasado.
  Una lectura normal no escribe nada: solo aparecen el inicio, la conexión a
  OCEA, los errores (una línea cuando aparecen, otra cuando todo vuelve a
  funcionar) y sus acciones.
