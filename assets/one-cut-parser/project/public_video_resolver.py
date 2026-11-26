"""Chuangbao's own public-page resolver; no paid parser or saved login required.

The site's ordinary WebView2 response supplies work-bound media candidates.
High-bitrate source retrieval remains preferred when available; otherwise use
the largest verified public MP4. Never label that fallback as an original/8K.
"""
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import time
import uuid
from urllib.parse import urlencode, urljoin, urlsplit

import requests

ROOT = Path(__file__).resolve().parent
APP_ROOT = ROOT.parents[2]
MEDIA_DOMAINS = ('douyinvod.com', 'idouyinvod.com', 'toutiaovod.com', 'zjcdn.com', 'bytecdn.cn', 'snssdk.com', 'v.smtcdns.com')
PAGE_DOMAINS = ('douyin.com', 'iesdouyin.com')
UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36')
DOWNLOAD_UA = 'QianchuanAuto-OneCut/1.43'
MOBILE_UA = ('Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 '
             '(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36')
RESOLVER_REVISION = '20260921-verified-video-edge-v2'


class ResolutionError(Exception):
    def __init__(self, message, code='PUBLIC_RESOLUTION_FAILED'):
        super().__init__(message)
        self.code = code


def positive(value):
    try:
        return max(0, int(value))
    except (TypeError, ValueError):
        return 0


def allowed(url, domains):
    try:
        parsed = urlsplit(url)
        return (parsed.scheme == 'https' and not parsed.username and not parsed.password
                and parsed.port in (None, 443) and any(
                    (bool(re.fullmatch(r'[a-f0-9]{32}\.v\.smtcdns\.com', parsed.hostname or ''))
                     if domain == 'v.smtcdns.com' else
                     parsed.hostname == domain or (parsed.hostname or '').endswith('.' + domain))
                    for domain in domains))
    except (ValueError, TypeError):
        return False


