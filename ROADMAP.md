# MediaGo Monetization SDK MCP 功能演进规划 (Roadmap & Backlog)

本文档记录 `mediago_monetization_sdk_mcp` 的已上线功能（Phase 1）以及暂缓开发的储备功能清单（Backlog）。

---

## 一、已上线功能（Phase 1：编号 1、2、3、8、9）

| 编号 | MCP Tool 名称 | 功能描述 | 状态 |
| :---: | :--- | :--- | :---: |
| **#1** | `get_sdk_compatibility` | 兼容矩阵与 Gradle / Kotlin DSL / Unity EDM4U 依赖生成器（单一事实源：`compatibility/compatibility.json`） | ✅ 已接入 |
| **#2** | `get_ad_integration_template` | 多广告样式（`init` / `rewarded` / `interstitial` / `splash` / `native` / `banner`）与多语言（Java / Kotlin / Unity C#）、常规 & Client Bidding (`IBiddingAd`) 精确代码模板生成器 | ✅ 已接入 |
| **#3** | `get_mediation_adapter_config` | 聚合平台（AdMob / MAX / TradPlus / TopOn ThinkUp & Legacy）Adapter 全限定类名与后台 Server Parameter JSON 生成器（自动防呆区分 `ad_unit_id` 与 `placement_id`） | ✅ 已接入 |
| **#8** | `diagnose_error_code` | 三层错误码（客户端 7 位 SDK 码 + 服务端 4 位 ADX/DSP 码 + 聚合 Adapter 码）智能诊断器，区分接入 Bug 与服务端 No Fill 并给出修复建议 | ✅ 已接入 |
| **#9** | `analyze_logcat_trace` | Logcat `[Funnel]` 10 阶段生命周期（`INIT#0` → `CLOSED#9` 及 `#90/#91/#92` 终态）与 `AdMaster/<Module>` 全链路日志分析器 | ✅ 已接入 |

---

## 二、待开发储备功能（Backlog：编号 4、5、6、7、10，暂不开发）

以下功能已完成方案设计，记录在此供后续迭代按需启用：

### 1. 编号 #4：`get_test_credentials_and_validator`（官方测试凭证下发与参数合法性校验器）
- **定位**：独立校验工具（当前基础测试凭证已内嵌于 `#1`、`#2`、`#3` 返回值中）。
- **规划能力**：
  - 校验宿主传入的 `app_id` 是否满足 32 位小写十六进制正则（`^[a-f0-9]{32}$`）。
  - 校验宿主 `ad_unit_id` / `placement_id` 是否为纯数字字符串、是否存在被 `Integer.parseInt` 截断前导零的风险、是否误将 `app_id` 与 `ad_unit_id` 填反。
  - 一键生成 Debug/Release 构建变体自动切换测试/正式 ID 的 `BuildConfig` 封装代码。

### 2. 编号 #5：`audit_host_gradle_and_manifest`（宿主工程构建脚本与 Manifest 自动体检器）
- **定位**：针对宿主 Android / Unity 工程的静态配置扫描工具。
- **规划能力**：
  - 扫描宿主 `build.gradle(.kts)`、`settings.gradle(.kts)`、`gradle.properties`、`AndroidManifest.xml` 或 Unity `AdMasterDependencies.xml`。
  - 自动检测：
    1. 是否漏配 `mavenCentral()` 仓库或 `compileOptions` Java 8；
    2. TopOn 宿主使用的是 `com.thinkup.sdk` 还是 `com.anythink.sdk`，是否选错了 Adapter 分支；
    3. 宿主 `AndroidManifest.xml` 合并规则是否误用 `tools:node="remove"` 移除了 SDK 的 Activity/Provider（预防 `1030001` / `1030002`）；
    4. 无 GMS 环境构建包是否正确剔除了 `com.google.android.gms` 传递依赖。

### 3. 编号 #6：`audit_ad_integration_code`（接入代码反模式与高频坑位静态扫描器）
- **定位**：接入完成后的自动化 Code Review 门禁工具。
- **规划能力**：
  - 扫描宿主 Java / Kotlin / C# 广告管理类代码，自动识别 7 类高频反模式：
    1. 未等待 `InitCallback.onInitialized()` 就在 `initialize()` 下一行直接调用 `load()`（必报 `1030003`）；
    2. 同一广告位无 `isLoading` 并发锁重复 `load()`（必报 `1040005`）；
    3. `onAdFailedToLoad` 中无退避延迟直接同步递归 `load()`（必报 `1040003`）；
    4. `show()` 前未检查 `ad != null && ad.isReady() && !ad.isExpired()`（易报 `1040006` / `3040002`）；
    5. 激励视频在 `onAdDismissedFullScreenContent` 而非 `OnUserEarnedRewardListener` 中发放奖励；
    6. 关闭或展示失败后漏调 `ad.destroy()` 导致内存泄漏；
    7. 开屏广告跳转主页面未使用 `AtomicBoolean` 幂等锁导致重复拉起 Activity。

### 4. 编号 #7：`generate_ad_cache_manager`（生产级预加载与容量队列脚手架生成器）
- **定位**：面向游戏与高频展示应用的高级缓存架构生成工具。
- **规划能力**：
  - 生成带 `isLoading` 串行锁、最大容量为 2 的 FIFO 缓存队列、过期自动剔除（`isExpired() -> destroy()`）、展示即异步补载、退避重试以及主线程安全回调派发的完整生产级管理类。

### 5. 编号 #10：`verify_live_device_ads`（真机 ADB 联调与日志抓取辅助工具）
- **定位**：连接本地真机做端到端冒烟验收的动态诊断工具。
- **规划能力**：
  - 通过 `adb` 自动采集连接设备信息（Android 版本、ABI、网络代理状态、WebView 版本）。
  - 自动清空并过滤抓取 `Funnel` / `AdMaster` / `Ads` 实时 Logcat 缓冲区，直接串联 `#9 analyze_logcat_trace` 输出端到端真机诊断报告。
