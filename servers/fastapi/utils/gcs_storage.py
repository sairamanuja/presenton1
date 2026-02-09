import os
from typing import Optional

from google.cloud import storage

from utils.get_env import get_app_data_directory_env, get_gcs_bucket_env, get_gcs_prefix_env


def _normalize_relative_path(path_value: str) -> str:
    return path_value.replace(os.sep, "/").lstrip("/")


def _derive_relative_path(local_path: str) -> str:
    app_data_dir = get_app_data_directory_env() or "/tmp/presenton"
    if local_path.startswith(app_data_dir):
        relative = local_path[len(app_data_dir) :]
    else:
        relative = os.path.basename(local_path)
    return _normalize_relative_path(relative)


def maybe_upload_file_to_gcs(
    local_path: str, relative_path: Optional[str] = None
) -> Optional[str]:
    bucket_name = get_gcs_bucket_env()
    if not bucket_name:
        return None

    prefix = get_gcs_prefix_env() or "app_data"
    relative = relative_path or _derive_relative_path(local_path)
    blob_name = _normalize_relative_path(os.path.join(prefix, relative))

    client = storage.Client()
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(blob_name)
    blob.upload_from_filename(local_path)
    blob.make_public()

    # Object is now publicly readable.
    return f"https://storage.googleapis.com/{bucket_name}/{blob_name}"