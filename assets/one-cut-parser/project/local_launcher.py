"""Local Chinese launcher; upstream douyin_8k_parser.py stays unmodified."""
from __future__ import annotations

import argparse
from contextlib import contextmanager
from dataclasses import asdict
from datetime import datetime
import hashlib
import json
from pathlib import Path
import re
import sys
from urllib.parse import urlsplit

import requests
import douyin_8k_parser as upstream
from douyin_8k_parser import DouyinParser

ROOT = Path(__file__).resolve().parent
MOBILE_UA = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 "
    "Mobile/15E148 Safari/604.1"
)


class RoutedSession(requests.Session):
    def __init__(self, network):
        super().__init__()
        self.network = network

    def request(self, method, url, **kwargs):
        if self.network.direct:
            self.trust_env = False
            self.proxies.clear()
            kwargs["proxies"] = {}
        try:
            return super().request(method, url, **kwargs)
        except requests.exceptions.ProxyError:
            if self.network.direct:
                raise
            # Retry only a failed proxy connection, once. Keep the new route
            # for this task's metadata, guest session, play URL and download.
            self.network.direct = True
            self.network.events.append("代理连接失败，已切换直连；本次后续解析和下载继续使用直连")
            print("代理连接失败，正在自动改用直连……", flush=True)
            self.trust_env = False
            self.proxies.clear()
            kwargs["proxies"] = {}
            return super().request(method, url, **kwargs)


class TaskNetwork:
    """Requests-compatible transport confined to this single CLI task."""
    def __init__(self):
        self.direct = False
        self.events = []

    def Session(self):
        return RoutedSession(self)

    def get(self, url, **kwargs):
        # Upstream download() uses requests.get instead of its parser session.
        # Route that call too, while retaining the original download method.
        with self.Session() as session:
            return session.get(url, **kwargs)

    def __getattr__(self, name):
        return getattr(requests, name)


@contextmanager
def task_network():
    network = TaskNetwork()
    original_requests = upstream.requests
    # This launcher runs one task at a time. Only this module reference is
    # scoped; neither the installed Requests module nor Windows is modified.
    upstream.requests = network
    try:
        yield network
    finally:
        upstream.requests = original_requests


def readable_error(message):
    message = message or "没有可用结果"
    if "ProxyError" in message:
        return "无法连接代理服务器。这是网络连接问题，不能据此判断视频不可用。"
    if "SSLError" in message or "CERTIFICATE_VERIFY_FAILED" in message:
        return "HTTPS 连接或证书验证失败，尚未取得视频数据。"
    if "Timeout" in message or "timed out" in message:
        return "请求超时，尚未取得视频数据。"
    if "Expecting value" in message:
        return "作品接口返回空内容或无效数据。"
    if "Could not fetch video uri" in message:
        return "本次作品响应中没有可用的视频资源 ID。"
    return message


def find_resource(value, work_id):
    """Require the requested work ID so related videos cannot be selected."""
    if isinstance(value, dict):
        if str(value.get("aweme_id", value.get("awemeId", ""))) == work_id:
            video = value.get("video") or {}
            for field in ("play_addr", "play_addr_h264", "play_addr_265"):
                uri = (video.get(field) or {}).get("uri")
                if isinstance(uri, str) and re.fullmatch(r"[A-Za-z0-9_-]+", uri):
                    return uri
        for child in value.values():
            found = find_resource(child, work_id)
            if found:
                return found
    elif isinstance(value, list):
        for child in value:
            found = find_resource(child, work_id)
            if found:
                return found
    return None


def resource_from_html(html, work_id):
    for match in re.finditer(r"window\s*\.\s*_ROUTER_DATA\s*=\s*", html):
        try:
            data, _ = json.JSONDecoder().raw_decode(html[match.end():])
        except ValueError:
            continue
        resource = find_resource(data, work_id)
        if resource:
            return resource
    return None


def work_detail(value, work_id):
    if isinstance(value, dict):
        if str(value.get("aweme_id", value.get("awemeId", ""))) == work_id and isinstance(value.get("video"), dict):
            return value
        children = value.values()
    elif isinstance(value, list):
        children = value
    else:
        return None
    for child in children:
        found = work_detail(child, work_id)
        if found:
            return found
    return None


def detail_from_html(html, work_id):
    for match in re.finditer(r"window\s*\.\s*_ROUTER_DATA\s*=\s*", html):
        try:
            data, _ = json.JSONDecoder().raw_decode(html[match.end():])
            found = work_detail(data, work_id)
            if found:
                return found
        except ValueError:
            continue
    return None


