# mcp2rest - Product Requirements Document

**Version:** 1.0  
**Date:** October 23, 2025  
**Status:** Approved for Development

---

## Executive Summary

**mcp2rest** is a standalone Node.js daemon that manages multiple MCP servers and exposes their tools via REST API. It solves the problem of MCP servers being Node.js-only by providing a universal HTTP interface accessible from any programming language.

**Target Users:** Developers using Python, Go, Rust, or any language that can make HTTP requests who want to leverage MCP tools (browser automation, file systems, etc.) without Node.js integration complexity.

---

## Architecture Overview

```
┌─────────────────────────────────────────┐
│         Client Applications              │
│  (Python, JavaScript, any HTTP client)   │
└──────────────────┬──────────────────────┘
                   │ HTTP/REST
          ┌────────▼────────┐
          │  mcp2rest    │
          │  (Node.js)      │
          │  Port: 3000     │
          └────────┬────────┘
                   │
       ┌───────────┼───────────┐
       │           │           │
   ┌───▼───┐   ┌──▼───┐   ┌───▼───┐
   │ MCP   │   │ MCP  │   │ MCP   │
   │Server │   │Server│   │Server │
   │   1   │   │  2   │   │  3    │
   └───────┘   └──────┘   └───────┘
```

---

## MVP Scope

### ✅ In Scope

1. **Dynamic Server Management**
   - CLI commands: `add`, `remove`, `list`, `tools`
   - Hot-reload: servers added/removed without gateway restart
   - npx-based package installation

2. **REST API**
   - `POST /call` - Execute tool on any server
   - `GET /servers` - List all servers with status
   - `GET /servers/:name/tools` - List tools for specific server
   - `POST /servers` - Add server dynamically
   - `DELETE /servers/:name` - Remove server
   - `GET /health` - Health check endpoint

3. **Gateway Daemon**
   - Process management: `start`, `stop`, `status`
   - Persistent connections to all MCP servers
   - Auto-reconnect on server failure
   - PID file at `~/.mcp2rest/gateway.pid`

4. **Configuration**
   - YAML config at `~/.mcp2rest/config.yaml`
   - Dynamic updates via CLI
   - Example configurations included

5. **Production Readiness**
   - Structured logging (console for dev)
   - Error handling with standardized codes
   - Graceful shutdown
   - npm package with global installation

### ❌ Out of Scope (Post-MVP)

- Authentication/Authorization
- Rate limiting
- WebSocket support for streaming
- Multi-instance clustering
- Web-based GUI/Dashboard
- Tool result caching
- Per-user configurations

---

## Technical Architecture

### 1. Configuration Management

**Location:** `~/.mcp2rest/config.yaml`

```yaml
servers:
  chrome:
    package: chrome-devtools-mcp@latest
    args: ["--headless=true", "--isolated=true"]
  
  filesystem:
    package: "@modelcontextprotocol/server-filesystem"
    args: ["/home/user/workspace"]

gateway:
  port: 3000
  host: localhost
  timeout: 30000  # Global tool execution timeout (ms)
  logLevel: info  # debug | info | warn | error
```

**Hot-Reload Strategy:**
- CLI commands modify config.yaml
- Send signal to running gateway process
- Gateway reloads config and updates server connections
- No downtime for unaffected servers

### 2. Server Connection Model

```typescript
interface ServerConfig {
  name: string;
  package: string;
  args?: string[];
}

interface ServerState {
  config: ServerConfig;
  status: 'connected' | 'disconnected' | 'error';
  client: Client | null;
  tools: Tool[];
  reconnectAttempts: number;
  lastError?: string;
}

class Gateway {
  private servers: Map<string, ServerState>;
  private config: Config;
  
  // Core operations
  async addServer(name: string, pkg: string, args?: string[]): Promise<void>;
  async removeServer(name: string): Promise<void>;
  async callTool(server: string, tool: string, arguments: any): Promise<any>;
  
  // Connection management
  async connectServer(name: string): Promise<void>;
  async disconnectServer(name: string): Promise<void>;
  async reconnectServer(name: string): Promise<void>;
  
  // Discovery
  listServers(): ServerInfo[];
  listTools(serverName: string): Tool[];
}
```

