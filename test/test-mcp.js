'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { handleRpcMessage } = require('../src/server');
const { runInitWizard } = require('../src/wizard');

function rpcCall(id, method, params) {
  const res = handleRpcMessage({
    jsonrpc: '2.0',
    id,
    method,
    params
  });
  assert(res && res.jsonrpc === '2.0', `Invalid RPC response for ${method}`);
  assert.strictEqual(res.id, id);
  assert(!res.error, `Unexpected RPC error: ${JSON.stringify(res.error)}`);
  return res.result;
}

function callMcpTool(name, args) {
  const result = rpcCall(Date.now(), 'tools/call', {
    name,
    arguments: args
  });
  assert.strictEqual(result.isError, false, `Tool ${name} returned error: ${result.content[0].text}`);
  return JSON.parse(result.content[0].text);
}

// 1. Test initialize & tools/list (all 10 tools)
const initResult = rpcCall(1, 'initialize', { protocolVersion: '2024-11-05' });
assert.strictEqual(initResult.serverInfo.name, 'mediago_monetization_sdk_mcp');
assert.strictEqual(initResult.serverInfo.version, '1.1.0');

const listResult = rpcCall(2, 'tools/list', {});
assert.strictEqual(listResult.tools.length, 10);

// 2. Test Tool #1: get_sdk_compatibility
const compatGroovy = callMcpTool('get_sdk_compatibility', {
  mediation_platform: 'admob',
  build_dsl: 'groovy'
});
assert.strictEqual(compatGroovy.sdk.latest_verified, '2.0.38');
assert(compatGroovy.dependency_snippet.includes('cc.admaster.android:sdk:2.0.38'));
assert(compatGroovy.dependency_snippet.includes('cc.admaster.android:adapter:1.0.0'));

const compatUnity = callMcpTool('get_sdk_compatibility', {
  mediation_platform: 'none',
  build_dsl: 'unity-edm4u'
});
assert(compatUnity.dependency_snippet.includes('<androidPackage spec="cc.admaster.android:sdk:2.0.38" />'));

// 3. Test Tool #2: get_ad_integration_template
const rewardedJavaBidding = callMcpTool('get_ad_integration_template', {
  ad_format: 'rewarded',
  language: 'java',
  bidding_mode: 'client-bidding',
  use_test_credentials: true
});
assert.strictEqual(rewardedJavaBidding.test_ad_unit_id, '100090001');
assert(rewardedJavaBidding.code.includes('adToShow.show(activity, rewardListener);'));
assert(rewardedJavaBidding.code.includes('notifyWin'));
assert(rewardedJavaBidding.code.includes('notifyLoss'));
assert(rewardedJavaBidding.code.includes('getResponseInfo().getEcpmLevel()'));

const splashJava = callMcpTool('get_ad_integration_template', {
  ad_format: 'splash',
  language: 'java'
});
assert.strictEqual(splashJava.test_ad_unit_id, '100090004');
assert(splashJava.code.includes('ad.show(splashContainer);'));

// 4. Test Tool #3: get_mediation_adapter_config
const admobConfig = callMcpTool('get_mediation_adapter_config', {
  platform: 'admob',
  ad_format: 'rewarded'
});
const admobJson = JSON.parse(admobConfig.dashboard_server_parameter_json);
assert.strictEqual(admobJson.app_id, 'ad2fd73dca2ccffd312495bcd8a33d29');
assert.strictEqual(admobJson.ad_unit_id, '100090001');
assert.strictEqual(admobJson.placement_id, undefined);
assert.strictEqual(
  admobConfig.adapter_classes.all_formats,
  'com.google.ads.mediation.admaster.AdMasterMediationAdapter'
);

const toponThinkupConfig = callMcpTool('get_mediation_adapter_config', {
  platform: 'topon-thinkup',
  ad_format: 'rewarded'
});
const toponJson = JSON.parse(toponThinkupConfig.dashboard_server_parameter_json);
assert.strictEqual(toponJson.placement_id, '100090001');
assert.strictEqual(
  toponThinkupConfig.adapter_classes.rewarded,
  'cc.admaster.android.topon.adapter.AdMasterTopOnRewardedAdapter'
);

// 5. Test Tool #4: get_test_credentials_and_validator
const validCreds = callMcpTool('get_test_credentials_and_validator', {
  app_id: 'ad2fd73dca2ccffd312495bcd8a33d29',
  ad_unit_id: '100090001',
  expected_format: 'rewarded',
  language: 'kotlin'
});
assert.strictEqual(validCreds.valid, true);
assert.strictEqual(validCreds.app_id_status, 'VALID_OFFICIAL_TEST_ID');
assert(validCreds.debug_release_switch_snippet.includes('object AdCredentials'));

const swappedCreds = callMcpTool('get_test_credentials_and_validator', {
  app_id: '100090001',
  ad_unit_id: 'ad2fd73dca2ccffd312495bcd8a33d29'
});
assert.strictEqual(swappedCreds.valid, false);
assert.strictEqual(swappedCreds.app_id_status, 'INVALID_SWAPPED');
assert.strictEqual(swappedCreds.ad_unit_id_status, 'INVALID_SWAPPED');

