from datetime import datetime
from sqlalchemy import String, Integer, ForeignKey, DateTime, func, Enum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.enums import Platform


class Chat(Base):
    __tablename__ = "chats"

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"))
    platform: Mapped[Platform] = mapped_column(Enum(Platform, native_enum=False), default=Platform.TELEGRAM)
    external_id: Mapped[str] = mapped_column(String(255))  # chat_id in TG/MAX
    title: Mapped[str] = mapped_column(String(255), nullable=True)
    first_name: Mapped[str] = mapped_column(String(255), nullable=True)
    username: Mapped[str] = mapped_column(String(255), nullable=True)
    avatar_file_path: Mapped[str] = mapped_column(String(500), nullable=True)
    type: Mapped[str] = mapped_column(String(50), default="private")  # private | group | channel
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    account: Mapped["Account"] = relationship(back_populates="chats")
    messages: Mapped[list["Message"]] = relationship(back_populates="chat", cascade="all, delete-orphan")