**Connection Lifecycle:**
1. Server added → npx installs package → spawn process → establish MCP connection
2. Connection lost → auto-reconnect with exponential backoff (1s, 2s, 4s)
3. Max 3 reconnect attempts, then mark as 'error' status
4. Manual retry available via CLI

### 3. Process Management

**Daemon Pattern:**
```bash
# Start gateway (forks to background)
mcp2rest start

# Stop gateway (kills via PID)
mcp2rest stop

# Check status
mcp2rest status  # → "running" or "stopped"
```

**Implementation:**
- PID file at `~/.mcp2rest/gateway.pid`
- Process detachment using Node.js `child_process`
- Graceful shutdown on SIGTERM/SIGINT
- Stdout/stderr redirect to `~/.mcp2rest/logs/gateway.log`

### 4. REST API Design

**Base URL:** `http://localhost:3000`

#### `GET /health`
Health check with server count.

**Response:**
```json
{
  "status": "healthy",
  "servers": 2,
  "serverNames": ["chrome", "filesystem"]
}
```

#### `GET /servers`
List all servers with status.

**Response:**
```json
{
  "servers": [
    {
      "name": "chrome",
      "package": "chrome-devtools-mcp@latest",
      "status": "connected",
      "toolCount": 26
    },
    {
      "name": "filesystem",
      "package": "@modelcontextprotocol/server-filesystem",
      "status": "error",
      "toolCount": 0,
      "error": "Connection refused"
    }
  ]
}
```

#### `POST /servers`
Add a new server dynamically.

**Request:**
```json
{
  "name": "chrome",
  "package": "chrome-devtools-mcp@latest",
  "args": ["--headless=true"]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Server 'chrome' added successfully"
}
```

#### `DELETE /servers/:name`
Remove a server.

**Response:**
```json
{
  "success": true,
  "message": "Server 'chrome' removed"
}
```

#### `GET /servers/:name/tools`
List all tools for a specific server.

**Response:**
```json
{
  "server": "chrome",
  "tools": [
    {
      "name": "navigate",
      "description": "Navigate to a URL",
      "inputSchema": {
        "type": "object",
        "properties": {
          "url": { "type": "string" }
        },
        "required": ["url"]
      }
    }
  ]
}
```

#### `POST /call`
Execute a tool on a server.

**Request:**
```json
{
  "server": "chrome",
  "tool": "navigate",
  "arguments": {
    "url": "https://example.com"
  }
}
```

**Success Response:**
```json
{
  "success": true,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Navigated to https://example.com"
      }
    ]
  }
}
```

**Error Response:**
```json
{
  "error": {
    "code": "SERVER_DISCONNECTED",
    "message": "Chrome server is not connected",
    "serverName": "chrome"
  }
}
```

### 5. Error Handling

**Standardized Error Codes:**

```typescript
enum ErrorCode {
  // Server errors
  SERVER_NOT_FOUND = 'SERVER_NOT_FOUND',           // Server name doesn't exist
  SERVER_DISCONNECTED = 'SERVER_DISCONNECTED',     // Server not connected
  SERVER_ADD_FAILED = 'SERVER_ADD_FAILED',         // Failed to add server
  
  // Tool errors
  TOOL_NOT_FOUND = 'TOOL_NOT_FOUND',               // Tool doesn't exist on server
  TOOL_EXECUTION_ERROR = 'TOOL_EXECUTION_ERROR',   // Tool ran but failed
  TOOL_TIMEOUT = 'TOOL_TIMEOUT',                   // Execution exceeded timeout
  
  // Validation errors
  INVALID_ARGUMENTS = 'INVALID_ARGUMENTS',         // Arguments don't match schema
  INVALID_CONFIG = 'INVALID_CONFIG',               // Config file malformed
  
  // System errors
  GATEWAY_ERROR = 'GATEWAY_ERROR'                  // Internal gateway error
}
```

