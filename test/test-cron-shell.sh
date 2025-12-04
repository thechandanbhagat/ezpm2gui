#!/bin/bash
# Test script for shell cron job

echo "[$(date -Iseconds)] Shell test cron job executed!"
echo "User: $(whoami)"
echo "Current directory: $(pwd)"
echo "Arguments: $@"
