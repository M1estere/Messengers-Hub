from pathlib import Path

from fastapi import APIRouter, Depends
from fastapi import Response
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Chat, Message
from app.schemas.chat import ChatOut, MessageOut
from app.services.telegram import load_avatar

router = APIRouter(prefix="/chats", tags=["chats"])


@router.get("/", response_model=list[ChatOut])
async def list_chats(db: AsyncSession = Depends(get_db)):
    last_message_id = (
        select(Message.id)
        .where(Message.chat_id == Chat.id)
        .order_by(Message.created_at.desc(), Message.id.desc())
        .limit(1)
        .correlate(Chat)
        .scalar_subquery()
    )
    result = await db.execute(
        select(Chat, Message)
        .outerjoin(Message, Message.id == last_message_id)
        .order_by(Message.created_at.desc().nullslast(), Chat.created_at.desc())
    )
    return [
        ChatOut(
            id=chat.id,
            platform=chat.platform,
            external_id=chat.external_id,
            title=chat.title,
            first_name=chat.first_name,
            username=chat.username,
            type=chat.type,
            avatar_url=f"/chats/{chat.id}/avatar",
            last_message=MessageOut.model_validate(last_message) if last_message else None,
        )
        for chat, last_message in result.all()
    ]


@router.get("/{chat_id}/avatar")
async def get_avatar(chat_id: int, db: AsyncSession = Depends(get_db)):
    chat = await db.get(Chat, chat_id)
    if chat is None:
        return Response(status_code=404)

    if not chat.avatar_file_path or not Path(chat.avatar_file_path).exists():
        await load_avatar(chat, db)

    if chat.avatar_file_path and Path(chat.avatar_file_path).exists():
        return FileResponse(chat.avatar_file_path, media_type="image/jpeg")

    return Response(status_code=204)