**Error Response Format:**
```json
{
  "error": {
    "code": "TOOL_TIMEOUT",
    "message": "Tool execution exceeded 30s timeout",
    "serverName": "chrome",
    "toolName": "screenshot",
    "details": {}
  }
}
```

### 6. Logging Strategy

**Development (Laptop):**
- Human-readable console output
- Colored logs with timestamps
- Log level: `info` by default

**Log Levels:**
- `debug`: Detailed MCP protocol messages
- `info`: Server connections, tool calls, CLI operations
- `warn`: Reconnection attempts, deprecated usage
- `error`: Failures, exceptions

**Example Log Output:**
```
[2025-10-23 14:32:01] INFO  Server 'chrome' connected (26 tools available)
[2025-10-23 14:32:15] INFO  Tool call: chrome.navigate(url=https://example.com)
[2025-10-23 14:32:16] INFO  Tool call completed in 1.2s
[2025-10-23 14:33:01] WARN  Server 'chrome' disconnected, attempting reconnect...
[2025-10-23 14:33:02] INFO  Server 'chrome' reconnected successfully
```

---

## CLI Commands Reference

### `mcp2rest init`
Initialize configuration directory and default config.

```bash
mcp2rest init
```

Creates `~/.mcp2rest/config.yaml` with defaults.

### `mcp2rest start`
Start the gateway daemon.

```bash
mcp2rest start [-c <config-path>]
```

**Behavior:**
- Forks to background
- Writes PID to `~/.mcp2rest/gateway.pid`
- Connects to all servers in config
- Exits if already running

### `mcp2rest stop`
Stop the running gateway daemon.

```bash
mcp2rest stop
```

**Behavior:**
- Reads PID from file
- Sends SIGTERM (graceful shutdown)
- Waits up to 10s, then SIGKILL
- Removes PID file

### `mcp2rest status`
Check if gateway is running.

```bash
mcp2rest status
```

**Output:**
```
Gateway is running (PID: 12345)
Servers: 2 connected, 0 disconnected
```

### `mcp2rest add <name> <package> [--args ...]`
Add a new MCP server (gateway must be running).

```bash
# Basic
mcp2rest add chrome chrome-devtools-mcp@latest

# With arguments
mcp2rest add chrome chrome-devtools-mcp@latest --args --headless=true --isolated=true

# Scoped package
mcp2rest add github @modelcontextprotocol/server-github

# With path argument
mcp2rest add fs @modelcontextprotocol/server-filesystem --args /home/user/workspace
```

**Behavior:**
1. Validates gateway is running
2. Checks server name not already in use
3. Updates config.yaml
4. Installs package via npx (shows progress)
5. Connects server in running gateway
6. Returns success/error

### `mcp2rest remove <name>`
Remove a server (gateway must be running).

```bash
mcp2rest remove chrome
```

**Behavior:**
1. Disconnects server gracefully
2. Updates config.yaml
3. Removes from running gateway

### `mcp2rest list`
List all servers and their status.

```bash
mcp2rest list
```

**Output:**
```
Servers:
  ✓ chrome      (chrome-devtools-mcp@latest)    26 tools
  ✗ filesystem  (@modelcontextprotocol/server-filesystem)  Error: Connection refused
```

### `mcp2rest tools <name>`
List all tools for a specific server.

```bash
mcp2rest tools chrome
```

**Output:**
```
Tools for 'chrome' (26 total):
  - navigate              Navigate to a URL
  - screenshot            Take a screenshot
  - click                 Click an element
  - type                  Type text into an element
  ...
```

### `mcp2rest config`
Show config file location and contents.

```bash
mcp2rest config
```

---

## Project Structure

```
mcp2rest/
├── package.json
├── tsconfig.json
├── README.md
├── LICENSE
├── .gitignore
├── .npmignore
├── bin/
│   └── mcp2rest.js          # Entry point for npm global (shebang)
├── src/
│   ├── gateway.ts              # Core Gateway class
│   ├── server.ts               # Express REST API
│   ├── cli.ts                  # Commander.js CLI implementation
│   ├── daemon.ts               # Process management (fork/kill/status)
│   ├── config.ts               # YAML config read/write
│   ├── logger.ts               # Logging utility
│   └── types.ts                # TypeScript interfaces
├── config/
│   └── example.yaml            # Example configuration
└── dist/                       # Compiled TypeScript output (gitignored)
```

