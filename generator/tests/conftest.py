import os

# Set before the tests import the app: config.py reads them at import time.
# They override generator/.env, and ".invalid" hosts can never be resolved (RFC 2606).
os.environ["OLLAMA_URL"] = "http://ollama.invalid:11434"
os.environ["OLLAMA_MODEL"] = "test-model"
os.environ["OLLAMA_TIMEOUT"] = "5"
os.environ["OLLAMA_NUM_CTX"] = "4096"