// 6. Test Tool #5 & #6 & CLI Wizard on a temporary fixture project
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mediago-mcp-test-'));
try {
  // Create a mock build.gradle with TopOn branch mismatch & missing mavenCentral
  fs.writeFileSync(
    path.join(tmpDir, 'build.gradle'),
    [
      'android {',
      '    defaultConfig { minSdk 21; compileSdk 34 }',
      '}',
      'dependencies {',
      "    implementation 'com.thinkup.sdk:core:6.4.18'",
      "    implementation 'cc.admaster.android:sdk:2.0.38'",
      "    implementation 'cc.admaster.android:topon-secmtp-adapter:0.0.3'",
      '}'
    ].join('\n'),
    'utf8'
  );

  // Create a mock AndroidManifest.xml with tools:node="remove"
  fs.writeFileSync(
    path.join(tmpDir, 'AndroidManifest.xml'),
    '<manifest><application><activity android:name="cc.admaster.android.BdShellActivity" tools:node="remove" /></application></manifest>',
    'utf8'
  );

  // Create a mock Java file with anti-patterns (premature load + recursive retry + reward in dismiss)
  const srcDir = path.join(tmpDir, 'src');
  fs.mkdirSync(srcDir, { recursive: true });
  fs.writeFileSync(
    path.join(srcDir, 'BadAdHelper.java'),
    [
      'import cc.admaster.android.proxy.api.AdMaster;',
      'import cc.admaster.android.proxy.api.RewardedAd;',
      'public class BadAdHelper {',
      '    public void init(Context ctx) {',
      '        AdMaster.initialize(ctx, "ad2fd73dca2ccffd312495bcd8a33d29", new InitCallback() {});',
      '        RewardedAd.load(ctx, "100090001", req, new AdLoadCallback<RewardedAd>() {',
      '            public void onAdFailedToLoad(AdError err) {',
      '                RewardedAd.load(ctx, "100090001", req, this);',
      '            }',
      '        });',
      '    }',
      '    public void showAd(Activity act, RewardedAd ad) {',
      '        ad.show(act, item -> {});',
      '    }',
      '    public void onAdDismissedFullScreenContent(AdDismissInfo info) {',
      '        grantReward();',
      '    }',
      '}'
    ].join('\n'),
    'utf8'
  );

  const gradleAudit = callMcpTool('audit_host_gradle_and_manifest', {
    project_root: tmpDir
  });
  assert.strictEqual(gradleAudit.status, 'FAIL');
  assert(gradleAudit.issues.some((i) => i.code === 'MISSING_MAVEN_CENTRAL'));
  assert(gradleAudit.issues.some((i) => i.code === 'TOPON_BRANCH_MISMATCH'));
  assert(gradleAudit.issues.some((i) => i.code === 'MANIFEST_REMOVED_SDK_COMPONENT'));

  const codeAudit = callMcpTool('audit_ad_integration_code', {
    target_path: tmpDir
  });
  assert.strictEqual(codeAudit.status, 'FAIL');
  assert(
    codeAudit.findings.some((f) => f.rule_id === 'ANTI_PATTERN_1_PREMATURE_LOAD_BEFORE_INIT')
  );
  assert(codeAudit.findings.some((f) => f.rule_id === 'ANTI_PATTERN_2_SYNC_RECURSIVE_RETRY'));
  assert(
    codeAudit.findings.some((f) => f.rule_id === 'ANTI_PATTERN_3_SHOW_WITHOUT_READY_OR_EXPIRED_GUARD')
  );
  assert(codeAudit.findings.some((f) => f.rule_id === 'ANTI_PATTERN_4_REWARD_IN_DISMISS_CALLBACK'));
  assert(codeAudit.findings.some((f) => f.rule_id === 'ANTI_PATTERN_5_MISSING_DESTROY_CALL'));

  // Test CLI init wizard (silent mode)
  const wizardRes = runInitWizard({ targetDir: tmpDir, silent: true });
  assert.strictEqual(wizardRes.mcp_configs_written.length, 2);
  assert(fs.existsSync(path.join(tmpDir, '.cursor', 'mcp.json')));
  assert(fs.existsSync(path.join(tmpDir, '.mcp.json')));
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

// 7. Test Tool #7: generate_ad_cache_manager
const cacheManagerKotlin = callMcpTool('generate_ad_cache_manager', {
  ad_format: 'rewarded',
  language: 'kotlin',
  cache_capacity: 2,
  bidding_mode: 'client-bidding'
});
assert.strictEqual(cacheManagerKotlin.manager_class_name, 'RewardedAdCacheManager');
assert(cacheManagerKotlin.code.includes('ConcurrentLinkedQueue<RewardedAd>'));
assert(cacheManagerKotlin.code.includes('peekBestEcpmCents'));

const cacheManagerJava = callMcpTool('generate_ad_cache_manager', {
  ad_format: 'interstitial',
  language: 'java',
  cache_capacity: 2
});
assert.strictEqual(cacheManagerJava.manager_class_name, 'InterstitialAdCacheManager');
assert(cacheManagerJava.code.includes('ExpressInterstitialAd'));

// 8. Test Tool #8: diagnose_error_code
const diag1030003 = callMcpTool('diagnose_error_code', { error_code: 1030003 });
assert.strictEqual(diag1030003.constant, 'ERROR_NOT_INITIALIZED');
assert.strictEqual(diag1030003.category, 'CLIENT_INTEGRATION_BUG');
assert.strictEqual(diag1030003.should_retry, false);

const diag2000 = callMcpTool('diagnose_error_code', { error_code: '2000' });
assert.strictEqual(diag2000.category, 'SERVER_NO_FILL');
assert.strictEqual(diag2000.should_retry, true);

const diagAdmob101 = callMcpTool('diagnose_error_code', {
  error_code: 101,
  mediation_platform: 'admob'
});
assert.strictEqual(diagAdmob101.constant, 'ERROR_INVALID_SERVER_PARAMETERS');

// 9. Test Tool #9: analyze_logcat_trace
const sampleLogcat = [
  '10-22 18:00:01.050 I/AdMaster/Doctor: [AI_DOCTOR_REPORT] {"sdk":"cc.admaster.android:xadsdk","version":"2.0.39","status":"WARN","checks":[{"id":"SDK_INIT","status":"PASS","detail":"Initialized"},{"id":"ANTI_PATTERNS","status":"WARN","detail":"1 issue","fix":"Wait for onInitialized"}]}',
  '10-22 18:00:01.080 W/AdMaster/Request: [AI-Hint] [SYNC_RECURSIVE_RETRY] RewardedAd.load() called inside onAdFailedToLoad at com.example.AdHelper.onAdFailedToLoad(AdHelper.java:42)',
  '10-22 18:00:01.100 D/SDKLogger: [Funnel] lifecycle_stage [INIT#0] [req=a1b2c3d4] [kind=rewarded_video] | cost_ms=2 elapsed_ms=2',
  '10-22 18:00:01.120 D/SDKLogger: [Funnel] lifecycle_stage [REQUESTING#1] [req=a1b2c3d4] [kind=rewarded_video] | cost_ms=20 elapsed_ms=22',
  '10-22 18:00:01.350 D/SDKLogger: [Funnel] lifecycle_stage [PARSING#2] [req=a1b2c3d4] [kind=rewarded_video] | cost_ms=230 elapsed_ms=252',
  '10-22 18:00:01.360 D/SDKLogger: [Funnel] lifecycle_stage [CACHING#3] [req=a1b2c3d4] [kind=rewarded_video] | cost_ms=10 elapsed_ms=262',
  '10-22 18:00:02.100 W/SDKLogger: [Funnel] video_precache_result [req=a1b2c3d4] [kind=rewarded_video] [FAIL] | cost_ms=740 success=0 phase=download err=SocketTimeoutException',
  '10-22 18:00:02.105 W/SDKLogger: [Funnel] lifecycle_stage [ERROR_TERMINATED#90] [req=a1b2c3d4] [kind=rewarded_video] [FAIL] | cost_ms=745 elapsed_ms=1007 reason=cache_failed',
  '10-22 18:00:02.110 E/Ads: [Ads] RewardedAd failed to load: code=3030002'
].join('\n');

const traceAnalysis = callMcpTool('analyze_logcat_trace', {
  logcat_text: sampleLogcat
});
assert.strictEqual(traceAnalysis.summary.funnel_events_count, 6);
assert.strictEqual(traceAnalysis.summary.ai_doctor_reports_count, 1);
assert.strictEqual(traceAnalysis.summary.ai_runtime_hints_count, 1);
assert.strictEqual(traceAnalysis.ai_runtime_hints[0].rule_id, 'SYNC_RECURSIVE_RETRY');
assert(traceAnalysis.summary.detected_error_codes.includes('3030002'));
assert.strictEqual(traceAnalysis.request_traces[0].req_id, 'a1b2c3d4');
assert.strictEqual(traceAnalysis.request_traces[0].last_normal_stage, 'CACHING');
assert.strictEqual(traceAnalysis.request_traces[0].terminal_stage.stage, 'ERROR_TERMINATED');

// 10. Test Tool #10: verify_live_device_ads (graceful response regardless of whether a device is plugged in)
const liveDeviceRes = callMcpTool('verify_live_device_ads', { max_lines: 200 });
assert(
  ['ADB_UNAVAILABLE', 'NO_DEVICE_CONNECTED', 'LOGCAT_READ_FAILED', 'DEVICE_VERIFIED'].includes(
    liveDeviceRes.status
  )
);

console.log('ALL 10 MCP TOOLS, CLI WIZARD & JSON-RPC PROTOCOL TESTS PASSED SUCCESSFULLY!');
