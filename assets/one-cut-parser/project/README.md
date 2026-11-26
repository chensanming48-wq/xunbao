# Douyin 8K Parser

[![Python](https://img.shields.io/badge/python-3.9%2B-blue)](https://www.python.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![CI](https://github.com/lijinrui182/douyin-8k-parser/actions/workflows/test.yml/badge.svg)](https://github.com/lijinrui182/douyin-8k-parser/actions/workflows/test.yml)

Resolve high-bitrate / original Douyin video URLs with a tiny Python script.

The useful trick is simple:

```text
ratio=default + improve_bitrate=1 + watermark=0
```

For some Douyin posts, that play endpoint redirects to a large original source that the normal web detail payload does not expose directly.

## Features

- Resolves Douyin long URLs, short links, share text, and raw aweme IDs.
- Extracts `video.play_addr.uri` from the public web detail payload.
- Requests the high-bitrate play endpoint and follows the CDN redirect.
- Prints file size from `Content-Length` without downloading the full video.
- Optional direct download with progress.
- Optional JSON output for automation.

## Install

```bash
git clone https://github.com/lijinrui182/douyin-8k-parser.git
cd douyin-8k-parser
pip install -r requirements.txt
```

## Quick Start

Resolve a high-bitrate URL:

```bash
python douyin_8k_parser.py "https://www.douyin.com/video/7628438784602389247"
```

Example output:

```text
Video ID : 7628438784602389247
Quality  : 8K / Original
Size     : 412.49 MB
URL      : https://v5-dy-o-abtest.zjcdn.com/...
```

Print the full CDN URL:

```bash
python douyin_8k_parser.py "https://www.douyin.com/video/7628438784602389247" --show-full-url
```

JSON output:

```bash
python douyin_8k_parser.py "https://www.douyin.com/video/7628438784602389247" --json
```

Download the resolved video:

```bash
python douyin_8k_parser.py "https://www.douyin.com/video/7628438784602389247" --download video_original.mp4
```

## How It Works

1. Extract the Douyin aweme/video ID from the input.
2. Request the web detail endpoint:
   `https://www.douyin.com/aweme/v1/web/aweme/detail/`
3. Read `aweme_detail.video.play_addr.uri`.
4. Use that value as `video_id` in the play endpoint:
   `https://www.douyin.com/aweme/v1/play/`
5. Set the important parameters:
   `ratio=default`, `improve_bitrate=1`, `watermark=0`.
6. Follow the redirect and return the final CDN URL.

## Notes

- CDN URLs expire. Resolve them when you need to use them.
- Not every post has an original / 8K source. Availability depends on the uploaded media and platform response.
- The script only uses publicly reachable endpoints. It does not bypass login, private content, captchas, DRM, or access controls.
- Use this only for content you have the right to access and download.

## Similar Keywords

`douyin downloader`, `douyin parser`, `douyin 8k`, `douyin original video`, `aweme parser`, `high bitrate video`, `抖音解析`, `抖音8K`, `抖音原片`.

## License

MIT
