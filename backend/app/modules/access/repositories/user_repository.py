import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.modules.access.models.user import (
    PerfilDocente,
    PerfilEstudiante,
    SesionAutenticacion,
    UserRole,
    Usuario,
)
from app.modules.curriculum.models.entities import Carrera, PlanEstudio
from app.modules.periods.models.entities import AperturaPlan


class UserRepository:
    def __init__(self, db: Session):
        self.db = db

    def find_for_login(self, identifier: str) -> Usuario | None:
        normalized = identifier.strip()
        return self.db.scalar(
            select(Usuario).where(
                or_(
                    func.lower(Usuario.correo) == normalized.lower(),
                    func.upper(Usuario.ci) == normalized.upper(),
                )
            )
        )

    def get(self, user_id: uuid.UUID) -> Usuario | None:
        return self.db.scalar(
            select(Usuario)
            .options(
                selectinload(Usuario.perfil_docente),
                selectinload(Usuario.perfil_estudiante)
                .selectinload(PerfilEstudiante.plan_estudio)
                .selectinload(PlanEstudio.carrera)
                .selectinload(Carrera.facultad),
                selectinload(Usuario.perfil_estudiante).selectinload(PerfilEstudiante.apertura_plan),
            )
            .where(Usuario.id == user_id)
        )

    def get_by_ci_or_email(self, ci: str, email: str) -> Usuario | None:
        return self.db.scalar(select(Usuario).where(or_(Usuario.ci == ci, Usuario.correo == email)))

    def list_visible(self, principal: bool, query: str | None = None) -> list[Usuario]:
        statement = select(Usuario).options(
            selectinload(Usuario.perfil_docente),
            selectinload(Usuario.perfil_estudiante)
            .selectinload(PerfilEstudiante.plan_estudio)
            .selectinload(PlanEstudio.carrera)
            .selectinload(Carrera.facultad),
            selectinload(Usuario.perfil_estudiante).selectinload(PerfilEstudiante.apertura_plan),
        )
        if not principal:
            statement = statement.where(Usuario.rol != UserRole.ADMINISTRADOR)
        if query and query.strip():
            needle = f"%{query.strip().lower()}%"
            statement = (
                statement.join(Usuario.perfil_docente, isouter=True)
                .join(Usuario.perfil_estudiante, isouter=True)
                .outerjoin(PlanEstudio, PerfilEstudiante.plan_estudio_id == PlanEstudio.id)
                .outerjoin(Carrera, PlanEstudio.carrera_id == Carrera.id)
                .outerjoin(AperturaPlan, PerfilEstudiante.apertura_plan_id == AperturaPlan.id)
                .where(
                    or_(
                        Usuario.nombres.ilike(needle),
                        Usuario.apellidos.ilike(needle),
                        Usuario.ci.ilike(needle),
                        Usuario.correo.ilike(needle),
                        Usuario.direccion.ilike(needle),
                        PerfilDocente.titulo.ilike(needle),
                        PerfilDocente.especialidad.ilike(needle),
                        PlanEstudio.codigo.ilike(needle),
                        Carrera.codigo.ilike(needle),
                        Carrera.nombre.ilike(needle),
                        AperturaPlan.codigo.ilike(needle),
                    )
                )
            )
        statement = statement.distinct().order_by(Usuario.apellidos, Usuario.nombres)
        return list(self.db.scalars(statement))

    def has_principal(self) -> bool:
        return bool(
            self.db.scalar(
                select(Usuario.id).where(Usuario.es_administrador_principal.is_(True)).limit(1)
            )
        )

    def revoke_sessions(self, user_id: uuid.UUID, now) -> None:
        sessions = self.db.scalars(
            select(SesionAutenticacion).where(
                SesionAutenticacion.usuario_id == user_id,
                SesionAutenticacion.revocada_en.is_(None),
            )
        )
        for session in sessions:
            session.revocada_en = now
