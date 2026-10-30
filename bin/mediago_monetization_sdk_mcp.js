#!/usr/bin/env node
'use strict';

const { startStdioServer, handleRpcMessage } = require('../src/server');
const { runInitWizard } = require('../src/wizard');

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(
    [
      'MediaGo Monetization SDK MCP Server & CLI Wizard',
      '',
      'Usage:',
      '  npx mediago_monetization_sdk_mcp               Start MCP JSON-RPC stdio server',
      '  npx mediago_monetization_sdk_mcp init [dir]    Auto-configure .cursor/mcp.json & .mcp.json and audit project',
      '  npx mediago_monetization_sdk_mcp --self-test   Run protocol & tool registration self-check'
    ].join('\n')
  );
  process.exit(0);
}

if (args[0] === 'init') {
  const targetDir = args[1] && !args[1].startsWith('-') ? args[1] : process.cwd();
  try {
    runInitWizard({ targetDir });
    process.exit(0);
  } catch (err) {
    console.error('Init failed:', err.message);
    process.exit(1);
  }
}

if (args.includes('--self-test')) {
  const initRes = handleRpcMessage({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2024-11-05' }
  });
  const listRes = handleRpcMessage({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list'
  });
  console.log('Initialize OK:', initRes.result.serverInfo);
  console.log(
    'Registered Tools (' + listRes.result.tools.length + '):',
    listRes.result.tools.map((t) => t.name)
  );
  process.exit(0);
}

startStdioServer();
