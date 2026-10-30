'use strict';

const {
  loadCompatibilityData,
  TEST_CREDENTIALS,
  ERROR_CODE_DB,
  LIFECYCLE_STAGES,
  TERMINAL_STAGES
} = require('./data');
const { getTemplate } = require('./templates');
const {
  handleGetTestCredentialsAndValidator,
  handleAuditHostGradleAndManifest,
  handleAuditAdIntegrationCode,
  handleGenerateAdCacheManager,
  handleVerifyLiveDeviceAds
} = require('./audit');

const TOOL_DEFINITIONS = [
  {
    name: 'get_sdk_compatibility',
    description:
      '查询 MediaGo Monetization SDK 及各聚合平台 Adapter (AdMob / AppLovin MAX / TradPlus / TopOn) 的官方兼容版本矩阵、Maven 坐标、Android/Unity API 级别要求，以及 Gradle / Kotlin DSL / Unity EDM4U 依赖配置片段（单一事实源：compatibility.json）。',
    inputSchema: {
      type: 'object',
      properties: {
        mediation_platform: {
          type: 'string',
          enum: [
            'none',
            'admob',
            'max',
            'tradplus',
            'topon-international',
            'topon-thinkup',
            'topon-legacy',
            'all'
          ],
          description:
            '聚合平台类型：none(仅直客SDK)、admob、max、tradplus、topon-international / topon-thinkup (海外新版 com.thinkup.sdk)、topon-legacy (旧版 com.anythink.sdk)、all(全部)',
          default: 'none'
        },
        build_dsl: {
          type: 'string',
          enum: ['groovy', 'kotlin-dsl', 'unity-edm4u'],
          description:
            '构建脚本格式：groovy (build.gradle)、kotlin-dsl (build.gradle.kts) 或 unity-edm4u (AdMasterDependencies.xml)',
          default: 'groovy'
        }
      }
    }
  },
  {
    name: 'get_ad_integration_template',
    description:
      '获取经过源码验证的 MediaGo Monetization SDK 接入代码模板与防踩坑签名约束。支持初始化(init)、激励视频(rewarded)、插屏(interstitial)、开屏(splash)、原生信息流(native)、横幅(banner)，支持 Java / Kotlin / Unity C# 及常规模式或 Client Bidding (IBiddingAd) 竞价模式。',
    inputSchema: {
      type: 'object',
      properties: {
        ad_format: {
          type: 'string',
          enum: ['init', 'rewarded', 'interstitial', 'splash', 'native', 'banner'],
          description: '要生成的模块或广告样式：init、rewarded、interstitial、splash、native、banner'
        },
        language: {
          type: 'string',
          enum: ['java', 'kotlin', 'unity-csharp'],
          description: '目标开发语言：java、kotlin 或 unity-csharp',
          default: 'java'
        },
        bidding_mode: {
          type: 'string',
          enum: ['standard', 'client-bidding'],
          description:
            '竞价模式：standard (常规瀑布流/直投) 或 client-bidding (C2S 客户端竞价，含 getECPM / sendWinNotification / sendLossNotification)',
          default: 'standard'
        },
        use_test_credentials: {
          type: 'boolean',
          description: '是否在代码模板中自动填入官方测试 App ID 与对应样式的测试广告位 ID',
          default: true
        }
      },
      required: ['ad_format']
    }
  },
  {
    name: 'get_mediation_adapter_config',
    description:
      '生成第三方聚合平台（AdMob / AppLovin MAX / TradPlus / TopOn International (ThinkUp) / TopOn Legacy (AnyThink)）接入 MediaGo Monetization SDK 自定义广告网络所需的 Maven 依赖坐标、各广告样式的全限定 Adapter 类名清单，以及聚合后台 Server Parameter JSON（自动区分 AdMob 的 ad_unit_id 与其他平台的 placement_id）。',
    inputSchema: {
      type: 'object',
      properties: {
        platform: {
          type: 'string',
          enum: ['admob', 'max', 'tradplus', 'topon-international', 'topon-thinkup', 'topon-legacy'],
          description:
            '目标聚合平台：admob、max、tradplus、topon-international (或别名 topon-thinkup，对应 com.thinkup.sdk)、topon-legacy (对应 com.anythink.sdk)'
        },
        ad_format: {
          type: 'string',
          enum: ['all', 'rewarded', 'interstitial', 'splash', 'native', 'banner'],
          description: '需要查询的广告样式，默认 all 返回该聚合平台支持的全部样式类名',
          default: 'all'
        },
        app_id: {
          type: 'string',
          description: '可选：填入你的 32 位 MediaGo Monetization SDK App ID（不填则默认生成官方测试 App ID）'
        },
        placement_id: {
          type: 'string',
          description: '可选：填入你的纯数字 MediaGo Monetization SDK 广告位 ID（不填则默认生成对应样式的官方测试广告位 ID）'
        }
      },
      required: ['platform']
    }
  },
  {
    name: 'get_test_credentials_and_validator',
    description:
      '下发 MediaGo Monetization SDK 官方测试凭证（32位测试 App ID 与 5 大广告样式测试广告位 ID），并校验宿主传入的 app_id / ad_unit_id 是否合法（自动检测是否把 App ID 与广告位 ID 填反、是否存在首尾空格、是否与目标广告样式不匹配），同时生成 Debug/Release 自动切换凭证的封装代码。',
    inputSchema: {
      type: 'object',
      properties: {
        app_id: {
          type: 'string',
          description: '可选：待校验的 MediaGo Monetization SDK App ID（标准为 32 位小写十六进制字符串）'
        },
        ad_unit_id: {
          type: 'string',
          description: '可选：待校验的广告位 ID / Placement ID（标准为纯数字字符串）'
        },
        expected_format: {
          type: 'string',
          enum: ['rewarded', 'interstitial', 'native', 'splash', 'banner'],
          description: '可选：期望绑定的广告样式，用于核对测试广告位 ID 是否拿错样式'
        },
        language: {
          type: 'string',
          enum: ['java', 'kotlin', 'unity-csharp'],
          description: '生成 Debug/Release 自动切换凭证代码的目标语言',
          default: 'java'
        }
      }
    }
  },
  {
    name: 'audit_host_gradle_and_manifest',
    description:
      '对宿主 Android 或 Unity 工程执行构建脚本与 AndroidManifest 静态体检：自动检查是否配置 mavenCentral()、SDK 与 Adapter 版本声明、TopOn 新旧双分支 (com.thinkup.sdk vs com.anythink.sdk) 是否混装冲突、minSdk 是否达标，以及 AndroidManifest 合并后是否误用 tools:node="remove" 剔除了 SDK 核心 Activity。',
    inputSchema: {
      type: 'object',
      properties: {
        project_root: {
          type: 'string',
          description: '宿主 Android 或 Unity 工程根目录绝对路径（不填默认使用当前工作目录）'
        }
      }
    }
  },
  {
    name: 'audit_ad_integration_code',
    description:
      '扫描宿主工程中的 Java / Kotlin / Unity C# 广告接入源码，自动识别 7 类高频反模式：未等待 onInitialized() 即同步调用 load() (1030003)、onAdFailedToLoad 中无退避延迟同步递归重试 (1040003)、调用 show() 前未检查 isReady() && !isExpired()、在关闭回调而非激励回调中发奖、漏调 destroy()、Client Bidding 传入浮点数 eCPM，以及无 Debug 守卫硬编码测试 ID。',
    inputSchema: {
      type: 'object',
      properties: {
        target_path: {
          type: 'string',
          description: '要扫描的宿主源码目录或单个文件绝对路径（不填默认扫描当前工作目录）'
        }
      }
    }
  },
  {
    name: 'generate_ad_cache_manager',
    description:
      '生成面向游戏与高频变现场景的生产级全屏广告（RewardedAd / ExpressInterstitialAd）双缓冲预加载队列管理器代码（支持 Java / Kotlin 及 Client Bidding 报价读取）。内置 AtomicBoolean 串行加载锁（防 1040005）、过期缓存自动销毁（防 1040006/3040004）、展示即异步补货（Refill-on-Consume）与指数退避重试（防 1040003）。',
    inputSchema: {
      type: 'object',
      properties: {
        ad_format: {
          type: 'string',
          enum: ['rewarded', 'interstitial'],
          description: '要生成缓存管理器的全屏广告样式：rewarded 或 interstitial',
          default: 'rewarded'
        },
        language: {
          type: 'string',
          enum: ['java', 'kotlin'],
          description: '目标开发语言：java 或 kotlin',
          default: 'java'
        },
        cache_capacity: {
          type: 'number',
          description: '缓冲队列容量（建议 2，范围 1~4）',
          default: 2
        },
        bidding_mode: {
          type: 'string',
          enum: ['standard', 'client-bidding'],
          description: '是否包含 Client Bidding 最高 eCPM 报价读取辅助方法',
          default: 'standard'
        }
      }
    }
  },
  {
    name: 'diagnose_error_code',
    description:
      '诊断 MediaGo Monetization SDK 广告请求或展示失败错误码。支持客户端 7 位 SDK 错误码（1010001~4030007）、服务端 4 位状态码（2000 无填充、3000~3004 请求异常、4000~4004 DSP 异常、1000~1999 内部错误）以及聚合 Adapter 错误码（AdMob 100~104、TopOn 1001~1007），明确区分“客户端接入 Bug”与“服务端无填充”，并给出重试建议与修复代码。',
    inputSchema: {
      type: 'object',
      properties: {
        error_code: {
          type: ['number', 'string'],
          description: '报错返回的错误码（如 1030003、1040005、2000、3040004、101、1001 等）'
        },
        mediation_platform: {
          type: 'string',
          enum: ['none', 'admob', 'topon', 'max', 'tradplus'],
          description: '可选：报错来源的聚合平台（用于精准区分 100~104 或 1001~1007 等聚合专属错误码）',
          default: 'none'
        }
      },
      required: ['error_code']
    }
  },
  {
    name: 'analyze_logcat_trace',
    description:
      '解析 Android Logcat 中的 MediaGo Monetization SDK 广告日志（支持 [Funnel] 10 阶段生命周期日志、AdMaster/<Module> 调试日志及宿主 [Ads] 桥接日志），自动还原 INIT#0 -> REQUESTING#1 -> PARSING#2 -> CACHING#3 -> READY#4 -> SHOW_CALLED#5 -> SHOWING#6 -> RENDERING#7 -> PLAYING#8 -> CLOSED#9 全链路状态机，定位断点阶段、耗时瓶颈与异常原因。',
    inputSchema: {
      type: 'object',
      properties: {
        logcat_text: {
          type: 'string',
          description: '从 Android Studio 或 adb logcat 复制的日志文本片段'
        },
        ad_format: {
          type: 'string',
          enum: ['auto', 'rewarded', 'interstitial', 'splash', 'native', 'banner'],
          description: '可选：当前排查的广告样式（默认 auto 自动从日志识别）',
          default: 'auto'
        }
      },
      required: ['logcat_text']
    }
  },
  {
    name: 'verify_live_device_ads',
    description:
      '通过本机 ADB 连接真机或模拟器执行端到端动态广告诊断：自动探测在线设备环境（机型、Android 版本、ABI、系统代理状态），拉取最新 Logcat 缓冲区并过滤 MediaGo Monetization SDK 日志，直接串联 analyze_logcat_trace 输出真机生命周期与错误码诊断报告。',
    inputSchema: {
      type: 'object',
      properties: {
        device_serial: {
          type: 'string',
          description: '可选：指定目标设备序列号（adb -s <serial>，不填默认取第一台在线设备）'
        },
        max_lines: {
          type: 'number',
          description: '从 adb logcat -d -t 拉取的最大日志行数（默认 1500，范围 100~10000）',
          default: 1500
        },
        clear_before_capture: {
          type: 'boolean',
          description: '是否在拉取前先执行 adb logcat -c 清空旧缓冲区（默认 false）',
          default: false
        }
      }
    }
  }
];

