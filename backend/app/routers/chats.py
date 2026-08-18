from fastapi import APIRouter, Depends, HTTPException
from fastapi import Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Chat, Message, Platform
from app.schemas.chat import ChatOut, MessageOut
from app.services.telegram import load_avatar
from app.services.auth import require_user
from app.services.yougile import create_yougile_task

router = APIRouter(prefix="/chats", tags=["chats"], dependencies=[Depends(require_user)])


@router.post("/{chat_id}/yougile")
async def add_to_yougile(chat_id: int, db: AsyncSession = Depends(get_db)):
    chat = await db.get(Chat, chat_id)
    if chat is None:
        raise HTTPException(404, "чат не найден")
    try:
        task = await create_yougile_task(chat)
    except ValueError as exc:
        raise HTTPException(503, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(502, str(exc)) from exc
    return {"ok": True, "task": task}


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
    unread_count = (
        select(func.count(Message.id))
        .where(
            Message.chat_id == Chat.id,
            Message.is_from_me.is_(False),
            Message.is_read.is_(False),
        )
        .correlate(Chat)
        .scalar_subquery()
    )
    result = await db.execute(
        select(Chat, Message, unread_count.label("unread_count"))
        .outerjoin(Message, Message.id == last_message_id)
        .order_by(
            Chat.is_pinned.desc(),
            Message.created_at.desc().nullslast(),
            Chat.created_at.desc(),
        )
    )
    return [
        ChatOut(
            id=chat.id,
            platform=chat.platform,
            external_id=chat.external_id,
            user_external_id=chat.user_external_id,
            title=chat.title,
            first_name=chat.first_name,
            username=chat.username,
            type=chat.type,
            avatar_url=f"/connect-hub/api/chats/{chat.id}/avatar",
            is_pinned=chat.is_pinned,
            unread_count=unread_count_value,
            last_message=MessageOut.model_validate(last_message) if last_message else None,
        )
        for chat, last_message, unread_count_value in result.all()
    ]


@router.patch("/{chat_id}/pin")
async def set_pinned(chat_id: int, pinned: bool = False, db: AsyncSession = Depends(get_db)):
    chat = await db.get(Chat, chat_id)
    if chat is None:
        raise HTTPException(404, "чат не найден")
    chat.is_pinned = pinned
    await db.commit()
    return {"ok": True, "id": chat.id, "is_pinned": chat.is_pinned}


@router.delete("/{chat_id}")
async def delete_chat(chat_id: int, db: AsyncSession = Depends(get_db)):
    chat = await db.get(Chat, chat_id)
    if chat is None:
        raise HTTPException(404, "чат не найден")
    await db.delete(chat)
    await db.commit()
    return {"ok": True}


@router.get("/{chat_id}/avatar")
async def get_avatar(chat_id: int, db: AsyncSession = Depends(get_db)):
    chat = await db.get(Chat, chat_id)
    if chat is None:
        return Response(status_code=404)

    if not chat.avatar_data and chat.platform == Platform.TELEGRAM:
        await load_avatar(chat, db)

    if chat.avatar_data:
        return Response(content=chat.avatar_data, media_type="image/jpeg")

    return Response(status_code=204)
