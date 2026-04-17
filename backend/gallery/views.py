from datetime import timedelta

from django.conf import settings
from django.db.models import Avg, Count
from django.db.models.functions import TruncDate
from django.http import JsonResponse
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django.views import View
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt

from .models import PipelineJob
from .services import GitLabConfigError, GitLabService


class PipelineJobQueryService:
    @classmethod
    def parse_multi_values(cls, request, key):
        return [value.strip() for value in request.GET.getlist(key) if value.strip()]

    @classmethod
    def parse_datetime_value(cls, value):
        if not value:
            return None
        parsed = parse_datetime(value)
        if parsed is None:
            return None
        if timezone.is_naive(parsed):
            return timezone.make_aware(parsed, timezone.get_current_timezone())
        return parsed

    @classmethod
    def validated_filters(cls, request):
        stages = cls.parse_multi_values(request, "stage")
        job_names = cls.parse_multi_values(request, "job_name")
        search = request.GET.get("search", "").strip()
        start_at = cls.parse_datetime_value(request.GET.get("start_at", "").strip())
        end_at = cls.parse_datetime_value(request.GET.get("end_at", "").strip())

        if end_at is not None:
            end_at = end_at.replace(second=59, microsecond=999999)

        if request.GET.get("start_at", "").strip() and start_at is None:
            raise ValueError("开始时间格式不正确")
        if request.GET.get("end_at", "").strip() and end_at is None:
            raise ValueError("结束时间格式不正确")
        if start_at and end_at and start_at > end_at:
            raise ValueError("开始时间必须小于等于结束时间")

        return {
            "stages": stages,
            "job_names": job_names,
            "search": search,
            "start_at": start_at,
            "end_at": end_at,
        }

    @classmethod
    def base_queryset(cls):
        since = timezone.now() - timedelta(days=30)
        return PipelineJob.objects.filter(started_at__gte=since, duration__isnull=False).select_related("pipeline")

    @classmethod
    def filtered_queryset(cls, request):
        queryset = cls.base_queryset()
        filters = cls.validated_filters(request)

        if filters["stages"]:
            queryset = queryset.filter(stage__in=filters["stages"])
        if filters["job_names"]:
            queryset = queryset.filter(name__in=filters["job_names"])
        if filters["search"]:
            queryset = queryset.filter(name__icontains=filters["search"])
        if filters["start_at"]:
            queryset = queryset.filter(started_at__gte=filters["start_at"])
        if filters["end_at"]:
            queryset = queryset.filter(started_at__lte=filters["end_at"])

        return queryset

    @classmethod
    def filter_payload(cls):
        queryset = cls.base_queryset().values("stage", "name").distinct().order_by("stage", "name")
        stage_job_map = {}

        for item in queryset:
            stage_job_map.setdefault(item["stage"], []).append(item["name"])

        return {
            "stages": list(stage_job_map.keys()),
            "jobs": sorted({job for jobs in stage_job_map.values() for job in jobs}),
            "stage_job_map": stage_job_map,
            "limits": {"maxCharts": 8},
            "config": {
                "projectPath": settings.GITLAB_PROJECT_PATH,
                "baseUrl": settings.GITLAB_BASE_URL,
                "hasToken": bool(settings.GITLAB_PRIVATE_TOKEN),
            },
        }

    @classmethod
    def duration_charts(cls, request):
        queryset = cls.filtered_queryset(request)
        groups = (
            queryset.values("stage", "name")
            .annotate(avg_duration=Avg("duration"), run_count=Count("id"))
            .order_by("stage", "name")[:8]
        )

        charts = []
        for group in groups:
            series_queryset = (
                queryset.filter(stage=group["stage"], name=group["name"])
                .annotate(day=TruncDate("started_at"))
                .values("day")
                .annotate(avg_duration=Avg("duration"), run_count=Count("id"))
                .order_by("day")
            )
            charts.append(
                {
                    "key": f"duration::{group['stage']}::{group['name']}",
                    "stage": group["stage"],
                    "job_name": group["name"],
                    "average_duration": round(group["avg_duration"] or 0, 2),
                    "run_count": group["run_count"],
                    "points": [
                        {
                            "label": item["day"].isoformat(),
                            "avg_duration": round(item["avg_duration"] or 0, 2),
                            "run_count": item["run_count"],
                            "job_id": None,
                            "web_url": "",
                        }
                        for item in series_queryset
                    ],
                }
            )

        return charts

    @classmethod
    def job_id_charts(cls, request):
        queryset = cls.filtered_queryset(request)
        groups = (
            queryset.values("stage", "name")
            .annotate(avg_duration=Avg("duration"), run_count=Count("id"))
            .order_by("stage", "name")[:8]
        )

        charts = []
        for group in groups:
            series_queryset = queryset.filter(stage=group["stage"], name=group["name"]).order_by("started_at", "job_id")
            charts.append(
                {
                    "key": f"jobid::{group['stage']}::{group['name']}",
                    "stage": group["stage"],
                    "job_name": group["name"],
                    "average_duration": round(group["avg_duration"] or 0, 2),
                    "run_count": group["run_count"],
                    "points": [
                        {
                            "label": str(item.job_id),
                            "avg_duration": round(item.duration or 0, 2),
                            "run_count": 1,
                            "job_id": item.job_id,
                            "web_url": item.web_url,
                        }
                        for item in series_queryset
                    ],
                }
            )

        return charts

    @classmethod
    def filters_payload(cls, request):
        filters = cls.validated_filters(request)
        return {
            "stage": filters["stages"],
            "job_name": filters["job_names"],
            "search": filters["search"],
            "start_at": request.GET.get("start_at", "").strip(),
            "end_at": request.GET.get("end_at", "").strip(),
        }


@method_decorator(csrf_exempt, name="dispatch")
class GitLabSyncView(View):
    def post(self, request):
        try:
            GitLabService().fetch_recent_jobs(days=30)
        except GitLabConfigError as exc:
            return JsonResponse({"detail": str(exc)}, status=400)
        except Exception as exc:
            return JsonResponse({"detail": f"GitLab sync failed: {exc}"}, status=502)

        return JsonResponse({"detail": "sync completed"})


class FilterOptionsView(View):
    def get(self, request):
        return JsonResponse(PipelineJobQueryService.filter_payload())


class DurationDashboardView(View):
    def get(self, request):
        try:
            return JsonResponse({"results": PipelineJobQueryService.duration_charts(request), "filters": PipelineJobQueryService.filters_payload(request)})
        except ValueError as exc:
            return JsonResponse({"detail": str(exc)}, status=400)


class JobIdDashboardView(View):
    def get(self, request):
        try:
            return JsonResponse({"results": PipelineJobQueryService.job_id_charts(request), "filters": PipelineJobQueryService.filters_payload(request)})
        except ValueError as exc:
            return JsonResponse({"detail": str(exc)}, status=400)