function normalizeMediationKey(platform) {
  if (!platform) return 'none';
  const lower = String(platform).toLowerCase();
  if (lower === 'topon-thinkup') return 'topon-international';
  return lower;
}

/**
 * Tool #1: get_sdk_compatibility
 */
function handleGetSdkCompatibility(args = {}) {
  const compat = loadCompatibilityData();
  const rawPlatform = args.mediation_platform || 'none';
  const normPlatform = normalizeMediationKey(rawPlatform);
  const dsl = args.build_dsl || 'groovy';

  const directEntry =
    compat.entries.find((e) => e.route === 'direct' || e.mediation === 'none') || compat.entries[0];
  const coreArtifact = `${directEntry.sdk_artifact}:${directEntry.sdk_version}`;

  const mediationEntries = compat.entries.filter((e) => e.route === 'mediation');
  let selectedAdapters = [];
  if (normPlatform === 'all') {
    selectedAdapters = mediationEntries;
  } else if (normPlatform !== 'none') {
    selectedAdapters = mediationEntries.filter((e) => e.mediation === normPlatform);
  }

  let buildSnippet = '';
  if (dsl === 'kotlin-dsl') {
    const adapterLines = selectedAdapters
      .map((a) => `    implementation("${a.adapter_artifact}:${a.adapter_version}")`)
      .join('\n');
    buildSnippet = `
// settings.gradle.kts 中确保包含 mavenCentral() 与 google()
dependencies {
    // MediaGo Monetization SDK 核心依赖
    implementation("${coreArtifact}")${adapterLines ? '\n    // 聚合平台 Adapter\n' + adapterLines : ''}
}`.trim();
  } else if (dsl === 'unity-edm4u') {
    const adapterXml = selectedAdapters
      .map((a) => `    <androidPackage spec="${a.adapter_artifact}:${a.adapter_version}" />`)
      .join('\n');
    buildSnippet = `
<!-- Assets/AdMaster/Editor/AdMasterDependencies.xml -->
<dependencies>
  <androidPackages>
    <androidPackage spec="${coreArtifact}" />${adapterXml ? '\n' + adapterXml : ''}
  </androidPackages>
</dependencies>`.trim();
  } else {
    const adapterLines = selectedAdapters
      .map((a) => `    implementation '${a.adapter_artifact}:${a.adapter_version}'`)
      .join('\n');
    buildSnippet = `
// settings.gradle 或根 build.gradle 中确保包含 mavenCentral() 与 google()
dependencies {
    // MediaGo Monetization SDK 核心依赖
    implementation '${coreArtifact}'${adapterLines ? '\n    // 聚合平台 Adapter\n' + adapterLines : ''}
}`.trim();
  }

  return {
    schema_version: compat.schema_version,
    generated_at: compat.generated_at,
    sdk: {
      coordinate: coreArtifact,
      sdk_artifact: directEntry.sdk_artifact,
      latest_verified: directEntry.sdk_version,
      supported_range: directEntry.supported_range
    },
    support_window: compat.support_window,
    selected_adapters: selectedAdapters.map((a) => ({
      mediation: a.mediation,
      coordinate: `${a.adapter_artifact}:${a.adapter_version}`,
      host_mediation_artifact: a.host_mediation_artifact,
      server_parameter_keys: a.server_parameter_keys,
      known_issues: a.known_issues
    })),
    build_dsl: dsl,
    dependency_snippet: buildSnippet,
    test_credentials: TEST_CREDENTIALS,
    proguard_note:
      'SDK AAR 已内置 consumer-rules.pro，开启 R8/ProGuard 时会自动合并混淆保留规则；若使用字节码重打包工具，请确保保留 keep class cc.admaster.android.** { *; }。'
  };
}

