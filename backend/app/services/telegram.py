import asyncio
import logging
import re
from pathlib import Path

import httpx
from sqlalchemy import select

from app.config import settings
from app.database import async_session
from app.models import Account, Chat, Message, Platform

logger = logging.getLogger(__name__)

TELEGRAM_API = "https://api.telegram.org/bot{token}/{method}"
AVATARS_DIR = Path(__file__).resolve().parent.parent / "avatars"


class TelegramService:
    def __init__(self):
        self.token = settings.telegram_bot_token

    @property
    def base_url(self) -> str:
        return TELEGRAM_API.format(token=self.token, method="").rstrip("/")

    async def _call(self, method: str, **params) -> dict:
        async with httpx.AsyncClient() as client:
            resp = await client.post(f"{self.base_url}/{method}", json=params, timeout=60)
            resp.raise_for_status()
            data = resp.json()
            if not data.get("ok"):
                raise RuntimeError(data.get("description", "telegram api error"))
            return data["result"]

    async def get_me(self) -> dict:
        return await self._call("getMe")

    async def send_message(self, chat_id: int | str, text: str) -> dict:
        return await self._call("sendMessage", chat_id=chat_id, text=text)

    async def _send_file(self, method: str, file_field: str, chat_id, content: bytes, filename: str, content_type: str, caption: str) -> dict:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{self.base_url}/{method}",
                data={"chat_id": chat_id, "caption": caption},
                files={file_field: (filename, content, content_type)},
                timeout=120,
            )
            resp.raise_for_status()
            data = resp.json()
            if not data.get("ok"):
                raise RuntimeError(data.get("description", "telegram api error"))
            return data["result"]

    async def send_photo(self, chat_id: int | str, content: bytes, filename: str, content_type: str, caption: str = "") -> dict:
        return await self._send_file("sendPhoto", "photo", chat_id, content, filename, content_type, caption)

    async def send_document(self, chat_id: int | str, content: bytes, filename: str, content_type: str, caption: str = "") -> dict:
        return await self._send_file("sendDocument", "document", chat_id, content, filename, content_type, caption)

    async def get_updates(self, offset: int, timeout: int = 30) -> list:
        return await self._call("getUpdates", offset=offset, timeout=timeout)

    async def get_chat(self, chat_id: int | str) -> dict:
        return await self._call("getChat", chat_id=chat_id)

    async def get_file_path(self, file_id: str) -> str:
        data = await self._call("getFile", file_id=file_id)
        return data["file_path"]

    async def download_file(self, file_path: str, attempts: int = 3) -> bytes:
        url = f"{TELEGRAM_API.format(token=self.token, method='')}file/{file_path}"
        for i in range(attempts):
            try:
                async with httpx.AsyncClient() as client:
                    resp = await client.get(url, timeout=30)
                    resp.raise_for_status()
                    return resp.content
            except Exception:
                if i == attempts - 1:
                    raise
                await asyncio.sleep(2)

    async def download_avatar_via_web(self, username: str) -> bytes | None:
        """Аватарка через превью-страницу t.me/<username>: CDN telesco.pe,
        минуя нестабильный api.telegram.org/file/bot..."""
        page = None
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"https://t.me/{username}",
                headers={
                    "User-Agent": (
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
                    )
                },
                timeout=20,
            )
            resp.raise_for_status()
            page = resp.text
        match = re.search(
            r'src="(https://[^"]+telesco\.pe/file/[^"]+\.(?:jpe?g|png))"', page
        )
        if match is None:
            return None
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                match.group(1), headers={"User-Agent": "Mozilla/5.0"}, timeout=20
            )
            resp.raise_for_status()
            return resp.content


telegram = TelegramService()


async def get_or_create_account() -> Account | None:
    if not telegram.token:
        return None
    async with async_session() as session:
        result = await session.execute(
            select(Account).where(Account.platform == Platform.TELEGRAM)
        )
        account = result.scalar_one_or_none()
        if account is None:
            me = await telegram.get_me()
            account = Account(
                platform=Platform.TELEGRAM,
                bot_token=telegram.token,
                bot_username=me.get("username"),
            )
            session.add(account)
            await session.commit()
            await session.refresh(account)
        return account


