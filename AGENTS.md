# Guía de desarrollo — Sistema Web de Gestión Académica

Estas instrucciones aplican a todo el repositorio. El documento funcional
canónico es `CONTEXTO_COMPLETO_PROGRAMACION_IV.md`; ante cambios, conservar los
códigos RF01–RF43, RNF01–RNF08, HU01–HU29 y P01–P14 y registrar las decisiones
confirmadas en ese contexto.

## Alcance y vocabulario

- El sistema cubre exclusivamente procesos académicos. No agregar cobros,
  pagos ni facturación.
- Mantener Administrador, Docente y Estudiante como únicos roles académicos.
  El administrador principal es un Administrador con privilegios especiales.
- Usar **Paralelo** en la interfaz. Mantener **Curso** como denominación del
  modelo de dominio para una oferta de materia en un periodo.
- Conservar el modelo v8 y las funciones aprobadas. No inventar reglas,
  permisos, endpoints, pantallas, actividades ni resultados de pruebas.
- Distinguir decisiones funcionales confirmadas de propuestas técnicas y
  asuntos pendientes. No resolver silenciosamente pendientes que cambien el
  comportamiento académico o los permisos.

## Arquitectura

Aplicación cliente-servidor con React y TypeScript, Python/FastAPI y PostgreSQL.
Se propone un monolito modular con frontend y backend separados; no crear
microservicios para este alcance.

La estructura sigue MVC adaptado a una API web:

- **Modelo:** dominio y reglas académicas. La persistencia se encapsula en
  repositorios.
- **Controlador:** rutas FastAPI; validan solicitudes, resuelven identidad y
  delegan a servicios. No concentrar reglas complejas en controladores.
- **Vista:** pantallas y componentes React. La respuesta JSON de la API es la
  salida presentada por la vista.
- **Servicios de aplicación:** coordinan casos de uso, reglas de negocio y
  autorización.
- **Base de datos:** PostgreSQL protege integridad mediante relaciones,
  restricciones y transacciones según el diseño físico aprobado.

Las reglas críticas y los permisos se validan en backend en cada operación,
incluidas consultas, escrituras y exportaciones. La interfaz puede ocultar
acciones como ayuda de uso, pero no sustituye la autorización del servidor.

### Estructura prevista

- `frontend/src/app/`: arranque y navegación.
- `frontend/src/features/`: interfaz organizada por función académica.
- `frontend/src/shared/`: componentes y utilidades compartidas.
- `frontend/src/api/`: cliente de API y contratos tipados.
- `backend/app/api/`: rutas y dependencias comunes.
- `backend/app/core/`: configuración y seguridad compartidas.
- `backend/app/db/`: persistencia y modelos físicos.
- `backend/app/modules/`: módulos de dominio; cada uno puede contener
  `models/`, `schemas/`, `repositories/`, `services/` y `api/`.
- `docs/fuentes/` y `docs/diagramas/`: documentación y fuentes editables.

## Decisiones técnicas

Confirmadas para la Fase 1: React con TypeScript, Vite, Python/FastAPI,
PostgreSQL en Docker Compose, SQLAlchemy, Alembic, Bun, sesiones revocables en
servidor, login por correo o CI y cuenta principal inicial mediante comando
CLI de un solo uso configurado desde variables de entorno. La contraseña temporal se genera aleatoriamente y se
muestra una sola vez al administrador autorizado. La vista de acceso adapta el
login del template Full Stack FastAPI; se mantiene su aviso de licencia MIT.

El resto de las propuestas aún pendientes son generación PDF/Excel,
despliegue, y selección/aplicación futura de Repository y Strategy. No adoptar
el flujo JWT/localStorage del template.

Decisiones funcionales confirmadas para currículo (Fase 2): cada carrera pertenece a una sola facultad; las facultades se gestionan como catálogo y no pueden eliminarse mientras tengan carreras asociadas. El código de plan
es único en todo el sistema; solo se modifica la estructura de un plan en
BORRADOR y se crea otro plan para cambios posteriores a su publicación; la
asignación de plan a un estudiante se corrige solo mientras no existan
inscripciones ni notas.

