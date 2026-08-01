from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import select

from app.config import settings

engine = create_async_engine(settings.database_url, echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with async_session() as session:
        yield session


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await _migrate_missing_columns()
    await _backfill_max_user_ids()


async def _backfill_max_user_ids():
    try:
        from app.models import Chat, Platform
        from app.services.max import max_service

        async with async_session() as session:
            result = await session.execute(
                select(Chat).where(
                    Chat.platform == Platform.MAX,
                    Chat.type == "private",
                    Chat.user_external_id.is_(None),
                )
            )
            for chat in result.scalars():
                try:
                    info = await max_service.get_chat(int(chat.external_id))
                    user = (info or {}).get("dialog_with_user") or {}
                    if user.get("user_id"):
                        chat.user_external_id = str(user["user_id"])
                        await session.commit()
                except Exception as exc:
                    from app.services.max import logger

                    logger.debug("backfill user_id %s: %s", chat.external_id, exc)
    except Exception as exc:
        from app.services.max import logger

        logger.warning("MAX user_id backfill: %s", exc)


async def _migrate_missing_columns():
    async with engine.begin() as conn:
        cols = await conn.exec_driver_sql("PRAGMA table_info(accounts)")
        existing = {row[1] for row in cols}
        if "bot_id" not in existing:
            await conn.exec_driver_sql(
                "ALTER TABLE accounts ADD COLUMN bot_id VARCHAR(255)"
            )

    async with engine.begin() as conn:
        cols = await conn.exec_driver_sql("PRAGMA table_info(chats)")
        existing = {row[1] for row in cols}
        if "avatar_file_path" not in existing:
            await conn.exec_driver_sql(
                "ALTER TABLE chats ADD COLUMN avatar_file_path VARCHAR(500)"
            )
        if "username" not in existing:
            await conn.exec_driver_sql(
                "ALTER TABLE chats ADD COLUMN username VARCHAR(255)"
            )
        if "user_external_id" not in existing:
            await conn.exec_driver_sql(
                "ALTER TABLE chats ADD COLUMN user_external_id VARCHAR(255)"
            )
        if "first_name" not in existing:
            await conn.exec_driver_sql(
                "ALTER TABLE chats ADD COLUMN first_name VARCHAR(255)"
            )
        if "is_pinned" not in existing:
            await conn.exec_driver_sql(
                "ALTER TABLE chats ADD COLUMN is_pinned BOOLEAN DEFAULT 0"
            )
        await conn.exec_driver_sql(
            "UPDATE chats SET title = REPLACE(title, ' (@' || username || ')', '') "
            "WHERE username IS NOT NULL AND title LIKE '% (@' || username || ')'"
        )
        await conn.exec_driver_sql(
            "UPDATE chats SET first_name = title "
            "WHERE type = 'private' AND (first_name IS NULL OR first_name = '')"
        )

    async with engine.begin() as conn:
        cols = await conn.exec_driver_sql("PRAGMA table_info(messages)")
        existing = {row[1] for row in cols}
        if "is_read" not in existing:
            await conn.exec_driver_sql(
                "ALTER TABLE messages ADD COLUMN is_read BOOLEAN"
            )
            await conn.exec_driver_sql("UPDATE messages SET is_read = 1")
        if "media_type" not in existing:
            await conn.exec_driver_sql(
                "ALTER TABLE messages ADD COLUMN media_type VARCHAR(50)"
            )
        if "media_path" not in existing:
            await conn.exec_driver_sql(
                "ALTER TABLE messages ADD COLUMN media_path VARCHAR(500)"
            )
        if "media_name" not in existing:
            await conn.exec_driver_sql(
                "ALTER TABLE messages ADD COLUMN media_name VARCHAR(255)"
            )
        if "media_data" not in existing:
            await conn.exec_driver_sql(
                "ALTER TABLE messages ADD COLUMN media_data BLOB"
            )
        if "reply_to_id" not in existing:
            await conn.exec_driver_sql(
                "ALTER TABLE messages ADD COLUMN reply_to_id INTEGER"
            )