/**
 * Tool #2: get_ad_integration_template
 */
function handleGetAdIntegrationTemplate(args = {}) {
  const ad_format = args.ad_format || 'rewarded';
  const language = args.language || 'java';
  const bidding_mode = args.bidding_mode || 'standard';
  const use_test_credentials = args.use_test_credentials !== false;

  return getTemplate({
    ad_format,
    language,
    bidding_mode,
    use_test_credentials
  });
}

/**
 * Tool #3: get_mediation_adapter_config
 */
function handleGetMediationAdapterConfig(args = {}) {
  const compat = loadCompatibilityData();
  const normPlatform = normalizeMediationKey(args.platform);
  const adFormat = args.ad_format || 'all';

  const adapterInfo = compat.entries.find(
    (e) => e.route === 'mediation' && e.mediation === normPlatform
  );

  if (!adapterInfo) {
    const validPlatforms = compat.entries
      .filter((e) => e.route === 'mediation')
      .map((e) => e.mediation);
    throw new Error(
      `不支持的聚合平台 "${args.platform}"，可选值: ${validPlatforms.join(', ')} (或别名 topon-thinkup)`
    );
  }

  const appId = args.app_id || TEST_CREDENTIALS.app_id;
  const formatForPlacement = adFormat === 'all' ? 'rewarded' : adFormat;
  const placementId =
    args.placement_id ||
    TEST_CREDENTIALS.placements[formatForPlacement] ||
    TEST_CREDENTIALS.placements.rewarded;

  let adapterClasses = {};
  if (adapterInfo.adapter_entry_class) {
    adapterClasses = {
      all_formats: adapterInfo.adapter_entry_class
    };
  } else if (adapterInfo.adapter_classes) {
    if (adFormat === 'all') {
      adapterClasses = adapterInfo.adapter_classes;
    } else if (adapterInfo.adapter_classes[adFormat]) {
      adapterClasses = { [adFormat]: adapterInfo.adapter_classes[adFormat] };
    } else {
      adapterClasses = {
        warning: `该聚合平台 (${normPlatform}) 未单独列出 ${adFormat} 的独立 Adapter 类，完整列表见下`,
        ...adapterInfo.adapter_classes
      };
    }
  }

  // AdMob 使用 "ad_unit_id"，其他聚合平台（MAX / TradPlus / TopOn）使用 "placement_id"
  const isAdMob = normPlatform === 'admob';
  const serverParameters = isAdMob
    ? {
        app_id: appId,
        ad_unit_id: placementId
      }
    : {
        app_id: appId,
        placement_id: placementId
      };

  const allPlacementServerParameters = {};
  for (const [fmt, pid] of Object.entries(TEST_CREDENTIALS.placements)) {
    allPlacementServerParameters[fmt] = isAdMob
      ? { app_id: appId, ad_unit_id: pid }
      : { app_id: appId, placement_id: pid };
  }

  const criticalNotes = [...(adapterInfo.known_issues || [])];
  if (isAdMob) {
    criticalNotes.push(
      '⚠️ 极易踩坑：AdMob 后台自定义事件 (Custom Event) 的 Parameter JSON 键名必须是 "app_id" 和 "ad_unit_id"！切勿写成 "placement_id"，否则必报 AdMob Adapter 错误码 101 (ERROR_INVALID_SERVER_PARAMETERS)。',
      `AdMob 自定义事件仅需配置 1 个统一入口类：${adapterInfo.adapter_entry_class}（无需按样式填不同类名）。`
    );
  } else if (normPlatform === 'max') {
    criticalNotes.push(
      `AppLovin MAX 后台 Custom Network 的 Adapter Class Name 统一填写：${adapterInfo.adapter_entry_class}。`,
      'MAX 后台 Custom Parameters JSON 键名为 "app_id" 和 "placement_id"。'
    );
  } else if (normPlatform === 'tradplus') {
    criticalNotes.push(
      'TradPlus 后台添加自定义广告网络时，需按广告样式分别填写对应的 Adapter 全限定类名（如激励视频填 cc.admaster.android.tradplus.adapter.AdMasterTPRewardedAdAdapter）。',
      'TradPlus 后台自定义参数 JSON 键名为 "app_id" 和 "placement_id"。'
    );
  } else if (normPlatform === 'topon-international' || normPlatform === 'topon-legacy') {
    criticalNotes.push(
      '⚠️ TopOn 双分支选择铁律：先检查宿主依赖的是海外新版 com.thinkup.sdk（选 topon-international，工件 cc.admaster.android:topon-adapter）还是旧版 com.anythink.sdk（选 topon-legacy，工件 cc.admaster.android:topon-secmtp-adapter），严禁混装！',
      'TopOn 后台自定义广告源参数 JSON 键名为 "app_id" 和 "placement_id"；若缺失会报 TopOn Adapter 错误码 1001 (ERROR_CONFIG)。',
      '支持在 TopOn 后台开启 C2S Header Bidding，Adapter 内置 startBiddingRequest 与竞胜/竞败自动回传。'
    );
  }

  return {
    platform: normPlatform,
    maven_dependencies: [
      `${adapterInfo.sdk_artifact}:${adapterInfo.sdk_version}`,
      `${adapterInfo.adapter_artifact}:${adapterInfo.adapter_version}`
    ],
    host_mediation_sdk_requirement: adapterInfo.host_mediation_artifact,
    server_parameter_keys: adapterInfo.server_parameter_keys,
    adapter_classes: adapterClasses,
    dashboard_server_parameter_json: JSON.stringify(serverParameters, null, 2),
    test_server_parameters_by_format: allPlacementServerParameters,
    critical_notes: criticalNotes
  };
}

