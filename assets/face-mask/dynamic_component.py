"""Pinned, optional Windows component; no pip, global installs or cloud inference."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import struct
import sys
import time
import urllib.request
import uuid
import zipfile


def file_hash(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def load_lock():
    path = Path(__file__).with_name('dynamic-component.json')
    raw = path.read_bytes()
    return json.loads(raw), hashlib.sha256(raw).hexdigest()


def valid_file(path, item):
    return path.is_file() and path.stat().st_size == item['bytes'] and file_hash(path) == item['sha256']


def check_runtime():
    if sys.version_info[:2] != (3, 13) or struct.calcsize('P') != 8:
        raise RuntimeError('动态头像需要软件配套的64位 Python 3.13组件，请更新视频运行组件')
    try:
        import numpy, cv2, PIL, packaging, six
        if not hasattr(cv2, 'Subdiv2D'):
            raise ImportError('OpenCV Subdiv2D')
    except ImportError as ex:
        raise RuntimeError('现有视频运行组件不完整，请先修复视频组件：' + str(ex)) from ex


def download(item, path, check, emit):
    # The exact HTTPS URL and digest are reviewed and pinned in the shipped lock.
    from urllib.parse import urlparse
    allowed = ('files.pythonhosted.org', 'storage.googleapis.com')
    if urlparse(item['url']).scheme != 'https' or urlparse(item['url']).hostname not in allowed:
        raise ValueError('动态头像组件下载地址无效')
    if valid_file(path, item):
        return
    part = path.with_suffix(path.suffix + '.part')
    deadline = time.monotonic() + 300
    request = urllib.request.Request(item['url'], headers={'User-Agent': 'Chuangbao-FaceComponent/1'})
    with urllib.request.urlopen(request, timeout=25) as response, part.open('wb') as out:
        final = urlparse(response.geturl())
        if final.scheme != 'https' or final.hostname not in allowed:
            raise ValueError('动态头像组件重定向地址无效')
        size = 0
        while True:
            check()
            if time.monotonic() > deadline:
                raise TimeoutError('动态头像组件下载超时，请重试')
            block = response.read(64 * 1024)
            if not block:
                break
            size += len(block)
            if size > item['bytes']:
                raise ValueError('动态头像组件大小不符')
            out.write(block)
            emit(phase='下载动态头像组件', progress=size / item['bytes'])
    check()
    if not valid_file(part, item):
        raise ValueError('动态头像组件校验失败，请重试')
    os.replace(part, path)


def verify(root, lock, lock_hash):
    receipt = root / 'installed.json'
    if not receipt.is_file():
        return False
    try:
        data = json.loads(receipt.read_text('utf8'))
        if data.get('lockHash') != lock_hash or not data.get('files'):
            return False
        for rel, item in data['files'].items():
            target = (root / rel).resolve()
            if not target.is_relative_to(root.resolve()) or not valid_file(target, item):
                return False
        return valid_file(root / lock['model']['file'], lock['model'])
    except (OSError, ValueError, KeyError):
        return False


def ensure(component_root, check, emit, stage_root=None):
    check_runtime()
    lock, lock_hash = load_lock()
    parent = Path(component_root).resolve()
    root = parent / (lock['id'] + '-' + lock_hash[:12])
    check()
    if verify(root, lock, lock_hash):
        sys.path.insert(0, str(root / 'lib'))
        return root
    if root.exists():
        raise RuntimeError('动态头像组件完整性校验失败，请修复组件；原文件已保留')
    parent.mkdir(parents=True, exist_ok=True)
    # Native preparation supplies its owned, same-volume job directory, so even a
    # hard-cancelled download is reclaimed by the host's existing task cleanup.
    stage_parent = Path(stage_root).resolve() if stage_root else parent
    stage_parent.mkdir(parents=True, exist_ok=True)
    stage = stage_parent / ('.dynamic-stage-' + uuid.uuid4().hex)
    stage.mkdir()
    try:
        library = stage / 'lib'
        library.mkdir()
        inventory = {}
        for item in lock['wheels']:
            check()
            package = stage / item['file']
            download(item, package, check, emit)
            with zipfile.ZipFile(package) as z:
                if sum(x.file_size for x in z.infolist()) > 250 * 1024 * 1024:
                    raise ValueError('动态头像组件解压大小异常')
                for entry in z.infolist():
                    check()
                    target = (library / entry.filename).resolve()
                    if not target.is_relative_to(library.resolve()) or (entry.external_attr >> 16) & 0o170000 == 0o120000:
                        raise ValueError('动态头像组件包含无效路径')
                    if entry.is_dir():
                        continue
                    target.parent.mkdir(parents=True, exist_ok=True)
                    with z.open(entry) as src, target.open('wb') as dst:
                        shutil.copyfileobj(src, dst)
                    inventory[target.relative_to(stage).as_posix()] = {'bytes': target.stat().st_size, 'sha256': file_hash(target)}
            package.unlink()
        model = stage / lock['model']['file']
        download(lock['model'], model, check, emit)
        inventory[model.name] = {'bytes': model.stat().st_size, 'sha256': file_hash(model)}
        (stage / 'installed.json').write_text(json.dumps({'lockHash': lock_hash, 'files': inventory}, sort_keys=True), encoding='utf8')
        check()
        # Publish only a complete, hash-verified directory; never replace an installed generation.
        try:
            stage.rename(root)
        except OSError:
            if not verify(root, lock, lock_hash):
                raise
        sys.path.insert(0, str(root / 'lib'))
        emit(phase='动态头像组件已就绪', progress=1)
        return root
    finally:
        # Only this invocation's disposable stage is owned here.
        if stage.exists() and stage.parent == stage_parent and stage.name.startswith('.dynamic-stage-'):
            shutil.rmtree(stage)
