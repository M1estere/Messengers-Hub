import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Account, Chat, Message, Platform
from app.schemas.chat import MessageOut
from app.services.push import send_new_message_push

router = APIRouter(prefix="/widget", tags=["website-widget"])


class WidgetSessionIn(BaseModel):
    visitor_id: str | None = None
    name: str | None = Field(default=None, max_length=100)
    page_url: str | None = Field(default=None, max_length=1000)
    referrer: str | None = Field(default=None, max_length=1000)


class WidgetMessageIn(BaseModel):
    text: str = Field(min_length=1, max_length=4000)


def _visitor_id(value: str | None) -> str:
    if not value:
        return str(uuid.uuid4())
    try:
        return str(uuid.UUID(value))
    except ValueError as exc:
        raise HTTPException(400, "некорректный visitor_id") from exc


async def _website_account(db: AsyncSession) -> Account:
    result = await db.execute(select(Account).where(Account.platform == Platform.WEBSITE))
    account = result.scalar_one_or_none()
    if account is None:
        account = Account(platform=Platform.WEBSITE, bot_token="website-widget", bot_username="Сайт")
        db.add(account)
        await db.flush()
    return account


async def _chat(visitor_id: str, db: AsyncSession) -> Chat:
    result = await db.execute(
        select(Chat).where(Chat.platform == Platform.WEBSITE, Chat.external_id == visitor_id)
    )
    chat = result.scalar_one_or_none()
    if chat is None:
        raise HTTPException(404, "диалог не найден")
    return chat


@router.post("/session")
async def open_session(body: WidgetSessionIn, db: AsyncSession = Depends(get_db)):
    visitor_id = _visitor_id(body.visitor_id)
    account = await _website_account(db)
    result = await db.execute(
        select(Chat).where(Chat.account_id == account.id, Chat.external_id == visitor_id)
    )
    chat = result.scalar_one_or_none()
    if chat is None:
        short_id = visitor_id.split("-")[0]
        chat = Chat(
            account_id=account.id,
            platform=Platform.WEBSITE,
            external_id=visitor_id,
            user_external_id=body.page_url,
            title=(body.name or f"Посетитель {short_id}").strip(),
            first_name=(body.name or f"Посетитель {short_id}").strip(),
            username=None,
            type="private",
        )
        db.add(chat)
        await db.commit()
        await db.refresh(chat)
    elif body.page_url and chat.user_external_id != body.page_url:
        chat.user_external_id = body.page_url
        await db.commit()
    return {"visitorId": visitor_id, "chatId": chat.id, "source": "website"}


@router.get("/messages/{visitor_id}", response_model=list[MessageOut])
async def widget_messages(visitor_id: str, db: AsyncSession = Depends(get_db)):
    visitor_id = _visitor_id(visitor_id)
    chat = await _chat(visitor_id, db)
    result = await db.execute(
        select(Message).where(Message.chat_id == chat.id).order_by(Message.created_at, Message.id)
    )
    return list(result.scalars())


@router.post("/messages/{visitor_id}", response_model=MessageOut)
async def widget_send(visitor_id: str, body: WidgetMessageIn, db: AsyncSession = Depends(get_db)):
    visitor_id = _visitor_id(visitor_id)
    chat = await _chat(visitor_id, db)
    text = body.text.strip()
    if not text:
        raise HTTPException(400, "сообщение не может быть пустым")
    message = Message(
        chat_id=chat.id,
        platform=Platform.WEBSITE,
        external_id=f"visitor-{uuid.uuid4()}",
        text=text,
        sender_name=chat.title or "Посетитель сайта",
        is_from_me=False,
        is_read=False,
    )
    db.add(message)
    await db.commit()
    await db.refresh(message)
    await send_new_message_push(chat.id, chat.title or "Сообщение с сайта", message.text or "Новое сообщение")
    return message