---

## Dependencies

### Production Dependencies
```json
{
  "express": "^4.18.2",
  "commander": "^11.0.0",
  "js-yaml": "^4.1.0",
  "@modelcontextprotocol/sdk": "^0.5.0",
  "winston": "^3.11.0"
}
```

### Development Dependencies
```json
{
  "typescript": "^5.3.0",
  "@types/node": "^20.0.0",
  "@types/express": "^4.17.21",
  "tsx": "^4.7.0"
}
```

---

## Implementation Phases

### Phase 1: Core Gateway (Days 1-3)
**Goal:** Basic gateway with manual config

- [x] Project setup (TypeScript, npm package structure)
- [x] Config loading from YAML
- [x] Gateway class: connect to servers from config
- [x] Tool execution logic with timeout (30s global)
- [x] Basic error handling

**Milestone:** Can call tools via code, no CLI/API yet.

### Phase 2: REST API (Days 4-5)
**Goal:** HTTP interface working

- [x] Express server setup
- [x] Implement all 6 endpoints
- [x] Error response standardization
- [x] Request validation
- [x] Health check endpoint

**Milestone:** Can add servers and call tools via curl.

### Phase 3: CLI (Days 6-8)
**Goal:** Full CLI experience

- [x] Commander.js integration
- [x] Daemon process management (start/stop/status)
- [x] Dynamic add/remove commands
- [x] List and tools commands
- [x] Hot-reload mechanism (send signal to daemon)

**Milestone:** End-to-end CLI workflow works.

### Phase 4: Polish & Ship (Days 9-10)
**Goal:** Production-ready npm package

- [x] Comprehensive logging
- [x] Auto-reconnect with exponential backoff
- [x] README with examples
- [x] npm packaging and global install testing
- [x] Edge case handling (concurrent adds, config corruption, etc.)

**Milestone:** Published to npm, ready for users.

---

## Technical Decisions (Finalized)

### ✅ Hot-Reload Requirement
**Decision:** `mcp2rest add/remove` requires gateway to be running.

**Rationale:**
- Better developer experience (immediate feedback)
- Config and runtime state stay in sync
- No restart needed for server changes

**Implementation:**
- CLI commands send HTTP requests to running gateway
- Gateway updates config.yaml after successful operation
- If gateway not running, CLI shows error: "Gateway not running. Start with 'mcp2rest start'"

### ✅ Tool Execution Timeout
**Decision:** 30s global timeout (configurable in config.yaml).

**Rationale:**
- Simple for MVP (one setting to tune)
- Prevents hung requests on dev laptop
- Per-tool timeout can be added post-MVP if needed

**Implementation:**
```typescript
const timeout = this.config.gateway.timeout || 30000;
const result = await Promise.race([
  this.callToolInternal(server, tool, args),
  this.timeoutPromise(timeout)
]);
```

### ✅ Server Package Installation
**Decision:** Use `npx` for dynamic package resolution.

**Rationale:**
- Leverages npm's package ecosystem
- No need to bundle MCP servers
- Users can use any version/fork

**Trade-off:** First `add` command is slow (downloads package). Acceptable for MVP.

### ✅ Configuration Persistence
**Decision:** YAML file at `~/.mcp2rest/config.yaml` is source of truth.

**Rationale:**
- Human-readable and editable
- Git-friendly for version control
- Easy to backup/share across machines

**Trade-off:** Must handle concurrent writes (use file locking or queue writes).

### ✅ Logging Destination
**Decision:** Console output for dev laptop (stdout/stderr).

**Rationale:**
- Simple for debugging
- Easy to pipe to file if needed: `mcp2rest start > ~/gateway.log 2>&1`
- Production users can redirect as needed

---

