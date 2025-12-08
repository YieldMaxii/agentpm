#!/bin/bash
# Load environment variables from .env
export $(cat .env | grep -v '^#' | xargs)

# Start LangFlow using the virtual environment
./.venv/bin/python -m langflow run
