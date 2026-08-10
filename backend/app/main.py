import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import init_db
from app.routers import webhooks, chats, messages, ws, auth, push, widget
from app.models import Account, Platform
from app.models.user import User
from app.services.auth import hash_password
from app.database import async_session
from sqlalchemy import select
from app.services.max import max_poller
from app.services.media import media_fetch_loop
from app.services.telegram import telegram_poller, avatar_fetch_loop

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    async with async_session() as session:
        result = await session.execute(select(User).where(User.username == "admin"))
        if result.scalar_one_or_none() is None:
            session.add(User(username="admin", email="admin@local", password_hash=hash_password("admin")))
            await session.commit()
        website_account = await session.execute(select(Account).where(Account.platform == Platform.WEBSITE))
        if website_account.scalar_one_or_none() is None:
            session.add(Account(platform=Platform.WEBSITE, bot_token="website-widget", bot_username="Сайт"))
            await session.commit()
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
app.include_router(auth.router)
app.include_router(push.router)
app.include_router(widget.router)
app.include_router(chats.router)
app.include_router(messages.router)
app.include_router(ws.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
