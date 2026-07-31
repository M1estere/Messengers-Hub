from datetime import datetime
from sqlalchemy import String, Integer, ForeignKey, Text, DateTime, Boolean, func, Enum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.enums import Platform


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    chat_id: Mapped[int] = mapped_column(ForeignKey("chats.id"))
    platform: Mapped[Platform] = mapped_column(Enum(Platform, native_enum=False), default=Platform.TELEGRAM)
    external_id: Mapped[str] = mapped_column(String(255))  # message_id in TG/MAX
    text: Mapped[str] = mapped_column(Text, nullable=True)
    sender_name: Mapped[str] = mapped_column(String(255), nullable=True)
    is_from_me: Mapped[bool] = mapped_column(Boolean, default=False)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    chat: Mapped["Chat"] = relationship(back_populates="messages")
