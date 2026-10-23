#!/usr/bin/env node
'use strict';

const { startStdioServer, handleRpcMessage } = require('../src/server');

if (process.argv.includes('--self-test')) {
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