Decisiones confirmadas para la planificación centrada en el plan: el periodo
académico permanece como ciclo semestral común; el administrador incorpora
explícitamente las carreras participantes y puede programar varios planes
VIGENTES de una misma carrera. El sistema muestra las materias de cada plan,
agrupadas por semestre curricular, para decidir cuáles se ofertan en el
periodo. No ofertar una materia en un periodo no inactiva la materia del
catálogo ni modifica el plan publicado. En modalidad SEMESTRAL la programación
de las materias elegidas abarca el semestre académico; en MODULAR se distribuye
en tramos mensuales dentro del mismo periodo. Siguen pendientes los límites
exactos de esos tramos y la política para retirar una oferta con historial.

Al preparar el siguiente periodo, la planificación debe mostrar las materias
de los planes seleccionados junto con el avance académico de sus estudiantes:
continuidad posible, materias reprobadas que podrían repetirse y requisitos
pendientes. Es una ayuda para decidir la oferta, no una apertura automática de
paralelos ni una habilitación individual. El cálculo exacto de la demanda y el
momento en que una nota será oficial si se añade aprobación administrativa
siguen pendientes de revisión institucional. La implementación actual cuenta
estudiantes activos con el plan asignado y resultados de periodos terminados
antes del inicio del periodo objetivo; muestra aptos, repetidores, bloqueados,
aprobados y casos sin nota. Señala como sugeridas solo materias con estudiantes
aptos que estén en su semestre nominal o puedan repetirlas.

Decisión confirmada para ambas modalidades: aprobar un prerrequisito durante
un periodo académico no habilita su materia dependiente en otro bloque de ese
mismo periodo. Una materia reprobada tampoco se repite dentro del mismo periodo;
podrá cursarse en uno posterior si se oferta y se cumplen las condiciones de
inscripción. La duración prevista de una carrera deriva de los semestres de su
plan (nueve en el ejemplo, no un valor fijo). Una misma versión del plan puede
recibir varios grupos de ingreso en distintos periodos; cada estudiante con
ese plan se asigna a un grupo para proyectar su semestre nominal. Publicar
otra versión del plan es una operación distinta.

## Reglas funcionales que deben preservarse

- Cada inscripción requiere una habilitación individual activa para el periodo
  y que el paralelo tenga inscripciones abiertas; son condiciones distintas.
- El semestre ubica una materia dentro del plan, pero no bloquea cursar materias
  pendientes de semestres anteriores ni adelantar materias posteriores. La
  elegibilidad académica depende de aprobar todos los prerrequisitos con nota
  final >= 51 en un periodo académico anterior al de la inscripción; la oferta
  debe comunicar los requisitos pendientes y no habilitar la acción de
  inscripción hasta cumplirlos. Una materia reprobada solo puede repetirse en
  un periodo posterior y si vuelve a ofertarse.
- Para Fase 3, las sesiones semanales son inclusivas en las fechas del paralelo,
  excluyen feriados del periodo y consideran cancelaciones y reprogramaciones.
  Inactivar un paralelo cierra su inscripción; reactivarlo no la abre. No se
  reduce el cupo por debajo de inscripciones activas.
- La nota final es un entero entre 0 y 100; se aprueba desde 51 y hay una sola
  nota final por inscripción. Solo el docente asignado la registra o corrige.
- Los cruces de horario consideran fechas reales de clase y superposición de
  horas. Una clase puede comenzar cuando termina otra.
- Los permisos dependen del rol y de la relación del usuario con el registro.
  El administrador consulta notas mediante reportes y no las modifica.
- Inactivar conserva historial; la eliminación física depende de que no haya
  registros dependientes.
- Los ocho reportes deben ofrecer PDF y Excel con los mismos límites de
  autorización.
- No implementar automatización de habilitaciones, recuperación del principal,
  cierre de notas o cambios de plan con historial hasta que se definan sus
  reglas pendientes.
- Todos los usuarios (Administrador, Docente y Estudiante) deben cambiar la
  contraseña en su primer ingreso y después de un restablecimiento. La
  condición se aplica en servidor y solo permite cambiar la contraseña o cerrar
  sesión mientras esté activa. Registrar las consecuencias para el informe en
  `CAMBIOS_PARA_INFORME.md`.
- Docentes y Estudiantes pueden consultar su perfil, pero no editar datos
  personales propios. La API debe rechazar esas actualizaciones; las
  correcciones permitidas las realiza un Administrador desde gestión de usuarios.
  El Administrador puede actualizar su propio teléfono. El cambio de contraseña
  sigue disponible para los tres roles.

