import asyncio
import logging
from datetime import datetime, timezone

import httpx
from sqlalchemy import select

from app.config import settings
from app.database import async_session
from app.models import Account, Chat, Message, Platform

logger = logging.getLogger(__name__)


class MaxService:
    def __init__(self):
        self.token = settings.max_bot_token
        self.api_url = settings.max_api_url.rstrip("/")

    @property
    def headers(self) -> dict:
        return {"Authorization": self.token}

    async def _call(self, method: str, path: str, **kwargs) -> dict:
        async with httpx.AsyncClient(verify=settings.max_verify_ssl) as client:
            resp = await client.request(
                method,
                f"{self.api_url}/{path}",
                headers=self.headers,
                timeout=60,
                **kwargs,
            )
            resp.raise_for_status()
            return resp.json()

    async def get_me(self) -> dict:
        return await self._call("GET", "me")

    async def get_chat(self, chat_id: int) -> dict:
        return await self._call("GET", f"chats/{chat_id}")

    async def get_updates(self, marker: int | None = None, timeout: int = 30, types: str | None = None) -> dict:
        params = {"timeout": timeout, "limit": 100}
        if marker is not None:
            params["marker"] = marker
        if types:
            params["types"] = types
        return await self._call("GET", "updates", params=params)

    async def send_message(
        self,
        text: str,
        user_id: int | None = None,
        chat_id: int | None = None,
        attachments: list[dict] | None = None,
        link: dict | None = None,
    ) -> dict:
        params = {}
        if user_id is not None:
            params["user_id"] = user_id
        if chat_id is not None:
            params["chat_id"] = chat_id
        body: dict = {"text": text}
        if attachments:
            body["attachments"] = attachments
        if link:
            body["link"] = link
        return await self._call("POST", "messages", params=params, json=body)

    async def delete_message(self, message_id: str | int) -> dict:
        return await self._call("DELETE", "messages", params={"message_id": message_id})

    async def upload_file(self, upload_type: str, content: bytes, filename: str) -> str:
        data = await self._call("POST", f"uploads?type={upload_type}")
        url = data.get("url")
        if not url:
            raise ValueError("MAX upload: нет url для загрузки")
        token = data.get("token")
        async with httpx.AsyncClient(verify=settings.max_verify_ssl) as client:
            resp = await client.post(
                url,
                headers=self.headers,
                files={"data": (filename, content)},
                timeout=120,
            )
            resp.raise_for_status()
            body = resp.json()
        token = token or body.get("token")
        if not token:
            for item in (body.get("photos") or {}).values():
                token = item.get("token")
                if token:
                    break
        if not token:
            token = body.get("retval")
        if not token:
            raise ValueError("MAX upload: не получен token")
        return token

    async def send_media(
        self,
        chat_id: int,
        upload_type: str,
        content: bytes,
        filename: str,
        text: str = "",
        link: dict | None = None,
    ) -> dict:
        token = await self.upload_file(upload_type, content, filename)
        for attempt in range(4):
            try:
                return await self.send_message(
                    text,
                    chat_id=chat_id,
                    attachments=[{"type": upload_type, "payload": {"token": token}}],
                    link=link,
                )
            except httpx.HTTPStatusError as exc:
                resp_text = exc.response.text if exc.response is not None else ""
                if "attachment.not.ready" not in resp_text:
                    raise
                await asyncio.sleep(2 * (attempt + 1))
        raise RuntimeError("MAX send_media: attachment не готов")


max_service = MaxService()


async def get_or_create_max_account() -> Account | None:
    if not max_service.token:
        return None
    async with async_session() as session:
        result = await session.execute(
            select(Account).where(Account.platform == Platform.MAX)
        )
        account = result.scalar_one_or_none()
        if account is None:
            me = await max_service.get_me()
            account = Account(
                platform=Platform.MAX,
                bot_token=max_service.token,
                bot_username=me.get("username"),
            )
            session.add(account)
            await session.commit()
            await session.refresh(account)
        return account


def _ts_to_datetime(ts: int | None) -> datetime | None:
    if not ts:
        return None
    if ts > 10**12:
        ts = ts / 1000.0
    return datetime.fromtimestamp(ts, tz=timezone.utc)


