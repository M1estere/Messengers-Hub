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
    created_at: datetime


class ChatOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    platform: str
    external_id: str
    title: str | None
    first_name: str | None = None
    username: str | None = None
    type: str
    avatar_url: str | None = None
    last_message: MessageOut | None = None


class MessageCreate(BaseModel):
    text: str
