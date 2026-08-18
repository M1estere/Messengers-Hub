from fastapi import APIRouter, Depends, Query
from typing import Literal

from app.services.auth import require_user
from app.services.search import search_messages

router = APIRouter(prefix="/search", tags=["search"], dependencies=[Depends(require_user)])


@router.get("/messages")
async def search_message_history(
    q: str = Query(min_length=2, max_length=200),
    limit: int = Query(default=50, ge=1, le=100),
    platform: Literal["telegram", "max", "website"] | None = Query(default=None),
):
    result = await search_messages(q.strip(), limit, platform)
    return {
        "items": result.get("hits", []),
        "query": result.get("query", q),
        "processing_time_ms": result.get("processingTimeMs", 0),
        "estimated_total_hits": result.get("estimatedTotalHits", 0),
    }
