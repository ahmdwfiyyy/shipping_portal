"""Vercel entry point: runs the FastAPI backend (backend/app.py) as a Python serverless function."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend"))

import store  # noqa: E402
from app import app  # noqa: E402,F401  (Vercel serves this ASGI app)

# Serverless platforms may skip FastAPI's start-up hook, so create the tables and first admin here
store.bootstrap()
