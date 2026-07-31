from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Chat, Message
from app.schemas.chat import MessageCreate, MessageOut
from app.services.telegram import telegram

router = APIRouter(prefix="/messages", tags=["messages"])


@router.get("/{chat_id}", response_model=list[MessageOut])
async def list_messages(chat_id: int, db: AsyncSession = Depends(get_db)):
    chat = await db.get(Chat, chat_id)
    if chat is None:
        raise HTTPException(404, "чат не найден")
    result = await db.execute(
        select(Message).where(Message.chat_id == chat_id).order_by(Message.created_at)
    )
    messages = result.scalars().all()
    for message in messages:
        if not message.is_from_me and not message.is_read:
            message.is_read = True
    await db.commit()
    return messages


@router.post("/{chat_id}", response_model=MessageOut)
async def send_message(chat_id: int, payload: MessageCreate, db: AsyncSession = Depends(get_db)):
    chat = await db.get(Chat, chat_id)
    if chat is None:
        raise HTTPException(404, "чат не найден")
    if chat.platform == "telegram":
        await telegram.send_message(chat.external_id, payload.text)
    else:
        raise HTTPException(501, f"платформа {chat.platform} ещё не поддерживается")

    message = Message(
        chat_id=chat.id,
        platform=chat.platform,
        external_id="",
        text=payload.text,
        sender_name="",
        is_from_me=True,
    )
    db.add(message)
    await db.commit()
    await db.refresh(message)
    return message
