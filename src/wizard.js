'use strict';

const fs = require('fs');
const path = require('path');
const { handleAuditHostGradleAndManifest } = require('./audit');

const MCP_SERVER_KEY = 'mediago_monetization_sdk_mcp';
const DEFAULT_MCP_SERVER_CONFIG = {
  command: 'npx',
  args: ['-y', 'github:mediagoinapp-star/mediago_monetization_sdk_mcp']
};

/**
 * Safely read and merge an MCP config JSON file without overwriting user's other mcpServers.
 */
function upsertMcpConfigFile(filePath, serverKey, serverConfig) {
  let existing = {};
  let action = 'created';

  if (fs.existsSync(filePath)) {
    action = 'updated';
    try {
      const raw = fs.readFileSync(filePath, 'utf8').trim();
      if (raw) {
        existing = JSON.parse(raw);
      }
    } catch (err) {
      throw new Error(`解析现有配置文件失败 (${filePath}): ${err.message}`);
    }
  }

  if (!existing || typeof existing !== 'object' || Array.isArray(existing)) {
    existing = {};
  }
  if (!existing.mcpServers || typeof existing.mcpServers !== 'object') {
    existing.mcpServers = {};
  }

  existing.mcpServers[serverKey] = serverConfig;

  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(filePath, JSON.stringify(existing, null, 2) + '\n', 'utf8');
  return { filePath, action };
}

/**
 * Run the zero-config initialization wizard for a target project directory.
 */
function runInitWizard(options = {}) {
  const targetDir = path.resolve(options.targetDir || process.cwd());
  const silent = options.silent === true;

  if (!fs.existsSync(targetDir)) {
    throw new Error(`目标目录不存在: ${targetDir}`);
  }

  // 1. Run Gradle & Manifest static audit to detect project environment
  const auditReport = handleAuditHostGradleAndManifest({ project_root: targetDir });

  // 2. Write / merge .cursor/mcp.json and .mcp.json (Claude Code / generic MCP)
  const cursorMcpPath = path.join(targetDir, '.cursor', 'mcp.json');
  const rootMcpPath = path.join(targetDir, '.mcp.json');

  const writtenFiles = [];
  writtenFiles.push(
    upsertMcpConfigFile(cursorMcpPath, MCP_SERVER_KEY, DEFAULT_MCP_SERVER_CONFIG)
  );
  writtenFiles.push(
    upsertMcpConfigFile(rootMcpPath, MCP_SERVER_KEY, DEFAULT_MCP_SERVER_CONFIG)
  );

  const skillInstallCommand =
    'npx skills add https://github.com/mediagoinapp-star/mediago_monetization_sdk_skills';

  const result = {
    target_dir: targetDir,
    project_type: auditReport.project_type,
    mcp_configs_written: writtenFiles.map((w) => ({
      path: path.relative(targetDir, w.filePath),
      action: w.action
    })),
    audit_summary: auditReport.summary,
    audit_status: auditReport.status,
    issues: auditReport.issues,
    recommendations: auditReport.recommendations,
    skill_install_command: skillInstallCommand
  };

  if (!silent) {
    const lines = [
      '================================================================',
      '  MediaGo Monetization SDK - AI Integration Wizard (init)',
      '================================================================',
      `Target Project : ${targetDir}`,
      `Project Type   : ${result.project_type}`,
      `Audit Status   : ${result.audit_status} (Errors: ${auditReport.summary.error_count}, Warnings: ${auditReport.summary.warning_count})`,
      '',
      '[1/3] MCP Server Configuration Written:',
      ...result.mcp_configs_written.map((f) => `  - ${f.path} (${f.action})`),
      '',
      '[2/3] Project Environment Audit Summary:',
      `  - Gradle / Dependency Files : ${auditReport.summary.gradle_and_dep_files_scanned}`,
      `  - AndroidManifest Files     : ${auditReport.summary.manifest_files_scanned}`,
      `  - mavenCentral() Configured : ${auditReport.summary.has_maven_central ? 'YES' : 'NO'}`,
      `  - TopOn Family Detected     : ${auditReport.summary.topon_family_detected}`,
      `  - Declared SDK Versions     : ${
        auditReport.summary.declared_sdk_versions.length > 0
          ? auditReport.summary.declared_sdk_versions.map((d) => `${d.version} (${d.file})`).join(', ')
          : 'None'
      }`
    ];

    if (result.issues.length > 0) {
      lines.push('', '  Detected Issues:');
      for (const issue of result.issues) {
        lines.push(`    [${issue.severity}] ${issue.code}: ${issue.message}`);
      }
    }

    lines.push(
      '',
      '[3/3] Recommended Next Step (Install Official AI Skill):',
      `  $ ${skillInstallCommand}`,
      '================================================================'
    );

    console.log(lines.join('\n'));
  }

  return result;
}

module.exports = {
  runInitWizard,
  upsertMcpConfigFile
};
