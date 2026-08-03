import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import init_db
from app.routers import webhooks, chats, messages, ws
from app.services.max import max_poller
from app.services.media import media_fetch_loop
from app.services.telegram import telegram_poller, avatar_fetch_loop

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    poller = asyncio.create_task(telegram_poller())
    max_poller_task = asyncio.create_task(max_poller())
    avatar_loader = asyncio.create_task(avatar_fetch_loop())
    media_loader = asyncio.create_task(media_fetch_loop())
    yield
    poller.cancel()
    max_poller_task.cancel()
    avatar_loader.cancel()
    media_loader.cancel()


app = FastAPI(title="ConnectHub", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(webhooks.router)
app.include_router(chats.router)
app.include_router(messages.router)
app.include_router(ws.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
