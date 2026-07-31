from app.config import settings


class MaxService:
    def __init__(self):
        self.token = settings.max_bot_token
        self.api_url = settings.max_api_url

    async def send_message(self, chat_id: str, text: str):
        # TODO: call MAX API
        # POST https://platform-api2.max.ru/messages?user_id={user_id}
        pass
