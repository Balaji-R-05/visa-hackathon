import logging

def setup_logger(name: str):
    """Setup and return a logger with standard formatting."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )
    return logging.getLogger(name)

logger = setup_logger("dqs-ai-agent")