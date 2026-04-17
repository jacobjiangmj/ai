from datetime import timedelta

import requests
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from .models import Pipeline, PipelineJob


class GitLabConfigError(Exception):
    pass


class GitLabService:
    def __init__(self):
        self.base_url = settings.GITLAB_BASE_URL.rstrip("/")
        self.project_path = settings.GITLAB_PROJECT_PATH.strip("/")
        self.token = settings.GITLAB_PRIVATE_TOKEN

        if not self.token:
            raise GitLabConfigError("Missing GITLAB_PRIVATE_TOKEN environment variable.")

    @property
    def headers(self):
        return {"PRIVATE-TOKEN": self.token}

    def _get(self, path, params=None):
        response = requests.get(
            f"{self.base_url}/api/v4{path}",
            params=params,
            headers=self.headers,
            timeout=30,
        )
        response.raise_for_status()
        return response

    def get_project_id(self):
        response = self._get(f"/projects/{requests.utils.quote(self.project_path, safe='')}")
        return response.json()["id"]

    def fetch_recent_jobs(self, days=30):
        project_id = self.get_project_id()
        since = timezone.now() - timedelta(days=days)
        page = 1

        while True:
            response = self._get(
                f"/projects/{project_id}/jobs",
                params={"per_page": 100, "page": page, "scope[]": "success", "include_retried": "false"},
            )
            jobs = response.json()
            if not jobs:
                break

            should_stop = False
            filtered_jobs = []
            for job in jobs:
                created_at = parse_datetime(job.get("created_at"))
                if created_at and created_at < since:
                    should_stop = True
                    continue
                filtered_jobs.append(job)

            self._store_jobs(filtered_jobs)
            if should_stop:
                break
            page += 1

    @transaction.atomic
    def _store_jobs(self, jobs):
        for job in jobs:
            pipeline_data = job.get("pipeline") or {}
            pipeline, _ = Pipeline.objects.update_or_create(
                pipeline_id=pipeline_data.get("id"),
                defaults={
                    "ref": pipeline_data.get("ref", ""),
                    "status": pipeline_data.get("status", ""),
                    "web_url": pipeline_data.get("web_url", ""),
                    "created_at": parse_datetime(pipeline_data.get("created_at")) or parse_datetime(job.get("created_at")),
                    "updated_at": parse_datetime(pipeline_data.get("updated_at")) or parse_datetime(job.get("finished_at")),
                },
            )

            PipelineJob.objects.update_or_create(
                job_id=job["id"],
                defaults={
                    "pipeline": pipeline,
                    "stage": job.get("stage") or "unknown",
                    "name": job.get("name") or "unknown",
                    "status": job.get("status", ""),
                    "duration": job.get("duration"),
                    "started_at": parse_datetime(job.get("started_at")),
                    "finished_at": parse_datetime(job.get("finished_at")),
                    "web_url": job.get("web_url", ""),
                },
            )
