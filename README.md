# dsh-wallpaper-tool
这是一个适用于Deepseek Harness的插件，给 DeepSeek Harness Web 界面换壁纸的插件（TypeScript）：图片/视频背景、不透明度/模糊/暗化、动态特效、面板透出、背景轮播、手动裁切构图。数据全部留在本机 IndexedDB。                                                                                                              A TypeScript wallpaper tool for the DeepSeek Harness Web UI: image/video backgrounds, opacity / blur / darken, animated effects, see-through panes, carousel and manual crop. Everything stays in local IndexedDB.
# Wallpaper tool 
给 **DeepSeek Harness** 的 Web 界面铺一张自己的壁纸：上传图片或视频，调节不透明度 / 模糊 / 暗化，叠加动态特效，让侧边栏、内容区和输入框一起透出壁纸，还能轮播与手动裁切构图。

> A wallpaper tool for the DeepSeek Harness Web UI. Images, videos, animated
> effects, translucent panes, a carousel and hand-made framing — TypeScript
> source, one self-contained browser bundle, no network access.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![TypeScript](https://img.shields.io/badge/TypeScript-source-3178c6)
![DSH plugin](https://img.shields.io/badge/DSH-client%20plugin-4f8cff)

---

## 它能做什么

| 能力 | 说明 |
| --- | --- |
| 自定义背景 | 壁纸库里的任意图片 / 视频 / 特效一键设为背景 |
| 上传图片与视频 | 拖拽或多选；**先探测再判定**，由浏览器决定能否解码，失败会告诉你是哪个文件、什么原因；视频自动静音循环并抓首帧做缩略图 |
| 不透明度 / 模糊 / 暗化 | 三个主滑块，另有亮度、饱和度、暗角、缩放、水平 / 垂直构图 |
| 动态背景特效 | 极光、星河流转、浮光粒子、层叠波浪、光束、细雨（Canvas 实时绘制），可当背景，也可叠在当前壁纸之上 |
| 面板透出壁纸 | 侧边栏 / 内容区 / 输入框 / 菜单弹层分别控制「面板不透明度」与「背后霜面模糊」 |
| 背景轮播 | 间隔 5–3600 秒、顺序或随机、淡入 / 缩放 / 平移 / 模糊过渡、过渡时长、参与成员勾选 |
| 手动裁切构图 | 拖拽移动、滚轮缩放、滑块微调、±180° 旋转、多种画幅比例；图片烘焙成新副本，视频保存取景参数 |
| 顺手的小东西 | `Alt+B` 开关壁纸、侧边栏快捷面板、缓慢动效（推拉 / 漂移 / 呼吸）、跟随系统「减少动态效果」、后台自动暂停、视频声音开关与音量 |

## 安装

这是标准的 DSH bundle，用官方 CLI 安装（本机实测流程）：

```powershell
dsh plugin --profile web add file:<插件文件夹绝对路径>
# 完全退出并重新打开 Harness
```

更新已安装版本请**先移除再安装**（对同一个本地路径重复 `add`，插件管理器的 `reconcile()`
会把 `dsh.profile.bundles` 里的注册删掉）：

```powershell
dsh plugin --profile web remove dsh-wallpaper-tool
dsh plugin --profile web add file:<插件文件夹绝对路径>
```

装好后：**设置 → 背景壁纸**（六个标签页），侧边栏底部多一个 🖼 快捷面板，`Alt+B` 随时开关。

## 隐私

壁纸原图 / 视频以 Blob 存在页面所在源的 IndexedDB，设置存在同一个库；**没有网络请求，不写磁盘文件，不经过 Host**。
IndexedDB 不可用时自动退化为"本次会话有效"并在界面上如实标注。

## 实现要点

- **面板透出**：覆盖界面自身的设计令牌（`--dsw-alias-bg-base`、`--dsw-specific-sidebar-fill`、
  `--dsw-specific-input-major`、`--dsw-specific-menu`）。颜色用 CSS 相对颜色语法写成
  `rgb(from <令牌原值> r g b / 48%)`，不解析颜色值，因此 `color-mix()` / wide-gamut / var 链都不会翻车；
  同时以 inline `!important` 兜底，避免被其它插件的更高优先级覆盖抢走。
- **面板霜面**：`backdrop-filter` 会让元素成为其 `position: fixed` 子元素的包含块（会挪动宿主布局），
  所以模糊**不施加在宿主元素上**——插件只测量面板几何，在自己的图层里画对应位置的霜面矩形。
  有专门的不变量断言守住"宿主元素零改动"。
- **裁切一致性**：背景层、裁切预览、烘焙出的图片共用同一套几何计算，所见即所得。
- **性能**：单个 requestAnimationFrame 循环、DPR 上限 1.5、粒子数随画布面积缩放、窗口隐藏即暂停、尊重 `prefers-reduced-motion`。

## 构建与测试

```bash
node build.mjs          # TypeScript → client.js / index.js（Node ≥ 22.18，内置类型擦除，零打包依赖）
node build.mjs --check  # 只编译校验
node tests/smoke.cjs    # 无头冒烟测试（21 项：DOM/IndexedDB/媒体桩 + 迷你 React）
```

构建期还会跑一组**打包器守卫自检**：循环依赖、多声明符导出、解构导出、Host 半边必须导出 `apply()`。

## 已知限制

- 视频不会被重新编码，裁切只保存取景参数；单文件上限 320 MB。
- MKV / H.265 等浏览器无法解码的封装或编码会被明确拒绝（并提示转码），而不是塞进库里变成黑屏。
- 面板霜面依赖几何采样；采不到时该面板只有透明、没有霜面（其余不受影响）。
- 覆盖 `--dsw-alias-bg-base` 会让少数共用该令牌的小控件一起变半透明，可用「整体压暗」与霜面模糊补偿。
