'use strict';

const assert = require('assert');
const { handleRpcMessage } = require('../src/server');

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

// 1. Test initialize & tools/list
const initResult = rpcCall(1, 'initialize', { protocolVersion: '2024-11-05' });
assert.strictEqual(initResult.serverInfo.name, 'mediago_monetization_sdk_mcp');

const listResult = rpcCall(2, 'tools/list', {});
assert.strictEqual(listResult.tools.length, 5);

// 2. Test Tool #1: get_sdk_compatibility
const compatGroovy = callMcpTool('get_sdk_compatibility', {
  mediation_platform: 'admob',
  build_dsl: 'groovy'
});
assert.strictEqual(compatGroovy.sdk.latest_verified, '2.0.38');
assert(compatGroovy.dependency_snippet.includes("cc.admaster.android:sdk:2.0.38"));
assert(compatGroovy.dependency_snippet.includes("cc.admaster.android:adapter:1.0.0"));

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

// 5. Test Tool #8: diagnose_error_code
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

// 6. Test Tool #9: analyze_logcat_trace
const sampleLogcat = [
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
assert(traceAnalysis.summary.detected_error_codes.includes('3030002'));
assert.strictEqual(traceAnalysis.request_traces[0].req_id, 'a1b2c3d4');
assert.strictEqual(traceAnalysis.request_traces[0].last_normal_stage, 'CACHING');
assert.strictEqual(traceAnalysis.request_traces[0].terminal_stage.stage, 'ERROR_TERMINATED');

console.log('ALL 5 MCP TOOLS & JSON-RPC PROTOCOL TESTS PASSED SUCCESSFULLY!');