def unavailable_from_html(html, work_id):
    """Read availability only from the requested public share route.

    An empty successful item list is weaker than an explicit deletion result.
    Keep those outcomes separate; never infer deletion from HTTP/CDN errors,
    missing play URLs, recommendation text, or a different work's payload.
    """
    for match in re.finditer(r"window\s*\.\s*_ROUTER_DATA\s*=\s*", html):
        try:
            data, _ = json.JSONDecoder().raw_decode(html[match.end():])
        except ValueError:
            continue
        if not isinstance(data, dict) or data.get("errors"):
            continue
        loaders = data.get("loaderData")
        page = loaders.get("video_(id)/page") if isinstance(loaders, dict) else None
        if not isinstance(page, dict) or str(page.get("itemId", "")) != work_id:
            continue
        info = page.get("videoInfoRes")
        if not isinstance(info, dict):
            continue
        message = str(info.get("status_msg") or info.get("status_message") or "").strip()
        for phrases, code, text in (
            (("视频已被删除", "作品已被删除", "视频已删除", "作品已删除"), "SOURCE_DELETED", "该作品已被删除，已停止解析。"),
            (("私密作品", "私密视频", "仅作者可见"), "SOURCE_PRIVATE", "该作品为私密或仅作者可见，已停止解析。"),
            (("视频不存在", "作品不存在", "视频已下架", "作品已下架"), "SOURCE_NOT_FOUND", "该作品不存在或已下架，已停止解析。"),
        ):
            if any(phrase in message for phrase in phrases):
                return {"errorCode": code, "error": text}
        if info.get("status_code") == 0 and info.get("item_list") == []:
            return {"errorCode": "SOURCE_UNAVAILABLE",
                    "error": "公开分享页未返回该作品；可能已删除、下架或设为私密。"}
    return None


class CompatibleParser(DouyinParser):
    """Only extend public metadata retrieval; inherit upstream play/download."""

    def __init__(self, network=None):
        super().__init__()
        self.trace = []
        self.network = network or requests
        self.detail = {}
        self.availability = None
        self.session.hooks["response"].append(self.capture_detail)

    def capture_detail(self, response, **kwargs):
        if "/aweme/v1/web/aweme/detail/" in response.url and response.status_code == 200:
            try:
                data = response.json().get("aweme_detail")
                if isinstance(data, dict):
                    self.detail = data
            except (ValueError, AttributeError):
                pass
        return response

    def get_video_uri(self, video_id):
        self.availability = None
        try:
            uri = super().get_video_uri(video_id)
            if uri:
                self.trace.append("原项目详情接口：成功")
                return uri
            self.trace.append("原项目详情接口：没有视频资源 ID")
        except (requests.RequestException, ValueError, AttributeError, TypeError) as error:
            self.trace.append("原项目详情接口：未取得可用数据（" + type(error).__name__ + "）")

        # A fresh anonymous guest session only. No browser cookies, login,
        # credentials, or local application/API configuration are read.
        with self.network.Session() as guest:
            guest.headers.update({
                "User-Agent": MOBILE_UA,
                "Accept-Language": "zh-CN,zh;q=0.9",
                "Referer": "https://www.douyin.com/",
            })
            try:
                with guest.post(
                    "https://ttwid.bytedance.com/ttwid/union/register/",
                    json={"region": "cn", "aid": 6383, "needFid": False,
                          "service": "www.douyin.com",
                          "migrate_info": {"ticket": "", "source": "node"},
                          "cbUrlProtocol": "https", "union": True},
                    timeout=8,
                ) as registration:
                    registration.raise_for_status()
                    ttwid = registration.cookies.get("ttwid")
                    if ttwid:
                        guest.cookies.set("ttwid", ttwid, domain=".iesdouyin.com", secure=True)
                        self.trace.append("临时匿名访客会话：已建立（不保存 Cookie）")
            except requests.RequestException:
                self.trace.append("临时匿名访客会话：未建立，继续检查公开分享页")

            with guest.get(
                "https://www.iesdouyin.com/share/video/" + video_id + "/",
                headers={"Accept": "text/html,application/xhtml+xml"},
                timeout=15, stream=True,
            ) as response:
                response.raise_for_status()
                chunks = []
                length = 0
                for chunk in response.iter_content(65536):
                    length += len(chunk)
                    if length > 4 * 1024 * 1024:
                        raise ValueError("Public share page exceeds 4 MB")
                    chunks.append(chunk)
                html = b"".join(chunks).decode("utf-8", errors="replace")
                self.detail = detail_from_html(html, video_id) or {}
                uri = find_resource(self.detail, video_id)
                if not uri:
                    self.availability = unavailable_from_html(html, video_id)
                self.trace.append("公开分享页：" + ("已取得本作品资源 ID" if uri else "未取得本作品资源 ID"))
                return uri


def run_once(value, *, original=False, download=False):
    with task_network() as network:
        return _run_once(value, original=original, download=download, network=network)