/**
 * Tool #8: diagnose_error_code
 */
function handleDiagnoseErrorCode(args = {}) {
  const rawCode = String(args.error_code).trim();
  const numCode = Number(rawCode);
  const platform = (args.mediation_platform || 'none').toLowerCase();

  // 1. 若指定了 admob 或 topon
  if (platform === 'admob' && ERROR_CODE_DB[`admob_${rawCode}`]) {
    return ERROR_CODE_DB[`admob_${rawCode}`];
  }
  if (platform === 'topon' && ERROR_CODE_DB[`topon_${rawCode}`]) {
    return ERROR_CODE_DB[`topon_${rawCode}`];
  }

  // 2. 直接匹配客户端 7 位码或服务端 2000
  if (ERROR_CODE_DB[rawCode]) {
    return ERROR_CODE_DB[rawCode];
  }

  // 3. 未显式指定平台时，100~104 匹配 AdMob Adapter
  if (ERROR_CODE_DB[`admob_${rawCode}`]) {
    return {
      ...ERROR_CODE_DB[`admob_${rawCode}`],
      note: '识别为 AdMob Mediation Adapter 错误码（100~104）。'
    };
  }

  // 4. 1001~1007 既可能是 TopOn Adapter 错误码，也可能是服务端 1000~1999 内部错误
  if (ERROR_CODE_DB[`topon_${rawCode}`]) {
    return {
      ...ERROR_CODE_DB[`topon_${rawCode}`],
      note:
        '若您使用的是 TopOn 聚合，此为 TopOn Adapter 错误码（1001~1007）；若为直客接入且在服务端响应中看到 1000~1999，则代表 ADX 服务端内部错误（可延迟重试并联系技术支持）。'
    };
  }

  // 5. 服务端区间码匹配
  if (!Number.isNaN(numCode)) {
    if (numCode >= 3000 && numCode <= 3004) {
      return {
        code: numCode,
        constant: 'SERVER_ADX_POLICY_FILTER_NO_FILL',
        layer: 'server_adx',
        category: 'SERVER_NO_FILL',
        should_retry: true,
        summary: 'ADX 策略过滤无填充 (3000~3004)',
        root_cause:
          '广告请求被 ADX 策略过滤（如频次控制、底价 bidFloor 过滤、地域或定向不匹配），导致无广告返回。',
        troubleshooting_steps: [
          '非客户端代码 Bug，属于业务策略或定向过滤导致的正常无填充 (No Fill)。',
          '客户端应执行退避延迟重试（如 30s~60s）或交由聚合瀑布流切换下一层广告源。',
          '若在开发联调阶段需要稳定填充，请切换至官方测试凭证进行验证。'
        ],
        code_fix_hint:
          '测试凭证对照：App ID="ad2fd73dca2ccffd312495bcd8a33d29"，激励="100090001"，插屏="100090002"，原生="100090003"，开屏="100090004"，横幅="100090005"。'
      };
    }

    if (numCode >= 4000 && numCode <= 4004) {
      return {
        code: numCode,
        constant: 'SERVER_BAD_REQUEST_PARAM_INVALID',
        layer: 'server_adx',
        category: 'CLIENT_INTEGRATION_BUG',
        should_retry: false,
        summary: '请求参数校验失败 Bad Request (4000~4004)',
        root_cause:
          '服务端校验请求参数失败：appId 或 adUnitId 无效、未在后台开通生效，或广告位样式与调用的 SDK API 类型不匹配（如拿激励视频广告位调用了 BannerAdLoader）。',
        troubleshooting_steps: [
          '核对 appId 与 adUnitId 是否存在前后空格、拼写错误，或误将 App ID 与 Ad Unit ID 填反。',
          '核对当前调用的广告类（RewardedAd / ExpressInterstitialAd / SplashAd / NativeAdLoader / BannerAdLoader）与后台创建的广告位样式是否一致。',
          '禁止对此类参数错误发起重试；可先切换至官方测试凭证验证接入代码。'
        ],
        code_fix_hint:
          '测试凭证对照：App ID="ad2fd73dca2ccffd312495bcd8a33d29"，激励="100090001"，插屏="100090002"，原生="100090003"，开屏="100090004"，横幅="100090005"。'
      };
    }

    if (numCode >= 1000 && numCode <= 1999) {
      return {
        code: numCode,
        constant: 'SERVER_ADX_INTERNAL_ERROR',
        layer: 'server_adx',
        category: 'SERVER_ERROR',
        should_retry: true,
        summary: 'ADX 服务端内部错误 (1000~1999)',
        root_cause: '服务端处理请求时发生内部异常。',
        troubleshooting_steps: [
          '客户端可采用退避策略延迟重试。',
          '若持续出现，请保留 Logcat 中的 req 请求 ID 联系技术支持排查。'
        ],
        code_fix_hint: '使用退避重试策略，避免立即死循环请求。'
      };
    }
  }

  return {
    code: rawCode,
    constant: 'UNKNOWN_ERROR_CODE',
    layer: 'unknown',
    category: 'UNKNOWN',
    should_retry: false,
    summary: `未收录的错误码: ${rawCode}`,
    root_cause: '可能是宿主自定义错误码、三方聚合框架自身错误码，或底层网络库异常码。',
    troubleshooting_steps: [
      '开启 AdMasterSetting.getInstance().setDebugLogEnable(true) 抓取完整 Logcat。',
      '将包含 [Funnel] 或 AdMaster/ 的日志片段传入 analyze_logcat_trace 工具进行上下文诊断。'
    ],
    code_fix_hint: '检查 AdError.getMessage() 中的详细英文/中文原因描述。'
  };
}

