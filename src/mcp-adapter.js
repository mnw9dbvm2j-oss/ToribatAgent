const fs = require('fs');
const path = require('path');

const DEFAULT_CONFIG = {
    enabled: false,
    servers: {
        filesystem: {
            enabled: false,
            command: '',
            args: []
        }
    },
    filesystem: {
        enabled: false,
        allowedRoots: [
            'D:\\ToribatAgent',
            'D:\\ToribatMagicSchool'
        ]
    },
    allowedRoots: [
        'D:\\ToribatAgent',
        'D:\\ToribatMagicSchool'
    ]
};

function getConfigPath(baseDir = path.resolve(__dirname, '..')) {
    return path.join(baseDir, 'mcp.config.json');
}

function normalizeRoot(root) {
    return path.resolve(String(root || '')).toLowerCase();
}

function loadMcpConfig(baseDir) {
    const file = getConfigPath(baseDir);
    try {
        if (!fs.existsSync(file)) return DEFAULT_CONFIG;
        const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
        const filesystem = { ...DEFAULT_CONFIG.filesystem, ...(saved.filesystem || {}) };
        const allowedRoots = Array.from(new Set([
            ...(saved.allowedRoots || []),
            ...(filesystem.allowedRoots || [])
        ])).filter(Boolean);
        return {
            ...DEFAULT_CONFIG,
            ...saved,
            filesystem: { ...filesystem, allowedRoots },
            allowedRoots
        };
    } catch {
        return DEFAULT_CONFIG;
    }
}

function getAllowedRoots(config = loadMcpConfig()) {
    const roots = [
        ...(config.allowedRoots || []),
        ...(config.filesystem?.allowedRoots || [])
    ];
    return Array.from(new Set(roots.map(normalizeRoot).filter(Boolean)));
}

function isWithinAllowedRoots(targetPath, config = loadMcpConfig()) {
    const resolved = normalizeRoot(targetPath);
    return getAllowedRoots(config).some(root => resolved === root || resolved.startsWith(root + path.sep.toLowerCase()));
}

function assertSafePath(targetPath, config = loadMcpConfig()) {
    if (!isWithinAllowedRoots(targetPath, config)) {
        throw new Error(`MCP path outside allowedRoots: ${targetPath}`);
    }
    return path.resolve(targetPath);
}

function isFilesystemMcpEnabled(config = loadMcpConfig()) {
    return config.enabled === true && config.filesystem?.enabled === true && config.servers?.filesystem?.enabled === true;
}

function canWrite(targetPath, config = loadMcpConfig()) {
    try {
        assertSafePath(targetPath, config);
        const existing = fs.existsSync(targetPath) ? targetPath : path.dirname(targetPath);
        fs.accessSync(existing, fs.constants.W_OK);
        return true;
    } catch {
        return false;
    }
}

function listProjectFiles(projectPath, relativeDir = '', options = {}) {
    const config = loadMcpConfig(options.baseDir);
    const root = assertSafePath(projectPath, config);
    const start = assertSafePath(path.join(root, relativeDir), config);
    const limit = Number(options.limit || 700);
    const files = [];

    function walk(current) {
        if (files.length >= limit || !fs.existsSync(current)) return;
        const entries = fs.readdirSync(current, { withFileTypes: true });
        for (const entry of entries) {
            if (files.length >= limit) return;
            const full = assertSafePath(path.join(current, entry.name), config);
            if (entry.isDirectory()) {
                walk(full);
            } else if (entry.isFile()) {
                const stat = fs.statSync(full);
                files.push({
                    full,
                    relative: path.relative(root, full).replace(/\\/g, '/'),
                    size: stat.size,
                    ext: path.extname(entry.name).toLowerCase()
                });
            }
        }
    }

    walk(start);
    return files;
}

function readFileContent(filePath, options = {}) {
    const config = loadMcpConfig(options.baseDir);
    const safe = assertSafePath(filePath, config);
    const maxBytes = Number(options.maxBytes || 1024 * 512);
    const stat = fs.statSync(safe);
    if (stat.size > maxBytes) {
        throw new Error(`File too large for MCP adapter read: ${stat.size} bytes`);
    }
    return fs.readFileSync(safe, options.encoding || 'utf8');
}

module.exports = {
    loadMcpConfig,
    getAllowedRoots,
    isWithinAllowedRoots,
    assertSafePath,
    isFilesystemMcpEnabled,
    listProjectFiles,
    readFileContent,
    canWrite
};
