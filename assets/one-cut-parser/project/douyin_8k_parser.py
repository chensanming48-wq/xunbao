"""Resolve high-bitrate Douyin video URLs.

Core trick:
    ratio=default + improve_bitrate=1

For some Douyin posts this play endpoint redirects to an original / 8K-ish
source that is not listed in the normal web detail payload.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import requests


DETAIL_ENDPOINT = "https://www.douyin.com/aweme/v1/web/aweme/detail/"
PLAY_ENDPOINT = "https://www.douyin.com/aweme/v1/play/"
DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/149.0.0.0 Safari/537.36"
)


@dataclass
class ParseResult:
    success: bool
    video_id: str | None = None
    video_uri: str | None = None
    url: str | None = None
    quality: str | None = None
    size_bytes: int | None = None
    size_mb: float | None = None
    error: str | None = None


class DouyinParser:
    """Small Douyin high-bitrate URL resolver."""

    def __init__(self, timeout: int = 15) -> None:
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update(
            {
                "Accept": "application/json,text/plain,*/*",
                "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
                "Referer": "https://www.douyin.com/",
                "User-Agent": DEFAULT_USER_AGENT,
            }
        )

    def extract_video_id(self, value: str) -> str | None:
        """Extract aweme/video id from raw text, long URL, short URL, or id."""
        value = value.strip()
        if re.fullmatch(r"\d{10,30}", value):
            return value

        url_match = re.search(r"https?://[^\s\"'<>]+", value)
        source = url_match.group(0) if url_match else value

        video_id = self._find_video_id(source)
        if video_id:
            return video_id

        if source.startswith("http"):
            response = self.session.get(source, allow_redirects=True, timeout=self.timeout)
            video_id = self._find_video_id(str(response.url))
            if video_id:
                return video_id
            return self._find_video_id(response.text[:200_000])

        return None

    @staticmethod
    def _find_video_id(value: str) -> str | None:
        patterns = (
            r"/video/(\d{10,30})",
            r"/note/(\d{10,30})",
            r"[?&](?:modal_id|aweme_id|item_id)=(\d{10,30})",
        )
        for pattern in patterns:
            match = re.search(pattern, value)
            if match:
                return match.group(1)
        return None

    def get_video_uri(self, video_id: str) -> str | None:
        """Fetch the web detail payload and return video.play_addr.uri."""
        params = {
            "aweme_id": video_id,
            "aid": "6383",
            "device_platform": "webapp",
            "cookie_enabled": "true",
            "browser_language": "zh-CN",
            "browser_platform": "Win32",
            "browser_name": "Chrome",
            "browser_version": "149.0.0.0",
        }
        response = self.session.get(DETAIL_ENDPOINT, params=params, timeout=self.timeout)
        response.raise_for_status()

        data: dict[str, Any] = response.json()
        video = data.get("aweme_detail", {}).get("video", {})
        return video.get("play_addr", {}).get("uri")

    def get_high_bitrate_url(self, video_uri: str) -> tuple[str | None, int | None]:
        """Resolve the high-bitrate play URL without downloading the video."""
        params = {
            "video_id": video_uri,
            "line": "0",
            "ratio": "default",
            "watermark": "0",
            "media_type": "4",
            "vr_type": "0",
            "improve_bitrate": "1",
            "is_play_url": "1",
            "source": "PackSourceEnum_AWEME_DETAIL",
        }
        response = self.session.get(
            PLAY_ENDPOINT,
            params=params,
            allow_redirects=True,
            stream=True,
            timeout=self.timeout,
        )
        try:
            response.raise_for_status()
            size = _safe_int(response.headers.get("content-length"))
            return response.url, size
        finally:
            response.close()

    def parse(self, value: str) -> ParseResult:
        """Parse a Douyin URL and return the high-bitrate CDN URL."""
        try:
            video_id = self.extract_video_id(value)
            if not video_id:
                return ParseResult(success=False, error="Could not extract Douyin video id")

            video_uri = self.get_video_uri(video_id)
            if not video_uri:
                return ParseResult(success=False, video_id=video_id, error="Could not fetch video uri")

            video_url, size_bytes = self.get_high_bitrate_url(video_uri)
            if not video_url:
                return ParseResult(
                    success=False,
                    video_id=video_id,
                    video_uri=video_uri,
                    error="Could not resolve high-bitrate play URL",
                )

            is_original_source = "tos-cn-v-0015c800" in video_url
            size_mb = round(size_bytes / 1024 / 1024, 2) if size_bytes else None
            return ParseResult(
                success=True,
                video_id=video_id,
                video_uri=video_uri,
                url=video_url,
                quality="8K / Original" if is_original_source else "High bitrate",
                size_bytes=size_bytes,
                size_mb=size_mb,
            )
        except requests.RequestException as exc:
            return ParseResult(success=False, error=f"Network error: {exc}")
        except ValueError as exc:
            return ParseResult(success=False, error=f"Invalid response: {exc}")

    def download(self, url: str, save_path: str | Path) -> None:
        """Download a resolved CDN URL with a simple progress display."""
        save_path = Path(save_path)
        headers = {
            "Referer": "https://www.douyin.com/",
            "User-Agent": DEFAULT_USER_AGENT,
        }
        with requests.get(url, headers=headers, stream=True, timeout=300) as response:
            response.raise_for_status()
            total = _safe_int(response.headers.get("content-length")) or 0
            downloaded = 0

            with save_path.open("wb") as file:
                for chunk in response.iter_content(chunk_size=1024 * 256):
                    if not chunk:
                        continue
                    file.write(chunk)
                    downloaded += len(chunk)
                    if total:
                        percent = downloaded / total * 100
                        print(
                            f"\rDownloading: {percent:5.1f}% "
                            f"({downloaded / 1024 / 1024:.1f}/{total / 1024 / 1024:.1f} MB)",
                            end="",
                        )

        print(f"\nSaved: {save_path}")


def _safe_int(value: str | None) -> int | None:
    if not value:
        return None
    try:
        number = int(value)
    except ValueError:
        return None
    return number if number > 0 else None


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Resolve high-bitrate / original Douyin video URLs.",
    )
    parser.add_argument("url", help="Douyin video URL, share text, short URL, or aweme id")
    parser.add_argument(
        "--download",
        nargs="?",
        const="video_original.mp4",
        metavar="PATH",
        help="Download the resolved video. Optional PATH defaults to video_original.mp4.",
    )
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON")
    parser.add_argument("--show-full-url", action="store_true", help="Print the full CDN URL")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    parser = DouyinParser()
    result = parser.parse(args.url)

    if args.json:
        print(json.dumps(asdict(result), ensure_ascii=False, indent=2))
    elif not result.success:
        print(f"Failed: {result.error}", file=sys.stderr)
    else:
        print(f"Video ID : {result.video_id}")
        print(f"Quality  : {result.quality}")
        if result.size_mb:
            print(f"Size     : {result.size_mb} MB")
        if args.show_full_url:
            print(f"URL      : {result.url}")
        else:
            print(f"URL      : {result.url[:100]}...")

    if not result.success:
        return 1

    if args.download:
        parser.download(result.url or "", args.download)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
