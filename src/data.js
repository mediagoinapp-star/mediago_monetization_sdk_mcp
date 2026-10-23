'use strict';

const fs = require('fs');
const path = require('path');

function resolveCompatibilityPath() {
  const candidates = [
    process.env.MEDIAGO_COMPATIBILITY_JSON_PATH,
    path.resolve(__dirname, '../data/compatibility.json'),
    path.resolve(__dirname, '../../mediago_monetization_sdk_skills/compatibility/compatibility.json')
  ].filter(Boolean);

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return candidates[0];
}

function loadCompatibilityData() {
  const targetPath = resolveCompatibilityPath();
  const raw = fs.readFileSync(targetPath, 'utf8');
  return JSON.parse(raw);
}

const TEST_CREDENTIALS = {
  app_id: 'ad2fd73dca2ccffd312495bcd8a33d29',
  placements: {
    rewarded: '100090001',
    interstitial: '100090002',
    native: '100090003',
    splash: '100090004',
    banner: '100090005'
  },
  format_rules: {
    app_id: '32 位小写十六进制字符串 (^[a-f0-9]{32}$)',
    ad_unit_id: '纯数字字符串（严禁使用 Integer.parseInt 转为数值导致前导零丢失）'
  }
};

const ERROR_CODE_DB = {
  // 1. 客户端 SDK 7 位错误码 (cc.admaster.android.proxy.api.AdError)
  '1010001': {
    code: 1010001,
    constant: 'ERROR_INTERFACE',
    layer: 'client_sdk',
    category: 'CLIENT_INTEGRATION_BUG',
    should_retry: false,
    summary: '接口调用异常',
    root_cause: '调用参数非法（如 adUnitId 为空、context 为 null）或 SDK 内部桥接状态异常。',
    troubleshooting_steps: [
      '检查传入 load(...) 的 context 和 adUnitId 是否为非空有效值。',
      '确保 adUnitId 全程作为 String 传递，未被截断或置空。'
    ],
    code_fix_hint: '确保 AdRequest 与 adUnitId 非空：RewardedAd.load(context, "100090001", new AdRequest.Builder().build(), callback);'
  },
  '1020001': {
    code: 1020001,
    constant: 'ERROR_NETWORK',
    layer: 'client_sdk',
    category: 'NETWORK_OR_CACHE_ERROR',
    should_retry: true,
    summary: '网络连接异常',
    root_cause: '设备无网络连接、DNS 解析失败、HTTPS 代理抓包证书未信任，或宿主缺失 INTERNET 权限。',
    troubleshooting_steps: [
      '检查测试机网络连通性及是否开启了未安装证书的 Charles/Fiddler 代理。',
      '检查 AndroidManifest.xml 是否声明了 <uses-permission android:name="android.permission.INTERNET" />。',
      '在代码中采用指数退避或延迟策略重试，切勿在 onAdFailedToLoad 中无延迟死循环重试。'
    ],
    code_fix_hint: '在发起请求前检查网络状态，并在 onAdFailedToLoad 中延迟（如 3~10 秒）后再重试。'
  },
  '1030001': {
    code: 1030001,
    constant: 'ERROR_UNREGISTER_ACTIVITY',
    layer: 'client_sdk',
    category: 'CLIENT_INTEGRATION_BUG',
    should_retry: false,
    summary: '广告 Activity 未注册',
    root_cause: 'AndroidManifest.xml 合并时用 tools:node="remove" 误删了 SDK 内置的广告展示 Activity（如 RemoteRewardActivity / AppActivity），或多进程未配置 AdActivityController。',
    troubleshooting_steps: [
      '检查构建产物 build/intermediates/merged_manifest/ 中是否包含 cc.admaster.android 相关 Activity。',
      '若是 Unity 工程，检查 Assets/Plugins/Android/AndroidManifest.xml 是否阻塞了 AAR Manifest 合并。'
    ],
    code_fix_hint: '移除针对 SDK Activity 的 tools:node="remove" 规则，确保 manifest merger 正常合并 SDK AAR。'
  },
  '1030002': {
    code: 1030002,
    constant: 'ERROR_UNREGISTER_PROVIDER',
    layer: 'client_sdk',
    category: 'CLIENT_INTEGRATION_BUG',
    should_retry: false,
    summary: 'Provider 未注册',
    root_cause: '宿主 Manifest 合并规则排除了 SDK 下载/初始化所需的 ContentProvider 组件。',
    troubleshooting_steps: [
      '检查 merged_manifest 中 Provider 声明是否被宿主移除或 authorities 冲突。'
    ],
    code_fix_hint: '保留 SDK AAR 中的 Provider 声明。'
  },
  '1030003': {
    code: 1030003,
    constant: 'ERROR_NOT_INITIALIZED',
    layer: 'client_sdk',
    category: 'CLIENT_INTEGRATION_BUG',
    should_retry: false,
    summary: 'SDK 尚未初始化（高频错误）',
    root_cause: '在 AdMaster.initialize(...) 的 InitCallback.onInitialized() 回调触发前就调用了广告 load(...)；或者在未初始化的独立子进程中发起了广告请求。',
    troubleshooting_steps: [
      '检查 Application.onCreate() 中是否已调用 AdMaster.initialize(context, appId, callback)。',
      '确认首次预加载（preload / load）是在 InitCallback.onInitialized() 回调内部或之后触发，而不是紧跟在 initialize(...) 下一行同步调用。',
      '如果应用有多个进程，确认只在主进程或已配置 AdActivityController 并完成初始化的进程中请求广告。'
    ],
    code_fix_hint: 'AdMaster.initialize(this, appId, new AdMaster.InitCallback() {\n    @Override public void onInitialized() {\n        // 必须在此回调后再发起首次广告 load()\n        preloadAds();\n    }\n    @Override public void onFailed(int code, String msg) {}\n});'
  },
  '1040001': {
    code: 1040001,
    constant: 'ERROR_TIMEOUT',
    layer: 'client_sdk',
    category: 'NETWORK_OR_CACHE_ERROR',
    should_retry: true,
    summary: '广告请求超时',
    root_cause: '开屏或常规广告在限定时间内未完成请求或素材准备，常见于弱网环境或 AdRequest.Builder().setTimeout(ms) 设置过短。',
    troubleshooting_steps: [
      '检查 AdRequest.Builder().setTimeout(ms) 是否小于 3000ms（开屏推荐 5000ms）。',
      '确保开屏超时或失败时宿主能安全跳转到主界面，不卡死启动页。'
    ],
    code_fix_hint: 'AdRequest request = new AdRequest.Builder().setTimeout(5000).build();'
  },
  '1040002': {
    code: 1040002,
    constant: 'ERROR_REQUEST_PARAM',
    layer: 'client_sdk',
    category: 'CLIENT_INTEGRATION_BUG',
    should_retry: false,
    summary: '请求参数错误',
    root_cause: 'appId（应为 32 位小写十六进制字符串）或 adUnitId（纯数字字符串）格式非法、为空，或两者不属于同一后台账号。',
    troubleshooting_steps: [
      '核对 AdMaster.initialize 传入的 appId 是否为 32 位十六进制字符串。',
      '核对 load 传入的 adUnitId 是否为纯数字字符串，且没有因为转 int 丢失前导 0。',
      '确认没有把 App ID 填到 adUnitId 参数位置。'
    ],
    code_fix_hint: '测试联调可使用官方测试 App ID "ad2fd73dca2ccffd312495bcd8a33d29" 与测试广告位（激励 "100090001"、插屏 "100090002"、原生 "100090003"、开屏 "100090004"、横幅 "100090005"）。'
  },
  '1040003': {
    code: 1040003,
    constant: 'ERROR_REQUEST_EXCESSIVE',
    layer: 'client_sdk',
    category: 'CLIENT_INTEGRATION_BUG',
    should_retry: true,
    summary: '广告请求过于频繁（触发客户端频控）',
    root_cause: '在 onAdFailedToLoad 回调中直接同步调用 load(...) 形成了无延迟死循环重试，或短时间内高频发起大量请求。',
    troubleshooting_steps: [
      '检查 onAdFailedToLoad 实现，严禁立即无延迟再次调用 load(...)。',
      '改为退避延迟重试（如延迟 3~15 秒，且限制最大连续重试次数）。'
    ],
    code_fix_hint: '在 onAdFailedToLoad 中使用 Handler.postDelayed(..., 5000L) 并限制最大重试次数。'
  },
  '1040004': {
    code: 1040004,
    constant: 'ERROR_NO_AD',
    layer: 'client_sdk',
    category: 'SERVER_NO_FILL',
    should_retry: true,
    summary: '无广告返回（No Fill）',
    root_cause: '客户端接入链路已通，但当前请求未匹配到可用广告预算或定向（No Fill）。',
    troubleshooting_steps: [
      '这表明客户端 SDK 请求已正常发出并收到响应，不属于代码崩溃或时序错误。',
      '若处于开发联调阶段需验证展示与回调闭环，请切换至官方测试 App ID 与测试广告位 ID。'
    ],
    code_fix_hint: '联调期在 Debug 模式下切换官方测试凭证（App ID: ad2fd73dca2ccffd312495bcd8a33d29）验证展示。'
  },
  '1040005': {
    code: 1040005,
    constant: 'ERROR_ALREADY_LOADING',
    layer: 'client_sdk',
    category: 'CLIENT_INTEGRATION_BUG',
    should_retry: false,
    summary: '同一广告位正在加载中（高频错误）',
    root_cause: '同一 (adFormat, adUnitId) 的上一次 load(...) 请求尚未触发 onAdLoaded / onAdFailedToLoad 回调，业务层又重复调用了 load(...)。',
    troubleshooting_steps: [
      '为每个广告位维护 isLoading 状态锁，在发起 load 时设为 true，在 onAdLoaded / onAdFailedToLoad 时设为 false。',
      '若需缓存多条广告（如容量为 2 的缓存池），必须在上一条 onAdLoaded 回调完成后再顺序发起下一条补载，严禁并发调用同一广告位 load。'
    ],
    code_fix_hint: 'if (isLoading) return;\nisLoading = true;\nRewardedAd.load(context, adUnitId, request, callback);'
  },
  '1040006': {
    code: 1040006,
    constant: 'ERROR_AD_EXPIRED',
    layer: 'client_sdk',
    category: 'CLIENT_INTEGRATION_BUG',
    should_retry: true,
    summary: '缓存广告已过期（或旧版并发加载拦截码）',
    root_cause: '缓存的广告实例超过有效期（TTL），展示前未检查 !ad.isExpired()；或在部分版本中代表同一广告位重复加载。',
    troubleshooting_steps: [
      '在调用 ad.show(...) 或参与 Client Bidding 比价前，必须校验 ad != null && ad.isReady() && !ad.isExpired()。',
      '若 ad.isExpired() 为 true，必须立即调用 ad.destroy() 并重新发起 load(...)。'
    ],
    code_fix_hint: 'if (ad != null && ad.isExpired()) {\n    ad.destroy();\n    ad = null;\n    preload(context, adUnitId);\n    return;\n}'
  },
  '3010001': {
    code: 3010001,
    constant: 'ERROR_PARSE',
    layer: 'client_sdk',
    category: 'NETWORK_OR_CACHE_ERROR',
    should_retry: true,
    summary: '响应数据解析失败',
    root_cause: '服务端返回数据格式异常，或请求被企业网关/抓包工具篡改。',
    troubleshooting_steps: [
      '检查设备网络是否被透明代理或防火墙劫持。'
    ],
    code_fix_hint: '关闭网络篡改代理后重试。'
  },
  '3010002': {
    code: 3010002,
    constant: 'ERROR_MATERIAL_EMPTY',
    layer: 'client_sdk',
    category: 'SERVER_NO_FILL',
    should_retry: true,
    summary: '返回广告物料为空（No Fill）',
    root_cause: '服务端返回了响应但无有效广告素材，等效于无填充（No Fill）。',
    troubleshooting_steps: [
      '联调期可切换至官方测试 App ID 与测试广告位验证 UI 渲染。'
    ],
    code_fix_hint: '无需修改代码逻辑，做好无广告兜底并在联调时使用官方测试广告位。'
  },
  '3020001': {
    code: 3020001,
    constant: 'ERROR_FILTER_APP',
    layer: 'client_sdk',
    category: 'SERVER_NO_FILL',
    should_retry: false,
    summary: '广告因应用安装条件被过滤',
    root_cause: '返回的下载类广告目标包名在当前设备上已安装或不符合定向条件，被客户端过滤。',
    troubleshooting_steps: [
      '属于正常定向过滤逻辑，测试时可卸载目标推广应用或使用官方测试广告位。'
    ],
    code_fix_hint: '保持宿主正常无填充兜底即可。'
  },
  '3020002': {
    code: 3020002,
    constant: 'ERROR_FILTER_SIZE',
    layer: 'client_sdk',
    category: 'CLIENT_INTEGRATION_BUG',
    should_retry: false,
    summary: '广告容器尺寸不满足要求',
    root_cause: '开屏（SplashAd）或横幅（Banner）承载容器 ViewGroup 宽高过小、为 0，或尚未完成布局测量。',
    troubleshooting_steps: [
      '检查承载容器 ViewGroup 在 XML 中的 layout_width / layout_height 是否有效（开屏容器建议 match_parent）。',
      '确保容器已挂载到 Window 且 visibility == View.VISIBLE。'
    ],
    code_fix_hint: '确保 splashContainer 宽高足够且处于 VISIBLE 状态后再调用 show(splashContainer)。'
  },
  '3030001': {
    code: 3030001,
    constant: 'ERROR_CACHE_NOT_COMPLETED',
    layer: 'client_sdk',
    category: 'CLIENT_INTEGRATION_BUG',
    should_retry: false,
    summary: '视频/图片素材缓存尚未完成',
    root_cause: '在素材尚未就绪（!ad.isReady()）时过早调用了展示。',
    troubleshooting_steps: [
      '确保在 onAdLoaded 回调触发后，且检查 ad.isReady() 为 true 后再调用 show(...)。'
    ],
    code_fix_hint: 'if (ad != null && ad.isReady() && !ad.isExpired()) { ad.show(activity); }'
  },
  '3030002': {
    code: 3030002,
    constant: 'ERROR_CACHE_FAILED',
    layer: 'client_sdk',
    category: 'NETWORK_OR_CACHE_ERROR',
    should_retry: true,
    summary: '广告素材缓存下载失败',
    root_cause: '广告视频或大图从 CDN 下载超时或中断。',
    troubleshooting_steps: [
      '检查设备访问海外/CDN 节点网络是否稳定。',
      '可通过 setAdCacheListener 监听 onAdCacheFailed 并在失败时销毁旧实例、延迟补载。'
    ],
    code_fix_hint: '在 onAdCacheFailed 或展示失败时调用 ad.destroy() 并触发延迟重连补载。'
  },
  '3040001': {
    code: 3040001,
    constant: 'ERROR_DISPLAY_STANDARD_UNFIT',
    layer: 'client_sdk',
    category: 'CLIENT_INTEGRATION_BUG',
    should_retry: false,
    summary: '展示条件不满足（Activity 已销毁或容器不可见）',
    root_cause: '调用 show(activity) 时传入的 Activity 已处于 isFinishing() / isDestroyed() 状态，或视图容器不可见。',
    troubleshooting_steps: [
      '在调用 show(activity) 前必须检查 activity != null && !activity.isFinishing() && !activity.isDestroyed()。',
      '不要在 Application Context 上调用全屏广告的 show(...)。'
    ],
    code_fix_hint: 'if (activity == null || activity.isFinishing() || activity.isDestroyed()) return false;'
  },
  '3040002': {
    code: 3040002,
    constant: 'ERROR_DISPLAY_FAILED',
    layer: 'client_sdk',
    category: 'CLIENT_INTEGRATION_BUG',
    should_retry: false,
    summary: '广告展示失败（未就绪、重复展示或已销毁）',
    root_cause: '广告未就绪（!ad.isReady()）、同一个广告对象被重复调用了两次 show(...)，或在 destroy() 之后再次调用了 show(...)。',
    troubleshooting_steps: [
      '一条广告实例只能展示一次（Single-Use），调用 show(...) 消费后必须从缓存队列移除，并在关闭/失败回调中 destroy()。',
      '展示前严格检查 ad != null && ad.isReady() && !ad.isExpired()。'
    ],
    code_fix_hint: '消费后立即将引用出队或置空，切勿复用已展示过的广告实例。'
  },
  '3040003': {
    code: 3040003,
    constant: 'ERROR_RENDER_FAILED',
    layer: 'client_sdk',
    category: 'CLIENT_INTEGRATION_BUG',
    should_retry: true,
    summary: '模板或视图渲染失败',
    root_cause: 'WebView 或原生模板渲染异常，或系统 WebView 组件不可用。',
    troubleshooting_steps: [
      '在 onAdFailedToShowFullScreenContent 中调用 ad.destroy() 并执行宿主业务兜底（如继续进入下一关）。'
    ],
    code_fix_hint: '在 onAdFailedToShowFullScreenContent 回调中确保调用 destroy() 并恢复宿主游戏/应用主流程。'
  },
  '3040004': {
    code: 3040004,
    constant: 'ERROR_SPLASH_CONTAINER_INVISIBLE',
    layer: 'client_sdk',
    category: 'CLIENT_INTEGRATION_BUG',
    should_retry: false,
    summary: '开屏广告承载容器不可见',
    root_cause: '调用 SplashAd.show(container) 时，container 未挂载到窗口（!isAttachedToWindow）、visibility != View.VISIBLE 或宽高为 0。',
    troubleshooting_steps: [
      '在调用 splashAd.show(container) 前，确保 container.setVisibility(View.VISIBLE) 且已添加到 Activity 视图树。'
    ],
    code_fix_hint: 'splashContainer.setVisibility(View.VISIBLE);\nsplashAd.show(splashContainer);'
  },
  '4030007': {
    code: 4030007,
    constant: 'ERROR_AD_DISMISS_CLOSED',
    layer: 'client_sdk',
    category: 'CLIENT_INTEGRATION_BUG',
    should_retry: false,
    summary: '广告在加载或准备期间被提前关闭',
    root_cause: '宿主页面或容器在广告准备完成前被提前关闭或销毁。',
    troubleshooting_steps: [
      '检查宿主 Activity 是否在开屏/插屏展示完成前就执行了 finish()。'
    ],
    code_fix_hint: '在 onAdDismissedFullScreenContent 或超时兜底中再跳转并关闭宿主页面。'
  },

  // 2. 服务端 4 位状态码
  '2000': {
    code: 2000,
    constant: 'SERVER_NO_FILL_DSP',
    layer: 'server_adx',
    category: 'SERVER_NO_FILL',
    should_retry: true,
    summary: 'DSP 无填充 (No Fill)',
    root_cause: '客户端请求已成功到达服务端，参数合法，但当前预算、地区或设备定向下无匹配广告返回。',
    troubleshooting_steps: [
      '好消息：返回 2000 说明客户端 SDK 初始化与请求代码链路完全正常！',
      '若需在本地验证广告展示、点击、激励发奖等 UI 闭环，请临时切换为官方测试 App ID 与测试广告位 ID。'
    ],
    code_fix_hint: '联调验证时使用测试 App ID: "ad2fd73dca2ccffd312495bcd8a33d29"，测试广告位: 激励 "100090001" / 插屏 "100090002" / 原生 "100090003" / 开屏 "100090004" / 横幅 "100090005"。'
  },

  // 3. 聚合 Adapter 错误码
  'admob_100': {
    code: 100,
    constant: 'ERROR_ADMASTER_SDK',
    layer: 'mediation_admob',
    category: 'SERVER_NO_FILL',
    should_retry: true,
    summary: 'AdMob Adapter 透传底层 MediaGo Monetization SDK 错误',
    root_cause: '底层 MediaGo Monetization SDK 返回了加载或展示错误（需查看内部 cause 错误码）。',
    troubleshooting_steps: [
      '开启 AdMasterSetting.getInstance().setDebugLogEnable(true) 查看底层 7 位或 4 位错误码。'
    ],
    code_fix_hint: '结合底层 AdError code 进一步诊断。'
  },
  'admob_101': {
    code: 101,
    constant: 'ERROR_INVALID_SERVER_PARAMETERS',
    layer: 'mediation_admob',
    category: 'CLIENT_INTEGRATION_BUG',
    should_retry: false,
    summary: 'AdMob 后台自定义事件 Parameter JSON 参数缺失或键名错误',
    root_cause: 'AdMob 后台 Custom Event 的 Parameter JSON 中缺失 "app_id" 或 "ad_unit_id"（注意：AdMob Adapter 专用键名为 "ad_unit_id"，而非 "placement_id"！）。',
    troubleshooting_steps: [
      '登录 AdMob 后台，检查 Mediation Custom Event 的 Parameter 配置。',
      '确保 JSON 键名严格为 {"app_id": "...", "ad_unit_id": "..."}。'
    ],
    code_fix_hint: '{\n  "app_id": "YOUR_ADMASTER_APP_ID",\n  "ad_unit_id": "YOUR_ADMASTER_AD_UNIT_ID"\n}'
  },
  'admob_102': {
    code: 102,
    constant: 'ERROR_RESPONSE_EMPTY',
    layer: 'mediation_admob',
    category: 'SERVER_NO_FILL',
    should_retry: true,
    summary: 'AdMob Adapter 返回广告为空',
    root_cause: '请求成功但无填充。',
    troubleshooting_steps: [
      '联调阶段可在 AdMob 后台 Parameter 中填入 MediaGo Monetization SDK 官方测试 app_id 与 ad_unit_id 验证。'
    ],
    code_fix_hint: '测试 Parameter JSON: {"app_id": "ad2fd73dca2ccffd312495bcd8a33d29", "ad_unit_id": "100090001"}'
  },
  'admob_103': {
    code: 103,
    constant: 'ERROR_AD_NOT_READY',
    layer: 'mediation_admob',
    category: 'CLIENT_INTEGRATION_BUG',
    should_retry: false,
    summary: 'AdMob Adapter 展示时广告未就绪',
    root_cause: '广告未加载完成或已过期。',
    troubleshooting_steps: [
      '确保在 AdMob 加载成功回调后再调用 show。'
    ],
    code_fix_hint: '等待聚合加载成功回调后再触发展示。'
  },
  'admob_104': {
    code: 104,
    constant: 'ERROR_CONTEXT_NOT_ACTIVITY',
    layer: 'mediation_admob',
    category: 'CLIENT_INTEGRATION_BUG',
    should_retry: false,
    summary: '传入 AdMob 的 Context 不是 Activity',
    root_cause: '请求或展示广告时传入了 Application Context 而非存活的 Activity。',
    troubleshooting_steps: [
      '确保使用当前前台 Activity 实例发起请求与展示。'
    ],
    code_fix_hint: '传入 Activity 实例而非 getApplicationContext()。'
  },
  'topon_1001': {
    code: 1001,
    constant: 'ERROR_CONFIG',
    layer: 'mediation_topon',
    category: 'CLIENT_INTEGRATION_BUG',
    should_retry: false,
    summary: 'TopOn 后台自定义广告源参数缺失',
    root_cause: 'TopOn 后台缺失 "app_id" 或 "placement_id" 配置。',
    troubleshooting_steps: [
      '检查 TopOn 后台自定义广告源参数 JSON 是否包含 "app_id" 和 "placement_id"。'
    ],
    code_fix_hint: '{\n  "app_id": "YOUR_ADMASTER_APP_ID",\n  "placement_id": "YOUR_ADMASTER_AD_UNIT_ID"\n}'
  },
  'topon_1002': {
    code: 1002,
    constant: 'ERROR_INIT_FAILED',
    layer: 'mediation_topon',
    category: 'CLIENT_INTEGRATION_BUG',
    should_retry: false,
    summary: 'TopOn Adapter 初始化底层 SDK 失败',
    root_cause: 'TopOn 后台配置的 app_id 非法或初始化异常。',
    troubleshooting_steps: [
      '核对 TopOn 后台配置的 app_id 是否为 32 位十六进制字符串。'
    ],
    code_fix_hint: '修正 TopOn 后台的 app_id 参数。'
  },
  'topon_1003': {
    code: 1003,
    constant: 'ERROR_LOADING',
    layer: 'mediation_topon',
    category: 'CLIENT_INTEGRATION_BUG',
    should_retry: false,
    summary: 'TopOn 同一广告位实例正在加载中',
    root_cause: '同一广告位并发重复请求。',
    troubleshooting_steps: [
      '避免对同一广告位并发触发加载。'
    ],
    code_fix_hint: '交由 TopOn SDK 管控瀑布流/Bidding 并发。'
  },
  'topon_1004': {
    code: 1004,
    constant: 'ERROR_BIDDING',
    layer: 'mediation_topon',
    category: 'CLIENT_INTEGRATION_BUG',
    should_retry: false,
    summary: 'TopOn C2S 竞价请求冲突或异常',
    root_cause: '同一广告位正在竞价中或竞价状态异常。',
    troubleshooting_steps: [
      '检查 TopOn 后台是否将 C2S Bidding 与常规 Waterfall 配置混淆。'
    ],
    code_fix_hint: '核对 TopOn 后台竞价类型设置。'
  },
  'topon_1005': {
    code: 1005,
    constant: 'ERROR_NO_AD',
    layer: 'mediation_topon',
    category: 'SERVER_NO_FILL',
    should_retry: true,
    summary: 'TopOn Adapter 无广告填充',
    root_cause: '请求成功但当前无广告返回。',
    troubleshooting_steps: [
      '联调期可在 TopOn 后台配置官方测试 app_id 与 placement_id 验证。'
    ],
    code_fix_hint: '测试 JSON: {"app_id": "ad2fd73dca2ccffd312495bcd8a33d29", "placement_id": "100090001"}'
  },
  'topon_1006': {
    code: 1006,
    constant: 'ERROR_SHOW_FAILED',
    layer: 'mediation_topon',
    category: 'CLIENT_INTEGRATION_BUG',
    should_retry: false,
    summary: 'TopOn Adapter 广告展示失败',
    root_cause: '展示时广告未就绪或 Activity 不可用。',
    troubleshooting_steps: [
      '确保在 isAdReady() 为 true 且 Activity 存活时调用 show。'
    ],
    code_fix_hint: '检查 isAdReady() 与 Activity 状态。'
  },
  'topon_1007': {
    code: 1007,
    constant: 'ERROR_AD_EXPIRED',
    layer: 'mediation_topon',
    category: 'CLIENT_INTEGRATION_BUG',
    should_retry: true,
    summary: 'TopOn Adapter 缓存广告已过期',
    root_cause: '缓存时间超过有效期才调用展示。',
    troubleshooting_steps: [
      '过期后重新发起加载请求。'
    ],
    code_fix_hint: '重新调用 load 刷新广告缓存。'
  }
};

