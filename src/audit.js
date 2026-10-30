'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { loadCompatibilityData, TEST_CREDENTIALS } = require('./data');

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.gradle',
  '.idea',
  'Library',
  'Temp',
  'Logs',
  'Obj',
  'Builds'
]);

function walkFiles(rootDir, filterFn, maxFiles = 400, includeBuild = false) {
  const results = [];
  if (!rootDir || !fs.existsSync(rootDir)) {
    return results;
  }

  let stat;
  try {
    stat = fs.statSync(rootDir);
  } catch (_) {
    return results;
  }

  if (stat.isFile()) {
    if (filterFn(rootDir)) {
      results.push(rootDir);
    }
    return results;
  }

  const stack = [rootDir];
  while (stack.length > 0 && results.length < maxFiles) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (_) {
      continue;
    }

    for (const entry of entries) {
      if (results.length >= maxFiles) break;
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        if (!includeBuild && entry.name === 'build') continue;
        stack.push(fullPath);
      } else if (entry.isFile()) {
        if (filterFn(fullPath)) {
          results.push(fullPath);
        }
      }
    }
  }
  return results;
}

/**
 * Tool #4: get_test_credentials_and_validator
 */
function handleGetTestCredentialsAndValidator(args = {}) {
  const rawAppId = args.app_id !== undefined && args.app_id !== null ? String(args.app_id) : null;
  const rawUnitId =
    args.ad_unit_id !== undefined && args.ad_unit_id !== null ? String(args.ad_unit_id) : null;
  const language = args.language || 'java';

  const issues = [];
  let appIdStatus = 'NOT_PROVIDED';
  let unitIdStatus = 'NOT_PROVIDED';

  const hex32Regex = /^[a-f0-9]{32}$/;
  const hex32CaseInsensitive = /^[a-fA-F0-9]{32}$/;
  const digitsRegex = /^\d{5,16}$/;

  if (rawAppId !== null) {
    const trimmed = rawAppId.trim();
    if (trimmed !== rawAppId) {
      issues.push({
        severity: 'ERROR',
        field: 'app_id',
        code: 'WHITESPACE_DETECTED',
        message: `app_id 包含首尾空白字符 ("${rawAppId}")，会导致服务端报 1040002 / 4000 参数错误。`
      });
    }
    if (digitsRegex.test(trimmed)) {
      appIdStatus = 'INVALID_SWAPPED';
      issues.push({
        severity: 'ERROR',
        field: 'app_id',
        code: 'CREDENTIALS_SWAPPED',
        message: `传入的 app_id ("${trimmed}") 是纯数字格式，疑似误将广告位 ID (ad_unit_id) 填到了 app_id 位置！MediaGo Monetization SDK 的 app_id 必须是 32 位小写十六进制字符串。`
      });
    } else if (hex32Regex.test(trimmed)) {
      appIdStatus =
        trimmed === TEST_CREDENTIALS.app_id ? 'VALID_OFFICIAL_TEST_ID' : 'VALID_PRODUCTION_FORMAT';
      if (trimmed === TEST_CREDENTIALS.app_id) {
        issues.push({
          severity: 'INFO',
          field: 'app_id',
          code: 'USING_OFFICIAL_TEST_APP_ID',
          message:
            '当前使用的是官方联调测试 App ID，仅限开发测试阶段使用，正式发版上线前必须替换为后台申请的生产 App ID。'
        });
      }
    } else if (hex32CaseInsensitive.test(trimmed)) {
      appIdStatus = 'WARNING_UPPERCASE_HEX';
      issues.push({
        severity: 'WARNING',
        field: 'app_id',
        code: 'UPPERCASE_CHARACTERS',
        message: `app_id ("${trimmed}") 含有大写字母，建议统一转为 32 位小写十六进制字符串: "${trimmed.toLowerCase()}"。`
      });
    } else {
      appIdStatus = 'INVALID_FORMAT';
      issues.push({
        severity: 'ERROR',
        field: 'app_id',
        code: 'INVALID_APP_ID_FORMAT',
        message: `app_id ("${trimmed}") 长度或格式非法（当前长度 ${trimmed.length}），标准格式为 32 位小写十六进制字符串 (^[a-f0-9]{32}$)。`
      });
    }
  }

  if (rawUnitId !== null) {
    const trimmed = rawUnitId.trim();
    if (trimmed !== rawUnitId) {
      issues.push({
        severity: 'ERROR',
        field: 'ad_unit_id',
        code: 'WHITESPACE_DETECTED',
        message: `ad_unit_id 包含首尾空白字符 ("${rawUnitId}")。`
      });
    }
    if (hex32CaseInsensitive.test(trimmed)) {
      unitIdStatus = 'INVALID_SWAPPED';
      issues.push({
        severity: 'ERROR',
        field: 'ad_unit_id',
        code: 'CREDENTIALS_SWAPPED',
        message: `传入的 ad_unit_id ("${trimmed}") 是 32 位十六进制字符串，疑似误将 App ID 填到了广告位 ID 位置！广告位 ID 应为纯数字字符串（如 "100090001"）。`
      });
    } else if (digitsRegex.test(trimmed)) {
      const testFormatEntry = Object.entries(TEST_CREDENTIALS.placements).find(
        ([, pid]) => pid === trimmed
      );
      if (testFormatEntry) {
        unitIdStatus = `VALID_OFFICIAL_TEST_ID (${testFormatEntry[0]})`;
        if (args.expected_format && args.expected_format !== testFormatEntry[0]) {
          issues.push({
            severity: 'ERROR',
            field: 'ad_unit_id',
            code: 'AD_FORMAT_MISMATCH',
            message: `测试广告位 "${trimmed}" 属于 [${testFormatEntry[0]}] 样式，但当前期望接入的样式为 [${args.expected_format}]！请改用 "${TEST_CREDENTIALS.placements[args.expected_format] || ''}"。`
          });
        }
      } else {
        unitIdStatus = 'VALID_PRODUCTION_FORMAT';
      }
      if (trimmed.startsWith('0')) {
        issues.push({
          severity: 'WARNING',
          field: 'ad_unit_id',
          code: 'LEADING_ZERO_RISK',
          message: `ad_unit_id ("${trimmed}") 含有前导 0，请务必全程作为 String 传递，严禁使用 Integer.parseInt / Long.parseLong 转换！`
        });
      }
    } else {
      unitIdStatus = 'INVALID_FORMAT';
      issues.push({
        severity: 'ERROR',
        field: 'ad_unit_id',
        code: 'INVALID_UNIT_ID_FORMAT',
        message: `ad_unit_id ("${trimmed}") 格式非法，标准格式为 5~16 位纯数字字符串（如 "100090001"）。`
      });
    }
  }

  let buildConfigSnippet = '';
  if (language === 'kotlin') {
    buildConfigSnippet = `
object AdCredentials {
    // Debug 构建自动使用官方测试凭证，Release 构建切换为正式生产凭证
    val APP_ID: String = if (BuildConfig.DEBUG) "${TEST_CREDENTIALS.app_id}" else "YOUR_PRODUCTION_APP_ID"
    val REWARDED_UNIT_ID: String = if (BuildConfig.DEBUG) "${TEST_CREDENTIALS.placements.rewarded}" else "YOUR_PROD_REWARDED_ID"
    val INTERSTITIAL_UNIT_ID: String = if (BuildConfig.DEBUG) "${TEST_CREDENTIALS.placements.interstitial}" else "YOUR_PROD_INTERSTITIAL_ID"
    val NATIVE_UNIT_ID: String = if (BuildConfig.DEBUG) "${TEST_CREDENTIALS.placements.native}" else "YOUR_PROD_NATIVE_ID"
    val SPLASH_UNIT_ID: String = if (BuildConfig.DEBUG) "${TEST_CREDENTIALS.placements.splash}" else "YOUR_PROD_SPLASH_ID"
    val BANNER_UNIT_ID: String = if (BuildConfig.DEBUG) "${TEST_CREDENTIALS.placements.banner}" else "YOUR_PROD_BANNER_ID"
}`.trim();
  } else if (language === 'unity-csharp') {
    buildConfigSnippet = `
public static class AdCredentials
{
#if UNITY_EDITOR || DEVELOPMENT_BUILD
    public const string AppId = "${TEST_CREDENTIALS.app_id}";
    public const string RewardedUnitId = "${TEST_CREDENTIALS.placements.rewarded}";
    public const string InterstitialUnitId = "${TEST_CREDENTIALS.placements.interstitial}";
    public const string NativeUnitId = "${TEST_CREDENTIALS.placements.native}";
    public const string SplashUnitId = "${TEST_CREDENTIALS.placements.splash}";
    public const string BannerUnitId = "${TEST_CREDENTIALS.placements.banner}";
#else
    public const string AppId = "YOUR_PRODUCTION_APP_ID";
    public const string RewardedUnitId = "YOUR_PROD_REWARDED_ID";
    public const string InterstitialUnitId = "YOUR_PROD_INTERSTITIAL_ID";
    public const string NativeUnitId = "YOUR_PROD_NATIVE_ID";
    public const string SplashUnitId = "YOUR_PROD_SPLASH_ID";
    public const string BannerUnitId = "YOUR_PROD_BANNER_ID";
#endif
}`.trim();
  } else {
    buildConfigSnippet = `
public final class AdCredentials {
    // Debug 构建自动使用官方测试凭证，Release 构建切换为正式生产凭证
    public static final String APP_ID = BuildConfig.DEBUG ? "${TEST_CREDENTIALS.app_id}" : "YOUR_PRODUCTION_APP_ID";
    public static final String REWARDED_UNIT_ID = BuildConfig.DEBUG ? "${TEST_CREDENTIALS.placements.rewarded}" : "YOUR_PROD_REWARDED_ID";
    public static final String INTERSTITIAL_UNIT_ID = BuildConfig.DEBUG ? "${TEST_CREDENTIALS.placements.interstitial}" : "YOUR_PROD_INTERSTITIAL_ID";
    public static final String NATIVE_UNIT_ID = BuildConfig.DEBUG ? "${TEST_CREDENTIALS.placements.native}" : "YOUR_PROD_NATIVE_ID";
    public static final String SPLASH_UNIT_ID = BuildConfig.DEBUG ? "${TEST_CREDENTIALS.placements.splash}" : "YOUR_PROD_SPLASH_ID";
    public static final String BANNER_UNIT_ID = BuildConfig.DEBUG ? "${TEST_CREDENTIALS.placements.banner}" : "YOUR_PROD_BANNER_ID";
}`.trim();
  }

  return {
    valid: issues.filter((i) => i.severity === 'ERROR').length === 0,
    app_id_status: appIdStatus,
    ad_unit_id_status: unitIdStatus,
    issues,
    official_test_credentials: TEST_CREDENTIALS,
    debug_release_switch_snippet: buildConfigSnippet
  };
}

