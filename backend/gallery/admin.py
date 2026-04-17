from django.contrib import admin

from .models import Pipeline, PipelineJob


@admin.register(Pipeline)
class PipelineAdmin(admin.ModelAdmin):
    list_display = ("pipeline_id", "ref", "status", "created_at")
    search_fields = ("pipeline_id", "ref", "status")


@admin.register(PipelineJob)
class PipelineJobAdmin(admin.ModelAdmin):
    list_display = ("job_id", "stage", "name", "status", "duration", "started_at")
    list_filter = ("stage", "status")
    search_fields = ("job_id", "name", "stage")
