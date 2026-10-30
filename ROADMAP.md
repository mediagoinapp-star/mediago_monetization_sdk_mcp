# MediaGo Monetization SDK MCP 功能演进规划 (Roadmap & Release Status)

本文档记录 `mediago_monetization_sdk_mcp` 的 Phase 1 与 Phase 2 完整交付状态。当前 **全部 10 个 MCP 工具 (`#1` ~ `#10`) 及 `init` 零配置向导均已正式实装上线（v1.1.0）**。

---

## 一、Phase 1 基础核心工具（编号 1、2、3、8、9 — v1.0.0 已上线）

| 编号 | MCP Tool 名称 | 功能描述 | 状态 |
| :---: | :--- | :--- | :---: |
| **#1** | `get_sdk_compatibility` | 兼容矩阵与 Gradle / Kotlin DSL / Unity EDM4U 依赖生成器（单一事实源：`compatibility/compatibility.json`） | ✅ 已上线 |
| **#2** | `get_ad_integration_template` | 多广告样式（`init` / `rewarded` / `interstitial` / `splash` / `native` / `banner`）与多语言（Java / Kotlin / Unity C#）、常规 & Client Bidding (`IBiddingAd`) 精确代码模板生成器 | ✅ 已上线 |
| **#3** | `get_mediation_adapter_config` | 聚合平台（AdMob / MAX / TradPlus / TopOn ThinkUp & Legacy）Adapter 全限定类名与后台 Server Parameter JSON 生成器（自动防呆区分 `ad_unit_id` 与 `placement_id`） | ✅ 已上线 |
| **#8** | `diagnose_error_code` | 三层错误码（客户端 7 位 SDK 码 + 服务端 4 位 ADX/DSP 码 + 聚合 Adapter 码）智能诊断器，区分接入 Bug 与服务端 No Fill 并给出修复建议 | ✅ 已上线 |
| **#9** | `analyze_logcat_trace` | Logcat `[Funnel]` 10 阶段生命周期（`INIT#0` → `CLOSED#9` 及 `#90/#91/#92` 终态）与 `AdMaster/<Module>` 全链路日志分析器 | ✅ 已上线 |

---

## 二、Phase 2 自动化体检、生产级缓存与真机联调（编号 4、5、6、7、10 + CLI Wizard — v1.1.0 已上线）

| 编号 | MCP Tool / CLI 名称 | 功能描述 | 状态 |
| :---: | :--- | :--- | :---: |
| **#4** | `get_test_credentials_and_validator` | 官方测试凭证下发、32 位十六进制 `app_id` 与纯数字 `ad_unit_id` 防填反/防空白/防样式错配校验器，及 Debug/Release 自动切换封装生成器 | ✅ 已上线 |
| **#5** | `audit_host_gradle_and_manifest` | 宿主 Android / Unity 工程构建脚本 (`build.gradle[.kts]` / `settings.gradle` / `*Dependencies.xml`) 与 `AndroidManifest.xml` 静态体检器（检测 `mavenCentral()`、TopOn 新旧双分支冲突、组件误删等） | ✅ 已上线 |
| **#6** | `audit_ad_integration_code` | 宿主接入代码 7 大反模式静态扫描器（检测未等 `onInitialized` 同步 `load`、失败回调死循环同步重试、`show` 前未判 `isReady && !isExpired`、关闭回调误发奖、漏调 `destroy()`、Bidding 浮点价格等） | ✅ 已上线 |
| **#7** | `generate_ad_cache_manager` | 面向游戏与高频展示应用的生产级双缓冲预加载队列管理器生成器（支持 `RewardedAd` / `ExpressInterstitialAd`、Java / Kotlin 及 Client Bidding 报价读取） | ✅ 已上线 |
| **#10** | `verify_live_device_ads` | 真机 ADB 自动设备环境探测、Logcat 缓冲区实时抓取与 `analyze_logcat_trace` 端到端串联诊断工具 | ✅ 已上线 |
| **CLI** | `npx ... init [dir]` | 零配置 CLI 初始化向导：自动探测工程类型、安全合并 `.cursor/mcp.json` 与 `.mcp.json`，并自动执行首次工程静态体检 | ✅ 已上线 |
