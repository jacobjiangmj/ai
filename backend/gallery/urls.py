from django.urls import path

from .views import DurationDashboardView, FilterOptionsView, GitLabSyncView, JobIdDashboardView


urlpatterns = [
    path("gitlab/sync/", GitLabSyncView.as_view(), name="gitlab-sync"),
    path("gitlab/filters/", FilterOptionsView.as_view(), name="gitlab-filters"),
    path("gitlab/durations/", DurationDashboardView.as_view(), name="gitlab-durations"),
    path("gitlab/job-ids/", JobIdDashboardView.as_view(), name="gitlab-job-ids"),
]