## Fases de desarrollo

El estado inicial es análisis, diseño y planificación. Una fase no se considera
terminada hasta revisar sus criterios y registrar resultados reales. Las
pruebas listadas son previstas, no resultados existentes.

| Fase | Alcance | Dependencias | Criterio de salida |
| --- | --- | --- | --- |
| **0. Preparación y diseño físico** | Revisar RF, permisos, modelo v8 y decisiones pendientes; diseñar tablas, relaciones, índices, restricciones y estrategia transaccional. | Ninguna. | Requisitos trazados; decisiones para fase 1 documentadas; diseño físico revisado y repositorio preparado. |
| **1. Acceso y usuarios** | RF01–RF10, RF41–RF42: sesión, perfil, usuarios, privilegio principal y configuración inicial segura. | Fase 0; definir sesión, almacenamiento de contraseñas y recuperación/configuración del principal. | Acceso y administración con permisos del backend; principal único y cambio obligatorio de contraseña temporal. |
| **2. Currículo** | RF11–RF18: carreras, materias, planes, unidades, prerrequisitos y asignación de plan. | Fase 1; precisar edición de planes en uso. | Integridad, unicidad, prevención de ciclos y conservación del historial. |
| **3. Periodos y paralelos** | RF19–RF23 y consultas RF26: periodos, oferta, cupos, horarios y apertura. | Fases 1–2; definir fechas y representación de horarios. | Fechas y cruces validados; estado activo separado de inscripciones abiertas. |
| **4. Habilitaciones e inscripciones** | RF24–RF25, RF43 y aviso RF31. | Fases 1–3; definir transacciones de cupo y prevención de duplicados concurrentes. | Habilitación individual e inscripción que valide condiciones antes de confirmar y notificar. |
| **5. Calificaciones** | RF27–RF29: registro, corrección y consulta. | Fases 1, 3 y 4. | Rango y unicidad de nota aplicados; escritura permitida solo al docente asignado. |
| **6. Reportes** | RF33–RF40: ocho reportes exportables a PDF y Excel. | Fases 2–5; disponer de datos representativos. | Los ocho reportes en ambos formatos con autorización equivalente. |
| **7. Paneles, avisos e integración** | RF30–RF32, integración, evaluación de calidad y entrega. | Fases 1–6 y eventos de inscripción/cambio de horario. | Panel por rol, avisos, trazabilidad, evidencias y entrega reproducible para el entorno acordado. |

### Criterios para avanzar

1. Aclarar las decisiones pendientes que bloquean la fase; no alterar el modelo
   ni el comportamiento aprobado en silencio.
2. Implementar la función en backend y frontend, aplicando reglas y permisos en
   el servidor.
3. Mantener trazabilidad entre requisito, módulo, pantalla y prueba prevista.
4. Revisar criterios de aceptación y documentar resultados reales antes de
   cerrar la fase.

No están fijados calendario, duración de iteraciones, entorno de despliegue ni
asignación individual entre los tres integrantes.

## Desarrollo local — Fase 1

### Windows (equipo nuevo)

La ruta de desarrollo Windows es PowerShell nativo con Docker Desktop usando
WSL 2; no requiere Make ni desarrollar dentro de una distribución Linux. En
una computadora virgen, instalar WinGet/App Installer si falta, instalar Git,
clonar el repositorio y ejecutar `scripts/setup-windows.ps1` como
administrador. El script instala/verifica Git, uv, Bun, Docker Desktop y Visual
Studio Code mediante WinGet; descarga la última versión estable Node.js 24.x
desde el sitio oficial y valida su SHA-256. Instala Python 3.14 administrado
por uv, prepara dependencias y crea `.env` solo si falta. Si habilitar WSL
requiere reinicio, completarlo y volver a ejecutar el script. Después iniciar Docker Desktop,
configurar `INITIAL_ADMIN_PASSWORD`, ejecutar una vez
`scripts/principal-windows.ps1` y levantar con `scripts/dev-windows.ps1`.
Ctrl+C cierra los procesos de aplicación y ejecuta `docker compose down`, que
conserva el volumen PostgreSQL.

