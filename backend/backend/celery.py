from __future__ import absolute_import, unicode_literals
import os
from celery import Celery

# Set default Django settings
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')

# Create Celery app
app = Celery('backend')

# Load config from Django settings, with a CELERY_ prefix
app.config_from_object('django.conf:settings', namespace='CELERY')

# Discover tasks across all Django apps automatically
app.autodiscover_tasks(['users', 'tasks'])

@app.task(bind=True)
def debug_task(self):
    print(f'Request: {self.request!r}')
