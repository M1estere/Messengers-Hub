from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Chat, Message
from app.schemas.chat import MessageOut
from app.services.telegram import telegram

router = APIRouter(prefix="/messages", tags=["messages"])

MEDIA_DIR = Path(__file__).resolve().parent.parent / "media"


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

        MEDIA_DIR.mkdir(parents=True, exist_ok=True)
        ext = Path(file.filename).suffix or ""
        local_path = MEDIA_DIR / f"msg_{uuid4().hex}{ext}"
        local_path.write_bytes(content)
        media_path = str(local_path)

        if chat.platform == "telegram":
            if media_type == "image":
                await telegram.send_photo(chat.external_id, content, media_name, content_type, text)
            else:
                await telegram.send_document(chat.external_id, content, media_name, content_type, text)
    else:
        if chat.platform == "telegram":
            await telegram.send_message(chat.external_id, text)
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
    )
    db.add(message)
    await db.commit()
    await db.refresh(message)
    return message


@router.get("/{message_id}/media")
async def get_media(message_id: int, db: AsyncSession = Depends(get_db)):
    message = await db.get(Message, message_id)
    if message is None or not message.media_path or not Path(message.media_path).exists():
        raise HTTPException(404, "медиа не найдено")
    return FileResponse(message.media_path)
