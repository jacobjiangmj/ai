from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="Pipeline",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("pipeline_id", models.BigIntegerField(unique=True)),
                ("ref", models.CharField(blank=True, max_length=255)),
                ("status", models.CharField(blank=True, max_length=64)),
                ("web_url", models.URLField(blank=True)),
                ("created_at", models.DateTimeField()),
                ("updated_at", models.DateTimeField(blank=True, null=True)),
            ],
            options={"ordering": ["-created_at"]},
        ),
        migrations.CreateModel(
            name="PipelineJob",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("job_id", models.BigIntegerField(unique=True)),
                ("stage", models.CharField(max_length=255)),
                ("name", models.CharField(max_length=255)),
                ("status", models.CharField(blank=True, max_length=64)),
                ("duration", models.FloatField(blank=True, null=True)),
                ("started_at", models.DateTimeField(blank=True, null=True)),
                ("finished_at", models.DateTimeField(blank=True, null=True)),
                ("web_url", models.URLField(blank=True)),
                (
                    "pipeline",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="jobs", to="gallery.pipeline"),
                ),
            ],
            options={"ordering": ["-started_at", "stage", "name"]},
        ),
        migrations.AddIndex(
            model_name="pipelinejob",
            index=models.Index(fields=["stage", "name"], name="gallery_pip_stage_c95ff0_idx"),
        ),
        migrations.AddIndex(
            model_name="pipelinejob",
            index=models.Index(fields=["started_at"], name="gallery_pip_started_e9b711_idx"),
        ),
    ]
