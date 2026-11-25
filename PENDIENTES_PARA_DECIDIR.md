# Pendientes para decidir

Este documento reúne propuestas y asuntos funcionales por resolver antes de
implementarse. Las decisiones de rediseño ya confirmadas se señalan
explícitamente y también se registran en el contexto funcional; su presencia
aquí no significa que el sistema ya las aplique. No asumir como aprobadas las
propuestas que continúan pendientes.

## Revisión de la interfaz de planificación — 24-11-2026

**Estado:** Boceto de navegación aceptado como punto de partida. Algunas reglas
de esta sección ya fueron confirmadas y registradas en el contexto funcional;
otras siguen en conversación. La programación modular secuencial ya se refleja
en la interfaz, API y base de datos; los demás puntos se detallan aquí.

- **Tablas de datos:** la oferta ahora muestra materias de todos los planes
  incorporados en una tabla con filtros, ordenación por columnas y paginación;
  los paralelos también se listan en tabla. Extender este patrón a las demás
  pantallas según su volumen de datos.
- **Centro de trabajo:** «Oferta y paralelos» muestra una semana de fechas
  efectivas y conserva el calendario al abrir el detalle lateral. Si el
  semestre aún no tiene planes, la tabla indica que se deben incorporar.
  Sigue pendiente evaluar si esta debe ser la pestaña inicial del semestre.
- **Habilitaciones:** se confirmó usar casillas para seleccionar estudiantes
  concretos y habilitarlos en una acción manual. «Seleccionar todos» marcará
  solo la página visible y se mostrará el número seleccionado antes de
  confirmar. Filtros deseados: facultad, carrera, plan y grupo de ingreso,
  además de búsqueda y estado. Se confirmó que el lote será atómico: si falla
  cualquier estudiante, ninguno se habilita y se explica el motivo. La
  habilitación individual continúa siendo una condición distinta de abrir la
  inscripción del paralelo; esto no define una habilitación automática.
- **Capacidad física y cupo académico — implementado:** las aulas nuevas
  requieren la cantidad de asientos y los paralelos conservan un cupo académico
  independiente. El servidor compara el cupo con todas las aulas semanales y
  sustitutas, exige aula al abrir inscripciones y rechaza reducir la capacidad
  cuando un paralelo activo aún tendrá clases allí con cupo mayor. La interfaz
  muestra avisos inmediatos. Las aulas anteriores a `0013_room_capacity`
  conservan capacidad desconocida; el administrador debe registrar los asientos
  reales antes de nuevas asignaciones o inscripciones. No se infiere una cifra
  a partir del cupo del paralelo.
- **Modalidad modular:** el patrón habitual de lunes a viernes con las mismas
  horas del turno ya se propone desde una franja predeterminada configurable
  en «Aulas y turnos». La cantidad de clases y la duración inicial provienen
  de la plantilla modular reutilizable descrita más abajo. Sigue pendiente
  «Personalizar horario» para ajustar días, horas o aulas en el borrador antes
  de guardar. El horario guardado de cada paralelo se puede editar después.
  No se impone lunes a viernes como restricción absoluta para casos especiales.

**Situación actual de habilitaciones:** la pantalla ya ofrece «Habilitar a todos
los de la lista» después de filtrar por nombre/CI y estado, ejecutando una
solicitud individual por estudiante. No hay casillas de selección ni filtros
por facultad, carrera, plan o grupo; el contrato de consulta aún no devuelve
esos datos académicos. La acción actual puede producir éxitos parciales; el
rediseño confirmado exige selección explícita y una operación atómica en el
servidor. Se requiere revisar el contrato y la transacción antes de implementarlo.