async def upsert_max_chat(
    account: Account,
    chat_id: int,
    user: dict | None = None,
    chat_type: str | None = None,
) -> Chat:
    user = user or {}
    first_name = user.get("first_name")
    last_name = user.get("last_name")
    name = " ".join(p for p in (first_name, last_name) if p) or user.get("username") or f"MAX {chat_id}"
    if chat_type == "channel":
        type_ = "channel"
    elif chat_type == "chat":
        type_ = "group"
    else:
        type_ = "private"
    async with async_session() as session:
        result = await session.execute(
            select(Chat).where(
                Chat.account_id == account.id,
                Chat.platform == Platform.MAX,
                Chat.external_id == str(chat_id),
            )
        )
        chat = result.scalar_one_or_none()
        if chat is None:
            chat = Chat(
                account_id=account.id,
                platform=Platform.MAX,
                external_id=str(chat_id),
                title=name,
                first_name=first_name,
                username=user.get("username"),
                type=type_,
            )
            session.add(chat)
            await session.commit()
            await session.refresh(chat)
        else:
            if chat.first_name is None and first_name:
                chat.first_name = first_name
            if chat.username is None and user.get("username"):
                chat.username = user.get("username")
            if chat_type and chat.type != type_:
                chat.type = type_
            await session.commit()
        return chat


async def save_max_message(account: Account, message: dict):
    if not message:
        return
    recipient = message.get("recipient") or {}
    chat_id = recipient.get("chat_id") or recipient.get("user_id")
    if chat_id is None:
        return
    sender = message.get("sender") or {}
    body = message.get("body") or {}
    text = body.get("text")
    mid = (
        body.get("mid")
        or message.get("mid")
        or message.get("message_id")
        or message.get("id")
        or f"{chat_id}_{message.get('timestamp', '')}"
    )
    created_at = _ts_to_datetime(message.get("timestamp"))

    chat = await upsert_max_chat(
        account, chat_id=chat_id, user=sender, chat_type=recipient.get("chat_type")
    )

    kwargs = {
        "chat_id": chat.id,
        "platform": Platform.MAX,
        "external_id": str(mid),
        "text": text,
        "sender_name": sender.get("first_name") or sender.get("username") or "",
        "is_from_me": False,
    }
    if created_at is not None:
        kwargs["created_at"] = created_at

    async with async_session() as session:
        existing = await session.execute(
            select(Message).where(
                Message.chat_id == chat.id,
                Message.external_id == str(mid),
            )
        )
        if existing.scalar_one_or_none() is not None:
            return

        reply_to_id = None
        link = message.get("link")
        if link and link.get("type") == "reply":
            linked_body = link.get("message_body") or {}
            linked_mid = str(linked_body.get("mid") or "")
            if linked_mid:
                target = await session.execute(
                    select(Message).where(
                        Message.chat_id == chat.id,
                        Message.external_id == linked_mid,
                    )
                )
                target_msg = target.scalar_one_or_none()
                if target_msg is None:
                    target_msg = Message(
                        chat_id=chat.id,
                        platform=Platform.MAX,
                        external_id=linked_mid,
                        text=linked_body.get("text"),
                        sender_name=(link.get("sender") or {}).get("first_name") or "",
                        is_from_me=False,
                    )
                    session.add(target_msg)
                    await session.flush()
                reply_to_id = target_msg.id

        session.add(Message(**kwargs, reply_to_id=reply_to_id))
        await session.commit()


async def handle_max_update(update: dict):
    account = await get_or_create_max_account()
    if account is None:
        logger.warning("MAX_BOT_TOKEN не настроен, пропускаем update")
        return
    update_type = update.get("update_type")
    if update_type == "message_created":
        await save_max_message(account, update.get("message") or {})
    elif update_type == "bot_started":
        chat_id = update.get("chat_id")
        if chat_id is not None:
            await upsert_max_chat(
                account, chat_id=chat_id, user=update.get("user") or {}, chat_type="user"
            )


async def max_poller():
    if not max_service.token:
        logger.info("MAX_BOT_TOKEN не настроен, MAX poller выключен")
        return
    logger.info("MAX poller started")
    marker = None
    while True:
        try:
            account = await get_or_create_max_account()
            if account is None:
                await asyncio.sleep(10)
                continue
            data = await max_service.get_updates(
                marker=marker, types="message_created,bot_started"
            )
            updates = data.get("updates") or []
            if data.get("marker") is not None:
                marker = data["marker"]
            for update in updates:
                await handle_max_update(update)
        except Exception as exc:
            logger.warning("MAX poll error: %s", exc)
            await asyncio.sleep(10)
