import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.modules.access.models.user import SesionAutenticacion, UserRole, Usuario


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
        return self.db.get(Usuario, user_id)

    def get_by_ci_or_email(self, ci: str, email: str) -> Usuario | None:
        return self.db.scalar(select(Usuario).where(or_(Usuario.ci == ci, Usuario.correo == email)))

    def list_visible(self, principal: bool) -> list[Usuario]:
        statement = select(Usuario).order_by(Usuario.apellidos, Usuario.nombres)
        if not principal:
            statement = statement.where(Usuario.rol != UserRole.ADMINISTRADOR)
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