async def save_message(account: Account, chat_data: dict, message_data: dict):
    chat_external_id = str(chat_data["id"])
    message_external_id = str(message_data.get("message_id", ""))

    username = chat_data.get("username")
    first_name = chat_data.get("first_name")
    title = chat_data.get("title") or first_name or username or "Без названия"

    async with async_session() as session:
        chat_result = await session.execute(
            select(Chat).where(
                Chat.account_id == account.id,
                Chat.external_id == chat_external_id,
            )
        )
        chat = chat_result.scalar_one_or_none()

        if chat is None:
            chat = Chat(
                account_id=account.id,
                platform=Platform.TELEGRAM,
                external_id=chat_external_id,
                title=title,
                first_name=first_name,
                username=username,
                type=chat_data.get("type", "private"),
            )
            session.add(chat)
            await session.flush()
            await load_avatar(chat, session)
        else:
            if chat.first_name is None and first_name:
                chat.first_name = first_name

        if not message_external_id:
            await session.commit()
            return

        existing = await session.execute(
            select(Message).where(
                Message.chat_id == chat.id,
                Message.external_id == message_external_id,
            )
        )
        if existing.scalar_one_or_none() is not None:
            return

        text = message_data.get("text") or message_data.get("caption")
        sender = (
            message_data.get("from", {}).get("first_name")
            or message_data.get("from", {}).get("username")
            or ""
        )

        session.add(
            Message(
                chat_id=chat.id,
                platform=Platform.TELEGRAM,
                external_id=message_external_id,
                text=text,
                sender_name=sender,
                is_from_me=False,
            )
        )
        await session.commit()


async def load_avatar(chat, session):
    info = None
    try:
        info = await telegram.get_chat(chat.external_id)
    except Exception as exc:
        logger.debug("get_chat %s: %s", chat.external_id, exc)

    content = None
    if info:
        photo = info.get("photo")
        if photo:
            try:
                content = await telegram.download_file(
                    await telegram.get_file_path(photo["big_file_id"])
                )
            except Exception as exc:
                logger.debug("TG file download %s: %s", chat.external_id, exc)

    username = (info or {}).get("username") or chat.username
    if content is None and username:
        try:
            content = await telegram.download_avatar_via_web(username)
        except Exception as exc:
            logger.debug("web avatar %s (@%s): %s", chat.external_id, username, exc)

    if not content:
        return False
    AVATARS_DIR.mkdir(parents=True, exist_ok=True)
    local_path = AVATARS_DIR / f"chat_{chat.id}.jpg"
    local_path.write_bytes(content)
    chat.avatar_file_path = str(local_path)
    if info and chat.username is None and info.get("username"):
        chat.username = info.get("username")
    if info and chat.first_name is None and info.get("first_name"):
        chat.first_name = info.get("first_name")
    await session.commit()
    return True


async def avatar_fetch_loop():
    """Файлы TG доступны для скачивания нестабильно (иногда 404 в течение минут),
    поэтому фоново пытаемся докачать недостающие аватары до победного."""
    while True:
        await asyncio.sleep(20)
        try:
            async with async_session() as session:
                result = await session.execute(select(Chat))
                for chat in result.scalars():
                    if not chat.avatar_file_path or not Path(chat.avatar_file_path).exists():
                        await load_avatar(chat, session)
        except Exception as exc:
            logger.debug("avatar_fetch_loop error: %s", exc)


async def handle_update(update: dict):
    for key in ("message", "edited_message", "channel_post"):
        if key in update:
            await save_message_from_update(update[key])
            return


async def save_message_from_update(message: dict):
    account = await get_or_create_account()
    if account is None:
        logger.warning("TELEGRAM_BOT_TOKEN не настроен, пропускаем update")
        return
    chat_data = message.get("chat")
    if chat_data is None:
        return
    await save_message(account, chat_data, message)


async def telegram_poller():
    logger.info("Telegram poller started")
    offset = 0
    while True:
        try:
            account = await get_or_create_account()
            if account is None:
                await asyncio.sleep(10)
                continue
            updates = await telegram.get_updates(offset=offset)
            for update in updates:
                await handle_update(update)
                offset = max(offset, update["update_id"] + 1)
        except Exception as exc:
            logger.warning("Telegram poll error: %s", exc)
            await asyncio.sleep(10)
