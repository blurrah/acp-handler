/**
 * MCP (Model Context Protocol) tools for acp-handler
 *
 * This module provides tool definitions and handlers to expose your acp-handler
 * checkout API as MCP tools for ChatGPT Apps. This allows merchants to sell
 * products through ChatGPT without waiting for ACP approval.
 *
 * @example Basic usage
 * ```typescript
 * import { McpServer } from 'mcp-handler';
 * import { tools, createHandlers } from 'acp-handler/mcp';
 *
 * const server = new McpServer({ name: 'my-store' });
 * const handlers = createHandlers({ baseUrl: 'https://mystore.com' });
 *
 * // Register all tools
 * server.registerTool('search_products', tools.searchProducts, handlers.searchProducts);
 * server.registerTool('create_checkout', tools.createCheckout, handlers.createCheckout);
 * server.registerTool('complete_checkout', tools.completeCheckout, handlers.completeCheckout);
 *
 * server.start();
 * ```
 *
 * @example With customization
 * ```typescript
 * import { McpServer } from 'mcp-handler';
 * import { tools, createHandlers } from 'acp-handler/mcp';
 *
 * const server = new McpServer({ name: 'my-store' });
 * const handlers = createHandlers({
 *   baseUrl: 'https://mystore.com',
 *   headers: { 'Authorization': 'Bearer secret' }
 * });
 *
 * // Customize tool definitions
 * server.registerTool(
 *   'search_products',
 *   {
 *     ...tools.searchProducts,
 *     description: 'Search our awesome product catalog!',
 *     _meta: {
 *       'openai/outputTemplate': 'ui://widget/custom-products.html'
 *     }
 *   },
 *   handlers.searchProducts
 * );
 *
 * // Or use custom handler logic
 * server.registerTool(
 *   'create_checkout',
 *   tools.createCheckout,
 *   async (input) => {
 *     // Custom logic before calling API
 *     console.log('Creating checkout:', input);
 *     const result = await handlers.createCheckout(input);
 *     // Custom logic after
 *     return result;
 *   }
 * );
 * ```
 *
 * @module mcp
 */

export { createHandlers, type HandlerConfig, type Handlers } from "./handlers";
export type { MCPToolDefinition } from "./tools";
export { tools } from "./tools";
