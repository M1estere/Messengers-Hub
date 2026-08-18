import asyncio
import logging
from datetime import datetime, timezone

import httpx
from sqlalchemy import select

from app.config import settings
from app.database import async_session
from app.models import Chat, Message

logger = logging.getLogger(__name__)
INDEX_NAME = "messages"
_last_indexed_id = 0
_index_ready = False


def _headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {settings.meili_master_key}"}


def _timestamp(value: datetime | None) -> int:
    if value is None:
        return 0
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return int(value.timestamp())


def _document(message: Message, chat: Chat) -> dict:
    platform = message.platform.value if hasattr(message.platform, "value") else str(message.platform)
    return {
        "id": message.id,
        "chat_id": message.chat_id,
        "platform": platform,
        "text": message.text or "",
        "sender_name": message.sender_name or "",
        "chat_title": chat.title or chat.first_name or chat.username or "",
        "chat_username": chat.username or "",
        "site": (chat.title or "") if platform == "website" else "",
        "created_at": _timestamp(message.created_at),
        "created_at_iso": message.created_at.isoformat() if message.created_at else None,
        "is_from_me": bool(message.is_from_me),
        "media_type": message.media_type,
    }


async def _request(method: str, path: str, **kwargs):
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.request(
            method,
            f"{settings.meili_url}{path}",
            headers=_headers(),
            **kwargs,
        )
        response.raise_for_status()
        return response.json() if response.content else None


async def ensure_index():
    global _index_ready
    if _index_ready:
        return
    try:
        await _request("GET", f"/indexes/{INDEX_NAME}")
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code != 404:
            raise
        await _request("POST", "/indexes", json={"uid": INDEX_NAME, "primaryKey": "id"})
        await asyncio.sleep(0.5)
    await _request(
        "PATCH",
        f"/indexes/{INDEX_NAME}/settings",
        json={
            "searchableAttributes": ["text", "sender_name", "chat_title", "chat_username"],
            "filterableAttributes": ["chat_id", "platform", "site", "created_at", "is_from_me"],
            "sortableAttributes": ["created_at"],
        },
    )
    _index_ready = True


async def index_new_messages(full: bool = False) -> int:
    global _last_indexed_id
    await ensure_index()
    async with async_session() as session:
        query = (
            select(Message, Chat)
            .join(Chat, Chat.id == Message.chat_id)
            .order_by(Message.id)
        )
        if not full and _last_indexed_id:
            query = query.where(Message.id > _last_indexed_id)
        rows = (await session.execute(query)).all()
    if full:
        await _request("DELETE", f"/indexes/{INDEX_NAME}/documents")
    if not rows:
        return 0
    documents = [_document(message, chat) for message, chat in rows]
    for start in range(0, len(documents), 500):
        await _request(
            "POST",
            f"/indexes/{INDEX_NAME}/documents",
            json=documents[start:start + 500],
        )
    _last_indexed_id = max(document["id"] for document in documents)
    return len(documents)


async def search_messages(query: str, limit: int = 50, platform: str | None = None) -> dict:
    await index_new_messages()
    payload: dict = {
        "q": query,
        "limit": limit,
        "sort": ["created_at:desc"],
        "attributesToHighlight": ["text", "sender_name", "chat_title"],
        "highlightPreTag": "<mark>",
        "highlightPostTag": "</mark>",
    }
    if platform:
        payload["filter"] = f'platform = "{platform}"'
    return await _request("POST", f"/indexes/{INDEX_NAME}/search", json=payload)


async def delete_indexed_message(message_id: int):
    try:
        await ensure_index()
        await _request("DELETE", f"/indexes/{INDEX_NAME}/documents/{message_id}")
    except Exception:
        logger.exception("Failed to remove message %s from search", message_id)


async def search_sync_loop():
    first_run = True
    while True:
        try:
            count = await index_new_messages(full=first_run)
            if first_run:
                logger.info("Search index initialized with %s messages", count)
            first_run = False
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Search index sync failed")
        await asyncio.sleep(5)
