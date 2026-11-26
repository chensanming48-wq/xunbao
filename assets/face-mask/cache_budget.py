"""Bound managed cache growth without removing any in-use or unowned files."""
import os
from pathlib import Path


def check_budget(root, limit):
    total=0
    root=Path(root)
    # New caches are flat sessions, legacy files live at the root. Do not follow links.
    folders=[root]
    for entry in root.iterdir():
        try:
            if entry.is_dir() and not entry.is_symlink() and not (getattr(entry.stat(), 'st_file_attributes', 0) & 0x400):
                if entry.name.startswith('session-'):folders.append(entry)
        except FileNotFoundError:continue
    for folder in folders:
        try:
            with os.scandir(folder) as entries:
                for entry in entries:
                    try:
                        if entry.is_file(follow_symlinks=False):total+=entry.stat(follow_symlinks=False).st_size
                    except FileNotFoundError:continue
                    if total>=limit:
                        raise RuntimeError('FACE_CACHE_LIMIT：遮挡缓存已达容量上限。请等待当前任务结束后退出并重开软件，以回收闲置缓存；旧版缓存需另行确认清理，或更换缓存目录。')
        except FileNotFoundError:continue  # Another process completed its safe cleanup.
    return total
