# US Wildfires

Siga desde Gladys los incendios forestales activos alrededor de su casa en Estados Unidos, con los datos
oficiales del [National Interagency Fire Center](https://www.nifc.gov) (NIFC): los incidentes y los
perímetros cartografiados de WFIGS (Wildland Fire Interagency Geospatial Services), de dominio público,
actualizados cada pocos minutos. Sin cuenta ni clave de API.

Para cada incendio de su radio: su nombre, su distancia (al borde de su perímetro cartografiado cuando
existe), su superficie, su contención, su condado y su estado.

No es un servicio de alerta oficial: en caso de emergencia, siga a sus autoridades locales, las alertas de
emergencia de su condado y las órdenes de evacuación. Sin afiliación con el NIFC, el US Forest Service ni
ninguna otra agencia.

## Lo que obtiene

- Un dispositivo **Incendios alrededor de la casa**: número de incendios en el radio, distancia del
  incendio más cercano, el incendio más cercano en palabras y la superficie quemada total, con su
  historial.
- Un **widget de panel** que lista los incendios del más cercano al más lejano, con su superficie y su
  contención.
- Tres **desencadenantes de escena**: un nuevo incendio en el radio, un incendio que se acerca (a menos de
  la distancia de alerta), un incendio contenido al 100 %.
- Una **acción de escena** que lee los incendios cercanos en una frase, para enviarla por mensaje o leerla
  en voz alta.

## Requisitos

- Gladys Assistant 5.3 o posterior.
- Acceso a Internet desde el equipo de Gladys (la integración lee `services3.arcgis.com`, el servicio
  ArcGIS del NIFC).
- Una ubicación para su casa en Gladys (Ajustes → Casas), o coordenadas introducidas en la configuración.
  Los datos solo cubren Estados Unidos (y Puerto Rico).

## Configuración

### Ajustes

| Ajuste                                    | Función                                                                                                         |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Latitud y longitud del centro             | Centro de la zona. Déjelas vacías para usar la ubicación de su casa. Se acepta la coma decimal.                 |
| Radio                                     | 10, 25, 50 (por defecto), 100 o 150 millas.                                                                     |
| Distancia de alerta                       | 1 a 25 millas (10 por defecto): el desencadenante «Incendio que se acerca» se activa al llegar a esa distancia. |
| Incluir las quemas prescritas             | Seguir también las quemas planificadas por los gestores del territorio («RX»). Desactivado por defecto.         |
| Ignorar los incendios contenidos al 100 % | Ocultar los incendios contenidos, que siguen listados hasta declararse extinguidos. Desactivado por defecto.    |
| Unidades                                  | Millas y acres (por defecto), o kilómetros y hectáreas.                                                         |
| Intervalo de actualización                | 10, 15 (por defecto), 30 o 60 minutos.                                                                          |
| Idioma de los textos                      | Nombres de las funciones (al crearlas) y textos enviados a las escenas. Francés por defecto.                    |

Guarde, abra la pestaña **Descubrir** de la integración y cree el dispositivo **Incendios alrededor de la
casa**. El botón **Mostrar los incendios actuales** de la configuración lista enseguida los incendios
cercanos: una forma rápida de comprobar los ajustes.

### Los incendios seguidos

Un incendio se sigue cuando el NIFC lo lista como activo, es un incendio forestal (o una quema prescrita,
si se eligió) y su distancia está dentro del radio. La distancia se mide **al borde de su perímetro
cartografiado** cuando el NIFC tiene uno (0 si su casa está dentro), si no a su **punto de origen**. Los
grandes incendios suelen estar mucho más cerca por su perímetro que por su punto: el incendio Hagen de la
grabación de prueba está a 25 millas por su punto y a 21 por su perímetro.

Privacidad: la ubicación enviada al NIFC se **redondea a 0,1°** (unos 11 km), con un radio ampliado en
consecuencia; la distancia exacta se calcula en el contenedor. La ubicación de la casa nunca se escribe en
los registros ni en `/data`.

## Dispositivo

| Función                            | Tipo               | Valor                                                                                        |
| ---------------------------------- | ------------------ | -------------------------------------------------------------------------------------------- |
| Incendios en el radio              | Contador           | Número de incendios seguidos                                                                 |
| Distancia del incendio más cercano | Distancia (mi, km) | Distancia al incendio más cercano; 1000 si no hay ninguno, para que «menos de 10» siga falso |
| Incendio más cercano               | Texto              | p. ej. `North Cayuse · 24 km · 1978 ha · contenido al 97 % · Umatilla, OR`                   |
| Superficie quemada total           | Superficie (km²)   | Superficie de los incendios seguidos. Gladys no tiene la unidad acre: 1 km² son 247 acres    |

La unidad de la distancia es la del ajuste **Unidades** al crear el dispositivo; después ya no cambia
(elimine y vuelva a crear el dispositivo para cambiarla). Cuando el NIFC no responde, no se publica nada:
los últimos valores se mantienen y la pantalla de configuración lo indica. Los valores se leen en el
contenedor en cada intervalo: Gladys no consulta el dispositivo.

## Widget de panel

**Incendios cercanos**: un título con el número de incendios, y luego hasta 8 incendios, el más cercano
primero. Cada fila muestra el nombre, la distancia, la superficie y el condado, y la contención como
insignia (verde al 100 %). Toque una fila para ver la fecha de descubrimiento, la causa, el identificador
del NIFC y un mapa de la ubicación del incendio. Las distancias siguen las unidades de su cuenta de Gladys.
El pie indica la fuente y la hora de la última lectura; el botón **InciWeb** (noticias de los incidentes)
se puede ocultar en los ajustes del widget.

## Desencadenantes de escena

**Incendios EE. UU.: nuevo incendio en el radio** se activa cuando un incendio no visto antes entra en el
radio. Filtro: tipos de incidente (incendio forestal, quema prescrita).

**Incendios EE. UU.: incendio que se acerca** se activa cuando un incendio llega a menos de la distancia de
alerta de la configuración, incluidos los nuevos. Filtro: tipos de incidente.

**Incendios EE. UU.: incendio contenido al 100 %** se activa cuando un incendio seguido alcanza el 100 % de
contención.

Cada desencadenante se activa **una vez por incendio**: un perímetro redibujado a uno y otro lado de la
distancia de alerta no lo vuelve a activar. Los incendios ya listados en el primer arranque, o al cambiar
la configuración, no activan nada: no son una novedad. Lo visto se guarda en `/data`: un reinicio no activa
nada para los incendios ya vistos. Como máximo 20 eventos por actualización.

Variables de los tres desencadenantes: `name`, `incident_type` (`wildfire`, `prescribed`), `distance` y
`distance_unit` (`mi` o `km`), `area` y `area_unit` (`acres` o `ha`), `containment` (porcentaje, vacío
cuando el NIFC no lo indica), `state` (`CA`, `OR`…), `county`, `cause` (`Human`, `Natural`,
`Undetermined`, tal como se publica) y `summary` (una línea, como la función Incendio más cercano).

## Acción de escena

**Incendios EE. UU.: leer los incendios cercanos** vuelve a leer el NIFC si la última lectura tiene más de
un intervalo, y devuelve:

- `text`: los incendios en una frase, p. ej. `5 incendios a menos de 80 km: North Cayuse, a 24 km; Hagen,
a 33 km; …` (5 incendios como máximo, luego «y N más»);
- `count`: el número de incendios.

## Ejemplos de escenas

- **Mensaje cuando un incendio se acerca**: desencadenante «Incendios EE. UU.: incendio que se acerca»,
  acción «Enviar un mensaje» con `{{triggerEvent.data.summary}}`.
- **Resumen matinal en temporada de incendios**: cada día a las 7:30, «Incendios EE. UU.: leer los
  incendios cercanos» y luego «Enviar un mensaje» con su `text`, solo si `count` es mayor que 0.
- **Cerrar las ventanas y parar la ventilación**: cuando «Distancia del incendio más cercano» baja de 10,
  apagar la ventilación y enviar un recordatorio para cerrar las ventanas (humo).
- **Buena noticia**: con «Incendios EE. UU.: incendio contenido al 100 %», enviar
  `{{triggerEvent.data.name}} está contenido`.

## Fuentes, condiciones y cuotas

- Datos: NIFC, capas WFIGS «Incident Locations Current» e «Interagency Perimeters Current», de dominio
  público, leídas desde los [datos abiertos del NIFC](https://data-nifc.opendata.arcgis.com) sin cuenta.
  Los incidentes proceden de IRWIN, el sistema común de las agencias de incendios federales, estatales y
  locales.
- Los datos los introducen las agencias, a veces con retraso: un nuevo incendio puede aparecer tarde, la
  superficie y la contención son las últimas declaradas, los incendios pequeños a menudo no tienen
  perímetro, y un incendio sigue «activo» hasta que se declara extinguido. Nunca sustituyen las alertas y
  órdenes de evacuación de sus autoridades locales. Consulte [Ready.gov](https://www.ready.gov/wildfires)
  para prepararse.
- Cuotas: el NIFC no publica ninguna para estas capas públicas. La integración hace dos consultas por
  intervalo (15 minutos por defecto), solo para la zona alrededor de su casa, con perímetros simplificados
  (precisión de unos 200 m): unas decenas de kilobytes por ciclo.

## Solución de problemas

- **«Sin centro» en la configuración**: indique la ubicación de su casa en Gladys (Ajustes → Casas), o
  introduzca coordenadas.
- **«El NIFC no responde»**: el servicio ArcGIS está caído o no es accesible desde el equipo de Gladys. Los
  últimos valores se mantienen; la integración lo vuelve a intentar en cada intervalo y lo indica una vez
  en sus registros.
- **Ningún incendio**: compruebe que el centro está en Estados Unidos y amplíe el radio; fuera de la
  temporada de incendios, puede que simplemente no haya ninguno.
- **Demasiados incendios pequeños sin interés**: active «Ignorar los incendios contenidos al 100 %» y deje
  las quemas prescritas desactivadas.
- **Ningún desencadenante tras cambiar los ajustes**: es normal, los incendios ya presentes no son una
  novedad.
- **Nombres de las funciones en el idioma equivocado, o distancia en la unidad equivocada**: se fijan al
  crear el dispositivo. Cambie el ajuste, elimine el dispositivo y vuelva a crearlo desde la pestaña
  Descubrir.
- Registros: página de la integración en Gladys, pestaña Registros. `LOG_LEVEL=debug` da una línea por
  lectura.

## Límites

- Solo Estados Unidos y Puerto Rico: WFIGS no cubre Canadá ni México.
- La distancia se mide al perímetro cartografiado, que puede tener un día o más; entre dos cartografías, un
  incendio rápido puede estar más cerca de lo indicado. Los incendios pequeños solo tienen un punto.
- La superficie, la contención y la causa son las declaradas por las agencias: pueden ir por detrás del
  terreno.
- El NIFC no publica la página de InciWeb de un incidente: el widget enlaza a la portada de InciWeb.
- Probada contra el servicio real del NIFC (grabación del 7 de noviembre de 2026 alrededor de Pendleton,
  Oregón), no con un incendio real cerca de una casa con Gladys: sus comentarios son bienvenidos en el
  foro.
