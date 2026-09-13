/**
 * The agent-facing server.
 *
 * A thin client over the API: every tool is a call to a route, no rule is
 * reimplemented here, and nothing reaches the database. What an agent may do is
 * decided by the scopes on its token and by nothing in this package.
 *
 * Filled by the agent access epic.
 */
export const MCP_PACKAGE = "@layered/mcp" as const;
