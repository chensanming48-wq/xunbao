# Promotion Kit

## Short Post

I open-sourced a tiny Python script for resolving high-bitrate / original Douyin video URLs.

Core trick: `ratio=default + improve_bitrate=1 + watermark=0`

Repo: https://github.com/lijinrui182/douyin-8k-parser

## Chinese Post

开源了一个抖音 8K / 原片解析小工具，核心算法很简单：

`ratio=default + improve_bitrate=1 + watermark=0`

它会先拿 `video.play_addr.uri`，再请求播放接口并跟随 CDN 重定向，适合研究抖音公开视频的高码率链路。

GitHub: https://github.com/lijinrui182/douyin-8k-parser

## Hacker News / Reddit Style

Show HN: Douyin 8K Parser - a tiny Python script for resolving high-bitrate Douyin video URLs

I found that some Douyin posts expose a much larger original source through the play endpoint when using `ratio=default` and `improve_bitrate=1`. I wrapped the flow in a small Python CLI that resolves the CDN URL without downloading the full file.

Repo: https://github.com/lijinrui182/douyin-8k-parser