// 生命周期阶段定义（对齐 cc.admaster.android.proxy.report.lifecycle.AdLifecycleStage）
const LIFECYCLE_STAGES = [
  { name: 'INIT', index: 0, description: '广告请求对象创建与初始化检查' },
  { name: 'REQUESTING', index: 1, description: '向 ADX 服务端发起广告网络请求' },
  { name: 'PARSING', index: 2, description: '接收并解析服务端返回的广告响应数据' },
  { name: 'CACHING', index: 3, description: '下载并缓存视频/图片/模板素材' },
  { name: 'READY', index: 4, description: '广告及素材准备就绪（触发 onAdLoaded，可调用 show）' },
  { name: 'SHOW_CALLED', index: 5, description: '宿主业务层调用了 ad.show(...)' },
  { name: 'SHOWING', index: 6, description: '广告容器/Activity 启动展示' },
  { name: 'RENDERING', index: 7, description: '广告视图/模板开始渲染' },
  { name: 'PLAYING', index: 8, description: '广告视频/内容开始播放并触发曝光' },
  { name: 'CLOSED', index: 9, description: '广告正常关闭（触发 onAdDismissedFullScreenContent）' }
];

const TERMINAL_STAGES = {
  ERROR_TERMINATED: { index: 90, description: '因请求失败、无填充、缓存失败或渲染异常提前终止' },
  INTERRUPTED: { index: 91, description: '展示或加载途中被用户杀进程或系统中断' },
  ABANDONED: { index: 92, description: '广告已就绪但未被展示即被销毁或过期丢弃' }
};

module.exports = {
  loadCompatibilityData,
  TEST_CREDENTIALS,
  ERROR_CODE_DB,
  LIFECYCLE_STAGES,
  TERMINAL_STAGES
};