Requisitos prácticos: Windows 11 23H2 o posterior de 64 bits recomendado,
virtualización de hardware habilitada y al menos 8 GB de RAM para Docker Desktop/WSL 2. WinGet se
distribuye mediante App Installer. La instalación inicial/clonado requieren
Internet y acceso GitHub de cada integrante. No distribuir `.env`.

Requisitos observados en el entorno: Python 3.14, Node.js 24, Docker Compose y
`psql`. `uv` y Bun se instalan en el perfil del usuario. Makefile requiere GNU
Make y Docker Compose v2.17 o posterior. PostgreSQL corre en Docker y escucha
solo en `127.0.0.1:55432` (5432 y 5433 ya están ocupados).

Para preparar el entorno, configurar `.env`, crear el administrador principal
(una vez por base local) y levantar API, frontend y PostgreSQL juntos:

```sh
make setup
# Configurar INITIAL_ADMIN_PASSWORD en .env antes del siguiente comando.
make principal
make dev
```

`make dev` aplica migraciones pendientes antes de iniciar las aplicaciones. Al
presionar Ctrl+C, termina ambos servidores de aplicación y ejecuta
`docker compose down`, conservando el volumen de datos. La creación de la cuenta
principal nunca se ejecuta automáticamente al iniciar los servidores.

```sh
cp .env.example .env
docker compose up -d db
cd backend
uv sync --all-groups
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8100
```

En otra terminal:

```sh
cd frontend
bun install
bun run dev
```

Primera instalación, después de aplicar migraciones:

```sh
cd backend
uv run python -m app.cli create-principal
```

La configuración local usa `CI=admin`; define una contraseña propia de al
menos 8 caracteres en `INITIAL_ADMIN_PASSWORD` dentro de `.env` antes de
ejecutar el comando. `.env` está excluido de Git y se crea con permisos
restringidos. Nunca guardar contraseñas en el repositorio; en producción,
inyectar estos secretos desde el gestor de secretos del entorno y configurar
`SESSION_COOKIE_SECURE=true` con HTTPS. No reutilizar la clave local fuera del
entorno de desarrollo.

Pruebas previstas del backend:

```sh
cd backend
uv run pytest
uv run ruff check app migrations
```

### Registro de avance

- **Entorno Windows para desarrollo (20-11-2026):** se añadieron scripts
  PowerShell para preparar herramientas/dependencias, crear manualmente el
  administrador principal y levantar los servicios juntos. README y esta guía
  explican instalación en una máquina Windows nueva, WSL 2/Docker Desktop,
  reinicio, `.env` y puertos locales. Falta ejecutar los scripts en Windows
  real; el entorno actual no es Windows.

- **Fase 1 — implementada y verificada localmente (17-11-2026):** API de
  autenticación, sesiones revocables, perfiles y administración de usuarios;
  interfaz de acceso, cambio de contraseña, perfil y administración. La
  configuración inicial del administrador principal usa valores `INITIAL_ADMIN_*`
  en `.env`. Cuenta `admin` creada localmente; la contraseña no se imprimió ni
  se incluyó en el repositorio.
- **Verificaciones ejecutadas:** 8 pruebas backend aprobadas; Ruff aprobó
  `app` y `migrations`; `tsc -b` y compilación Vite aprobados; migración
  `0001_access_sessions` aplicada en PostgreSQL 18 local (Compose saludable,
  puerto `127.0.0.1:55432`). Vite mostró dos avisos de comentarios de pureza
  dentro de Zod; no impidieron la compilación.
- **Pendiente para el uso inicial:** validar la sesión desde la interfaz con
  la contraseña local almacenada en `.env`.
- **Fase 2 — implementación en curso; validación parcial (18-11-2026):** API y
  pantallas administrativas para facultades, carreras, materias, planes,
  unidades, prerrequisitos y asignación a estudiantes. La suite completa aprobó
  18/18 en SQLite y PostgreSQL aislado; la cobertura de T11–T18 sigue parcial y
  faltan los escenarios de `docs/MATRIZ_PRUEBAS.md` y la revisión visual. La
  migración `0008_facultades` se probó en PostgreSQL aislado; la base principal
  permanece en `0007_calificaciones` hasta contar con autorización explícita
  para aplicar el cambio de esquema y la asignación de datos existentes.
- **Fase 3 — implementada (17-11-2026):** periodos, paralelos,
  horarios, feriados por periodo y excepciones por sesión. Según P07 no se
  agregó edición ni eliminación de periodos. Migraciones 0004 y 0005 aplicadas;