class PublicVideoResolver:
    def __init__(self, session=None, probe_path=None, timeout=31):
        self.session = session or requests.Session()
        self.session.headers.update({'User-Agent': UA, 'Referer': 'https://www.douyin.com/',
                                     'Accept-Encoding': 'identity'})
        self.probe_path = Path(probe_path or ROOT / 'OneCutPublicBrowserProbe.exe')
        self.deadline = time.monotonic() + timeout
        self.trace = []

    def remaining(self, maximum=6):
        remaining = self.deadline - time.monotonic()
        if remaining < .25:
            raise ResolutionError('自有解析已达到等待时限，请稍后重试。', 'RESOLUTION_TIMEOUT')
        return min(maximum, remaining)

    def get(self, url, domains, maximum=6, session=None, **kwargs):
        session = session or self.session
        for _ in range(5):
            if not allowed(url, domains):
                raise ResolutionError('视频地址或跳转域名未通过检查。')
            response = session.get(url, allow_redirects=False, stream=True,
                                        timeout=self.remaining(maximum), **kwargs)
            if response.status_code not in (301, 302, 303, 307, 308):
                return response
            location = response.headers.get('Location', '')
            response.close()
            if not location:
                raise ResolutionError('视频接口未返回有效跳转地址。')
            url = urljoin(url, location)
        raise ResolutionError('视频接口跳转次数过多。')

    def work_id(self, source):
        if not isinstance(source, str) or len(source) > 8192:
            raise ResolutionError('请输入抖音作品链接或作品编号。', 'INVALID_INPUT')
        source = source.strip()
        if re.fullmatch(r'\d{10,30}', source):
            return source
        match = re.search(r'https://[^\s\"\x27<>]+', source)
        url = match.group(0).rstrip('，。)）]') if match else ''
        if not allowed(url, PAGE_DOMAINS):
            raise ResolutionError('只支持 HTTPS 抖音作品链接或作品编号。', 'INVALID_INPUT')
        for _ in range(5):
            if not allowed(url, PAGE_DOMAINS):
                break
            match = re.search(r'/(?:video|note)/(\d{10,30})(?:[/?#]|$)|[?&](?:modal_id|aweme_id|item_id)=(\d{10,30})(?:&|$)', url)
            if match:
                return match.group(1) or match.group(2)
            with self.session.get(url, allow_redirects=False, stream=True, timeout=self.remaining(4)) as response:
                if response.status_code not in (301, 302, 303, 307, 308):
                    break
                url = urljoin(url, response.headers.get('Location', ''))
        raise ResolutionError('未能识别分享链接的作品编号，请使用完整作品链接。', 'INVALID_INPUT')

    def browser_detail(self, work_id):
        if not self.probe_path.is_file():
            raise ResolutionError('自有解析组件缺失，请更新软件。', 'COMPONENT_MISSING')
        profile_id = uuid.uuid4().hex
        profile_root = (Path(tempfile.gettempdir()) / 'ChuangbaoPublicResolver').resolve()
        profile = profile_root / profile_id
        try:
            result = subprocess.run([str(self.probe_path), work_id, str(APP_ROOT), str(os.getpid()), profile_id],
                                    capture_output=True, timeout=self.remaining(26),
                                    creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        except subprocess.TimeoutExpired:
            raise ResolutionError('公开网页加载超时，未取得视频数据。', 'PUBLIC_PAGE_TIMEOUT')
        finally:
            # The browser has exited. Remove only the exact fresh GUID profile
            # allocated for this invocation; never follow a changed/reparse path.
            if profile.resolve().parent == profile_root and profile.name == profile_id:
                for attempt in range(4):
                    try:
                        shutil.rmtree(profile)
                        break
                    except FileNotFoundError:
                        break
                    except OSError:
                        if attempt < 3:
                            time.sleep(.25)
        if len(result.stdout) > 1024 * 1024:
            raise ResolutionError('公开网页作品响应过大。')
        try:
            payload = json.loads(result.stdout.decode('utf-8-sig'))
        except (UnicodeError, ValueError):
            raise ResolutionError('自有解析组件未返回有效作品数据。')
        if result.returncode or payload.get('success') is not True:
            raise ResolutionError(payload.get('error') or '公开网页未返回播放数据，不能据此判断作品不存在。',
                                  payload.get('errorCode') or 'PUBLIC_PAGE_UNAVAILABLE')
        detail = payload.get('detail') or {}
        if str(detail.get('aweme_id')) != work_id or not isinstance(detail.get('video'), dict):
            raise ResolutionError('网页返回的作品编号与输入不一致。', 'WORK_ID_MISMATCH')
        self.trace.append('自有网页通道：已取得本作品播放数据（匿名会话）')
        return detail

    @staticmethod
    def detail_from_share_html(html, work_id):
        for match in re.finditer(r'window\s*\.\s*_ROUTER_DATA\s*=\s*', html):
            try:
                root, _ = json.JSONDecoder().raw_decode(html[match.end():])
            except (ValueError, RecursionError):
                continue
            pending = [root]
            visited = 0
            while pending and visited < 50000:
                value = pending.pop()
                visited += 1
                if isinstance(value, dict):
                    if (str(value.get('aweme_id', value.get('awemeId', ''))) == work_id
                            and isinstance(value.get('video'), dict)):
                        return {**value, 'aweme_id': work_id}
                    pending.extend(value.values())
                elif isinstance(value, list):
                    pending.extend(value)
        raise ResolutionError('公开分享页未返回本作品数据，不能据此判断作品不存在。',
                              'PUBLIC_PAGE_UNAVAILABLE')

    def share_detail(self, work_id):
        url = 'https://www.iesdouyin.com/share/video/' + work_id + '/'
        # Establish only the site's ordinary anonymous guest cookie. No saved
        # account/session is read; the session ends with this one resolution.
        try:
            with self.session.post('https://ttwid.bytedance.com/ttwid/union/register/',
                    json={'region': 'cn', 'aid': 6383, 'needFid': False,
                          'service': 'www.douyin.com', 'migrate_info': {'ticket': '', 'source': 'node'},
                          'cbUrlProtocol': 'https', 'union': True},
                    timeout=self.remaining(2), allow_redirects=False) as registration:
                if registration.status_code == 200:
                    cookie = registration.cookies.get('ttwid')
                    if cookie:
                        self.session.cookies.set('ttwid', cookie, domain='.iesdouyin.com', secure=True)
        except requests.RequestException:
            pass
        with self.get(url, PAGE_DOMAINS, maximum=3,
                      headers={'User-Agent': MOBILE_UA, 'Accept': 'text/html,application/xhtml+xml'}) as response:
            response.raise_for_status()
            content = bytearray()
            for chunk in response.iter_content(32768):
                self.remaining()
                content.extend(chunk)
                if len(content) > 4 * 1024 * 1024:
                    raise ResolutionError('公开分享页作品数据过大。')
            detail = self.detail_from_share_html(content.decode('utf-8-sig', errors='replace'), work_id)
        self.trace.append('公开分享页：已取得编号一致的作品播放数据')
        return detail

    def work_detail(self, work_id):
        try:
            return self.browser_detail(work_id)
        except (ResolutionError, requests.RequestException, OSError) as error:
            self.trace.append('匿名网页通道未取得作品数据：' + getattr(error, 'code', type(error).__name__))
        # A second ordinary public page, within the existing total deadline.
        # Missing WebView2 or a challenged/empty desktop response is not deletion.
        return self.share_detail(work_id)

    @staticmethod
    def media_candidate_url(url):
        if not isinstance(url, str):
            return None
        # Metadata sometimes lists http even when this exact CDN supports TLS.
        # Only probe HTTPS; never follow or permit an insecure media redirect.
        candidate = 'https://' + url[7:] if url.startswith('http://') else url
        return candidate if '/playwm/' not in candidate and allowed(candidate, MEDIA_DOMAINS) else None

    def verify_download_request(self, verified, maximum=4):
        # The application uses a different UA and no Range at offset zero.
        # A browser-Range success alone does not prove its download will work.
        # Keep this session cookie-free, matching HttpOneCutMediaTransport.
        with requests.Session() as download:
            download.headers.update({'User-Agent': DOWNLOAD_UA, 'Referer': 'https://www.douyin.com/',
                'Accept': 'video/*,application/octet-stream;q=0.8,*/*;q=0.1', 'Accept-Encoding': 'identity'})
            with self.get(verified['mediaUrl'], MEDIA_DOMAINS, maximum=maximum, session=download) as response:
                response.raise_for_status()
                prefix = response.raw.read(32, decode_content=True)
                if response.status_code != 200 or len(prefix) < 12 or prefix[4:8] != b'ftyp':
                    raise ResolutionError('正式下载请求未返回完整 MP4 资源。', 'DOWNLOAD_REQUEST_REJECTED')
                size = positive(response.headers.get('Content-Length'))
                if size != verified['expectedBytes']:
                    raise ResolutionError('正式下载请求的文件大小与解析校验不一致。', 'DOWNLOAD_REQUEST_REJECTED')
                return {'mediaUrl': response.url, 'expectedBytes': size,
                        'etag': response.headers.get('ETag', ''),
                        'lastModified': response.headers.get('Last-Modified', '')}

    def verify_for_download(self, url, expected=0, maximum=5):
        verified = self.verify(url, expected, maximum)
        return self.verify_download_request(verified, min(maximum, 4))

    def verify(self, url, expected=0, maximum=5):
        with self.get(url, MEDIA_DOMAINS + ('douyin.com',), maximum,
                      headers={'Range': 'bytes=0-31'}) as response:
            response.raise_for_status()
            if not allowed(response.url, MEDIA_DOMAINS):
                raise ResolutionError('未取得可信的视频 CDN 文件。')
            prefix = response.raw.read(32, decode_content=True)
            if len(prefix) < 12 or prefix[4:8] != b'ftyp':
                raise ResolutionError('播放地址返回的内容不是有效 MP4。')
            match = re.fullmatch(r'bytes 0-(\d+)/(\d+)', response.headers.get('Content-Range', ''))
            if response.status_code == 206:
                size = positive(match.group(2)) if match and int(match.group(1)) >= 31 else 0
            else:
                size = positive(response.headers.get('Content-Length')) if response.status_code == 200 else 0
            if size < 32 or (expected and expected != size):
                raise ResolutionError('视频实际大小与作品资源信息不一致。')
            return {'mediaUrl': response.url, 'expectedBytes': size,
                    'etag': response.headers.get('ETag', ''),
                    'lastModified': response.headers.get('Last-Modified', '')}

    @staticmethod
    def candidates(detail):
        video = detail['video']
        addresses = [video.get(field) for field in ('play_addr', 'play_addr_h264', 'play_addr_265')]
        for row in (video.get('bit_rate') or [])[:32]:
            if isinstance(row, dict) and not row.get('is_drm_source') and not row.get('is_encrypt'):
                addresses.append(row.get('play_addr'))
        candidates, seen = [], set()
        for address in addresses:
            if not isinstance(address, dict):
                continue
            urls = tuple(dict.fromkeys(normalized for url in (address.get('url_list') or [])[:4]
                         for normalized in [PublicVideoResolver.media_candidate_url(url)] if normalized))
            if not urls or urls[0] in seen:
                continue
            seen.add(urls[0])
            candidates.append({'urls': urls, 'size': positive(address.get('data_size'))})
        return sorted(candidates, key=lambda row: row['size'], reverse=True)[:12]

    def resolve(self, source):
        work_id = self.work_id(source)
        detail = self.work_detail(work_id)
        video = detail['video']
        verified = []
        policy = 'verified_public_best'
        resource = (video.get('play_addr') or {}).get('uri', '')
        if isinstance(resource, str) and re.fullmatch(r'[A-Za-z0-9_-]+', resource):
            endpoint = 'https://www.douyin.com/aweme/v1/play/?' + urlencode({
                'video_id': resource, 'line': '0', 'ratio': 'default', 'watermark': '0',
                'media_type': '4', 'vr_type': '0', 'improve_bitrate': '1',
                'is_play_url': '1', 'source': 'PackSourceEnum_AWEME_DETAIL'})
            try:
                verified.append(self.verify_for_download(endpoint, maximum=3))
                policy = 'verified_high_bitrate'
                self.trace.append('高码率资源：MP4 与真实大小校验通过')
            except (requests.RequestException, ResolutionError):
                self.trace.append('高码率接口未取得文件，继续校验网页播放资源')
        if not verified:
            for candidate in self.candidates(detail):
                # All remaining candidates declare a smaller size; a verified
                # larger representation is already available. Unknown sizes
                # are still probed, never treated as smaller by assumption.
                if candidate['size'] and verified and candidate['size'] <= max(v['expectedBytes'] for v in verified):
                    continue
                for url in candidate['urls']:
                    try:
                        verified.append(self.verify_for_download(url, candidate['size']))
                        break
                    except (requests.RequestException, ResolutionError):
                        if self.deadline - time.monotonic() < .5:
                            break
            self.trace.append('网页播放资源：已校验 ' + str(len(verified)) + ' 个可用版本')
        if not verified:
            raise ResolutionError('已找到作品，但播放资源校验未成功；请稍后重试。', 'MEDIA_UNAVAILABLE')
        selected = max(verified, key=lambda row: row['expectedBytes'])
        self.trace.append('正式下载请求：无登录 Cookie、无 Range，MP4 与文件大小复核通过')
        cover = video.get('cover') or video.get('origin_cover') or {}
        covers = cover.get('url_list') or []
        return {'protocol': 1, 'success': True, 'trace': self.trace, 'result': {
            **selected, 'workId': work_id, 'title': str(detail.get('desc') or '').strip(),
            'author': str((detail.get('author') or {}).get('nickname') or ''),
            'coverUrl': next((u for u in covers if isinstance(u, str) and u.startswith('https://')), ''),
            # The host measures the downloaded rendition, rather than copying
            # potentially different preview dimensions into the task record.
            'width': 0, 'height': 0, 'durationMs': positive(video.get('duration')), 'videoBitrate': 0,
            'provider': 'chuangbao-public-browser-v1', 'qualityPolicy': policy,
            'candidateCount': len(verified), 'selectedSourceOriginal': False,
            'resolverRevision': RESOLVER_REVISION}}


def resolve(source):
    parser = PublicVideoResolver()
    try:
        return parser.resolve(source)
    except (ResolutionError, requests.RequestException, OSError, ValueError) as error:
        return {'protocol': 1, 'success': False, 'errorCode': getattr(error, 'code', 'NETWORK_ERROR'),
                'error': str(error), 'trace': parser.trace}
    finally:
        parser.session.close()
