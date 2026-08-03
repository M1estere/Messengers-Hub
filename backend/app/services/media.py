import asyncio
import logging
from pathlib import Path

from sqlalchemy import select

from app.database import async_session
from app.models import Message, Platform
from app.services.max import max_service
from app.services.telegram import telegram

logger = logging.getLogger(__name__)

ERROR_LOG = Path("/tmp/media_download.log")


def _log_error(msg: str):
    try:
        with ERROR_LOG.open("a") as f:
            f.write(msg + "\n")
    except Exception:
        pass


async def fetch_message_media(message: Message) -> bytes | None:
    """Докачивает медиа по media_external_id (file_id для TG, url для MAX)."""
    if not message.media_external_id:
        return None
    try:
        if message.platform == Platform.TELEGRAM:
            file_path = await telegram.get_file_path(message.media_external_id)
            return await telegram.download_file(file_path)
        if message.platform == Platform.MAX:
            return await max_service.download_url(message.media_external_id)
    except Exception as exc:
        _log_error(f"[{message.id}] {message.platform} download: {exc!r}")
        logger.debug("media download %s: %s", message.id, exc)
    return None


async def media_fetch_loop():
    """Фоновая докачка недостающих голосовых/аудио."""
    while True:
        await asyncio.sleep(15)
        try:
            async with async_session() as session:
                result = await session.execute(
                    select(Message).where(
                        Message.media_type.in_(("voice", "audio")),
                        Message.media_external_id.is_not(None),
                        Message.media_data.is_(None),
                    )
                )
                for message in result.scalars():
                    data = await fetch_message_media(message)
                    if data:
                        message.media_data = data
                        await session.commit()
                        _log_error(f"[{message.id}] downloaded {len(data)} bytes")
        except Exception as exc:
            logger.debug("media_fetch_loop error: %s", exc)
