'use strict';

const { TOOL_DEFINITIONS, callTool } = require('./tools');

const SERVER_INFO = {
  name: 'mediago_monetization_sdk_mcp',
  version: '1.1.0'
};

const DEFAULT_PROTOCOL_VERSION = '2024-11-05';

function createRpcResponse(id, result) {
  return {
    jsonrpc: '2.0',
    id,
    result
  };
}

function createRpcError(id, code, message, data) {
  const err = { code, message };
  if (data !== undefined) {
    err.data = data;
  }
  return {
    jsonrpc: '2.0',
    id: id !== undefined ? id : null,
    error: err
  };
}

function handleRpcMessage(msg) {
  if (!msg || typeof msg !== 'object') {
    return createRpcError(null, -32600, 'Invalid Request');
  }

  const { id, method, params } = msg;

  // Notification (no id)
  if (id === undefined || id === null) {
    return null;
  }

  try {
    switch (method) {
      case 'initialize': {
        const clientProtocol =
          params && typeof params.protocolVersion === 'string'
            ? params.protocolVersion
            : DEFAULT_PROTOCOL_VERSION;
        return createRpcResponse(id, {
          protocolVersion: clientProtocol,
          capabilities: {
            tools: {
              listChanged: false
            }
          },
          serverInfo: SERVER_INFO
        });
      }

      case 'ping':
        return createRpcResponse(id, {});

      case 'tools/list':
        return createRpcResponse(id, {
          tools: TOOL_DEFINITIONS
        });

      case 'tools/call': {
        if (!params || !params.name) {
          return createRpcError(id, -32602, 'Missing tool name in params');
        }
        try {
          const toolResult = callTool(params.name, params.arguments || {});
          return createRpcResponse(id, {
            content: [
              {
                type: 'text',
                text: JSON.stringify(toolResult, null, 2)
              }
            ],
            isError: false
          });
        } catch (toolErr) {
          return createRpcResponse(id, {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    error: toolErr.message || String(toolErr)
                  },
                  null,
                  2
                )
              }
            ],
            isError: true
          });
        }
      }

      case 'resources/list':
        return createRpcResponse(id, { resources: [] });

      case 'prompts/list':
        return createRpcResponse(id, { prompts: [] });

      default:
        return createRpcError(id, -32601, `Method not found: ${method}`);
    }
  } catch (err) {
    return createRpcError(id, -32603, err.message || 'Internal error');
  }
}

function startStdioServer() {
  let buffer = Buffer.alloc(0);
  let useContentLengthHeader = false;

  function sendMessage(responseObj) {
    if (!responseObj) return;
    const json = JSON.stringify(responseObj);
    if (useContentLengthHeader) {
      const byteLength = Buffer.byteLength(json, 'utf8');
      process.stdout.write(`Content-Length: ${byteLength}\r\n\r\n${json}`);
    } else {
      process.stdout.write(`${json}\n`);
    }
  }

  function processBuffer() {
    while (buffer.length > 0) {
      // 1. Check if buffer starts with Content-Length header
      const headerMatch = buffer
        .slice(0, Math.min(buffer.length, 128))
        .toString('utf8')
        .match(/^Content-Length:\s*(\d+)\r?\n/i);

      if (headerMatch) {
        useContentLengthHeader = true;
        const separatorIdx = buffer.indexOf('\r\n\r\n');
        const altSeparatorIdx = buffer.indexOf('\n\n');
        let bodyStart = -1;
        if (separatorIdx !== -1) {
          bodyStart = separatorIdx + 4;
        } else if (altSeparatorIdx !== -1) {
          bodyStart = altSeparatorIdx + 2;
        } else {
          // Wait for full header
          break;
        }

        const contentLength = Number(headerMatch[1]);
        if (buffer.length < bodyStart + contentLength) {
          // Wait for full body
          break;
        }

        const bodyBytes = buffer.slice(bodyStart, bodyStart + contentLength);
        buffer = buffer.slice(bodyStart + contentLength);
        const rawText = bodyBytes.toString('utf8').trim();
        if (rawText) {
          try {
            const parsed = JSON.parse(rawText);
            const response = handleRpcMessage(parsed);
            sendMessage(response);
          } catch (e) {
            sendMessage(createRpcError(null, -32700, `Parse error: ${e.message}`));
          }
        }
        continue;
      }

      // 2. Otherwise process as newline-delimited JSON
      const newlineIdx = buffer.indexOf('\n');
      if (newlineIdx === -1) {
        break;
      }

      const lineBytes = buffer.slice(0, newlineIdx);
      buffer = buffer.slice(newlineIdx + 1);
      const lineStr = lineBytes.toString('utf8').trim();
      if (!lineStr) {
        continue;
      }

      try {
        const parsed = JSON.parse(lineStr);
        const response = handleRpcMessage(parsed);
        sendMessage(response);
      } catch (e) {
        sendMessage(createRpcError(null, -32700, `Parse error: ${e.message}`));
      }
    }
  }

  process.stdin.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    processBuffer();
  });

  process.stdin.on('end', () => {
    process.exit(0);
  });
}

module.exports = {
  handleRpcMessage,
  startStdioServer
};
