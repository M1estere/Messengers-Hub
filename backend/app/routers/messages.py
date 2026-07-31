from fastapi import APIRouter

router = APIRouter(prefix="/messages", tags=["messages"])


@router.get("/{chat_id}")
async def list_messages(chat_id: int):
    # TODO: return messages for chat
    return []


@router.post("/{chat_id}")
async def send_message(chat_id: int, text: str):
    # TODO: send message to TG or MAX depending on chat origin
    return {"ok": True}
