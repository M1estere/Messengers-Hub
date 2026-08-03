import mimetypes
import re
from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Chat, Message
from app.schemas.chat import MessageOut
from app.services.max import max_service
from app.services.media import fetch_message_media
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
    reply_to_id: int | None = Form(None),
):
    chat = await db.get(Chat, chat_id)
    if chat is None:
        raise HTTPException(404, "чат не найден")

    reply_to_message = None
    if reply_to_id is not None:
        reply_to_message = await db.get(Message, reply_to_id)
        if reply_to_message is None or reply_to_message.chat_id != chat.id:
            raise HTTPException(400, "сообщение для ответа не найдено в этом чате")
    reply_external_id = reply_to_message.external_id or None if reply_to_message else None

    media_type = None
    media_path = None
    media_name = None
    external_id = ""

    if file and file.filename:
        content = await file.read()
        content_type = file.content_type or "application/octet-stream"
        media_type = "image" if content_type.startswith("image/") else "document"
        media_name = file.filename

        if chat.platform == "telegram":
            if media_type == "image":
                result = await telegram.send_photo(chat.external_id, content, media_name, content_type, text, reply_external_id)
            else:
                result = await telegram.send_document(chat.external_id, content, media_name, content_type, text, reply_external_id)
            external_id = str(result.get("message_id", ""))
        elif chat.platform == "max":
            upload_type = "image" if media_type == "image" else "file"
            result = await max_service.send_media(
                int(chat.external_id), upload_type, content, media_name, text,
                link={"type": "reply", "mid": reply_external_id} if reply_external_id else None,
            )
            external_id = _max_message_id(result)
        else:
            raise HTTPException(501, f"отправка медиа на платформу {chat.platform} ещё не поддерживается")
    else:
        if chat.platform == "telegram":
            result = await telegram.send_message(chat.external_id, text, reply_external_id)
            external_id = str(result.get("message_id", ""))
        elif chat.platform == "max":
            result = await max_service.send_message(
                text, chat_id=int(chat.external_id),
                link={"type": "reply", "mid": reply_external_id} if reply_external_id else None,
            )
            external_id = _max_message_id(result)
        else:
            raise HTTPException(501, f"платформа {chat.platform} ещё не поддерживается")

    message = Message(
        chat_id=chat.id,
        platform=chat.platform,
        external_id=external_id,
        text=text or None,
        sender_name="",
        is_from_me=True,
        reply_to_id=reply_to_id,
        media_type=media_type,
        media_path=media_path,
        media_name=media_name,
        media_data=content if file and file.filename else None,
    )
    db.add(message)
    await db.commit()
    await db.refresh(message)
    return message


def _max_message_id(result: dict) -> str:
    msg = result.get("message") or {}
    body = msg.get("body") or {}
    return str(
        body.get("mid")
        or msg.get("mid")
        or msg.get("message_id")
        or msg.get("id")
        or ""
    )


@router.delete("/{message_id}")
async def delete_message(message_id: int, db: AsyncSession = Depends(get_db)):
    message = await db.get(Message, message_id)
    if message is None:
        raise HTTPException(404, "сообщение не найдено")
    if not message.is_from_me:
        raise HTTPException(403, "можно удалять только свои сообщения")
    chat = await db.get(Chat, message.chat_id)
    if chat is None:
        raise HTTPException(404, "чат не найден")
    if message.external_id:
        try:
            if chat.platform == "telegram":
                await telegram.delete_message(chat.external_id, message.external_id)
            elif chat.platform == "max":
                await max_service.delete_message(message.external_id)
        except Exception:
            pass
    await db.delete(message)
    await db.commit()
    return {"ok": True}


@router.get("/{message_id}/media")
async def get_media(
    message_id: int,
    request: Request,
    download: bool = False,
    db: AsyncSession = Depends(get_db),
):
    message = await db.get(Message, message_id)
    if message is None:
        raise HTTPException(404, "сообщение не найдено")
    filename = message.media_name
    content_type = mimetypes.guess_type(filename or "")[0]
    if content_type is None:
        if message.media_type in ("voice", "audio"):
            content_type = "audio/ogg"
        elif message.media_type == "image":
            content_type = "image/jpeg"
        else:
            content_type = "application/octet-stream"
    headers = {}
    if download and filename:
        ascii_name = filename.encode("ascii", "ignore").decode() or "file"
        headers["Content-Disposition"] = (
            f'attachment; filename="{ascii_name}"; '
            f"filename*=UTF-8''{quote(filename)}"
        )
    if message.media_data:
        headers["Accept-Ranges"] = "bytes"
        if not download:
            range_header = request.headers.get("range")
            if range_header:
                match = re.match(r"bytes=(\d*)-(\d*)", range_header)
                if match:
                    start_s, end_s = match.groups()
                    total = len(message.media_data)
                    try:
                        start = int(start_s) if start_s else 0
                        end = int(end_s) if end_s else total - 1
                        if end >= total:
                            end = total - 1
                        if start <= end and 0 <= start < total:
                            chunk = message.media_data[start:end + 1]
                            headers["Content-Range"] = f"bytes {start}-{end}/{total}"
                            return Response(
                                status_code=206,
                                content=chunk,
                                media_type=content_type,
                                headers=headers,
                            )
                    except ValueError:
                        pass
        return Response(content=message.media_data, media_type=content_type, headers=headers)
    if message.media_external_id:
        data = await fetch_message_media(message)
        if data:
            message.media_data = data
            await db.commit()
            headers["Accept-Ranges"] = "bytes"
            return Response(content=data, media_type=content_type, headers=headers)
    if message.media_path and Path(message.media_path).exists():
        return FileResponse(message.media_path, media_type=content_type, headers=headers)
    raise HTTPException(404, "медиа не найдено")
