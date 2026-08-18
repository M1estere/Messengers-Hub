from html import escape
from urllib.parse import quote

import httpx

from app.config import settings

YOUGILE_TASKS_URL = "https://yougile.com/api-v2/tasks"
YOUGILE_COMPANY_URL = "https://yougile.com/api-v2/companies"
YOUGILE_UI_URL = "https://ru.yougile.com"
CONNECT_HUB_URL = "http://130.17.17.201/connect-hub/"


def _profile_url(chat) -> str:
    platform = getattr(chat.platform, "value", str(chat.platform))
    if platform == "telegram":
        return f"https://t.me/{chat.username}" if chat.username else f"tg://user?id={chat.external_id}"
    if platform == "max":
        return f"max://user/{chat.user_external_id or chat.external_id}"
    return ""


def _task_url(company_id: str | None, task_code: str | None) -> str | None:
    if not company_id or not task_code:
        return None
    return f"{YOUGILE_UI_URL}/team/{quote(company_id, safe='')}/#{quote(task_code, safe='-')}"


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
    headers = {
        "Authorization": f"Bearer {settings.yougile_api_key}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient() as client:
        response = await client.post(
            YOUGILE_TASKS_URL,
            headers=headers,
            json=payload,
            timeout=30,
        )
        if response.status_code not in (200, 201):
            detail = response.text[:500]
            raise RuntimeError(f"YouGile HTTP {response.status_code}: {detail}")

        task = response.json()
        task_id = task.get("id")
        if task_id:
            task_response = await client.get(
                f"{YOUGILE_TASKS_URL}/{quote(task_id, safe='')}",
                headers=headers,
                timeout=30,
            )
            if task_response.is_success:
                task.update(task_response.json())

        company_response = await client.get(YOUGILE_COMPANY_URL, headers=headers, timeout=30)
        company = company_response.json() if company_response.is_success else {}
        task_code = task.get("idTaskProject") or task.get("idTaskCommon")
        task["url"] = _task_url(company.get("id"), task_code)
        return task
