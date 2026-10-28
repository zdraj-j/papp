# Póliza colectiva de automóviles — administración

Aplicación web estática para administrar la base de vehículos de la póliza
colectiva de automóviles de los empleados, registrar las novedades del mes,
conciliar el pre-cobro mensual de la aseguradora y generar el archivo plano de
descuentos para gestión humana.

Todo corre en el navegador. **Los datos nunca salen del equipo**: se guardan en
una carpeta que tú escoges.

---

## Publicar en GitHub Pages

1. Crea un repositorio y sube el contenido de esta carpeta tal cual.
2. En el repositorio: *Settings → Pages → Build and deployment → Deploy from a
   branch*, rama `main`, carpeta `/ (root)`.
3. Abre la URL que te da GitHub en Chrome.

No hay build ni dependencias que instalar: son archivos estáticos.

### Por qué conviene GitHub Pages y no abrir el HTML con doble clic

Escoger una carpeta del equipo usa la *File System Access API*, que solo existe
en contexto seguro (`https://` o `localhost`). Al abrir el archivo con doble
clic la dirección es `file://` y esa función no está disponible.

La app funciona igual desde `file://`, pero en **modo navegador**: la base se
guarda dentro del almacenamiento del navegador y tienes que descargar e
importar el `.json` a mano desde *Ajustes*. Sirve de emergencia, no para el día
a día.

---

## La primera vez

1. Abre la app y pulsa **Escoger carpeta de trabajo**. Elige una carpeta vacía,
   fuera del repositorio (ver la advertencia de abajo).
2. Pulsa **Crear una base nueva**.
3. Ve a **Cobros** e importa el pre-cobro más reciente en Excel. Ese archivo es
   el que llena la base: cada línea se convierte en un vehículo.
4. Revisa la conciliación y pulsa **Aplicar a la base**.

Cada vez que vuelvas a abrir la app, Chrome pedirá permiso para la carpeta. Es
un clic en **Reconectar carpeta**.

### Qué se guarda en la carpeta

```
base.json                      la base completa: vehículos, colaboradores, movimientos
cobros/2026-10.json            las líneas de cada cobro, tal como llegaron
planos/plano_2026-10.txt       los archivos planos generados
respaldos/base-AAAA-MM-DD.json respaldos automáticos antes de cada importación
```

> **No pongas esa carpeta dentro del repositorio de GitHub.** Contiene cédulas y
> nombres de los colaboradores. El `.gitignore` incluido evita que se suban por
> accidente si ocurre, pero lo seguro es tenerla aparte (por ejemplo en
> *Documentos*).

---

## El mes típico

**Durante el mes**, cada vez que pasa algo: *Movimientos → Registrar
movimiento*. Se puede registrar inclusión, exclusión, cambio de beneficiario,
siniestro, cambio de vehículo, corrección de datos, retiro del colaborador y
reactivación. Siempre con la fecha a partir de la cual aplica.

Un movimiento queda **pendiente**. La base no cambia todavía: la base refleja lo
que la aseguradora está cobrando hoy, y los movimientos son lo que pediste. La
única excepción es la exclusión, que marca el vehículo como *en exclusión* para
poder esperar su último pago.

**Cuando llega el cobro**, *Cobros → importar*. La app compara el archivo contra
la base y contra los movimientos pendientes, y muestra:

- vehículos que entran y que salen,
- cambios de valor por encima de la tolerancia (ajustable en *Ajustes*),
- cambios en los datos,
- valores negativos,
- qué movimientos quedaron confirmados y cuáles no aplicó la aseguradora.

Un vehículo marcado *en exclusión* que aparece en el cobro se entiende como su
último pago y no se reporta como cambio sospechoso. Si vuelve a aparecer al mes
siguiente, se levanta una alerta de posible cobro indebido.

**Al final**, *Archivo plano*. La app arma el archivo con los descuentos y pide
resolver cada valor negativo: cruzarlo contra otro vehículo del mismo
colaborador, o eliminar la línea. Si el saldo a favor es mayor que el otro
descuento, el remanente queda guardado para el mes siguiente.

### Formato del archivo plano

Una línea por vehículo, sin encabezado:

```
cédula del empleado (12 dígitos) <TAB> concepto <TAB> valor (12 dígitos) <TAB> CRLF
```

El concepto se configura en *Ajustes* (por defecto `3055`).

---

## Estructura

```
index.html
css/estilos.css
js/util.js       utilidades de texto, números y fechas
js/almacen.js    carpeta local e IndexedDB
js/modelo.js     la base de datos y sus consultas
js/cobro.js      lectura del Excel, conciliación y aplicación
js/plano.js      archivo de descuentos
js/ui.js         modal, avisos, tablas, formularios
js/vistas.js     las pantallas
js/app.js        arranque y navegación
vendor/          SheetJS, para leer los Excel sin conexión
```

Sin frameworks ni CDN: funciona aunque la red de la empresa bloquee recursos
externos.
