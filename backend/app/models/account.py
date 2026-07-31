from datetime import datetime
from sqlalchemy import String, DateTime, func, Enum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.enums import Platform


class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(primary_key=True)
    platform: Mapped[Platform] = mapped_column(Enum(Platform, native_enum=False), default=Platform.TELEGRAM)
    bot_token: Mapped[str] = mapped_column(String(255))
    bot_username: Mapped[str] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    chats: Mapped[list["Chat"]] = relationship(back_populates="account", cascade="all, delete-orphan")
