import { Client } from '@modelcontextprotocol/sdk/client/index.js';

/**
 * Configuration for a single MCP server
 */
export interface ServerConfig {
  name: string;
  package: string;
  args?: string[];
}

/**
 * Runtime state of an MCP server connection
 */
export interface ServerState {
  config: ServerConfig;
  status: 'connected' | 'disconnected' | 'error' | 'reconnecting';
  client: Client | null;
  tools: Tool[];
  reconnectAttempts: number;
  lastError?: string;
  lastConnected?: Date;
}

/**
 * Tool definition from MCP server
 */
export interface Tool {
  name: string;
  description?: string;
  inputSchema: any;
}

/**
 * Gateway configuration structure
 */
export interface GatewayConfig {
  servers: Record<string, ServerConfig>;
  gateway: {
    port: number;
    host: string;
    timeout: number;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
  };
}

/**
 * Server information for API responses
 */
export interface ServerInfo {
  name: string;
  package: string;
  status: 'connected' | 'disconnected' | 'error' | 'reconnecting';
  toolCount: number;
  error?: string;
  lastConnected?: string;
}

/**
 * Process status information
 */
export interface ProcessStatus {
  running: boolean;
  pid?: number;
  uptime?: number;
}

/**
 * Error codes for standardized error handling
 */
export enum ErrorCode {
  // Server errors
  SERVER_NOT_FOUND = 'SERVER_NOT_FOUND',
  SERVER_DISCONNECTED = 'SERVER_DISCONNECTED',
  SERVER_ADD_FAILED = 'SERVER_ADD_FAILED',
  SERVER_ALREADY_EXISTS = 'SERVER_ALREADY_EXISTS',
  
  // Tool errors
  TOOL_NOT_FOUND = 'TOOL_NOT_FOUND',
  TOOL_EXECUTION_ERROR = 'TOOL_EXECUTION_ERROR',
  TOOL_TIMEOUT = 'TOOL_TIMEOUT',
  
  // Validation errors
  INVALID_ARGUMENTS = 'INVALID_ARGUMENTS',
  INVALID_CONFIG = 'INVALID_CONFIG',
  
  // System errors
  GATEWAY_ERROR = 'GATEWAY_ERROR',
  DAEMON_NOT_RUNNING = 'DAEMON_NOT_RUNNING'
}

/**
 * Tool execution response
 */
export interface ToolResponse {
  success: true;
  result: {
    content: Array<{
      type: string;
      text?: string;
      data?: any;
    }>;
  };
}

/**
 * Error response
 */
export interface ErrorResponse {
  error: {
    code: ErrorCode;
    message: string;
    serverName?: string;
    toolName?: string;
    details?: any;
  };
}