-  Ruff, compilación TypeScript/Vite y comparación Alembic aprobados. Las pruebas
  T19–T23 tienen cobertura automatizada parcial; T26 se comprueba por rol. Faltan
  los escenarios pendientes de la matriz.
- **Fase 4 — implementada (17-11-2026):** gestión manual de
  habilitaciones, oferta e inscripción con control transaccional de cupo y
  conflictos; aviso interno al confirmar. Reingreso después de RETIRADA y
  automatización SISTEMA continúan pendientes por regla funcional. Migración
  0006 aplicada; T24/T25/T31/T43 tienen cobertura automatizada parcial.
- **Fase 5 — implementada (17-11-2026):** registro, corrección y consulta de
  notas finales con una nota por inscripción y límites 0–100. Migración 0007
  aplicada; T27–T29 tienen cobertura automatizada parcial. Política de
  cierre académico sigue pendiente; no existe bloqueo por cierre.
- **Fase 6 — implementada (17-11-2026):** ocho informes RF33–RF40,
  exportación PDF/XLSX y filtros aplicados en backend según el rol. T33–T40
  tienen prueba automatizada de descarga PDF/XLSX; falta revisión visual de
  archivos y ampliar escenarios negativos.
- **Fase 7 — implementación en curso (17-11-2026):** panel por rol, actividad
  reciente, consulta y lectura de avisos, más notificaciones por cambios de
  horario/calendario. Una revisión estática excluye avisos de feriado cuando
  la sesión ya tiene excepción. Ruff, compilación TypeScript/Vite y rutas OpenAPI
  verificados. Se documentó el arranque local y se agregó la matriz de trabajo
  `docs/EVALUACION_CALIDAD.md`; T30–T32 tienen cobertura automatizada parcial.
  RNF01–RNF08 y evidencia de despliegue siguen pendientes.
- **Regresión (18-11-2026):** 18 pruebas automatizadas (10 de acceso, 4 de
  currículo y 4 de integración) aprobaron con SQLite; Ruff, formato y
  compilación frontend también aprobaron. La matriz `docs/MATRIZ_PRUEBAS.md`
  registra los huecos. No se pudo confirmar `alembic current/check` contra
  PostgreSQL desde este entorno.
- **Planificación académica — mejora de flujo (18-11-2026):** se confirmó que
  el periodo académico representa el ciclo semestral común a planes MODULARES y
  SEMESTRALES, distinto del semestre curricular dentro del plan. La interfaz
  guía creación del semestre, programación de oferta y habilitaciones; conserva
  el semestre seleccionado entre pantallas y filtra los paralelos por periodo.
  No se añadió entidad para módulo mensual: fechas del paralelo delimitan el
  bloque. `CONTEXTO_COMPLETO_PROGRAMACION_IV.md`, `PENDIENTES_PARA_DECIDIR.md` y
  `CAMBIOS_PARA_INFORME.md` fueron actualizados. `bun run build` aprobó con dos
  avisos existentes de comentarios Zod y el aviso de tamaño del bundle. No se
  ejecutaron pruebas funcionales; la aprobación administrativa de notas sigue
  pendiente y no fue implementada.
- **Arranque local con Make (19-11-2026):** se añadieron `make setup`,
  `make principal` y `make dev`. El último espera PostgreSQL saludable, aplica
  migraciones y administra backend/frontend en conjunto; Ctrl+C detiene esos
  procesos y PostgreSQL sin borrar su volumen. La contraseña de la cuenta
  inicial permanece fuera de Git. Ruff y la compilación de sintaxis Python
  aprobaron; `make -n setup principal dev` revisó los objetivos. No se ejecutó
  el arranque completo ni pruebas funcionales de esta mejora.
