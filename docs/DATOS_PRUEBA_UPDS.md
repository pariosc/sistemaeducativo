# Escenario académico de prueba UPDS

Este conjunto es **ficticio** y está separado de los registros anteriores mediante el prefijo `QA-UPDS`. Contiene muestras parciales de dos semestres por carrera para verificar el flujo. Los nombres de materias se basan en las páginas públicas de [Ingeniería de Sistemas](https://www.upds.edu.bo/carrera/ingenieria-de-sistemas-potosi/), [Administración de Empresas](https://www.upds.edu.bo/carrera/administracion-de-empresas/) y [Psicología](https://www.upds.edu.bo/carrera/psicologia/) de UPDS. La selección de materias, los prerrequisitos y las personas de este escenario son demostrativos; **no constituyen mallas oficiales**.

## Datos cargados

| Carrera | Modalidad | Plan | Materias de muestra | Prerrequisito de prueba |
| --- | --- | --- | --- | --- |
| Ingeniería de Sistemas | Modular | `QA-UPDS-SIS-2028` | Metodología de la Investigación Científica; Programación Básica; Programación I; Sistemas Operativos I | Programación Básica → Programación I |
| Administración de Empresas | Semestral | `QA-UPDS-ADM-2028` | Administración I; Contabilidad Empresarial I; Administración II; Contabilidad Empresarial II | Administración I → Administración II |
| Psicología | Modular | `QA-UPDS-PSI-2028` | Introducción a la Psicología; Psicología del Desarrollo Humano I; Psicología del Desarrollo Humano II; Fundamentos de Neurociencia | Psicología del Desarrollo Humano I → Psicología del Desarrollo Humano II |

Se crearon dos periodos, `Prueba UPDS 2028-1` (10 de enero a 30 de junio) y `Prueba UPDS 2028-2` (3 de julio a 20 de diciembre). Cada carrera tiene una facultad de prueba, un grupo de ingreso que inicia en 2028-1, un aula de 30 asientos, un docente y tres estudiantes. La plantilla modular tiene 21 clases de 180 minutos; el turno de mañana reutiliza el horario predeterminado local y el de tarde usa 14:00–17:00.

| Carrera | Docente | Estudiantes |
| --- | --- | --- |
| Sistemas | `QA-UPDS-SIS-DOC` | `QA-UPDS-SIS-E01`, `QA-UPDS-SIS-E02`, `QA-UPDS-SIS-E03` |
| Administración | `QA-UPDS-ADM-DOC` | `QA-UPDS-ADM-E01`, `QA-UPDS-ADM-E02`, `QA-UPDS-ADM-E03` |
| Psicología | `QA-UPDS-PSI-DOC` | `QA-UPDS-PSI-E01`, `QA-UPDS-PSI-E02`, `QA-UPDS-PSI-E03` |

Todos los correos usan el dominio de ejemplo `example.com`. La contraseña inicial de estas cuentas se suministra al ejecutar la carga mediante `DEMO_USER_PASSWORD`; no se guarda en el repositorio. Todas requieren cambio de contraseña en el primer ingreso. La contraseña nueva debe cumplir la regla general de mínimo ocho caracteres.

## Recorrido para revisar

1. En **Planificar semestre**, abrir `Prueba UPDS 2028-1` y revisar las tres carreras incorporadas, sus planes VIGENTES y sus grupos. Abrir después `Prueba UPDS 2028-2` para comprobar la proyección al segundo semestre curricular.
2. En **Oferta y paralelos**, filtrar por cada carrera. Hay un paralelo abierto de una materia de primer semestre en 2028-1 y otro de una materia de segundo semestre en 2028-2. Los planes contienen otras materias para revisar la oferta sugerida; no se abrieron todos los paralelos posibles.
3. En **Aulas y turnos** y en el calendario, comprobar las aulas `QA SIS 101`, `QA ADM 201` y `QA PSI 301`, y los horarios modulares y semestrales.
4. En **Habilitaciones**, revisar las nueve autorizaciones individuales activas para cada periodo (18 en total).
5. Las tres cuentas `E01` y las tres `E02` obtuvieron 75 y 61 en la materia inicial y se inscribieron en la materia dependiente del periodo siguiente. Las tres `E03` obtuvieron 40: pueden revisar su oferta, pero se rechazó su inscripción en la materia dependiente por faltar el prerrequisito.
6. En el panel docente y las consultas de notas, revisar nueve calificaciones del primer periodo. La aprobación administrativa de notas sigue pendiente de definición funcional y no forma parte de este flujo.

## Repetir la carga

Ejecutar únicamente contra PostgreSQL local de desarrollo en `localhost:55432`:

```sh
cd backend
DEMO_USER_PASSWORD='<contraseña temporal de prueba>' uv run python -m scripts.seed_upds_demo
```

La carga es idempotente: reutiliza sus códigos de prueba, no reinicia contraseñas existentes y comprueba que una cuenta o plan preexistente con ese código tenga el rol y la relación esperados. Si encuentra una inconsistencia, se detiene para que se revise manualmente.

## Verificación ejecutada el 26-11-2026

- PostgreSQL local: 3 facultades, 3 carreras, 3 planes VIGENTES, 12 materias, 2 periodos, 3 grupos, 3 docentes, 9 estudiantes y 6 paralelos de este escenario.
- 18 habilitaciones, 15 inscripciones y 9 notas. Se registraron 2 avances y 1 rechazo por prerrequisito en cada carrera. La segunda ejecución no duplicó datos.
- La API local aceptó el acceso de una cuenta ficticia, indicó cambio obligatorio de contraseña y denegó la consulta de oferta hasta completar ese cambio. Luego cerró la sesión.
- Se verificó para cada carrera la oferta con prerrequisito pendiente, la consulta de notas del estudiante y del docente, un reporte de materias por plan exportado a PDF/XLSX y un reporte administrativo de notas.
- La suite backend aprobó 46 pruebas y la suite frontend aprobó 6. Ruff aprobó la revisión de código y la compilación frontend TypeScript/Vite terminó correctamente. La verificación de formato global detectó tres archivos anteriores sin formato Ruff; el script nuevo sí está formateado.

Esta carga verifica el recorrido de servicios y las restricciones indicadas. Aún requiere revisión manual de las pantallas con los usuarios de prueba; no demuestra concurrencia ni todos los reportes exportados de forma visual.