**Consulta rápida implementada parcialmente:** la tabla conjunta muestra
materias sugeridas sin paralelo y los paralelos señalan faltas de docente,
aula u horario. El calendario fechado reúne las clases de las carreras,
excluye feriados y cancelaciones y presenta reprogramaciones. Sus filtros
permiten consultar por facultad, carrera, plan, docente o aula. Un panel
lateral permite ver docentes y aulas libres u ocupados para una fecha y franja
de todas las carreras y periodos superpuestos, y asignar recursos al paralelo
seleccionado. Cada escritura valida todas las fechas del paralelo en el
  servidor. La programación conjunta ya previsualiza series de varias
  carreras. Sigue pendiente una consulta que compare la disponibilidad de un
  **recurso candidato** sobre toda la serie antes de seleccionarlo.

## Planificación modular por carrera y feriados de Bolivia — 24-11-2026

**Estado:** Plantilla, vínculo con el semestre, generación de fechas y secuencia
por grupo/turno/paralelo implementados. La tabla y el calendario reúnen todas las
carreras. El editor conjunto permite preparar secuencias de varios planes y
guardarlas de forma atómica; el editor individual sigue disponible.

- La vista amplia de planificación por semestre académico reúne carreras y
  planes modulares de varias facultades. El plan aporta las materias sugeridas;
  seis materias es un ejemplo, no un número fijo. El administrador escoge qué
  materias abrir y su orden, turno, docente, aula y cupo por paralelo. El lote
  se previsualiza y guarda en la página de trabajo.
- En «Aulas y turnos» se puede crear una **plantilla de programación modular**
  reutilizable, por ejemplo «Sistema modular 2026», con número de clases por
  módulo y duración diaria. Se partirá de 21 fechas de clase y unas tres horas
  por día como valores iniciales editables en esa plantilla; no son límites
  obligatorios. Los turnos conservan sus franjas de inicio y fin; una franja
  activa por turno se marca como predeterminada modular. La duración elegida
  debe coincidir con la de la plantilla. El semestre selecciona una plantilla;
  una vez asignada, sus valores no se editan y se crea otra para un cambio
  futuro. Cada paralelo conserva su horario y objetivo de clases.
- Para un mismo grupo de ingreso y turno, las materias MODULARES van una tras
  otra; se vincula cada paralelo al grupo usado para planificarlo, sin restringir
  por ello la inscripción de estudiantes de otros grupos que cumplan las reglas.
  Al elegir la fecha inicial, el sistema propone de lunes a viernes las fechas
  requeridas por la plantilla, salta los feriados del periodo y calcula el fin.
  El administrador revisa la vista previa y los cruces de docente y aula entre
  carreras antes de guardar toda la secuencia en una operación. Si no cabe en
  el semestre se rechaza; se puede ajustar el objetivo de clases de cada
  materia. No se crean paralelos solo por existir materias en el plan.
- La ubicación de referencia es **La Paz, Bolivia**. El administrador cargará
  en el calendario del periodo ya existente los feriados nacionales y
  departamentales de La Paz, además de los institucionales que correspondan;
  no se requiere importación automática de feriados. Las fechas oficiales deben
  verificarse por gestión y contemplar traslados o feriados extraordinarios;
  por ejemplo, el Decreto Supremo 5521 modificó la agenda nacional de 2026:
  https://gacetaoficialdebolivia.gob.bo/normas/listadonor/11/page:6
  Si se agrega un feriado después de programar, las clases efectivas pueden
  disminuir y «Oferta y paralelos» muestra la diferencia frente al objetivo.
  No se reprograma automáticamente. Sigue pendiente la política definitiva de
  revisión y reprogramación de horarios ya publicados.
- **Mes calendario:** «módulo mensual» describe la organización habitual, pero
  el módulo puede terminar en el mes siguiente para completar las fechas
  propuestas después de excluir feriados. Debe mostrarse la fecha final
  calculada y avisar si los módulos elegidos no caben en el periodo académico;
  el administrador podrá ajustar fechas, cantidad de clases u oferta antes de
  confirmar. Se confirmó que las materias de un mismo grupo, turno e
  identificador de paralelo no comparten bloque; los paralelos A y B pueden
  llevar órdenes diferentes si sus docentes y aulas están disponibles.
