import re
from typing import Annotated

from pydantic import BeforeValidator, Field, StrictBool, StrictInt, StringConstraints

CI_PATTERN = re.compile(r"^[A-Z0-9-]{3,32}$")
PHONE_PATTERN = re.compile(r"^[0-9+() ./-]{5,40}$")
CODE_PATTERN = re.compile(r"^[A-Z0-9._-]{1,32}$")
COOKIE_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
ORIGIN_PATTERN = re.compile(r"^https?://[A-Za-z0-9.-]+(?::[0-9]{1,5})?$")


def _validate_ci(value: str) -> str:
    if not isinstance(value, str):
        return value
    normalized = value.strip().upper()
    if not CI_PATTERN.fullmatch(normalized):
        raise ValueError("El CI solo admite letras, números y guiones, de 3 a 32 caracteres")
    return normalized


def _validate_phone(value: str) -> str:
    if not isinstance(value, str):
        return value
    normalized = value.strip()
    if not PHONE_PATTERN.fullmatch(normalized):
        raise ValueError("El teléfono solo admite números, +, (), espacios, puntos, / y -")
    return normalized


def _validate_code(value: str) -> str:
    if not isinstance(value, str):
        return value
    normalized = value.strip().upper()
    if not CODE_PATTERN.fullmatch(normalized):
        raise ValueError("El código solo admite letras, números, puntos, guiones y subrayados")
    return normalized


def _validate_person_name(value: str) -> str:
    if not isinstance(value, str):
        return value
    normalized = value.strip()
    if not 1 <= len(normalized) <= 120:
        raise ValueError("Debe tener entre 1 y 120 caracteres")
    if not any(character.isalpha() for character in normalized):
        raise ValueError("Debe contener al menos una letra")
    if any(not (character.isalpha() or character in " -'.") for character in normalized):
        raise ValueError("Solo se permiten letras, espacios, guiones, apóstrofos y puntos")
    return normalized


def descriptive_text(max_length: int):
    def validate(value: str) -> str:
        if not isinstance(value, str):
            return value
        normalized = " ".join(value.split())
        if not 1 <= len(normalized) <= max_length:
            raise ValueError(f"Debe tener entre 1 y {max_length} caracteres")
        return normalized

    return Annotated[str, BeforeValidator(validate)]


CI = Annotated[str, BeforeValidator(_validate_ci), StringConstraints(min_length=3, max_length=32)]
Phone = Annotated[
    str, BeforeValidator(_validate_phone), StringConstraints(min_length=5, max_length=40)
]
Code = Annotated[
    str, BeforeValidator(_validate_code), StringConstraints(min_length=1, max_length=32)
]
PersonName = Annotated[
    str, BeforeValidator(_validate_person_name), StringConstraints(min_length=1, max_length=120)
]
PositiveInt = Annotated[StrictInt, Field(gt=0)]
StrictFlag = StrictBool


def ensure_date_order(start, end, start_label: str = "inicial", end_label: str = "final") -> None:
    if end < start:
        raise ValueError(f"La fecha {end_label} no puede ser anterior a la fecha {start_label}")


def ensure_time_order(start, end) -> None:
    if end <= start:
        raise ValueError("La hora final debe ser posterior a la hora inicial")


def is_valid_cookie_name(value: str) -> bool:
    return bool(COOKIE_PATTERN.fullmatch(value))


def is_valid_origin(value: str) -> bool:
    if not ORIGIN_PATTERN.fullmatch(value):
        return False
    host = value.split("://", 1)[1].split(":", 1)[0]
    return all(part and part != "-" for part in host.split("."))
