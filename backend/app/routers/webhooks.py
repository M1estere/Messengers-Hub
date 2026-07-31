from fastapi import APIRouter, Request

from app.services.telegram import handle_update

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.post("/telegram")
async def telegram_webhook(request: Request):
    body = await request.json()
    await handle_update(body)
    return {"ok": True}


@router.post("/max")
async def max_webhook(request: Request):
    body = await request.json()
    # TODO: process incoming MAX message
    return {"ok": True}