- **Pendiente de interfaz:** ofrecer edición de días y aulas por cada fecha
  antes de guardar el borrador. El editor conjunto asigna un aula y la franja
  del turno a cada módulo; después de guardar, las excepciones y los horarios
  del paralelo se pueden ajustar con las herramientas actuales.

## Configuración del umbral de aprobación

**Estado:** Pendiente de conversar con los compañeros del proyecto.

Actualmente, el umbral de aprobación es **51** y está fijado en la lógica del
backend y en algunos textos y cálculos de la interfaz. Afecta la clasificación
de notas, el cumplimiento de prerrequisitos y los indicadores académicos.

Antes de implementar una pantalla de configuración, acordar:

1. Si el umbral será configurable y qué valores se permitirán.
2. Quién podrá cambiarlo: cualquier Administrador o solo el Administrador
   principal.
3. Si el cambio requiere confirmar la contraseña actual. Recomendación técnica:
   validar esa confirmación en el servidor al guardar, no solo pedirla en la
   interfaz.
4. Desde cuándo se aplica: inmediatamente, desde un periodo académico futuro
   u otra vigencia explícita.
5. Qué pasa con las notas ya registradas y los prerrequisitos históricos.
   Recomendación: conservar el criterio vigente cuando se registró cada nota,
   para que una modificación no cambie retroactivamente aprobaciones ni
   habilitaciones académicas.
6. Si se requiere auditoría persistente del cambio, con usuario, fecha, valor
   anterior, valor nuevo y motivo. Recomendación: registrar estos datos.

**Propuesta técnica para evaluar:** agregar una sección de **Configuración
académica** con control de permisos en el backend, confirmación de contraseña
para esta acción y registro de auditoría. No implementar hasta que el equipo
defina y documente las reglas anteriores en
`CONTEXTO_COMPLETO_PROGRAMACION_IV.md`.

## Flujo operativo de oferta, habilitación y calificaciones

**Estado:** Pendiente de revisión conjunta del flujo y de las reglas nuevas.

### Lo que existe hoy

- **Currículo:** facultades, carreras, materias y planes con semestres,
  prerrequisitos y asignación de plan al estudiante.
- **Periodo académico:** registro de una denominación y fechas del ciclo
  semestral común a planes SEMESTRALES y MODULARES. Actualmente no guarda la
  selección explícita de carreras y planes participantes.
- **Paralelos:** creación de una oferta para una materia del plan y un periodo;
  en ese registro se puede asignar docente, cupo, fechas y horarios. El paralelo
  se abre por separado para aceptar inscripciones. Esto cubre la asignación
  individual, pero no presenta una planificación agrupada del conjunto de
  materias de un semestre.
- **Habilitaciones:** el administrador autoriza o revoca a cada estudiante para
  un periodo. Es una autorización distinta de abrir un paralelo y distinta de
  inscribirse en una materia.
- **Calificaciones:** el docente asignado registra o corrige la nota final. La
  calificación queda visible para el estudiante y cuenta para prerrequisitos en
  cuanto se guarda; hoy no existe revisión ni visto bueno administrativo.

### Flujo propuesto para conversar

1. Preparar el currículo institucional y asignar el plan a cada estudiante.
2. Crear el periodo académico que corresponda al ciclo de trabajo.
3. Planificar la oferta del periodo: seleccionar las materias del plan que se
   abrirán, crear sus paralelos y asignar docente, fechas, cupo y horarios.
   Revisar la programación y luego abrir los paralelos.
4. Habilitar a los estudiantes para inscribirse en ese periodo.
5. Permitir que cada estudiante se inscriba en paralelos disponibles si cumple
   habilitación, cupo, prerrequisitos y las demás reglas vigentes.
6. Permitir que el docente registre las notas de sus estudiantes.
7. Si el equipo confirma el visto bueno, el docente enviaría las notas para
   revisión; el administrador podría aprobarlas o devolverlas. Solo las notas
   aprobadas se mostrarían como oficiales al estudiante y contarían para
   prerrequisitos. Registrar quién envía, aprueba o devuelve y cuándo.

