"""法典图鉴（novelai.quicktagcloud.com）在线发现客户端。"""

from .online import (
    TAGCLOUD_DATA_BASE_URL,
    TAGCLOUD_MEDIA_BASE_URL,
    TAGCLOUD_SITE_URL,
    TagcloudClient,
    TagcloudClientError,
    validate_tagcloud_base_url,
)

__all__ = [
    "TAGCLOUD_DATA_BASE_URL",
    "TAGCLOUD_MEDIA_BASE_URL",
    "TAGCLOUD_SITE_URL",
    "TagcloudClient",
    "TagcloudClientError",
    "validate_tagcloud_base_url",
]
