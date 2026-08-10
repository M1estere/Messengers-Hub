import asyncio
import json
import logging

from pywebpush import WebPushException, webpush
from sqlalchemy import select

from app.config import settings
from app.database import async_session
from app.models.push_subscription import PushSubscription

logger = logging.getLogger(__name__)


async def send_new_message_push(chat_id: int, title: str, body: str) -> None:
    if not settings.vapid_public_key or not settings.vapid_private_key:
        return
    async with async_session() as session:
        result = await session.execute(select(PushSubscription))
        subscriptions = list(result.scalars())
        stale: list[PushSubscription] = []
        payload = json.dumps(
            {
                "title": title,
                "body": body or "Новое сообщение",
                "url": f"/connect-hub/?chat={chat_id}",
                "chatId": chat_id,
            },
            ensure_ascii=False,
        )
        for subscription in subscriptions:
            try:
                await asyncio.to_thread(
                    webpush,
                    subscription_info={
                        "endpoint": subscription.endpoint,
                        "keys": {"p256dh": subscription.p256dh, "auth": subscription.auth},
                    },
                    data=payload,
                    vapid_private_key=settings.vapid_private_key,
                    vapid_claims={"sub": settings.vapid_claims_email},
                    ttl=300,
                )
            except WebPushException as exc:
                status = getattr(getattr(exc, "response", None), "status_code", None)
                if status in (404, 410):
                    stale.append(subscription)
                else:
                    logger.warning("Web Push error: %s", exc)
            except Exception as exc:
                logger.warning("Web Push error: %s", exc)
        for subscription in stale:
            await session.delete(subscription)
        if stale:
            await session.commit()
