"""One JSON request on stdin, one verified public video result on stdout."""
import json
import sys
from public_video_resolver import resolve


def main():
    try:
        raw = sys.stdin.buffer.read(65537)
        if len(raw) > 65536:
            raise ValueError("解析输入过大。")
        request = json.loads(raw.decode("utf-8-sig"))
        if not isinstance(request, dict):
            raise ValueError("解析输入格式无效。")
        result = resolve(request.get("source", ""))
    except Exception:
        result = {"protocol": 1, "success": False, "errorCode": "INVALID_RESPONSE",
                  "error": "自有解析未取得有效结果，请稍后重试。"}
    print(json.dumps(result, ensure_ascii=False, separators=(",", ":")), flush=True)
    return 0 if result.get("success") else 1


if __name__ == "__main__":
    raise SystemExit(main())
