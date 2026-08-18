import asyncio
import sqlite3
from datetime import datetime
from pathlib import Path

from sqlalchemy import Boolean, DateTime, Enum, func, select, text

from app.database import Base, engine, init_db
from app import models  # noqa: F401

SQLITE_PATH = Path("/data/connect-hub.db")
TABLES = ["accounts", "users", "chats", "messages", "push_subscriptions"]


def convert_value(column, value):
    if value is None:
        return None
    if isinstance(column.type, DateTime) and isinstance(value, str):
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    if isinstance(column.type, Boolean):
        return bool(value)
    if isinstance(column.type, Enum) and column.type.enum_class:
        for member in column.type.enum_class:
            if value in (member.name, member.value):
                return member
    return value


def read_sqlite():
    source = sqlite3.connect(f"file:{SQLITE_PATH}?mode=ro", uri=True)
    source.row_factory = sqlite3.Row
    try:
        integrity = source.execute("PRAGMA integrity_check").fetchone()[0]
        if integrity != "ok":
            raise RuntimeError(f"SQLite integrity check failed: {integrity}")
        result = {}
        for table_name in TABLES:
            result[table_name] = [dict(row) for row in source.execute(f'SELECT * FROM "{table_name}"')]
        return result
    finally:
        source.close()


async def migrate():
    source_data = read_sqlite()
    await init_db()
    async with engine.begin() as connection:
        await connection.execute(text("SET FOREIGN_KEY_CHECKS=0"))
        for table_name in reversed(TABLES):
            await connection.execute(Base.metadata.tables[table_name].delete())
        for table_name in TABLES:
            table = Base.metadata.tables[table_name]
            columns = {column.name: column for column in table.columns}
            rows = [
                {
                    name: convert_value(columns[name], value)
                    for name, value in row.items()
                    if name in columns
                }
                for row in source_data[table_name]
            ]
            if rows:
                await connection.execute(table.insert(), rows)
        await connection.execute(text("SET FOREIGN_KEY_CHECKS=1"))

    async with engine.connect() as connection:
        for table_name in TABLES:
            table = Base.metadata.tables[table_name]
            target_count = await connection.scalar(select(func.count()).select_from(table))
            source_count = len(source_data[table_name])
            if target_count != source_count:
                raise RuntimeError(f"Count mismatch for {table_name}: SQLite={source_count}, MySQL={target_count}")
            print(f"{table_name}: {target_count}")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(migrate())
