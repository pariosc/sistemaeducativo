# Diagramas del informe

Estas tres vistas documentan las clases implementadas al 25-11-2026. Se
derivan de los modelos SQLAlchemy en `backend/app/modules/*/models/` y
complementan el modelo funcional v8 incluido en
`CONTEXTO_COMPLETO_PROGRAMACION_IV.md`. Se omitieron atributos técnicos como
`id` en algunas cajas para mantener legibilidad; las relaciones y claves se
pueden verificar en el código y las migraciones. `Curso` es la entidad de
dominio que la interfaz denomina «Paralelo». `BloqueHorario` es una plantilla
de horas, no una relación persistida con cada `HorarioClase`.

Regeneración con Graphviz:

```sh
for source in docs/diagramas/clases_*.dot; do
  dot -Tpng -Gdpi=240 "$source" -o "${source%.dot}.png"
done
```

El diagrama relacional se obtuvo por introspección de PostgreSQL 18 local en
la migración `0014_group_trajectory`: 27 tablas, 140 columnas y 40 claves
foráneas. `postgres_schema_0014.json` y `postgres_fks_0014.json` contienen
los metadatos leídos de la base, sin filas de usuarios ni secretos.
`generar_erd.py` produce siete vistas editables `.dot` y sus `.png`:

```sh
python3 docs/diagramas/generar_erd.py
```

Las cajas grises de las vistas relacionales indican referencias a tablas
desarrolladas en otra vista. Las flechas parten de la clave foránea y apuntan
a la tabla referida. El JSON preserva todas las columnas; el diagrama muestra
las claves y hasta tres atributos adicionales por tabla para su lectura.

`Casos_de_Uso_Academico_Estilo_Referencia.drawio` es la fuente editable de
las ocho páginas CU00–CU07 aportada por el equipo. Se revisaron CU00–CU03
para incluir facultades, grupos de ingreso y programación semestral, y se
eliminó la edición de teléfono del caso de perfil. CU04–CU07 conservan los
casos de habilitaciones, notas, reportes y avisos. El detalle de la secuencia
modular se explica en el informe y en la aplicación; el caso CU03 presenta
su alcance general. Las ampliaciones fragmentadas del informe anterior se
retiraron. `casos_uso/CU00.svg` a `CU07.svg`, sus PNG y
`casos_uso_completos.pdf` son exportaciones completas de esa fuente, útiles
para ampliar durante la defensa. Se generaron con draw.io Desktop 32.7.4.

`diagrama_clases_v2_referencia.puml` se conserva únicamente como fuente
histórica aportada. No usarlo para la presentación: representa herencia de
roles, nota decimal y omite entidades incorporadas después. Las vistas
`clases_*.dot` y sus imágenes muestran el modelo de implementación actual.