### Decisiones pendientes antes de cambiar el flujo

1. **Planificación de oferta:** implementado el espacio de trabajo por periodo,
   carrera y plan. El calendario permanece visible al editar un paralelo y se
   filtra por facultad, carrera, plan, docente y aula. Las materias del plan
   muestran aptos, repetidores, bloqueados y resultados sin nota, calculados
   con calificaciones de periodos terminados antes del objetivo. La misma
   versión del plan admite varios grupos de ingreso y se proyectan sus
   semestres curriculares. La inscripción ya exige que los prerrequisitos se
   hayan aprobado en un periodo anterior y la repetición espera otro periodo.
   Falta precisar los rangos de cada bloque mensual MODULAR, el retiro de una
   oferta con historial y la continuidad de un plan anterior cuando se publica
   una versión nueva. Si se aprueba el visto bueno administrativo de notas,
   habrá que ajustar qué resultados cuentan para la propuesta y la inscripción.
2. **Habilitaciones:** ¿se mantienen manuales por estudiante como ahora o se
   necesita seleccionar/habilitar un conjunto de estudiantes? Si se desea
   automatizarlas, falta definir la regla académica; no asumir que todos quedan
   habilitados automáticamente.
3. **Revisión de notas:** confirmar si el visto bueno administrativo será
   obligatorio antes de que una nota sea visible/oficial y habilite
   prerrequisitos. Definir si la aprobación es por estudiante, por materia,
   por paralelo o por periodo.
4. **Correcciones:** definir quién puede cambiar una nota después de enviada o
   aprobada y si una corrección vuelve a requerir visto bueno. La regla actual
   permite al docente asignado corregir y no incluye aprobación administrativa.
5. **Devolución y cierre:** definir si el administrador puede rechazar/devolver
   notas con motivo y si habrá una fecha de cierre; el cierre académico y las
   correcciones posteriores están pendientes en el contexto funcional.

**Advertencia de alcance:** el visto bueno cambiaría el comportamiento aprobado
actual de RF27–RF29, RN15 y sus historias, porque actualmente la nota del docente
se registra directamente y se usa para el historial y los prerrequisitos. Tratar
el flujo anterior como propuesta hasta que el equipo lo acuerde; entonces
actualizar `CONTEXTO_COMPLETO_PROGRAMACION_IV.md`, la trazabilidad, las pantallas
y los criterios de aceptación antes de implementarlo.

### Eliminación de semestres académicos

Se propuso añadir un botón para eliminar semestres desde la lista. P07 solo
contempla registrar y consultar; todavía no define qué hacer con carreras,
planes, grupos, paralelos, habilitaciones, feriados, inscripciones y notas
asociados. Definir si se permite eliminar únicamente un semestre vacío o si
debe existir otro mecanismo antes de agregar el botón.

### Flujo de oferta y programación modular

«Programar secuencia» ya aparece como botón y abre el editor conjunto con la
materia de esa fila marcada; «Seleccionar previstas» permite agregar las demás.
El grupo y el plan se conservan desde «Planificar». La oferta distingue las
materias previstas por la progresión del grupo de la demanda real de estudiantes.
Queda pendiente decidir si el botón de una materia debe abrir el editor de un
solo plan en lugar del editor conjunto. No cambiar la regla de recomendaciones
académicas hasta confirmar esa decisión.

### Agenda de aulas durante la programación

**Estado:** implementado y verificado con pruebas automatizadas el 25-11-2026. La regla
confirmada es que cada identificador de paralelo (A, B, etc.) lleva su propia
secuencia dentro del grupo y turno. A y B pueden cursar materias en distinto
orden o en las mismas fechas. La elección de aula y docente depende de que
estén libres en las fechas y horas efectivas; un recurso usado en otro horario
o mes sigue disponible. Dentro de un mismo paralelo, las materias distintas
deben continuar una después de otra.