## Risk Management

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|-----------|
| npx package install slow (10-30s) | Medium | High | Show progress spinner, cache packages locally |
| Multiple simultaneous `add` commands | High | Low | Queue operations, process serially |
| Config file corruption | High | Low | Validate YAML on load, backup before write |
| MCP server crashes frequently | High | Medium | Auto-reconnect with backoff, clear status reporting |
| Gateway process crashes | Medium | Low | Acceptable for MVP (PID cleanup on next start) |
| Tool execution blocks event loop | Medium | Low | Use async/await properly, hard timeout prevents hangs |
| Breaking changes in MCP SDK | Medium | Low | Pin SDK version in package.json |

---

## Success Metrics

### MVP Launch Criteria
- ✅ Install via `npm install -g mcp2rest` works
- ✅ Can add/remove servers without gateway restart
- ✅ Tool execution completes with <100ms gateway overhead
- ✅ Gateway survives MCP server crashes (auto-reconnect works)
- ✅ All CLI commands have help text
- ✅ README includes quickstart guide

### Post-Launch (Month 1)
- 100+ npm downloads
- 5+ GitHub stars
- 0 critical bugs reported
- Documentation for 3+ common MCP servers

---

## Future Enhancements (Post-MVP)

### Authentication & Security
- API key authentication
- Per-server access control
- TLS support

### Scalability
- WebSocket support for streaming results
- Per-tool timeout overrides
- Connection pooling for high concurrency

### Developer Experience
- Client libraries (Python, Go, Rust)
- OpenAPI spec generation
- Interactive web dashboard

### Observability
- Metrics export (Prometheus)
- Distributed tracing
- Tool execution analytics

---

## Appendix: Usage Examples

### Example 1: Browser Automation
```bash
# Setup
mcp2rest init
mcp2rest start
mcp2rest add chrome chrome-devtools-mcp@latest

# Use from Python
curl -X POST http://localhost:3000/call \
  -H "Content-Type: application/json" \
  -d '{
    "server": "chrome",
    "tool": "navigate",
    "arguments": {"url": "https://example.com"}
  }'

curl -X POST http://localhost:3000/call \
  -H "Content-Type: application/json" \
  -d '{
    "server": "chrome",
    "tool": "screenshot",
    "arguments": {}
  }'
```

### Example 2: File System Operations
```bash
# Add filesystem server
mcp2rest add fs @modelcontextprotocol/server-filesystem --args /home/user/workspace

# List files
curl http://localhost:3000/call \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "server": "fs",
    "tool": "list_directory",
    "arguments": {"path": "/"}
  }'
```

### Example 3: Multi-Server Setup
```bash
# Add multiple servers
mcp2rest add chrome chrome-devtools-mcp@latest
mcp2rest add github @modelcontextprotocol/server-github
mcp2rest add fs @modelcontextprotocol/server-filesystem --args ~/projects

# List all
mcp2rest list

# Check tools for each
mcp2rest tools chrome
mcp2rest tools github
mcp2rest tools fs
```

---

## Questions & Answers

**Q: Why not use WebSockets instead of REST?**  
A: REST is simpler for MVP and works with any HTTP client. WebSockets can be added post-MVP for streaming.

**Q: Can I run multiple gateway instances?**  
A: Not in MVP (single PID file). Clustering can be added later if needed.

**Q: How do I secure the gateway?**  
A: For dev laptop, no auth needed. Production users should put gateway behind reverse proxy (nginx) with auth.

**Q: What if two clients call the same tool simultaneously?**  
A: MCP protocol supports concurrent calls. Gateway doesn't queue. If issues arise, we'll add per-server queuing.

**Q: Can I edit config.yaml manually?**  
A: Yes, but you must restart gateway (`mcp2rest stop && mcp2rest start`) for changes to take effect. Use CLI for hot-reload.

---

## Glossary

- **MCP Server**: A process that implements the Model Context Protocol, exposing tools and resources
- **Gateway**: The mcp2rest daemon process
- **Tool**: A function exposed by an MCP server (e.g., `navigate`, `screenshot`)
- **Hot-Reload**: Adding/removing servers without restarting the gateway
- **npx**: Node package runner that installs and executes packages on-demand

---

**Document Version:** 1.0  
**Last Updated:** October 23, 2025  
**Next Review:** Post-MVP launch (Week 3)
