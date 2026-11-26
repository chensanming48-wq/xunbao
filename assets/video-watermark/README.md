# 视频水印本地处理组件

界面：`assets/video-watermark-web`，原生控制器：`VideoWatermarkStudio.cs`，桥接：`VideoWatermarkWebHost.cs`，导航：`MainForm.VideoWatermark.cs`。处理实现独立编写，未引用天策运行文件或其私有补丁。

运行依赖：现有 `Tools/FFmpeg`，`assets/one-cut-parser/runtime/python.exe`（本次为 Windows x64 CPython 3.13.15），以及 `Tools/Watermark/lib`、`Tools/Watermark/models/lama_fp32.onnx`。依赖清单、模型/轮子哈希和第三方许可在组件内 `component-info.json`、`THIRD-PARTY-NOTICES.txt` 和 `licenses`。Python 库为 cp313/abi3，不适用于旧版 Python 运行时。

本次验收/安装目录：`E:/千川软件/千川软件-重要资料/本地测试/视频水印整合-20260925/`。组件约 455 MiB，测试与本机安装共用一份已验证内容，不复制整个 Python/FFmpeg。正式对外发布时必须把完整水印组件及对应 Python 运行时加入独立候选并重新做打包/安装验证；仅复制网页和 EXE 不构成完整公开发布包。本次用户要求是本机安装，未生成公开或 OEM 安装包。

三个模式：remove/add/both。区域坐标为已归一化显示方向后的画面比例，保护框优先于去除框。自动检测采用本地 PP-OCRv4，4 次/秒扫描并识别文字。连续确认抖音标记时，用平台文字与账号行定位相邻图形标志，按时段跟踪水印位置，并单独定位稳定的下方字幕，避免把台历等原画文字一起去除。短暂漏检会在同一位置限时补齐；未确认平台水印的视频沿用通用文字检测。独立抖音片尾名片保留，需另行剪裁；其他图形标志或漏检内容仍可手动补框，绿色保护框优先。快速修复为 OpenCV Telea；AI 修复为固定 512 输入的 LaMa ONNX，按最多 8 个 CPU 线程逐帧逐区域补全，仅替换遮罩内像素，不承诺恢复被覆盖的原始内容。复杂运动背景可能有时序抖动，CPU 模式速度取决于片长/分辨率/区域数量。

FFmpeg 统一处理显示旋转、像素宽高比、帧率和音轨，输出 H.264/AAC MP4。输入不覆盖；每批创建独立目录及 JSON 记录。任务先写 partial 文件，通过 native ffprobe 的尺寸、时长、音轨校验后保留；失败、取消清理中间输出。进程取消先发送取消标记，必要时仅终止本任务的 Python/FFmpeg 进程树。

主界面复用现有 VIDEO_FISSION 会员能力门控；WebView2 限定本地可信页面，媒体只暴露本任务缓存，离开页面任务可继续，忙碌时正常关闭会要求先取消。
