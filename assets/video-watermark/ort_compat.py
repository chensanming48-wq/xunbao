"""Pinned ORT compatibility lane. Never modifies an installed library or uses pip.

An import failure is handled before any media processing, in a fresh interpreter.
The existing OCR/LaMa models and quality settings are retained.
"""
import hashlib
import os
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import time
import uuid
import zipfile

WHEEL = "onnxruntime-1.20.1-cp313-cp313-win_amd64.whl"
SHA256 = "d30367df7e70f1d9fc5a6a68106f5961686d39b54d3221f760085524e8d38e16"
SIZE = 11331758
URL = "https://files.pythonhosted.org/packages/d8/e0/50db43188ca1c945decaa8fc2a024c33446d31afed40149897d4f9de505f/" + WHEEL
SWITCH = "--watermark-ort-compat"

def digest(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()

def prepare(request, check):
    if sys.version_info[:2] != (3, 13) or struct.calcsize("P") != 8:
        raise RuntimeError("ORT_COMPAT_ARCH：需要软件配套的 64 位 Python 3.13，请修复视频运行组件")
    wheel = Path(__file__).with_name("compat") / WHEEL
    if not wheel.is_file():
        raise RuntimeError("ORT_COMPAT_MISSING：原识别引擎加载失败，离线兼容组件缺失；请安装匹配版本的视频组件")
    check()
    if wheel.stat().st_size != SIZE or digest(wheel) != SHA256:
        raise RuntimeError("ORT_COMPAT_INTEGRITY：兼容组件校验失败，已停止处理，请修复视频组件")
    # The native host creates a session-specific request/cache directory in TEMP.
    # Contents are derived only from the exact reviewed wheel; no caller path in ZIP.
    parent = Path(request).resolve().parent
    target = parent / ("ort-compat-" + SHA256[:16])
    with zipfile.ZipFile(wheel) as z:
        entries = [x for x in z.infolist() if x.filename.startswith("onnxruntime/") and not x.is_dir()]
        if any(".." in Path(x.filename).parts or "\\" in x.filename or ":" in x.filename for x in entries):
            raise RuntimeError("ORT_COMPAT_INTEGRITY：兼容组件路径无效")
        def valid():
            for entry in entries:
                check()
                path = target / entry.filename
                if not path.is_file() or path.is_symlink() or path.stat().st_size != entry.file_size:
                    return False
                if digest(path) != hashlib.sha256(z.read(entry)).hexdigest():
                    return False
            return True
        if target.exists():
            if not valid():
                raise RuntimeError("ORT_COMPAT_CACHE：兼容缓存不完整或已变化，请取消任务后重试")
            return target
        stage = parent / (".ort-stage-" + uuid.uuid4().hex)
        stage.mkdir()
        try:
            for entry in entries:
                check()
                path = stage / entry.filename
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(z.read(entry))
            try:
                stage.rename(target)
            except OSError:
                if not target.is_dir() or not valid():
                    raise
        finally:
            if stage.exists():
                shutil.rmtree(stage)  # Only this invocation's UUID staging directory.
        if not valid():
            raise RuntimeError("ORT_COMPAT_INTEGRITY：兼容组件解压校验失败")
    return target

def required(job):
    if job["action"] == "preflight":
        return job.get("needsDetection", False) or job.get("needsAi", False)
    return job["action"] == "detect" or (job["action"] == "render" and
            job["settings"].get("Mode", "remove") != "add" and job["settings"].get("Quality") == "ai")

def bootstrap(job, request, worker, emit, check):
    if not required(job):
        return None
    if SWITCH in sys.argv[2:]:
        path = prepare(request, check)
        sys.path.insert(0, str(path))
        try:
            import onnxruntime as ort
            if ort.__version__ != "1.20.1" or not Path(ort.__file__).resolve().is_relative_to(path):
                raise ImportError("Unexpected compatibility engine")
        except (ImportError, OSError) as exc:
            raise RuntimeError("ORT_COMPAT_LOAD：主引擎与兼容引擎均无法加载；请检查系统运行库和视频组件，未改用普通涂抹") from exc
        emit(status="已使用本地 CPU 兼容引擎，保留自动识别与 AI 修复", engine="onnxruntime-1.20.1-cpu")
        return None
    try:
        import onnxruntime
        return None
    except (ImportError, OSError):
        emit(status="识别引擎加载失败，正在启动本地兼容引擎", code="ORT_PRIMARY_IMPORT_FAILED")
    prepare(request, check)
    check()
    # Never try to unload/reimport a partly initialized native DLL in this process.
    # stdio remains connected to the native host; it owns whole-process-tree timeout.
    p = subprocess.Popen([sys.executable, "-B", str(worker), str(request), SWITCH],
                         stdin=subprocess.DEVNULL, stdout=sys.stdout, stderr=sys.stderr,
                         creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    try:
        while p.poll() is None:
            check()
            time.sleep(.1)
        return p.returncode
    finally:
        if p.poll() is None:
            # Give the worker a chance to close its decoder/encoder on cancellation.
            try:
                p.wait(timeout=3)
            except subprocess.TimeoutExpired:
                if os.name == "nt":
                    subprocess.run([str(Path(os.environ["SystemRoot"])/"System32/taskkill.exe"), "/PID", str(p.pid), "/T", "/F"],
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=5,
                                   creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
                else:
                    p.kill()
                p.wait(timeout=5)