#### Flujo propuesto

1. **Elegir la secuencia:** en la cabecera del editor modular, seleccionar
   grupo de ingreso, identificador de paralelo, turno y fecha de inicio. El
   identificador elegido se aplicará a las materias de esa secuencia para
   evitar mezclar A y B por accidente. Al preparar B, «Usar siguiente fecha»
   consultará únicamente los módulos B ya existentes. La lista de materias y
   su orden seguirá siendo independiente de A.
2. **Ver fechas antes de asignar recursos:** calcular inicio, fin y días
   efectivos de cada materia con plantilla, turno y feriados, aunque aún no
   tenga docente o aula. Mostrar «desde–hasta» en cada fila. Recalcular las
   filas siguientes al cambiar orden, inicio o cantidad de clases. Si se
   solapa con otra materia **del mismo grupo, turno y paralelo**, señalar las
   dos materias y fechas en la fila y bloquear el guardado. Un cruce con A al
   planificar B no producirá este aviso de secuencia.
3. **Elegir docente y aula:** consultar al servidor la ocupación efectiva del
   semestre y recalcular en el cliente al editar el borrador para evaluar cada candidato durante **todas las
   clases efectivas** de la materia frente a carreras y periodos superpuestos,
   feriados, cancelaciones, reprogramaciones y otras filas aún no guardadas.
   Mostrar en los selectores `Libre`, `Ocupado` (con primera fecha/hora y
   materia que ocupa),
   `Capacidad insuficiente` o `Capacidad sin configurar`. Las opciones no
   disponibles permanecerán visibles pero deshabilitadas, con texto
   explicativo accesible; no depender solo de color o de un tooltip. «Asignar
   después» seguirá permitido para docente.
   Si una selección deja de ser válida tras editar el borrador, conservarla
   visible como inválida, explicar el motivo junto a la fila y bloquear
   «Guardar secuencia» hasta corregirla.
4. **Consultar agenda desde la materia:** colocar «Ver agenda de aulas» junto
   al selector de aula de cada fila. El modal abrirá con las fechas propuestas
   de esa materia, su turno, horas, cupo y paralelo; permitirá filtrar aula y
   navegar semanas. Mostrará siete columnas de lunes a domingo y un eje
   horario visible de 06:00 a 22:00 en pasos de 30 minutos, conservando la
   hora real de cada clase. Cada bloque ocupado indicará materia, paralelo,
   docente, hora y vigencia; feriados y reprogramaciones tendrán indicación
   propia. Para cada aula, una etiqueta separada dirá `Disponible todo el
   módulo` u `Ocupada en el módulo` según **todas** las fechas propuestas,
   aunque la semana visible esté libre. «Elegir aula» solo estará activo si
   también cumple capacidad. El modal será navegable con teclado y tendrá
   desplazamiento horizontal en pantallas estrechas.
5. **Confirmar:** mantener la validación transaccional del backend al guardar.
   La consulta anticipada orienta al administrador, pero otra programación
   puede ocupar un recurso mientras el borrador está abierto; en ese caso
   se mostrará el conflicto actualizado sin crear registros parciales.

#### Orden de trabajo y comprobaciones

Implementación realizada: la API administrativa de disponibilidad por rango
consulta clases efectivas de periodos superpuestos. Ambos editores modulares
proyectan fechas sin exigir recursos, bloquean recursos ocupados o sin capacidad
y abren una agenda de aulas desde cada materia. La validación final del backend
se conserva. Se aprobaron la prueba de API con feriado y reprogramación, las
pruebas modulares de backend y las pruebas de proyección y disponibilidad del
frontend. La revisión autenticada en el navegador confirmó que AULA D-01 y la
docente ocupada quedan deshabilitadas, AULA D-02 figura libre para el módulo,
la agenda muestra el bloque de A y la vista previa acepta B con cupo válido.
No se guardó un paralelo durante la revisión visual.

