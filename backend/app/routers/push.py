from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.push_subscription import PushSubscription
from app.models.user import User
from app.services.auth import require_user

router = APIRouter(prefix="/push", tags=["push"])


class PushKeys(BaseModel):
    p256dh: str
    auth: str


class PushSubscriptionBody(BaseModel):
    endpoint: str
    keys: PushKeys


@router.get("/public-key")
async def public_key(_: User = Depends(require_user)):
    if not settings.vapid_public_key:
        raise HTTPException(503, "push-уведомления не настроены")
    return {"publicKey": settings.vapid_public_key}


@router.post("/subscribe")
async def subscribe(
    body: PushSubscriptionBody,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PushSubscription).where(PushSubscription.endpoint == body.endpoint)
    )
    subscription = result.scalar_one_or_none()
    if subscription is None:
        subscription = PushSubscription(
            user_id=user.id,
            endpoint=body.endpoint,
            p256dh=body.keys.p256dh,
            auth=body.keys.auth,
        )
        db.add(subscription)
    else:
        subscription.user_id = user.id
        subscription.p256dh = body.keys.p256dh
        subscription.auth = body.keys.auth
    await db.commit()
    return {"ok": True}


@router.delete("/subscribe")
async def unsubscribe(
    body: PushSubscriptionBody,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PushSubscription).where(
            PushSubscription.endpoint == body.endpoint,
            PushSubscription.user_id == user.id,
        )
    )
    subscription = result.scalar_one_or_none()
    if subscription:
        await db.delete(subscription)
        await db.commit()
    return {"ok": True}
