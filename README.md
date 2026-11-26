# 瞬爆一刀不剪 · 安装目录归档

瞬爆一刀不剪 V1.57.7 桌面端完整安装目录的镜像归档。

主仓库只收录 **代码、配置、Web UI 资源与小于 50MB 的运行组件**；超过 GitHub 仓库单文件上限的运行组件与安装包，
统一放在 [Releases](../../releases) 里。

## 目录结构

```
├── 瞬爆点这里启动.exe          启动器
├── Microsoft.Web.WebView2.*     WebView2 运行时
├── WebView2Loader.dll
├── release-manifest.json       发布清单
├── core-release.json           核心版本清单
├── runtime-integrity.json      运行时校验
├── component-catalog.json      组件目录
├── install-profile.json        安装配置
├── brand/                      品牌资源包与图标
├── assets/                     全部前端 UI（视频、图文、素材、千川、选品等模块）
├── Tools/
│   ├── FFmpeg/                 ffmpeg / ffprobe（走 Release）
│   ├── Speech/                 Whisper 语音模型（走 Release）
│   └── Watermark/              LaMa 去水印 + RapidOCR + OpenCV
└── data/                       本地运行数据（不收录）
```

## 大文件附件

见 [Releases v1.57.7](../../releases/tag/v1.57.7)，共 5 个附件约 644 MB（安装包 zip 未收录）：

| 附件 | 还原路径 | 大小 |
|---|---|---|
| ffmpeg.exe | `Tools/FFmpeg/` | 97 MB |
| ffprobe.exe | `Tools/FFmpeg/` | 97 MB |
| ggml-small-q5_1.bin | `Tools/Speech/` | 182 MB |
| cv2.pyd | `Tools/Watermark/lib/cv2/` | 72 MB |
| lama_fp32.onnx | `Tools/Watermark/models/` | 199 MB |

## 完整还原

```bash
git clone https://github.com/chensanming48-wq/xunbao.git
cd xunbao
# 从 Releases 下载 5 个附件，按上表路径放回
```

## 未收录内容

以下内容因安全原因不进入版本库：

- `xw.key` —— 授权密钥文件
- `data/` —— 账号会话、千川 / 抖店 Cookie、WebView2 本地配置与运行日志

## 说明

本仓库为内部部署备份用途，软件著作权归原厂所有。
