import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn, ChildProcess } from 'child_process';
import { ConfigManager } from '../config/ConfigManager.js';
import { 
  ServerState, 
  ServerConfig, 
  GatewayConfig, 
  Tool, 
  ServerInfo,
  ErrorCode 
} from '../types/index.js';

/**
 * Core Gateway class that manages MCP server connections and tool execution
 */
export class Gateway {
  private servers: Map<string, ServerState>;
  private config: GatewayConfig;
  private configManager: ConfigManager;

  constructor(configManager: ConfigManager) {
    this.servers = new Map();
    this.configManager = configManager;
    this.config = configManager.getDefaultConfig();
  }

  /**
   * Initialize the gateway by loading configuration and connecting to all servers
   */
  async initialize(): Promise<void> {
    console.log('Initializing MCP Gateway...');
    
    // Load configuration
    this.config = await this.configManager.load();
    console.log(`Configuration loaded from ${this.configManager.getConfigPath()}`);
    
    // Connect to all configured servers
    const serverNames = Object.keys(this.config.servers);
    console.log(`Found ${serverNames.length} server(s) in configuration`);
    
    for (const name of serverNames) {
      const serverConfig = this.config.servers[name];
      try {
        await this.connectServer(name, serverConfig);
      } catch (error: any) {
        console.error(`Failed to connect to server '${name}': ${error.message}`);
      }
    }
    
    console.log('Gateway initialization complete');
  }

  /**
   * Connect to an MCP server
   */
  private async connectServer(name: string, serverConfig: ServerConfig): Promise<void> {
    console.log(`Connecting to server '${name}' (${serverConfig.package})...`);
    
    // Initialize server state
    const serverState: ServerState = {
      config: serverConfig,
      status: 'disconnected',
      client: null,
      tools: [],
      reconnectAttempts: 0
    };
    
    this.servers.set(name, serverState);
    
    try {
      // Spawn MCP server process using npx
      const args = [serverConfig.package, ...(serverConfig.args || [])];
      const serverProcess = spawn('npx', args, {
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      // Create MCP client with stdio transport
      const transport = new StdioClientTransport({
        command: 'npx',
        args: args
      });
      
      const client = new Client({
        name: 'mcp2rest',
        version: '0.1.0'
      }, {
        capabilities: {}
      });
      
      // Connect client to transport
      await client.connect(transport);
      
      // List available tools
      const toolsResponse = await client.listTools();
      const tools: Tool[] = toolsResponse.tools.map((tool: any) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema
      }));
      
      // Update server state
      serverState.client = client;
      serverState.tools = tools;
      serverState.status = 'connected';
      serverState.lastConnected = new Date();
      serverState.reconnectAttempts = 0;
      
      console.log(`✓ Connected to server '${name}' with ${tools.length} tool(s)`);
      
    } catch (error: any) {
      serverState.status = 'error';
      serverState.lastError = error.message;
      console.error(`✗ Failed to connect to server '${name}': ${error.message}`);
      throw error;
    }
  }

  /**
   * Call a tool on a specific MCP server
   */
  async callTool(serverName: string, toolName: string, args: any): Promise<any> {
    // Look up server by name
    const serverState = this.servers.get(serverName);
    
    if (!serverState) {
      throw new Error(`${ErrorCode.SERVER_NOT_FOUND}: Server '${serverName}' not found`);
    }
    
    if (serverState.status !== 'connected' || !serverState.client) {
      throw new Error(`${ErrorCode.SERVER_DISCONNECTED}: Server '${serverName}' is not connected`);
    }
    
    // Create timeout promise
    const timeout = this.config.gateway.timeout || 30000;
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`${ErrorCode.TOOL_TIMEOUT}: Tool execution exceeded ${timeout}ms timeout`));
      }, timeout);
    });
    
    // Execute tool with timeout
    try {
      console.log(`Executing tool '${toolName}' on server '${serverName}'...`);
      
      const executionPromise = serverState.client.callTool({
        name: toolName,
        arguments: args
      });
      
      const result = await Promise.race([executionPromise, timeoutPromise]);
      
      console.log(`✓ Tool '${toolName}' executed successfully on server '${serverName}'`);
      return result;
      
    } catch (error: any) {
      console.error(`✗ Tool execution failed: ${error.message}`);
      
      // Check if it's a timeout error
      if (error.message.includes(ErrorCode.TOOL_TIMEOUT)) {
        throw error;
      }
      
      throw new Error(`${ErrorCode.TOOL_EXECUTION_ERROR}: ${error.message}`);
    }
  }

  /**
   * Get information about all servers
   */
  getServerInfo(): ServerInfo[] {
    const serverInfoList: ServerInfo[] = [];
    
    for (const [name, state] of this.servers.entries()) {
      serverInfoList.push({
        name,
        package: state.config.package,
        status: state.status,
        toolCount: state.tools.length,
        error: state.lastError,
        lastConnected: state.lastConnected?.toISOString()
      });
    }
    
    return serverInfoList;
  }

  /**
   * Get tools for a specific server
   */
  getServerTools(serverName: string): Tool[] {
    const serverState = this.servers.get(serverName);
    
    if (!serverState) {
      throw new Error(`${ErrorCode.SERVER_NOT_FOUND}: Server '${serverName}' not found`);
    }
    
    return serverState.tools;
  }

  /**
   * Add a new server dynamically
   */
  async addServer(name: string, pkg: string, args?: string[]): Promise<void> {
    // Check if server already exists
    if (this.servers.has(name)) {
      throw new Error(`${ErrorCode.SERVER_ALREADY_EXISTS}: Server '${name}' already exists`);
    }
    
    const serverConfig: ServerConfig = {
      name,
      package: pkg,
      args
    };
    
    try {
      // Add to configuration file
      await this.configManager.addServer(name, serverConfig);
      
      // Connect to the server
      await this.connectServer(name, serverConfig);
      
      console.log(`✓ Server '${name}' added successfully`);
      
    } catch (error: any) {
      console.error(`✗ Failed to add server '${name}': ${error.message}`);
      throw new Error(`${ErrorCode.SERVER_ADD_FAILED}: ${error.message}`);
    }
  }

  /**
   * Remove a server
   */
  async removeServer(name: string): Promise<void> {
    const serverState = this.servers.get(name);
    
    if (!serverState) {
      throw new Error(`${ErrorCode.SERVER_NOT_FOUND}: Server '${name}' not found`);
    }
    
    try {
      // Disconnect client if connected
      if (serverState.client) {
        await serverState.client.close();
      }
      
      // Remove from servers map
      this.servers.delete(name);
      
      // Remove from configuration
      await this.configManager.removeServer(name);
      
      console.log(`✓ Server '${name}' removed successfully`);
      
    } catch (error: any) {
      console.error(`✗ Failed to remove server '${name}': ${error.message}`);
      throw error;
    }
  }

  /**
   * Shutdown the gateway and disconnect all servers
   */
  async shutdown(): Promise<void> {
    console.log('Shutting down MCP Gateway...');
    
    for (const [name, state] of this.servers.entries()) {
      if (state.client) {
        try {
          await state.client.close();
          console.log(`✓ Disconnected from server '${name}'`);
        } catch (error: any) {
          console.error(`✗ Error disconnecting from server '${name}': ${error.message}`);
        }
      }
    }
    
    this.servers.clear();
    console.log('Gateway shutdown complete');
  }
}