- Primero separar la proyección de fechas del requisito actual de aula en la
  vista previa modular y ofrecer una consulta de disponibilidad para el lote
  completo. Reutilizar las reglas existentes de clases efectivas y cruces; la
  consulta actual de un solo día y el calendario semanal no bastan para
  calificar un módulo entero. Esta propuesta no requiere una nueva entidad de
  base de datos para la agenda.
- Después conectar los estados `Libre/Ocupado/Capacidad insuficiente` a ambos
  editores modulares, con actualización al cambiar cualquier dato que altere
  fechas, horas o cupo. Por último, añadir el modal de agenda y la selección
  de aula desde él.
- Probar A y B del mismo grupo con órdenes inversos, coincidencia de aula o
  docente entre A y B, reutilización del mismo recurso en fechas distintas,
  materias superpuestas dentro de B, cupo, feriados, reprogramaciones,
  periodos solapados, cambios mientras el borrador está abierto y manejo por
  teclado del modal. Verificar la vista de siete días y su lectura en móvil.

### Identidad y trayectoria de los grupos de ingreso

Decisión confirmada: un grupo de ingreso por carrera y periodo académico,
asociado a un plan de estudios. Sus paralelos no son grupos de ingreso
adicionales. Se genera un código visible y se guarda la trayectoria de todos
los semestres del plan. El semestre inicial se vincula al periodo de apertura;
los siguientes se asignan a periodos disponibles no solapados, sin mover
asignaciones existentes cuando se crea otro periodo. Los espacios aún sin
periodo aparecen como «Por programar». La restricción también se aplica en
PostgreSQL.

Pendiente por decidir: si el administrador podrá corregir manualmente el
periodo asignado a un semestre futuro del grupo, en qué condiciones y con qué
efecto sobre paralelos y estudiantes ya vinculados. No se agregó edición de la
trayectoria mientras esa regla no esté definida.

### Auditoría de periodo académico y semestre curricular

La revisión del modelo muestra que son conceptos relacionados, pero no
intercambiables:

- `UnidadPlan` (presentada en la interfaz como **Semestre**) ubica una materia
  dentro de la progresión del plan: semestre 1, 2, 3, etc. Pertenece al currículo
  y no lleva fechas.
- `PeriodoAcademico` representa un ciclo real con denominación y fechas, por
  ejemplo **2027-I**. Paralelos, habilitaciones, feriados, inscripciones y
  calificaciones llegan a ese ciclo mediante `periodo_id`.
- Una misma persona puede cursar en un periodo materias de distintos semestres
  curriculares, porque puede retomar materias reprobadas o adelantar si cumple
  las reglas. Por eso no conviene fusionar ambas entidades ni usar el semestre
  del plan como periodo de inscripción.
- La modalidad MODULAR o SEMESTRAL pertenece al plan. Los paralelos ya tienen
  fechas de inicio y fin dentro del periodo, así que el modelo actual puede
  representar bloques mensuales dentro de un periodo semestral compartido. No
  existe, sin embargo, un campo o entidad explícita para numerar/nombrar cada
  módulo mensual.
- La interfaz separa **Periodos** y **Paralelos** dentro de Gestión académica;
  el flujo actual guía la selección de carreras y planes, muestra materias del
  plan y abre el calendario semanal en la misma pantalla de oferta.

**Decisión confirmada y aplicada en la interfaz/documentación:** mantener
separados el semestre curricular y el periodo académico en el dominio; usar un
periodo semestral común para ambas modalidades y delimitar los bloques modulares
por fechas de paralelo dentro de ese periodo. La navegación ahora presenta una
planificación del semestre con enlaces contextuales a oferta y habilitaciones.
No se añade una entidad/campo de módulo mensual porque las fechas del paralelo
delimitan el bloque por ahora. Sigue pendiente definir los límites exactos de
los tramos modulares y el visto bueno administrativo de notas.