- **Planificación de horarios — vista semanal y recursos (23-11-2026):** P08
  incorpora una vista semanal conjunta filtrada por periodo. Se agrega un
  catálogo sencillo de aulas y plantillas para Madrugada, Mañana, Tarde y Noche.
  Al elegir una plantilla, el formulario copia sus horas al paralelo; editar la
  plantilla no cambia horarios guardados. Inactivar recursos los conserva y
  evita nuevas asignaciones. El backend valida cruces de aula por fecha real,
  feriados, excepciones y solapamiento horario. Configuración:
  `/admin/planificacion-config`. El formulario consulta la API al editar y la
  API vuelve a validar al guardar; la comprobación previa no persiste cambios.
  Cobertura ejecutada el 23-11-2026: 26 pruebas backend aprobaron en SQLite;
  Ruff, TypeScript y build Vite también aprobaron. Después de corregir los 500
  observados en la interfaz, se aplicó `0009_planificacion_recursos` en la base
  PostgreSQL local (estaba en `0008_facultades`); la revisión quedó en `0009`,
  y las consultas ORM listaron 4 aulas heredadas y 0 bloques. Falta ejecutar
  la suite completa y concurrencia contra PostgreSQL.
- **Validación, usabilidad y tema visual (22-11-2026):** se reforzaron los
  esquemas de entrada del backend y los formularios del frontend con reglas
  compartidas, mensajes claros y errores HTTP normalizados. Se añadió
  alternancia claro/oscuro con etiqueta de acción e iconos sol/luna, con
  persistencia, y confirmaciones para acciones sensibles. No se cambiaron
  reglas académicas ni permisos. Ruff, 18 pruebas,
  typecheck y build frontend aprobaron; API, frontend y PostgreSQL respondieron
  en local. Detalles en `CAMBIOS_PARA_INFORME.md`.
- **Planificación por carrera, plan y grupo de ingreso (23-11-2026):** se
  añadieron relaciones explícitas de carrera y plan por periodo, grupos de
  ingreso reutilizando la misma versión del plan, asignación de estudiantes al
  grupo y proyección hasta el último semestre curricular. La oferta presenta
  todas las materias del plan con demanda académica; la selección de carreras
  se filtra por facultad. El calendario filtra por facultad, carrera, plan,
  docente y aula y conserva el detalle del paralelo en la misma vista. La
  inscripción exige prerrequisitos aprobados en un periodo
  anterior; una materia reprobada espera a otro periodo. La API previsualiza
  cruces de docente, aula y estudiantes al editar un paralelo. Migración
  `0010_aperturas_plan` aplicada en PostgreSQL local; `alembic check` no detectó
  cambios pendientes. Pasaron 28 pruebas en SQLite y 28 en PostgreSQL temporal,
  Ruff y build TypeScript/Vite. Tras ajustar la sugerencia de demanda y la
  asignación conjunta de plan y grupo, pasaron otra vez 28 pruebas SQLite y
  las 2 pruebas de progresión en PostgreSQL temporal. Falta revisión visual
  autenticada, prueba de concurrencia en PostgreSQL y definir visto bueno de
  notas, tramos modulares exactos y transición de planes anteriores.
- **Integración de `origin/main` (24-11-2026):** se avanzó de `87ec9cb` a
  `07ce28d` conservando los cambios locales. Se resolvieron los cruces en el
  cliente de API, perfil y usuarios; la vista nueva mantiene los datos de
  docentes y estudiantes en solo lectura y permite corregir el teléfono desde
  administración. Se combinaron los campos de `CoursePublic` requeridos por
  reportes y planificación. La dependencia de filtros de reportes se volvió
  asíncrona tras detectar una solicitud que quedaba en espera durante la
  regresión. Pasaron 28 pruebas backend, Ruff, formato y compilación
  TypeScript/Vite. Los cambios siguen sin commit; el stash previo a la
  integración se conserva como respaldo.
- **Currículo — integridad y usabilidad (24-11-2026):** se reforzó la
  publicación de planes (estructura con semestres 1..N y materias, sin vacíos,
  carrera/facultad/materias activas), se bloquearon inconsistencias de
  carreras/facultades y la inactivación de materias usadas por planes VIGENTES,
  y se restringió la asignación a planes INACTIVOS. Se agregaron diagnósticos
  tipados, duplicación de planes con prerrequisitos, generación y renumeración
  de semestres, carga masiva de materias, conteos de uso y filtros en catálogos.
  Migración `0011_curriculum_integrity` creada (índice `materias_plan.materia_id`)
  pero **no aplicada** a la base principal. Verificación: 34 pruebas backend en
  SQLite, Ruff sobre `app`/`migrations` y build TypeScript/Vite aprobados. Falta
  revisión visual autenticada, pruebas de concurrencia y aplicar la migración
  con autorización explícita. Los cambios permanecen sin commit.