/**
 * 解析单行 [Funnel] / [FunnelWithoutInstance] 日志
 * 标准漏斗日志格式:
 * [Funnel] lifecycle_stage [READY#4] [req=a1b2c3d4] [kind=rewarded_video] | cost_ms=312 elapsed_ms=850 cache_source=network
 */
function parseFunnelLine(line) {
  const funnelMatch = line.match(/\[(Funnel|FunnelWithoutInstance)\]\s+([a-z0-9_]+)(.*)$/i);
  if (!funnelMatch) return null;

  const tagType = funnelMatch[1];
  const actionType = funnelMatch[2];
  const rest = funnelMatch[3] || '';

  const stageMatch = rest.match(/\[([A-Z_]+)#(\d+)\]/);
  const reqMatch = rest.match(/\[req=([^\]]+)\]/);
  const kindMatch = rest.match(/\[kind=([^\]]+)\]/);
  const isFail = rest.includes('[FAIL]');

  const kvPart = rest.includes('|') ? rest.split('|').slice(1).join('|') : rest;
  const fields = {};
  const kvRegex = /([a-zA-Z0-9_]+)=([^\s]+)/g;
  let m;
  while ((m = kvRegex.exec(kvPart)) !== null) {
    fields[m[1]] = m[2];
  }

  return {
    tag_type: tagType,
    action_type: actionType,
    stage: stageMatch ? stageMatch[1] : fields.cur_stage || fields.stage || null,
    stage_index: stageMatch ? Number(stageMatch[2]) : fields.cur_idx ? Number(fields.cur_idx) : null,
    req_id: reqMatch ? reqMatch[1] : 'global',
    material_kind: kindMatch ? kindMatch[1] : null,
    is_fail: isFail,
    fields,
    raw: line.trim()
  };
}

