from html import escape

import httpx

from app.config import settings

YOUGILE_TASKS_URL = "https://yougile.com/api-v2/tasks"
CONNECT_HUB_URL = "http://130.17.17.201/connect-hub/"


def _profile_url(chat) -> str:
    platform = getattr(chat.platform, "value", str(chat.platform))
    if platform == "telegram":
        return f"https://t.me/{chat.username}" if chat.username else f"tg://user?id={chat.external_id}"
    if platform == "max":
        return f"max://user/{chat.user_external_id or chat.external_id}"
    return ""


async def create_yougile_task(chat) -> dict:
    if not settings.yougile_api_key:
        raise ValueError("не задан YOUGILE_API_KEY")
    if not settings.yougile_column_id:
        raise ValueError("не задан YOUGILE_COLUMN_ID")

    name = chat.first_name or chat.username or chat.title or "Без имени"
    platform = getattr(chat.platform, "value", str(chat.platform))
    values = {
        "name": escape(str(name)),
        "username": escape(str(chat.username or "-")),
        "platform": escape(str(platform)),
        "external_id": escape(str(chat.external_id or "-")),
        "user_external_id": escape(str(chat.user_external_id or "-")),
        "profile_url": escape(str(_profile_url(chat) or "-")),
    }
    description_text = settings.yougile_task_text.replace("\\n", "\n").format_map(values)
    description = (
        "<br>".join(description_text.splitlines())
        + f'<br><br><a href="{CONNECT_HUB_URL}?chat={chat.id}">Перейти к чату</a>'
    )
    payload = {
        "title": f"Заявка из мессенджера - {values['platform']}",
        "columnId": settings.yougile_column_id,
        "description": description,
    }
    async with httpx.AsyncClient() as client:
        response = await client.post(
            YOUGILE_TASKS_URL,
            headers={
                "Authorization": f"Bearer {settings.yougile_api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=30,
        )
    if response.status_code not in (200, 201):
        detail = response.text[:500]
        raise RuntimeError(f"YouGile HTTP {response.status_code}: {detail}")
    return response.json()
