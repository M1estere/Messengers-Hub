from datetime import datetime
from sqlalchemy import String, Integer, ForeignKey, Text, DateTime, Boolean, func, Enum, LargeBinary
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
    reply_to_id: Mapped[int] = mapped_column(ForeignKey("messages.id"), nullable=True)
    media_type: Mapped[str] = mapped_column(String(50), nullable=True)  # image | document | voice | audio
    media_path: Mapped[str] = mapped_column(String(500), nullable=True)
    media_name: Mapped[str] = mapped_column(String(255), nullable=True)
    media_data: Mapped[bytes] = mapped_column(LargeBinary, nullable=True)
    media_external_id: Mapped[str] = mapped_column(String(500), nullable=True)  # file_id (TG) / url (MAX)
    duration: Mapped[int] = mapped_column(Integer, nullable=True)  # секунды (голосовые/аудио)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    chat: Mapped["Chat"] = relationship(back_populates="messages")

    @property
    def media_url(self) -> str | None:
        return f"/connect-hub/api/messages/{self.id}/media" if (self.media_path or self.media_data or self.media_external_id) else None
