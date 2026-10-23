# MediaGo Monetization SDK MCP Server (`mediago_monetization_sdk_mcp`)

面向 **MediaGo / AdMaster Android 广告 SDK (`cc.admaster.android:sdk`)** 的官方 Model Context Protocol (MCP) Server。

与官方 Skill 仓库 [`mediago_monetization_sdk_skills`](https://github.com/mediagoinapp-star/mediago_monetization_sdk_skills) 配合使用，采用 **「Skill 定流程 + MCP 供工具/查真源/断日志」** 的双引擎架构：
- **零外部依赖**：基于原生 Node.js (`>=18`) 实现标准 JSON-RPC 2.0 `stdio` 协议，无需 `npm install` 任何第三方包即可直接运行。
- **单一事实源**：直接读取内置 [`data/compatibility.json`](./data/compatibility.json) 与 SDK 源码级状态机定义，彻底杜绝大模型编造版本号、写错包名或混淆聚合参数键名。

---

## 一、已支持的工具清单 (Tools)

| 工具名 | 对应编号 | 核心用途 |
| :--- | :---: | :--- |
| **`get_sdk_compatibility`** | **#1** | 查询核心 SDK 与 5 大聚合 Adapter 的最新验证版本、Maven 坐标、Android API 要求，并生成 Gradle (`groovy` / `kotlin-dsl`) 或 Unity EDM4U (`AdMasterDependencies.xml`) 依赖代码片段。 |
| **`get_ad_integration_template`** | **#2** | 生成 `init`、`rewarded`、`interstitial`、`splash`、`native`、`banner` 的标准接入代码模板，支持 `java`、`kotlin`、`unity-csharp`，以及 `standard`（常规）与 `client-bidding`（`IBiddingAd` C2S 竞价回传）模式。 |
| **`get_mediation_adapter_config`** | **#3** | 生成 AdMob / AppLovin MAX / TradPlus / TopOn (ThinkUp & Legacy) 的 Maven 依赖、各广告样式全限定 Adapter 类名，以及聚合后台 **Server Parameter JSON**（自动处理 AdMob `ad_unit_id` vs 其他平台 `placement_id` 的差异）。 |
| **`diagnose_error_code`** | **#8** | 诊断客户端 7 位 SDK 错误码 (`1010001`~`4030007`)、服务端 4 位 ADX/DSP 状态码 (`2000`、`3000~3004`、`4000~4004`、`1000~1999`) 及聚合 Adapter 错误码 (AdMob `100~104`、TopOn `1001~1007`)，明确区分客户端接入 Bug 与服务端无填充。 |
| **`analyze_logcat_trace`** | **#9** | 解析 Android Logcat 中的 `[Funnel]` 10 阶段生命周期日志（`INIT#0` → `CLOSED#9` 及 `#90/#91/#92` 终态）、`AdMaster/<Module>` 模块日志及错误码，自动定位卡死或报错的精确阶段。 |

> 暂缓开发的储备功能（编号 `#4`、`#5`、`#6`、`#7`、`#10`）详见 [`ROADMAP.md`](./ROADMAP.md)。

---

## 二、外部开发者一键接入配置

### 方式 A：直接通过 GitHub 公开仓库接入（零配置，立即可用）
外部开发者无需克隆仓库、无需等待 npm 审核，直接在 Cursor (`.cursor/mcp.json`)、Claude Code (`.mcp.json`)、Windsurf 或 Cline 中配置：

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

### 方式 B：通过 npm 官方包接入（发布至 npmjs.com 后可用）

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

### 方式 C：本地克隆调试

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
# 自检列出 5 个工具
node ./bin/mediago_monetization_sdk_mcp.js --self-test

# 运行全套协议与工具单元测试
npm test
```
