"""`python -m app.dispatcher`: run the dispatcher process until SIGTERM or SIGINT."""

import asyncio
import signal

from app.core.config import get_settings
from app.core.logging import configure_logging
from app.dispatcher.service import run_forever


async def _main() -> None:
    settings = get_settings()
    configure_logging(settings.log_level)
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for signum in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(signum, stop.set)
    await run_forever(settings=settings, stop=stop)


if __name__ == "__main__":
    asyncio.run(_main())
