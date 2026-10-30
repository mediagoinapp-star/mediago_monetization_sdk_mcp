# MediaGo Monetization SDK MCP Server (`mediago_monetization_sdk_mcp`)

面向 **MediaGo Monetization SDK (`cc.admaster.android:sdk`)** 的官方 Model Context Protocol (MCP) Server 与零配置初始化 CLI 向导。

与官方 Skill 仓库 [`mediago_monetization_sdk_skills`](https://github.com/mediagoinapp-star/mediago_monetization_sdk_skills) 配合使用，采用 **「Skill 定流程 + MCP 供工具/查真源/静默体检/断日志」** 的双引擎架构：
- **零外部依赖**：基于原生 Node.js (`>=18`) 实现标准 JSON-RPC 2.0 `stdio` 协议与 CLI 向导，无需 `npm install` 任何第三方包即可直接运行。
- **单一事实源**：直接读取内置 [`data/compatibility.json`](./data/compatibility.json) 与 SDK 源码级状态机定义，彻底杜绝大模型编造版本号、写错包名或混淆聚合参数键名。
- **全套 10 大专业工具**：覆盖依赖兼容查询、代码模板生成、聚合配置生成、测试凭证防呆校验、Gradle/Manifest 静态体检、接入代码 7 大反模式扫描、生产级双缓冲缓存池生成、三层错误码诊断、Logcat 10 阶段漏斗还原与真机 ADB 联调诊断。

---

## 一、已支持的全部 10 个工具清单 (Tools `#1` ~ `#10`)

| 工具名 | 对应编号 | 核心用途 |
| :--- | :---: | :--- |
| **`get_sdk_compatibility`** | **#1** | 查询核心 SDK 与 5 大聚合 Adapter 的最新验证版本、Maven 坐标、Android API 要求，并生成 Gradle (`groovy` / `kotlin-dsl`) 或 Unity EDM4U (`AdMasterDependencies.xml`) 依赖代码片段。 |
| **`get_ad_integration_template`** | **#2** | 生成 `init`、`rewarded`、`interstitial`、`splash`、`native`、`banner` 的标准接入代码模板，支持 `java`、`kotlin`、`unity-csharp`，以及 `standard`（常规）与 `client-bidding`（`IBiddingAd` C2S 竞价回传）模式。 |
| **`get_mediation_adapter_config`** | **#3** | 生成 AdMob / AppLovin MAX / TradPlus / TopOn (ThinkUp & Legacy) 的 Maven 依赖、各广告样式全限定 Adapter 类名，以及聚合后台 **Server Parameter JSON**（自动处理 AdMob `ad_unit_id` vs 其他平台 `placement_id` 的差异）。 |
| **`get_test_credentials_and_validator`** | **#4** | 下发官方联调测试凭证，并校验宿主传入的 `app_id`（32位小写十六进制）与 `ad_unit_id`（纯数字字符串）是否合法、是否填反或样式不匹配，同时生成 Debug/Release 自动切换凭证封装代码。 |
| **`audit_host_gradle_and_manifest`** | **#5** | 扫描宿主工程 Gradle / EDM4U 与 `AndroidManifest.xml`，自动检查 `mavenCentral()` 仓库、SDK/Adapter 版本声明、TopOn 新旧双分支 (`com.thinkup.sdk` vs `com.anythink.sdk`) 冲突，以及 Manifest 是否误用 `tools:node="remove"` 剔除 SDK 组件。 |
| **`audit_ad_integration_code`** | **#6** | 静态扫描宿主 Java / Kotlin / C# 广告接入代码，自动识别 7 类高频反模式：未等 `onInitialized` 同步 `load`（必报 `1030003`）、失败回调无延迟递归重试（必报 `1040003`）、`show` 前漏检 `isReady() && !isExpired()`、关闭回调误发奖、漏调 `destroy()`、Bidding 浮点价格及无 Debug 守卫硬编码测试 ID。 |
| **`generate_ad_cache_manager`** | **#7** | 生成面向游戏与高频展示场景的生产级全屏广告（`RewardedAd` / `ExpressInterstitialAd`）双缓冲预加载队列管理器（Java / Kotlin），内置 `AtomicBoolean` 串行加载锁、过期自动销毁、展示即异步补载与指数退避重试。 |
| **`diagnose_error_code`** | **#8** | 诊断客户端 7 位 SDK 错误码 (`1010001`~`4030007`)、服务端 4 位 ADX/DSP 状态码 (`2000`、`3000~3004`、`4000~4004`、`1000~1999`) 及聚合 Adapter 错误码 (AdMob `100~104`、TopOn `1001~1007`)，明确区分客户端接入 Bug 与服务端无填充。 |
| **`analyze_logcat_trace`** | **#9** | 解析 Android Logcat 中的 `[Funnel]` 10 阶段生命周期日志（`INIT#0` → `CLOSED#9` 及 `#90/#91/#92` 终态）、`AdMaster/<Module>` 模块日志及错误码，自动定位卡死或报错的精确阶段。 |
| **`verify_live_device_ads`** | **#10** | 通过本机 ADB 连接真机或模拟器采集设备环境（机型、Android 版本、ABI、系统代理），自动抓取最新 Logcat 缓冲区并串联 `analyze_logcat_trace` 输出端到端真机诊断报告。 |

> 版本演进说明详见 [`ROADMAP.md`](./ROADMAP.md)。

---

## 二、外部开发者一键接入配置

### 方式 A：使用 `init` 向导一行命令零配置初始化（强烈推荐）
在你的 Android 或 Unity 工程根目录下直接运行：

```bash
npx -y github:mediagoinapp-star/mediago_monetization_sdk_mcp init
```
该向导会自动完成三件事：
1. 自动探测工程类型（`native_android` 或 `unity_android_bridge`）；
2. 安全创建或合并 `.cursor/mcp.json` 与 `.mcp.json`（不覆盖已有的其他 MCP Server）；
3. 立即执行一次 `audit_host_gradle_and_manifest` 静态工程环境体检并打印报告。

### 方式 B：手动通过 GitHub 公开仓库接入
在 Cursor (`.cursor/mcp.json`)、Claude Code (`.mcp.json`)、Windsurf 或 Cline 中配置：

```json
{
  "mcpServers": {
    "mediago_monetization_sdk_mcp": {
      "command": "npx",
      "args": ["-y", "github:mediagoinapp-star/mediago_monetization_sdk_mcp"]
    }
  }
}
```

**Claude Code 一键命令行安装：**
```bash
claude mcp add mediago_monetization_sdk_mcp -- npx -y github:mediagoinapp-star/mediago_monetization_sdk_mcp
```

### 方式 C：通过 npm 官方包接入（发布至 npmjs.com 后可用）

```json
{
  "mcpServers": {
    "mediago_monetization_sdk_mcp": {
      "command": "npx",
      "args": ["-y", "mediago_monetization_sdk_mcp@latest"]
    }
  }
}
```

### 方式 D：本地克隆调试

```json
{
  "mcpServers": {
    "mediago_monetization_sdk_mcp": {
      "command": "node",
      "args": [
        "/abs/path/to/mediago_monetization_sdk_mcp/bin/mediago_monetization_sdk_mcp.js"
      ]
    }
  }
}
```

### 命令行自检与测试

```bash
# 自检列出全部 10 个工具
node ./bin/mediago_monetization_sdk_mcp.js --self-test

# 运行全套协议、10 大工具与 CLI 向导单元测试
npm test
```
