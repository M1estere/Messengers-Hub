from datetime import datetime

from pydantic import BaseModel, ConfigDict


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    platform: str
    external_id: str
    text: str | None
    sender_name: str | None
    is_from_me: bool
    is_read: bool = False
    reply_to_id: int | None = None
    media_type: str | None = None
    media_path: str | None = None
    media_name: str | None = None
    media_url: str | None = None
    duration: int | None = None
    created_at: datetime


class ChatOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    platform: str
    external_id: str
    user_external_id: str | None = None
    title: str | None
    first_name: str | None = None
    username: str | None = None
    type: str
    avatar_url: str | None = None
    is_pinned: bool = False
    unread_count: int = 0
    last_message: MessageOut | None = None


class MessageCreate(BaseModel):
    text: str