/**
 * Tool #5: audit_host_gradle_and_manifest
 */
function handleAuditHostGradleAndManifest(args = {}) {
  const projectRoot = path.resolve(args.project_root || process.cwd());
  if (!fs.existsSync(projectRoot)) {
    throw new Error(`目标工程目录不存在: ${projectRoot}`);
  }

  const compat = loadCompatibilityData();
  const latestSdkVersion = compat.support_window.android_sdk.latest_verified;

  const isUnityProject =
    fs.existsSync(path.join(projectRoot, 'Assets')) &&
    fs.existsSync(path.join(projectRoot, 'ProjectSettings'));

  const gradleFiles = walkFiles(
    projectRoot,
    (f) =>
      /\.(gradle|gradle\.kts)$/i.test(f) ||
      path.basename(f) === 'libs.versions.toml' ||
      /\*Dependencies\.xml$|Dependencies\.xml$/i.test(f),
    150,
    false
  );

  const manifestFiles = walkFiles(
    projectRoot,
    (f) => path.basename(f) === 'AndroidManifest.xml',
    100,
    true
  );

  let hasMavenCentral = false;
  let hasGoogleRepo = false;
  let declaredSdkVersions = [];
  let declaredAdapters = [];
  let hasThinkUpTopOn = false;
  let hasAnyThinkTopOn = false;
  let hasToponNewAdapter = false;
  let hasToponLegacyAdapter = false;
  let minSdkValues = [];
  let compileSdkValues = [];

  for (const gf of gradleFiles) {
    let content = '';
    try {
      content = fs.readFileSync(gf, 'utf8');
    } catch (_) {
      continue;
    }

    if (/mavenCentral\s*\(\s*\)/.test(content)) hasMavenCentral = true;
    if (/google\s*\(\s*\)/.test(content)) hasGoogleRepo = true;

    const sdkRegex = /cc\.admaster\.android:sdk:([0-9a-zA-Z._-]+)/g;
    let m;
    while ((m = sdkRegex.exec(content)) !== null) {
      declaredSdkVersions.push({ file: path.relative(projectRoot, gf), version: m[1] });
    }

    const adapterRegex =
      /cc\.admaster\.android:(adapter|max-adapter|tradplus-adapter|topon-adapter|topon-secmtp-adapter):([0-9a-zA-Z._-]+)/g;
    while ((m = adapterRegex.exec(content)) !== null) {
      declaredAdapters.push({
        file: path.relative(projectRoot, gf),
        artifact: `cc.admaster.android:${m[1]}`,
        version: m[2]
      });
      if (m[1] === 'topon-adapter') hasToponNewAdapter = true;
      if (m[1] === 'topon-secmtp-adapter') hasToponLegacyAdapter = true;
    }

    if (/com\.thinkup\.sdk:/i.test(content)) hasThinkUpTopOn = true;
    if (/com\.anythink\.sdk:/i.test(content)) hasAnyThinkTopOn = true;

    const minSdkMatch = content.match(/\bminSdk(?:Version)?\s*[=:]?\s*(\d+)/);
    if (minSdkMatch) minSdkValues.push(Number(minSdkMatch[1]));

    const compileSdkMatch = content.match(/\bcompileSdk(?:Version)?\s*[=:]?\s*(\d+)/);
    if (compileSdkMatch) compileSdkValues.push(Number(compileSdkMatch[1]));
  }

  const manifestFindings = [];
  let hasRemovedSdkActivity = false;
  let hasRemovedSdkProvider = false;
  let mergedManifestChecked = false;

  for (const mf of manifestFiles) {
    let content = '';
    try {
      content = fs.readFileSync(mf, 'utf8');
    } catch (_) {
      continue;
    }
    const relPath = path.relative(projectRoot, mf);
    const isMerged = relPath.includes('merged_manifest') || relPath.includes('merged_manifests');
    if (isMerged) mergedManifestChecked = true;

    if (
      /cc\.admaster\.android|BdShellActivity|MobRewardVideoActivity|AppActivity/.test(content) &&
      /tools:node\s*=\s*["']remove["']/.test(content)
    ) {
      hasRemovedSdkActivity = true;
      manifestFindings.push({
        severity: 'ERROR',
        file: relPath,
        code: 'MANIFEST_REMOVED_SDK_COMPONENT',
        message:
          '检测到在 AndroidManifest.xml 中对 SDK 组件使用了 tools:node="remove"，这会导致展示或初始化时报 1030001 / 1030002 错误！'
      });
    }

    if (isMerged) {
      const requiredActivities = ['BdShellActivity', 'MobRewardVideoActivity', 'AppActivity'];
      for (const act of requiredActivities) {
        if (!content.includes(act)) {
          manifestFindings.push({
            severity: 'WARNING',
            file: relPath,
            code: 'MERGED_MANIFEST_MISSING_ACTIVITY',
            message: `合并后的 Manifest (${relPath}) 中未发现 ${act}，请确认是否已完成 Gradle 依赖同步或被合并规则剔除。`
          });
        }
      }
    }
  }

  const issues = [...manifestFindings];
  const recommendations = [];

  if (!hasMavenCentral && gradleFiles.length > 0) {
    issues.push({
      severity: 'ERROR',
      code: 'MISSING_MAVEN_CENTRAL',
      message:
        '未在 Gradle / EDM4U 配置文件中检测到 mavenCentral() 仓库声明，MediaGo Monetization SDK 托管于 Maven Central。'
    });
    recommendations.push('在 settings.gradle(.kts) 或根 build.gradle 的 repositories 中添加 mavenCentral()。');
  }

  if (declaredSdkVersions.length === 0) {
    issues.push({
      severity: 'WARNING',
      code: 'SDK_DEPENDENCY_NOT_FOUND',
      message: `尚未在工程中检测到 cc.admaster.android:sdk 依赖声明（当前最新验证版本为 ${latestSdkVersion}）。`
    });
    recommendations.push(
      `添加核心 SDK 依赖: implementation 'cc.admaster.android:sdk:${latestSdkVersion}'`
    );
  } else {
    for (const d of declaredSdkVersions) {
      if (d.version.includes('SNAPSHOT')) {
        issues.push({
          severity: 'WARNING',
          file: d.file,
          code: 'SNAPSHOT_VERSION_IN_USE',
          message: `检测到正在使用 SNAPSHOT 版本 (${d.version})，正式提审发版前请切换为稳定发布版 ${latestSdkVersion}。`
        });
      }
    }
  }

  // TopOn 双分支冲突检测
  if (hasToponNewAdapter && hasToponLegacyAdapter) {
    issues.push({
      severity: 'ERROR',
      code: 'TOPON_DUAL_ADAPTER_CONFLICT',
      message:
        '同时引入了 cc.admaster.android:topon-adapter (ThinkUp) 与 cc.admaster.android:topon-secmtp-adapter (AnyThink)！严禁混装两个 TopOn 分支。'
    });
  }
  if (hasThinkUpTopOn && hasToponLegacyAdapter) {
    issues.push({
      severity: 'ERROR',
      code: 'TOPON_BRANCH_MISMATCH',
      message:
        '宿主工程使用的是海外新版 TopOn (com.thinkup.sdk)，但却错误引入了旧版 Adapter (topon-secmtp-adapter)！应改为 cc.admaster.android:topon-adapter:0.0.4。'
    });
  }
  if (hasAnyThinkTopOn && hasToponNewAdapter) {
    issues.push({
      severity: 'ERROR',
      code: 'TOPON_BRANCH_MISMATCH',
      message:
        '宿主工程使用的是旧版 TopOn (com.anythink.sdk)，但却错误引入了新版 ThinkUp Adapter (topon-adapter)！应改为 cc.admaster.android:topon-secmtp-adapter:0.0.3。'
    });
  }

  if (minSdkValues.some((v) => v < 19)) {
    issues.push({
      severity: 'ERROR',
      code: 'MIN_SDK_TOO_LOW',
      message: `检测到 minSdk 小于 19 (${minSdkValues.join(', ')})，MediaGo Monetization SDK 要求 minSdk >= 19（Unity 桥接建议 >= 23）。`
    });
  }

  const errorCount = issues.filter((i) => i.severity === 'ERROR').length;
  const warningCount = issues.filter((i) => i.severity === 'WARNING').length;

  return {
    project_root: projectRoot,
    project_type: isUnityProject ? 'unity_android_bridge' : 'native_android',
    status: errorCount > 0 ? 'FAIL' : warningCount > 0 ? 'WARN' : 'PASS',
    summary: {
      gradle_and_dep_files_scanned: gradleFiles.length,
      manifest_files_scanned: manifestFiles.length,
      merged_manifest_verified: mergedManifestChecked,
      has_maven_central: hasMavenCentral,
      has_google_repo: hasGoogleRepo,
      declared_sdk_versions: declaredSdkVersions,
      declared_adapters: declaredAdapters,
      topon_family_detected: hasThinkUpTopOn
        ? 'com.thinkup.sdk (topon-international)'
        : hasAnyThinkTopOn
        ? 'com.anythink.sdk (topon-legacy)'
        : 'none',
      min_sdk_detected: minSdkValues,
      compile_sdk_detected: compileSdkValues,
      error_count: errorCount,
      warning_count: warningCount
    },
    issues,
    recommendations
  };
}

/**
 * Tool #6: audit_ad_integration_code
 */
function handleAuditAdIntegrationCode(args = {}) {
  const targetPath = path.resolve(args.target_path || process.cwd());
  if (!fs.existsSync(targetPath)) {
    throw new Error(`目标源码路径不存在: ${targetPath}`);
  }

  const sourceFiles = walkFiles(
    targetPath,
    (f) => /\.(java|kt|cs)$/i.test(f),
    300,
    false
  );

  const findings = [];
  let adRelatedFilesCount = 0;

  for (const file of sourceFiles) {
    let content = '';
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch (_) {
      continue;
    }

    // 仅扫描与 MediaGo / AdMaster 相关的源码文件
    if (
      !/AdMaster|RewardedAd|ExpressInterstitialAd|SplashAd|NativeAdLoader|BannerAdLoader|AdMBannerView|IBiddingAd/i.test(
        content
      )
    ) {
      continue;
    }

    adRelatedFilesCount++;
    const relFile = fs.statSync(targetPath).isDirectory()
      ? path.relative(targetPath, file)
      : path.basename(file);
    const lines = content.split(/\r?\n/);

    // Rule 1: PREMATURE_LOAD_BEFORE_INIT
    // 检测 AdMaster.initialize(...) 之后在同一方法短距离内未在 onInitialized 内部直接调用 .load(
    const initIdx = lines.findIndex((l) => /AdMaster\.initialize\s*\(/.test(l));
    if (initIdx !== -1) {
      const windowLines = lines.slice(initIdx, Math.min(lines.length, initIdx + 25));
      const windowText = windowLines.join('\n');
      // 查找在 initialize 调用语句闭合后紧接着出现的 .load(
      const afterInitMatch = windowText.match(
        /AdMaster\.initialize\s*\([\s\S]*?\)\s*;?\s*\r?\n\s*(?:RewardedAd|ExpressInterstitialAd|SplashAd|NativeAdLoader|BannerAdLoader)\.load/
      );
      if (afterInitMatch) {
        findings.push({
          rule_id: 'ANTI_PATTERN_1_PREMATURE_LOAD_BEFORE_INIT',
          severity: 'ERROR',
          file: relFile,
          line: initIdx + 1,
          summary: '未等待 InitCallback.onInitialized() 回调即同步调用广告 load()（必报 1030003）',
          fix_suggestion:
            'AdMaster.initialize(...) 是异步过程，请务必将首次预加载逻辑放入 InitCallback.onInitialized() 回调方法体内执行。'
        });
      }
    }

    // Rule 2: SYNC_RECURSIVE_RETRY_IN_ON_FAILED
    // 检测 onAdFailedToLoad / onAdFailed 回调内直接同步调用 load 且无延迟退避
    for (let i = 0; i < lines.length; i++) {
      if (/void\s+onAdFailedToLoad|override\s+fun\s+onAdFailedToLoad|void\s+onAdFailed\b/.test(lines[i])) {
        const block = lines.slice(i, Math.min(lines.length, i + 22)).join('\n');
        const hasLoadCall =
          /\b(?:load|loadAd|preload|requestAd)\s*\(/.test(block) &&
          !/onAdFailedToLoad\s*\(/.test(
            block.replace(/void\s+onAdFailedToLoad|override\s+fun\s+onAdFailedToLoad/, '')
          );
        const hasDelayGuard =
          /postDelayed|schedule|Timer|CoroutineScope|delay\s*\(|Invoke\s*\(|WaitForSeconds|ScheduleRetry/i.test(
            block
          );
        if (hasLoadCall && !hasDelayGuard) {
          findings.push({
            rule_id: 'ANTI_PATTERN_2_SYNC_RECURSIVE_RETRY',
            severity: 'ERROR',
            file: relFile,
            line: i + 1,
            summary: '在 onAdFailedToLoad 失败回调中无退避延迟直接同步递归调用 load（易触发 1040003 频控死循环）',
            fix_suggestion:
              '严禁在失败回调中同步立即重试！请使用 Handler.postDelayed / 协程 delay 并结合指数退避（建议 >= 3000ms，限制最大重试次数）。'
          });
        }
      }
    }

    // Rule 3: SHOW_WITHOUT_READY_OR_EXPIRED_CHECK
    for (let i = 0; i < lines.length; i++) {
      if (/\.\s*show\s*\(/.test(lines[i]) && !/SplashAd\.loadAndShow/.test(lines[i])) {
        const prevContext = lines.slice(Math.max(0, i - 12), i + 1).join('\n');
        const hasReadyCheck = /isReady\s*\(\s*\)|\.isReady\b/.test(prevContext);
        const hasExpiredCheck = /isExpired\s*\(\s*\)|\.isExpired\b|PurgeExpired|pollReadyAd/.test(
          prevContext
        );
        if (!hasReadyCheck || !hasExpiredCheck) {
          findings.push({
            rule_id: 'ANTI_PATTERN_3_SHOW_WITHOUT_READY_OR_EXPIRED_GUARD',
            severity: 'WARNING',
            file: relFile,
            line: i + 1,
            summary: '调用 ad.show(...) 前未同时检查 ad.isReady() 与 !ad.isExpired()（易报 3040002 / 3040004）',
            fix_suggestion:
              '在调用 show(activity) 前必须校验 `if (ad != null && ad.isReady() && !ad.isExpired())`；若已过期需调用 ad.destroy() 并触发重拉。'
          });
        }
      }
    }

    // Rule 4: REWARD_GRANTED_IN_DISMISS_CALLBACK
    for (let i = 0; i < lines.length; i++) {
      if (/onAdDismissedFullScreenContent/.test(lines[i])) {
        const dismissBlock = lines.slice(i, Math.min(lines.length, i + 18)).join('\n');
        if (/\b(?:grantReward|giveReward|addCoins|onUserEarnedReward|rewardUser)\s*\(/i.test(dismissBlock)) {
          findings.push({
            rule_id: 'ANTI_PATTERN_4_REWARD_IN_DISMISS_CALLBACK',
            severity: 'ERROR',
            file: relFile,
            line: i + 1,
            summary: '疑似在 onAdDismissedFullScreenContent 关闭回调中直接发放激励视频奖励',
            fix_suggestion:
              '关闭回调不代表用户看完了视频（用户可能中途跳过）！必须且只能在 show(activity, rewardItem -> { ... }) 的 OnUserEarnedRewardListener 中发放奖励。'
          });
        }
      }
    }

    // Rule 5: MISSING_DESTROY_CLEANUP
    const usesAdObjects =
      /\b(RewardedAd|ExpressInterstitialAd|SplashAd|NativeAd|BannerAd)\b/.test(content);
    const hasDestroyCall = /\.\s*destroy\s*\(\s*\)|Call\s*\(\s*["']destroy["']\s*\)/.test(content);
    if (usesAdObjects && !hasDestroyCall) {
      findings.push({
        rule_id: 'ANTI_PATTERN_5_MISSING_DESTROY_CALL',
        severity: 'WARNING',
        file: relFile,
        line: 1,
        summary: '文件中使用了广告实例但未发现任何 .destroy() 释放调用（存在内存与 WebView 泄漏风险）',
        fix_suggestion:
          '在 onAdDismissedFullScreenContent、onAdFailedToShowFullScreenContent 或宿主 Activity/Fragment onDestroy 中必须调用 ad.destroy() 释放底层资源。'
      });
    }

    // Rule 6: BIDDING_FLOAT_OR_INVALID_ECPM
    if (/notifyWin|notifyLoss/.test(content)) {
      if (/parseDouble|toDouble\s*\(\s*\)|parseFloat|toFloat\s*\(\s*\)/.test(content) && !/Math\.round|roundToInt|toInt\s*\(\s*\)/.test(content)) {
        findings.push({
          rule_id: 'ANTI_PATTERN_6_BIDDING_NON_INTEGER_ECPM',
          severity: 'ERROR',
          file: relFile,
          line: 1,
          summary: 'Client Bidding 调用 notifyWin / notifyLoss 时疑似传入了浮点数 eCPM',
          fix_suggestion:
            'IBiddingAd 严格要求 secondInfo/winInfo 中的 "ecpm" 必须为 > 0 的正整数（单位：分/美分），传入浮点数或 <= 0 会导致竞价上报校验失败。'
        });
      }
    }

    // Rule 7: TEST_CREDENTIALS_HARDCODED_WITHOUT_DEBUG_GUARD
    if (content.includes(TEST_CREDENTIALS.app_id) && !/BuildConfig\.DEBUG|UNITY_EDITOR|DEVELOPMENT_BUILD|isDebug/i.test(content)) {
      const testLine = lines.findIndex((l) => l.includes(TEST_CREDENTIALS.app_id)) + 1;
      findings.push({
        rule_id: 'ANTI_PATTERN_7_UNCONDITIONAL_TEST_CREDENTIALS',
        severity: 'INFO',
        file: relFile,
        line: testLine,
        summary: '代码中硬编码了官方测试 App ID 且未绑定 BuildConfig.DEBUG 条件守卫',
        fix_suggestion:
          '联调验证通过后，请使用 BuildConfig.DEBUG 区分测试与正式 ID，切勿携带测试 App ID 发布线上生产包。'
      });
    }
  }

  return {
    target_path: targetPath,
    files_scanned: sourceFiles.length,
    ad_related_files_analyzed: adRelatedFilesCount,
    status: findings.some((f) => f.severity === 'ERROR')
      ? 'FAIL'
      : findings.length > 0
      ? 'WARN'
      : 'PASS',
    total_findings: findings.length,
    findings
  };
}

/**
 * Tool #7: generate_ad_cache_manager
 */
function handleGenerateAdCacheManager(args = {}) {
  const adFormat = args.ad_format === 'interstitial' ? 'interstitial' : 'rewarded';
  const language = args.language || 'java';
  const capacity = Math.min(Math.max(Number(args.cache_capacity) || 2, 1), 4);
  const isBidding = args.bidding_mode === 'client-bidding';

  const unitId =
    adFormat === 'interstitial'
      ? TEST_CREDENTIALS.placements.interstitial
      : TEST_CREDENTIALS.placements.rewarded;
  const adClass = adFormat === 'interstitial' ? 'ExpressInterstitialAd' : 'RewardedAd';
  const managerName =
    adFormat === 'interstitial' ? 'InterstitialAdCacheManager' : 'RewardedAdCacheManager';

  let code = '';
  if (language === 'kotlin') {
    code = `
package com.example.ads

import android.app.Activity
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import cc.admaster.android.proxy.api.AdDismissInfo
import cc.admaster.android.proxy.api.AdError
import cc.admaster.android.proxy.api.AdLoadCallback
import cc.admaster.android.proxy.api.AdMaster
import cc.admaster.android.proxy.api.AdRequest
import cc.admaster.android.proxy.api.${adClass}
import cc.admaster.android.proxy.api.FullScreenContentCallback
${adFormat === 'rewarded' ? 'import cc.admaster.android.proxy.api.OnUserEarnedRewardListener\n' : ''}import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.min
import kotlin.math.pow

/**
 * 生产级 ${adClass} 双缓冲预加载队列管理器 (容量=${capacity})
 * 特性：
 * 1. 严格串行加载锁 (isLoading)，彻底杜绝 1040005 (ERROR_ALREADY_LOADING)
 * 2. 自动驱逐过期缓存 (isExpired() -> destroy())，杜绝 1040006 / 3040004
 * 3. 消费出队即异步触发后台补载 (Refill-on-Consume)，最大化展示率 (Show Rate)
 * 4. 失败指数退避重试 (Exponential Backoff)，杜绝 1040003 请求风暴
 */
class ${managerName}(
    context: Context,
    private val adUnitId: String = "${unitId}",
    private val capacity: Int = ${capacity}
) {
    companion object {
        private const val TAG = "${managerName}"
        private const val MAX_RETRY_ATTEMPTS = 5
        private const val BASE_RETRY_DELAY_MS = 3000L
        private const val MAX_RETRY_DELAY_MS = 60000L
    }

    private val appContext: Context = context.applicationContext
    private val cacheQueue = ConcurrentLinkedQueue<${adClass}>()
    private val isLoading = AtomicBoolean(false)
    private val mainHandler = Handler(Looper.getMainLooper())
    private var retryAttempt = 0

    /**
     * 触发补充加载（仅当队列未满且当前无正在进行的请求时执行）
     */
    fun ensurePreloaded() {
        purgeExpiredAds()
        if (!AdMaster.isInitialized()) {
            Log.w(TAG, "[Ads] SDK not initialized yet, skip preload for \$adUnitId")
            return
        }
        if (cacheQueue.size >= capacity) {
            return
        }
        if (!isLoading.compareAndSet(false, true)) {
            return
        }

        val request = AdRequest.Builder().build()
        ${adClass}.load(appContext, adUnitId, request, object : AdLoadCallback<${adClass}> {
            override fun onAdLoaded(ad: ${adClass}) {
                isLoading.set(false)
                retryAttempt = 0
                cacheQueue.offer(ad)
                Log.d(TAG, "[Ads] Loaded success, queueSize=\${cacheQueue.size}/\$capacity")
                // 若队列仍未满，顺序补齐下一槽位
                if (cacheQueue.size < capacity) {
                    ensurePreloaded()
                }
            }

            override fun onAdFailedToLoad(error: AdError) {
                isLoading.set(false)
                Log.w(TAG, "[Ads] Failed to load: code=\${error.code}, msg=\${error.message}")
                scheduleBackoffRetry(error.code)
            }
        })
    }

    /**
     * 清理队列中已过期或不可用的广告实例并释放底层资源
     */
    fun purgeExpiredAds() {
        val iterator = cacheQueue.iterator()
        while (iterator.hasNext()) {
            val ad = iterator.next()
            if (!ad.isReady || ad.isExpired) {
                iterator.remove()
                ad.destroy()
            }
        }
    }
${
  isBidding
    ? `
    /**
     * [Client Bidding] 获取当前队列中最高 eCPM 广告的报价（单位：分/美分）
     */
    fun peekBestEcpmCents(): Int {
        purgeExpiredAds()
        val head = cacheQueue.peek() ?: return 0
        val ecpmStr = head.responseInfo.ecpmLevel
        return ecpmStr?.toDoubleOrNull()?.let { if (it > 0) Math.round(it).toInt() else 0 } ?: 0
    }
`
    : ''
}
    /**
     * 展示一条就绪广告，出队后立即触发后台异步补载
     */
    fun showAvailableAd(
        activity: Activity${adFormat === 'rewarded' ? ',\n        onReward: () -> Unit' : ''},
        onClosedOrFallback: () -> Unit
    ): Boolean {
        if (activity.isFinishing || activity.isDestroyed) {
            onClosedOrFallback()
            return false
        }
        purgeExpiredAds()
        val ad = cacheQueue.poll()
        if (ad == null) {
            ensurePreloaded()
            onClosedOrFallback()
            return false
        }

        ad.setFullScreenContentCallback(object : FullScreenContentCallback() {
            override fun onAdShowedFullScreenContent() {
                // 展示开始即异步触发下一条补货
                ensurePreloaded()
            }

            override fun onAdDismissedFullScreenContent(dismissInfo: AdDismissInfo) {
                ad.destroy()
                ensurePreloaded()
                onClosedOrFallback()
            }

            override fun onAdFailedToShowFullScreenContent(error: AdError) {
                ad.destroy()
                ensurePreloaded()
                onClosedOrFallback()
            }
        })

        ${
          adFormat === 'rewarded'
            ? 'ad.show(activity, OnUserEarnedRewardListener { onReward() })'
            : 'ad.show(activity)'
        }
        return true
    }

    private fun scheduleBackoffRetry(errorCode: Int) {
        // 参数错误或未初始化不盲目重试
        if (errorCode == 1030003 || errorCode == 1040002 || errorCode in 4000..4004) return
        if (retryAttempt >= MAX_RETRY_ATTEMPTS) return

        retryAttempt++
        val delayMs = min(
            MAX_RETRY_DELAY_MS,
            (BASE_RETRY_DELAY_MS * 2.0.pow((retryAttempt - 1).toDouble())).toLong()
        )
        mainHandler.postDelayed({ ensurePreloaded() }, delayMs)
    }

    fun destroyAll() {
        mainHandler.removeCallbacksAndMessages(null)
        while (true) {
            val ad = cacheQueue.poll() ?: break
            ad.destroy()
        }
    }
}`.trim();
  } else {
    code = `
package com.example.ads;

import android.app.Activity;
import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import androidx.annotation.NonNull;
import java.util.Iterator;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.atomic.AtomicBoolean;
import cc.admaster.android.proxy.api.AdDismissInfo;
import cc.admaster.android.proxy.api.AdError;
import cc.admaster.android.proxy.api.AdLoadCallback;
import cc.admaster.android.proxy.api.AdMaster;
import cc.admaster.android.proxy.api.AdRequest;
import cc.admaster.android.proxy.api.${adClass};
import cc.admaster.android.proxy.api.FullScreenContentCallback;

/**
 * 生产级 ${adClass} 双缓冲预加载队列管理器 (容量=${capacity})
 * 特性：
 * 1. 严格串行加载锁 (isLoading)，彻底杜绝 1040005 (ERROR_ALREADY_LOADING)
 * 2. 自动驱逐过期缓存 (isExpired() -> destroy())，杜绝 1040006 / 3040004
 * 3. 消费出队即异步触发后台补载 (Refill-on-Consume)，最大化展示率 (Show Rate)
 * 4. 失败指数退避重试 (Exponential Backoff)，杜绝 1040003 请求风暴
 */
public final class ${managerName} {
    private static final String TAG = "${managerName}";
    private static final int MAX_RETRY_ATTEMPTS = 5;
    private static final long BASE_RETRY_DELAY_MS = 3000L;
    private static final long MAX_RETRY_DELAY_MS = 60000L;

    private final Context appContext;
    private final String adUnitId;
    private final int capacity;
    private final ConcurrentLinkedQueue<${adClass}> cacheQueue = new ConcurrentLinkedQueue<>();
    private final AtomicBoolean isLoading = new AtomicBoolean(false);
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private int retryAttempt = 0;

    public ${managerName}(@NonNull Context context, @NonNull String adUnitId) {
        this.appContext = context.getApplicationContext();
        this.adUnitId = adUnitId;
        this.capacity = ${capacity};
    }

    /**
     * 触发补充加载（仅当队列未满且当前无正在进行的请求时执行）
     */
    public void ensurePreloaded() {
        purgeExpiredAds();
        if (!AdMaster.isInitialized()) {
            Log.w(TAG, "[Ads] SDK not initialized yet, skip preload for " + adUnitId);
            return;
        }
        if (cacheQueue.size() >= capacity) {
            return;
        }
        if (!isLoading.compareAndSet(false, true)) {
            return;
        }

        AdRequest request = new AdRequest.Builder().build();
        ${adClass}.load(appContext, adUnitId, request, new AdLoadCallback<${adClass}>() {
            @Override
            public void onAdLoaded(@NonNull ${adClass} ad) {
                isLoading.set(false);
                retryAttempt = 0;
                cacheQueue.offer(ad);
                Log.d(TAG, "[Ads] Loaded success, queueSize=" + cacheQueue.size() + "/" + capacity);
                if (cacheQueue.size() < capacity) {
                    ensurePreloaded();
                }
            }

            @Override
            public void onAdFailedToLoad(@NonNull AdError error) {
                isLoading.set(false);
                Log.w(TAG, "[Ads] Failed to load: code=" + error.getCode() + ", msg=" + error.getMessage());
                scheduleBackoffRetry(error.getCode());
            }
        });
    }

    /**
     * 清理队列中已过期或不可用的广告实例并释放底层资源
     */
    public void purgeExpiredAds() {
        Iterator<${adClass}> it = cacheQueue.iterator();
        while (it.hasNext()) {
            ${adClass} ad = it.next();
            if (!ad.isReady() || ad.isExpired()) {
                it.remove();
                ad.destroy();
            }
        }
    }

    /**
     * 展示一条就绪广告，出队后立即触发后台异步补载
     */
    public boolean showAvailableAd(
            @NonNull Activity activity${adFormat === 'rewarded' ? ',\n            @NonNull Runnable onRewardEarned' : ''},
            @NonNull Runnable onClosedOrFallback) {
        if (activity.isFinishing() || activity.isDestroyed()) {
            onClosedOrFallback.run();
            return false;
        }
        purgeExpiredAds();
        final ${adClass} ad = cacheQueue.poll();
        if (ad == null) {
            ensurePreloaded();
            onClosedOrFallback.run();
            return false;
        }

        ad.setFullScreenContentCallback(new FullScreenContentCallback() {
            @Override
            public void onAdShowedFullScreenContent() {
                ensurePreloaded();
            }

            @Override
            public void onAdDismissedFullScreenContent(@NonNull AdDismissInfo dismissInfo) {
                ad.destroy();
                ensurePreloaded();
                onClosedOrFallback.run();
            }

            @Override
            public void onAdFailedToShowFullScreenContent(@NonNull AdError error) {
                ad.destroy();
                ensurePreloaded();
                onClosedOrFallback.run();
            }
        });

        ${
          adFormat === 'rewarded'
            ? 'ad.show(activity, rewardItem -> onRewardEarned.run());'
            : 'ad.show(activity);'
        }
        return true;
    }

    private void scheduleBackoffRetry(int errorCode) {
        if (errorCode == 1030003 || errorCode == 1040002 || (errorCode >= 4000 && errorCode <= 4004)) {
            return;
        }
        if (retryAttempt >= MAX_RETRY_ATTEMPTS) {
            return;
        }
        retryAttempt++;
        long delayMs = Math.min(MAX_RETRY_DELAY_MS, (long) (BASE_RETRY_DELAY_MS * Math.pow(2, retryAttempt - 1)));
        mainHandler.postDelayed(this::ensurePreloaded, delayMs);
    }

    public void destroyAll() {
        mainHandler.removeCallbacksAndMessages(null);
        ${adClass} ad;
        while ((ad = cacheQueue.poll()) != null) {
            ad.destroy();
        }
    }
}`.trim();
  }

  return {
    ad_format: adFormat,
    language,
    cache_capacity: capacity,
    bidding_mode: isBidding ? 'client-bidding' : 'standard',
    manager_class_name: managerName,
    architecture_highlights: [
      `FIFO 缓冲队列 (容量=${capacity})，单实例串行加载锁 (AtomicBoolean isLoading) 杜绝 1040005`,
      '每次请求与展示前执行 purgeExpiredAds()，自动销毁过期广告并释放 WebView 内存',
      '展示时立即异步触发 ensurePreloaded() 补齐空位，无缝衔接下一次广告展示',
      '内置指数退避重试 (3s -> 6s -> 12s -> 24s -> 48s)，并对 1030003/1040002/400x 客户端配置错误自动熔断'
    ],
    code
  };
}

/**
 * Tool #10: verify_live_device_ads
 */
function handleVerifyLiveDeviceAds(args = {}, analyzeLogcatFn) {
  const deviceSerial = args.device_serial ? String(args.device_serial).trim() : null;
  const maxLines = Math.min(Math.max(Number(args.max_lines) || 1500, 100), 10000);
  const clearBeforeCapture = args.clear_before_capture === true;

  function runAdb(adbArgs, timeoutMs = 6000) {
    const finalArgs = deviceSerial ? ['-s', deviceSerial, ...adbArgs] : adbArgs;
    return execFileSync('adb', finalArgs, {
      encoding: 'utf8',
      timeout: timeoutMs,
      stdio: ['ignore', 'pipe', 'pipe']
    });
  }

  let devicesOutput = '';
  try {
    devicesOutput = execFileSync('adb', ['devices', '-l'], {
      encoding: 'utf8',
      timeout: 4000,
      stdio: ['ignore', 'pipe', 'pipe']
    });
  } catch (err) {
    return {
      adb_available: false,
      connected_devices: [],
      status: 'ADB_UNAVAILABLE',
      message: `无法执行 adb 命令 (${err.message})。请确认 Android SDK platform-tools 已加入 PATH，或直接将复制好的日志传入 analyze_logcat_trace 工具。`
    };
  }

  const deviceLines = devicesOutput
    .split(/\r?\n/)
    .slice(1)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('*'));

  const onlineDevices = deviceLines
    .filter((l) => /\bdevice\b/.test(l))
    .map((l) => {
      const parts = l.split(/\s+/);
      return { serial: parts[0], details: parts.slice(1).join(' ') };
    });

  if (onlineDevices.length === 0) {
    return {
      adb_available: true,
      connected_devices: [],
      status: 'NO_DEVICE_CONNECTED',
      message:
        '当前未检测到已连接的 Android 真机或模拟器（`adb devices` 为空或处于 offline/unauthorized 状态）。请连接设备并开启 USB 调试后重试。'
    };
  }

  const targetSerial = deviceSerial || onlineDevices[0].serial;
  function runTargetAdb(adbArgs, timeoutMs = 6000) {
    return execFileSync('adb', ['-s', targetSerial, ...adbArgs], {
      encoding: 'utf8',
      timeout: timeoutMs,
      stdio: ['ignore', 'pipe', 'pipe']
    });
  }

  const deviceEnv = {
    serial: targetSerial,
    model: '',
    android_version: '',
    sdk_int: '',
    abi: '',
    http_proxy: ''
  };

  try {
    deviceEnv.model = runTargetAdb(['shell', 'getprop', 'ro.product.model']).trim();
    deviceEnv.android_version = runTargetAdb([
      'shell',
      'getprop',
      'ro.build.version.release'
    ]).trim();
    deviceEnv.sdk_int = runTargetAdb(['shell', 'getprop', 'ro.build.version.sdk']).trim();
    deviceEnv.abi = runTargetAdb(['shell', 'getprop', 'ro.product.cpu.abi']).trim();
    deviceEnv.http_proxy = runTargetAdb(['shell', 'settings', 'get', 'global', 'http_proxy']).trim();
  } catch (_) {
    // ignore partial property read failures
  }

  if (args.enable_runtime_doctor !== false) {
    try {
      runTargetAdb(['shell', 'setprop', 'debug.admaster.doctor', '1']);
    } catch (_) {}
  }

  if (clearBeforeCapture) {
    try {
      runTargetAdb(['logcat', '-c']);
    } catch (_) {}
  }

  let rawLogcat = '';
  try {
    rawLogcat = runTargetAdb(['logcat', '-d', '-t', String(maxLines)], 8000);
  } catch (err) {
    return {
      adb_available: true,
      connected_devices: onlineDevices,
      device_env: deviceEnv,
      status: 'LOGCAT_READ_FAILED',
      message: `读取真机 Logcat 失败: ${err.message}`
    };
  }

  const relevantLines = rawLogcat
    .split(/\r?\n/)
    .filter((l) =>
      /Funnel|AdMaster|SDKLogger|AI_DOCTOR_REPORT|AI-Hint|\[Ads\]|cc\.admaster|AdError/i.test(l)
    );

  const traceDiagnosis = analyzeLogcatFn({
    logcat_text: relevantLines.join('\n')
  });

  return {
    adb_available: true,
    status: 'DEVICE_VERIFIED',
    connected_devices: onlineDevices,
    device_environment: deviceEnv,
    logcat_capture_summary: {
      total_lines_pulled: maxLines,
      sdk_relevant_lines_matched: relevantLines.length
    },
    trace_diagnosis: traceDiagnosis
  };
}

module.exports = {
  handleGetTestCredentialsAndValidator,
  handleAuditHostGradleAndManifest,
  handleAuditAdIntegrationCode,
  handleGenerateAdCacheManager,
  handleVerifyLiveDeviceAds
};