/**
 * Tool #9: analyze_logcat_trace
 */
function handleAnalyzeLogcatTrace(args = {}) {
  const text = String(args.logcat_text || '');
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);

  const funnelEvents = [];
  const moduleLogs = [];
  const hostAdsLogs = [];
  const aiDoctorReports = [];
  const aiRuntimeHints = [];
  const detectedErrorCodes = new Set();

  // 匹配 7 位客户端错误码或已知服务端码
  const errorCodeRegex =
    /\b(1010001|1020001|1030001|1030002|1030003|1040001|1040002|1040003|1040004|1040005|1040006|3010001|3010002|3020001|3020002|3030001|3030002|3040001|3040002|3040003|3040004|4030007|2000|300[0-4]|400[0-4])\b/g;
  const explicitCodeFieldRegex =
    /\b(?:code|error_code|errorCode|err_code|status_code)[=:\s]+(\d{3,7})\b/gi;

  for (const line of lines) {
    const funnel = parseFunnelLine(line);
    if (funnel) {
      funnelEvents.push(funnel);
    }

    // 解析 SDK IntegrationDoctor 输出的 [AI_DOCTOR_REPORT] <json>
    const doctorMatch = line.match(/\[AI_DOCTOR_REPORT\]\s*(\{.*\})/);
    if (doctorMatch) {
      try {
        aiDoctorReports.push(JSON.parse(doctorMatch[1]));
      } catch (_) {
        aiDoctorReports.push({ raw: doctorMatch[1] });
      }
    }

    // 解析 SDK AntiPatternGuard 输出的 [AI-Hint] [RULE_ID] ...
    const aiHintMatch = line.match(/\[AI-Hint\]\s*(?:\[([A-Z0-9_]+)\])?\s*(.*)$/);
    if (aiHintMatch) {
      aiRuntimeHints.push({
        rule_id: aiHintMatch[1] || 'RUNTIME_AI_HINT',
        message: aiHintMatch[2].trim(),
        raw: line.trim()
      });
    }

    const modMatch = line.match(
      /AdMaster\/(Init|Request|Material|Splash|Reward|Interstitial|Feed|Banner|Player|Click|Network|Cache|Download|Doctor)\b[:\s]*(.*)$/i
    );
    if (modMatch) {
      moduleLogs.push({
        module: modMatch[1],
        message: modMatch[2].trim(),
        raw: line.trim()
      });
    }

    if (line.includes('[Ads]') || /AdMaster/i.test(line)) {
      hostAdsLogs.push(line.trim());
    }

    let cm;
    while ((cm = errorCodeRegex.exec(line)) !== null) {
      detectedErrorCodes.add(cm[1]);
    }
    while ((cm = explicitCodeFieldRegex.exec(line)) !== null) {
      const candidate = cm[1];
      if (
        ERROR_CODE_DB[candidate] ||
        ERROR_CODE_DB[`admob_${candidate}`] ||
        ERROR_CODE_DB[`topon_${candidate}`]
      ) {
        detectedErrorCodes.add(candidate);
      }
    }
  }

  // 按 req_id 聚合请求轨迹
  const tracesByReq = {};
  for (const ev of funnelEvents) {
    const key = ev.req_id || 'global';
    if (!tracesByReq[key]) {
      tracesByReq[key] = {
        req_id: key,
        material_kind: ev.material_kind || null,
        stages_reached: [],
        max_stage_index: -1,
        last_normal_stage: null,
        terminal_stage: null,
        anomalies: [],
        interrupts: [],
        precache_results: [],
        total_elapsed_ms: null
      };
    }
    const trace = tracesByReq[key];
    if (!trace.material_kind && ev.material_kind) {
      trace.material_kind = ev.material_kind;
    }

    if (ev.action_type === 'lifecycle_stage') {
      trace.stages_reached.push({
        stage: ev.stage,
        index: ev.stage_index,
        cost_ms: ev.fields.cost_ms ? Number(ev.fields.cost_ms) : null,
        elapsed_ms: ev.fields.elapsed_ms ? Number(ev.fields.elapsed_ms) : null,
        cache_source: ev.fields.cache_source || null,
        reason: ev.fields.reason || null,
        is_fail: ev.is_fail
      });

      if (ev.fields.elapsed_ms) {
        trace.total_elapsed_ms = Number(ev.fields.elapsed_ms);
      }

      if (ev.stage_index !== null && ev.stage_index < 90) {
        if (ev.stage_index > trace.max_stage_index) {
          trace.max_stage_index = ev.stage_index;
          trace.last_normal_stage = ev.stage;
        }
      } else if (ev.stage_index !== null && ev.stage_index >= 90) {
        trace.terminal_stage = {
          stage: ev.stage,
          index: ev.stage_index,
          reason: ev.fields.reason || null
        };
      }
    } else if (ev.action_type === 'lifecycle_anomaly') {
      trace.anomalies.push({
        anomaly: ev.fields.anomaly || 'unknown',
        expected: ev.fields.expected || null,
        cur_stage: ev.fields.cur_stage || ev.stage,
        reason: ev.fields.reason || null,
        elapsed_ms: ev.fields.elapsed_ms ? Number(ev.fields.elapsed_ms) : null
      });
    } else if (ev.action_type === 'lifecycle_interrupt') {
      trace.interrupts.push({
        interrupt: ev.fields.interrupt || 'unknown',
        stage: ev.fields.stage || ev.stage,
        progress_pct: ev.fields.progress_pct || null,
        played_ms: ev.fields.played_ms || null
      });
    } else if (
      ev.action_type === 'video_precache_result' ||
      ev.action_type === 'image_precache_result'
    ) {
      trace.precache_results.push({
        type: ev.action_type,
        success: ev.fields.success === '1',
        cost_ms: ev.fields.cost_ms ? Number(ev.fields.cost_ms) : null,
        phase: ev.fields.phase || null,
        err: ev.fields.err || null
      });
    }
  }

  // 生成诊断结论与修复建议
  const findings = [];
  const recommendations = [];

  for (const trace of Object.values(tracesByReq)) {
    const reqLabel = trace.req_id === 'global' ? '全局会话' : `请求 [req=${trace.req_id}]`;

    if (trace.anomalies.length > 0) {
      for (const anom of trace.anomalies) {
        findings.push(
          `${reqLabel} 触发状态机异常 (lifecycle_anomaly=${anom.anomaly})：期望阶段为 ${anom.expected || 'READY'}，但实际处于 ${anom.cur_stage || '未知'}，原因=${anom.reason || '未提供'}。`
        );
      }
      recommendations.push(
        '展示异常通常是因为在 READY#4 之前调用了 show(...)、重复消费了同一个广告实例，或传入的 Activity 已销毁。请在调用 show 前严格校验 ad != null && ad.isReady() && !ad.isExpired()。'
      );
    }

    for (const pre of trace.precache_results) {
      if (!pre.success) {
        findings.push(
          `${reqLabel} 素材预缓存失败 (${pre.type})：阶段=${pre.phase || 'download'}，耗时=${pre.cost_ms ?? '?'}ms，错误=${pre.err || '未知'}。`
        );
        recommendations.push(
          '视频/图片素材下载失败（常见于海外 CDN 弱网或代理拦截），建议检查网络连通性并在展示失败/缓存失败时调用 destroy() 后延迟重连补载。'
        );
      }
    }

    if (trace.terminal_stage) {
      const termName = trace.terminal_stage.stage;
      const lastStage = trace.last_normal_stage || 'INIT';
      findings.push(
        `${reqLabel} 在到达 [${lastStage}#${trace.max_stage_index}] 后进入异常终态 [${termName}#${trace.terminal_stage.index}]${trace.terminal_stage.reason ? ` (reason=${trace.terminal_stage.reason})` : ''}。`
      );

      if (termName === 'ABANDONED' || trace.max_stage_index === 4) {
        recommendations.push(
          '广告已到达 READY#4（加载成功），但最终进入 ABANDONED#92 或未触发 SHOW_CALLED#5：说明宿主业务层拿到 onAdLoaded 后从未调用 ad.show(...)，或缓存超时过期被丢弃。请检查业务层展示触发条件。'
        );
      } else if (trace.max_stage_index <= 1) {
        recommendations.push(
          '断点位于 INIT#0 -> REQUESTING#1 阶段：请结合错误码检查是否未等待 onInitialized() 回调 (1030003)、参数错误 (1040002)、并发重复请求 (1040005) 或服务端无填充 (1040004 / 2000)。'
        );
      } else if (trace.max_stage_index >= 5 && trace.max_stage_index < 8) {
        recommendations.push(
          '断点位于 SHOW_CALLED#5 -> RENDERING#7 之间：宿主已调用 show(...) 但未成功进入 PLAYING#8 曝光，请检查 AndroidManifest 中广告 Activity 是否被移除 (1030001)、开屏容器是否可见 (3040004) 或传入的 Activity 是否正在销毁 (3040001)。'
        );
      }
    } else if (trace.max_stage_index === 4) {
      findings.push(
        `${reqLabel} 已成功停留在 [READY#4]（广告与素材已就绪），但日志中未见 [SHOW_CALLED#5]。`
      );
      recommendations.push(
        '广告加载与缓存已完成，若界面未弹出广告，请检查宿主业务代码是否在合适的时机调用了 ad.show(...)。'
      );
    } else if (trace.max_stage_index >= 8) {
      findings.push(
        `${reqLabel} 已走通至 [${trace.last_normal_stage}#${trace.max_stage_index}]，曝光与播放链路正常。`
      );
    }
  }

  const diagnosedErrors = Array.from(detectedErrorCodes).map((code) =>
    handleDiagnoseErrorCode({ error_code: code })
  );

  for (const errDiag of diagnosedErrors) {
    findings.push(
      `检测到错误码 ${errDiag.code} (${errDiag.constant} - ${errDiag.summary})：[${errDiag.category}] ${errDiag.root_cause}`
    );
    if (errDiag.code_fix_hint) {
      recommendations.push(`[针对 ${errDiag.code}] ${errDiag.code_fix_hint}`);
    }
  }

  for (const hint of aiRuntimeHints) {
    findings.push(`检测到 SDK 运行时反模式拦截 [AI-Hint] [${hint.rule_id}]：${hint.message}`);
  }

  for (const report of aiDoctorReports) {
    if (report && report.status) {
      findings.push(
        `检测到 SDK IntegrationDoctor 自检报告：status=${report.status}，checks=${Array.isArray(report.checks) ? report.checks.length : 0} 项`
      );
      if (Array.isArray(report.checks)) {
        for (const chk of report.checks) {
          if (chk.status === 'FAIL' || chk.status === 'WARN') {
            findings.push(`  - [Doctor:${chk.id}] (${chk.status}) ${chk.detail}`);
            if (chk.fix) {
              recommendations.push(`[Doctor:${chk.id}] ${chk.fix}`);
            }
          }
        }
      }
    }
  }

  if (
    funnelEvents.length === 0 &&
    moduleLogs.length === 0 &&
    diagnosedErrors.length === 0 &&
    aiDoctorReports.length === 0 &&
    aiRuntimeHints.length === 0
  ) {
    findings.push(
      '未在输入文本中识别到 [Funnel] 生命周期日志、AdMaster/<Module> 日志、[AI_DOCTOR_REPORT]、[AI-Hint] 或已知错误码。'
    );
    recommendations.push(
      '请确认已在初始化前开启调试日志：AdMasterSetting.getInstance().setDebugLogEnable(true); 或执行 `adb shell setprop debug.admaster.doctor 1` 激活零代码自检，并使用过滤词 `adb logcat | grep -E "Funnel|AdMaster|AI_DOCTOR_REPORT|AI-Hint|\\[Ads\\]"` 重新抓取。'
    );
  }

  return {
    summary: {
      total_lines_analyzed: lines.length,
      funnel_events_count: funnelEvents.length,
      admaster_module_logs_count: moduleLogs.length,
      ai_doctor_reports_count: aiDoctorReports.length,
      ai_runtime_hints_count: aiRuntimeHints.length,
      detected_error_codes: Array.from(detectedErrorCodes),
      request_count: Object.keys(tracesByReq).length
    },
    lifecycle_reference: {
      normal_stages: LIFECYCLE_STAGES,
      terminal_stages: TERMINAL_STAGES
    },
    request_traces: Object.values(tracesByReq),
    error_diagnoses: diagnosedErrors,
    ai_doctor_reports: aiDoctorReports,
    ai_runtime_hints: aiRuntimeHints,
    findings,
    recommendations: Array.from(new Set(recommendations))
  };
}

function callTool(name, args = {}) {
  switch (name) {
    case 'get_sdk_compatibility':
      return handleGetSdkCompatibility(args);
    case 'get_ad_integration_template':
      return handleGetAdIntegrationTemplate(args);
    case 'get_mediation_adapter_config':
      return handleGetMediationAdapterConfig(args);
    case 'get_test_credentials_and_validator':
      return handleGetTestCredentialsAndValidator(args);
    case 'audit_host_gradle_and_manifest':
      return handleAuditHostGradleAndManifest(args);
    case 'audit_ad_integration_code':
      return handleAuditAdIntegrationCode(args);
    case 'generate_ad_cache_manager':
      return handleGenerateAdCacheManager(args);
    case 'diagnose_error_code':
      return handleDiagnoseErrorCode(args);
    case 'analyze_logcat_trace':
      return handleAnalyzeLogcatTrace(args);
    case 'verify_live_device_ads':
      return handleVerifyLiveDeviceAds(args, handleAnalyzeLogcatTrace);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

module.exports = {
  TOOL_DEFINITIONS,
  callTool
};
