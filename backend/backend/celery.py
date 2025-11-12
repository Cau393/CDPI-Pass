from __future__ import absolute_import, unicode_literals

import logging
import os
import subprocess

from celery import Celery, shared_task

logger = logging.getLogger(__name__)

# Set the default Django settings module
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")

# Create the Celery application
app = Celery("backend")

# Load task modules from all registered Django apps
app.config_from_object("django.conf:settings", namespace="CELERY")

# Auto-discover tasks in all installed apps
# This will look for tasks.py in each app
app.autodiscover_tasks(["users", "tasks"])


@app.task(bind=True, ignore_result=True)
def debug_task(self):
    """Debug task to test Celery is working"""
    print(f"Request: {self.request!r}")


@shared_task
def check_pending_payments_task():
    logger.info("Running check_pending_payments management command")
    subprocess.run(["python", "manage.py", "check_pending_payments"], check=False)
