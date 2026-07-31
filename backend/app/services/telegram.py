from app.config import settings


class TelegramService:
    def __init__(self):
        self.token = settings.telegram_bot_token

    async def send_message(self, chat_id: str, text: str):
        # TODO: call TG Bot API
        pass
