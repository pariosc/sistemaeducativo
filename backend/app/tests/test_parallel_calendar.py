from datetime import date, time
from uuid import uuid4

from app.modules.parallel.models.entities import (
    Curso,
    DiaSemana,
    ExcepcionHorario,
    HorarioClase,
    TipoExcepcionHorario,
)
from app.modules.parallel.services.calendar import course_occurrences, first_overlap


def test_course_occurrences_use_inclusive_dates_and_skip_holidays():
    course = Curso(
        fecha_inicio=date(2026, 12, 7),
        fecha_fin=date(2026, 12, 14),
    )
    schedule = HorarioClase(
        dia_semana=DiaSemana.LUNES,
        hora_inicio=time(8),
        hora_fin=time(10),
    )

    occurrences = course_occurrences(
        course,
        [schedule],
        {date(2026, 12, 7)},
        [],
    )

    assert occurrences == [(date(2026, 12, 14), time(8), time(10))]


def test_cancelled_exception_removes_occurrence_and_rescheduled_adds_replacement():
    course = Curso(
        fecha_inicio=date(2026, 12, 7),
        fecha_fin=date(2026, 12, 14),
    )
    schedule = HorarioClase(
        dia_semana=DiaSemana.LUNES,
        hora_inicio=time(8),
        hora_fin=time(10),
    )
    exceptions = [
        ExcepcionHorario(
            id=uuid4(),
            fecha_original=date(2026, 12, 7),
            tipo=TipoExcepcionHorario.CANCELADA,
        ),
        ExcepcionHorario(
            id=uuid4(),
            fecha_original=date(2026, 12, 14),
            tipo=TipoExcepcionHorario.REPROGRAMADA,
            fecha_reprogramada=date(2026, 12, 9),
            hora_inicio=time(11),
            hora_fin=time(13),
        ),
    ]

    occurrences = course_occurrences(course, [schedule], set(), exceptions)

    assert occurrences == [
        (date(2026, 12, 9), time(11), time(13)),
    ]


def test_first_overlap_requires_same_date_and_positive_time_intersection():
    monday = date(2026, 12, 7)
    tuesday = date(2026, 12, 8)

    assert first_overlap([(monday, time(8), time(10))], [(monday, time(9), time(11))]) == monday
    assert first_overlap([(monday, time(8), time(10))], [(monday, time(10), time(12))]) is None
    assert first_overlap([(monday, time(8), time(10))], [(tuesday, time(9), time(11))]) is None
