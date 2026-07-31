from fastapi import APIRouter

router = APIRouter(prefix="/chats", tags=["chats"])


@router.get("/")
async def list_chats():
    # TODO: return all chats grouped by platform
    return []
