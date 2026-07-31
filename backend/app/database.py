from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

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


async def _migrate_missing_columns():
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
