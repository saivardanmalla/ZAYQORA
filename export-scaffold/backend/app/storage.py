"""S3-Compatible Object Storage Helper for ZAYQORA Tenant Media Assets.

Generates scoped presigned PUT URLs for restaurant logos, cover banners,
and menu dish photography using AWS S3, Cloudflare R2, or MinIO.
"""

import os
import uuid
from typing import Literal

import boto3
from botocore.config import Config

S3_ENDPOINT_URL = os.getenv("S3_ENDPOINT_URL")
S3_REGION = os.getenv("S3_REGION", "us-east-1")
S3_BUCKET = os.getenv("S3_BUCKET", "zayqora-media-prod")
CDN_BASE_URL = os.getenv("CDN_BASE_URL", f"https://{S3_BUCKET}.s3.amazonaws.com")

AssetKind = Literal["logo", "cover", "menu_item", "gallery"]


def get_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=S3_ENDPOINT_URL or None,
        region_name=S3_REGION,
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
        config=Config(signature_version="s3v4"),
    )


def create_tenant_presigned_upload(
    restaurant_id: str,
    asset_kind: AssetKind,
    content_type: str = "image/jpeg",
    expires_in_seconds: int = 300,
) -> dict[str, str]:
    """Return a tenant-isolated S3 object key, presigned upload URL, and public CDN URL."""
    allowed_types = {"image/jpeg", "image/png", "image/webp"}
    if content_type not in allowed_types:
        raise ValueError(f"Unsupported image content_type: {content_type}")

    extension = content_type.split("/")[-1].replace("jpeg", "jpg")
    object_key = f"tenants/{restaurant_id}/{asset_kind}/{uuid.uuid4()}.{extension}"

    client = get_s3_client()
    upload_url = client.generate_presigned_url(
        ClientMethod="put_object",
        Params={
            "Bucket": S3_BUCKET,
            "Key": object_key,
            "ContentType": content_type,
        },
        ExpiresIn=expires_in_seconds,
    )

    return {
        "object_key": object_key,
        "upload_url": upload_url,
        "public_url": f"{CDN_BASE_URL.rstrip('/')}/{object_key}",
    }
