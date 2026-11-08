See @AGENTS.md for full project architecture, verification commands, and mandatory Graphify knowledge-graph rules:
1. **Search First**: Always check `graphify-out/wiki/index.md`, `graphify-out/GRAPH_REPORT.md`, or query the `graphify` MCP server (`query_graph`, `get_node`, `get_neighbors`, `shortest_path`) before broad codebase grepping.
2. **Test**: Run `node --test tests/characterization.test.js` after changes.
3. **Update Graph After Changes**: Always update `graphify-out/` (`/graphify . --update` + `graphify export html` + `graphify export wiki`) after modifying code or documentation.