def _run_once(value, *, original, download, network):
    parser = DouyinParser() if original else CompatibleParser(network)
    mode = "原版" if original else "兼容版（原项目 + 公开分享页补充）"
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    print("\n运行模式：" + mode, flush=True)
    print("网络模式：自动（代理连接失败时切换直连）", flush=True)
    print("正在获取作品信息并调用原项目高码率解析……", flush=True)
    try:
        result = parser.parse(value)
        record = {"time": stamp, "mode": mode, "input": value,
                  "trace": list(getattr(parser, "trace", [])), "result": asdict(result)}
        for stage in record["trace"]:
            print("  " + stage)
        if result.success:
            print("原项目高码率方法：成功")
            print("作品 ID：" + (result.video_id or "未知"))
            if result.size_bytes:
                print(f"文件大小：{result.size_bytes:,} 字节（约 {result.size_bytes / 1048576:.1f} MB）")
            else:
                print("文件大小：服务器未返回；下载后核实")
            print("项目返回的质量标签：" + (result.quality or "未知"))
            print("提示：质量标签不代表已经测量出 8K 分辨率。")
        else:
            print("解析失败：" + readable_error(result.error))
            if original:
                print("原版详情接口可能返回空响应；可从菜单选择兼容版再次测试。")
            else:
                print("本次接口请求未成功，不能据此判断作品不可播放；详细原因会写入结果记录。")

        if result.success and download:
            folder = ROOT / "downloads"
            folder.mkdir(exist_ok=True)
            final = folder / f"{result.video_id}_{stamp}.mp4"
            partial = final.with_suffix(".mp4.part")
            print("正在调用原项目下载方法……", flush=True)
            try:
                parser.download(result.url, partial)
                size = partial.stat().st_size
                with partial.open("rb") as stream:
                    header = stream.read(32)
                if size == 0 or header[4:8] != b"ftyp":
                    raise ValueError("下载内容不是可识别的 MP4 文件")
                if result.size_bytes and size != result.size_bytes:
                    raise ValueError(f"文件大小不完整：预期 {result.size_bytes}，实际 {size}")
                digest = hashlib.sha256()
                with partial.open("rb") as stream:
                    for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                        digest.update(chunk)
                partial.rename(final)
                record["download"] = {"success": True, "path": str(final), "bytes": size,
                                      "sha256": digest.hexdigest()}
                print("完整性检查通过，最终文件：" + str(final))
            except (requests.RequestException, OSError, ValueError) as error:
                record["download"] = {"success": False, "error": str(error), "partial": str(partial)}
                print("下载未完成：" + readable_error(str(error)))
                print("未完成内容保留为 .part，不会作为完成的 MP4。")
        record["network"] = {"policy": "auto", "final_mode": "direct" if network.direct else "system",
                             "events": list(network.events)}
        log_dir = ROOT / "logs"
        log_dir.mkdir(exist_ok=True)
        log_path = log_dir / (stamp + ".json")
        log_path.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
        print("本次结果记录：" + str(log_path))
        return 0 if result.success and (not download or record.get("download", {}).get("success")) else 1
    finally:
        parser.session.close()


def is_video_input(value):
    if re.fullmatch(r"\d{10,30}", value):
        return True
    match = re.search(r"https?://[^\s\"'<>]+", value, re.IGNORECASE)
    if not match:
        return False
    try:
        host = (urlsplit(match.group()).hostname or "").lower().rstrip(".")
    except ValueError:
        return False
    return any(host == domain or host.endswith("." + domain)
               for domain in ("douyin.com", "iesdouyin.com"))


def main():
    args_parser = argparse.ArgumentParser(description="Douyin 8K Parser 中文启动入口")
    args_parser.add_argument("url", nargs="?")
    args_parser.add_argument("--original", action="store_true", help="使用完全未修改的上游解析器")
    args_parser.add_argument("--download", action="store_true")
    args = args_parser.parse_args()
    if args.url:
        return run_once(args.url, original=args.original, download=args.download)
    print("Douyin 8K Parser — 完整项目独立运行")
    print("来源：https://github.com/lijinrui182/douyin-8k-parser")
    print("下载目录：" + str(ROOT / "downloads"))
    print("直接粘贴抖音链接并按回车，即可使用兼容版下载；只想查看大小可输入 1。")
    while True:
        print("\n1. 兼容版：解析并查看大小（默认）")
        print("2. 兼容版：解析并下载视频")
        print("3. 原版：解析并查看大小")
        print("4. 原版：解析并下载视频")
        print("0. 退出")
        entry = input("粘贴链接直接下载，或输入菜单数字：").strip()
        direct_input = is_video_input(entry)
        choice = "2" if direct_input else (entry or "1")
        if choice == "0":
            return 0
        if choice not in ("1", "2", "3", "4"):
            print("请粘贴抖音视频链接、作品 ID，或输入菜单数字 0～4。")
            continue
        value = entry if direct_input else input("粘贴抖音链接或作品 ID，按回车：").strip()
        if not value:
            continue
        try:
            run_once(value, original=choice in ("3", "4"), download=choice in ("2", "4"))
        except Exception as error:
            print("运行错误：" + str(error))


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (KeyboardInterrupt, EOFError):
        print("\n已退出。")
