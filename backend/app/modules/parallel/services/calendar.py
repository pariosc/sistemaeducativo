from collections.abc import Iterable
from datetime import date, time, timedelta

from app.modules.parallel.models.entities import (
    Curso,
    DiaSemana,
    ExcepcionHorario,
    HorarioClase,
    TipoExcepcionHorario,
)

WEEKDAY_NUMBER = {
    DiaSemana.LUNES: 0,
    DiaSemana.MARTES: 1,
    DiaSemana.MIERCOLES: 2,
    DiaSemana.JUEVES: 3,
    DiaSemana.VIERNES: 4,
    DiaSemana.SABADO: 5,
    DiaSemana.DOMINGO: 6,
}
Occurrence = tuple[date, time, time]


def course_occurrences(
    course: Curso,
    schedules: Iterable[HorarioClase],
    holidays: set[date],
    exceptions: Iterable[ExcepcionHorario],
) -> list[Occurrence]:
    schedule_by_weekday: dict[int, list[HorarioClase]] = {}
    for schedule in schedules:
        schedule_by_weekday.setdefault(WEEKDAY_NUMBER[schedule.dia_semana], []).append(schedule)

    exception_by_date = {exception.fecha_original: exception for exception in exceptions}
    occurrences: list[Occurrence] = []
    current = course.fecha_inicio
    while current <= course.fecha_fin:
        exception = exception_by_date.get(current)
        if current not in holidays and exception is None:
            for schedule in schedule_by_weekday.get(current.weekday(), []):
                occurrences.append((current, schedule.hora_inicio, schedule.hora_fin))
        current += timedelta(days=1)

    for exception in exception_by_date.values():
        if (
            exception.tipo == TipoExcepcionHorario.REPROGRAMADA
            and exception.fecha_reprogramada is not None
            and exception.hora_inicio is not None
            and exception.hora_fin is not None
        ):
            occurrences.append(
                (exception.fecha_reprogramada, exception.hora_inicio, exception.hora_fin)
            )
    return sorted(occurrences, key=lambda item: (item[0], item[1], item[2]))


def first_overlap(left: Iterable[Occurrence], right: Iterable[Occurrence]) -> date | None:
    right_by_date: dict[date, list[tuple[time, time]]] = {}
    for day, start, end in right:
        right_by_date.setdefault(day, []).append((start, end))
    for day, start, end in left:
        for other_start, other_end in right_by_date.get(day, []):
            if start < other_end and other_start < end:
                return day
    return None
