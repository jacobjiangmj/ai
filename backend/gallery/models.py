from django.db import models


class Pipeline(models.Model):
    pipeline_id = models.BigIntegerField(unique=True)
    ref = models.CharField(max_length=255, blank=True)
    status = models.CharField(max_length=64, blank=True)
    web_url = models.URLField(blank=True)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]


class PipelineJob(models.Model):
    job_id = models.BigIntegerField(unique=True)
    pipeline = models.ForeignKey(Pipeline, related_name="jobs", on_delete=models.CASCADE)
    stage = models.CharField(max_length=255)
    name = models.CharField(max_length=255)
    status = models.CharField(max_length=64, blank=True)
    duration = models.FloatField(null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    web_url = models.URLField(blank=True)

    class Meta:
        ordering = ["-started_at", "stage", "name"]
        indexes = [
            models.Index(fields=["stage", "name"]),
            models.Index(fields=["started_at"]),
        ]
