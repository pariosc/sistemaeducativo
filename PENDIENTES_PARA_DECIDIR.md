# Pendientes para decidir

Este documento reúne decisiones funcionales y de alcance que deben conversarse
antes de implementarse. Mientras sigan aquí como pendientes, no se deben asumir
como reglas aprobadas ni cambiar el comportamiento del sistema.

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
