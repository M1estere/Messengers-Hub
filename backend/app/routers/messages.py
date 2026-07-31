import mimetypes
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Chat, Message
from app.schemas.chat import MessageOut
from app.services.max import max_service
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
async def send_message(
    chat_id: int,
    db: AsyncSession = Depends(get_db),
    text: str = Form(""),
    file: UploadFile | None = File(None),
):
    chat = await db.get(Chat, chat_id)
    if chat is None:
        raise HTTPException(404, "чат не найден")

    media_type = None
    media_path = None
    media_name = None

    if file and file.filename:
        content = await file.read()
        content_type = file.content_type or "application/octet-stream"
        media_type = "image" if content_type.startswith("image/") else "document"
        media_name = file.filename

        if chat.platform == "telegram":
            if media_type == "image":
                await telegram.send_photo(chat.external_id, content, media_name, content_type, text)
            else:
                await telegram.send_document(chat.external_id, content, media_name, content_type, text)
        elif chat.platform == "max":
            upload_type = "image" if media_type == "image" else "file"
            await max_service.send_media(
                int(chat.external_id), upload_type, content, media_name, text
            )
        else:
            raise HTTPException(501, f"отправка медиа на платформу {chat.platform} ещё не поддерживается")
    else:
        if chat.platform == "telegram":
            await telegram.send_message(chat.external_id, text)
        elif chat.platform == "max":
            await max_service.send_message(text, chat_id=int(chat.external_id))
        else:
            raise HTTPException(501, f"платформа {chat.platform} ещё не поддерживается")

    message = Message(
        chat_id=chat.id,
        platform=chat.platform,
        external_id="",
        text=text or None,
        sender_name="",
        is_from_me=True,
        media_type=media_type,
        media_path=media_path,
        media_name=media_name,
        media_data=content if file and file.filename else None,
    )
    db.add(message)
    await db.commit()
    await db.refresh(message)
    return message


@router.get("/{message_id}/media")
async def get_media(message_id: int, db: AsyncSession = Depends(get_db)):
    message = await db.get(Message, message_id)
    if message is None:
        raise HTTPException(404, "сообщение не найдено")
    if message.media_data:
        content_type = mimetypes.guess_type(message.media_name or "")[0] or "application/octet-stream"
        return Response(content=message.media_data, media_type=content_type)
    if message.media_path and Path(message.media_path).exists():
        return FileResponse(message.media_path)
    raise HTTPException(404, "медиа не найдено")
