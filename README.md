# mcp-cmd

MCP (Model Context Protocol) server for executing shell commands and managing
their outputs.

## Features

This MCP server provides tools to execute shell commands and manage their
outputs:

- **runCommand**: Execute shell commands asynchronously and capture
  stdout/stderr with output ID
- **getCommand**: Retrieve complete command results including status, exit code,
  stdout, stderr, and metadata

## Installation & Usage

### STDIO Mode

Run the MCP server in STDIO mode (for use with MCP clients):

```bash
deno run --allow-run --allow-read --allow-write --allow-sys --allow-env --allow-ffi --allow-net --unstable-worker-options jsr:@masinc/mcp-cmd/bin/stdio
```

To ensure you're running the latest version:

```bash
deno run --reload --allow-run --allow-read --allow-write --allow-sys --allow-env --allow-ffi --allow-net --unstable-worker-options jsr:@masinc/mcp-cmd/bin/stdio
```

### HTTP Mode

Run the MCP server as an HTTP server:

```bash
deno serve --allow-run --allow-read --allow-write --allow-sys --allow-env --allow-ffi --allow-net --unstable-worker-options jsr:@masinc/mcp-cmd/bin/http
```

To ensure you're running the latest version:

```bash
deno serve --reload --allow-run --allow-read --allow-write --allow-sys --allow-env --allow-ffi --allow-net --unstable-worker-options jsr:@masinc/mcp-cmd/bin/http
```

The HTTP server will be available at `http://localhost:8000/mcp`.

You can specify host and port:

```bash
# Custom port
deno serve --port 3000 --allow-run --allow-read --allow-write --allow-sys --allow-env --allow-ffi --allow-net --unstable-worker-options jsr:@masinc/mcp-cmd/bin/http

# Custom host and port
deno serve --host 0.0.0.0 --port 3000 --allow-run --allow-read --allow-write --allow-sys --allow-env --allow-ffi --allow-net --unstable-worker-options jsr:@masinc/mcp-cmd/bin/http
```

## MCP Tools

### runCommand

Execute a shell command and capture both stdout and stderr. Returns an output ID
that can be used to retrieve the results later.

**Input:**

- `command`: The base command to execute (e.g. 'ls', 'curl', 'git', 'python',
  'node')
- `args` (optional): Array of command-line arguments
- `stdin` (optional): Text input to send to the command's stdin
- `stdinForOutput` (optional): Output ID of a previous command's output to use
  as stdin (enables command chaining)

**Output:**

- `id`: 9-digit numeric output ID for retrieving results later
- `status`: "running" (command execution begins asynchronously)

### getCommand

Retrieve complete information about a command execution including status, exit
code, stdout, stderr, and metadata. This is the primary tool for checking
command results after running a command with runCommand.

**Input:**

- `id`: The 9-digit numeric output ID returned from a previous runCommand
  execution

**Output:**

- `id`: The command output ID
- `status`: Command execution status ("running", "completed", "failed")
- `exitCode`: Process exit code (null if still running)
- `hasOutput`: Boolean indicating if command has produced output
- `stdout`: Object containing stdout content and encoding information
  - `content`: The stdout content (base64 encoded if binary data)
  - `isEncoded`: Boolean indicating if content is base64 encoded
- `stderr`: Object containing stderr content and encoding information
  - `content`: The stderr content (base64 encoded if binary data)
  - `isEncoded`: Boolean indicating if content is base64 encoded
- `createdAt`: ISO timestamp when the command was started

## Architecture

### Worker Pool System

Commands are executed using a worker pool architecture for optimal performance:

- **Concurrent Execution**: Multiple commands can run simultaneously
- **Resource Management**: Configurable worker pool size based on CPU cores
- **Isolation**: Each command runs in a separate worker thread
- **Security**: Workers run with minimal required permissions

### Database Layer

- **Drizzle ORM**: Type-safe database operations with SQLite
- **Flexible Configuration**: File-based storage for production, in-memory for
  testing
- **Automatic Schema**: Database tables created automatically on startup
- **Data Lifecycle**: Expired command outputs automatically cleaned up

## Key Features

- **Asynchronous Execution**: Non-blocking command execution with worker pools
- **Command Chaining**: Pipe output from one command to another
- **Binary Data Support**: Automatic base64 encoding for binary output
- **Flexible Storage**: SQLite for production, in-memory for testing
- **Cross-Platform**: Linux, macOS, and Windows support
- **Comprehensive Testing**: Full test coverage with fast in-memory database

## Development

### Running Tests

The project includes comprehensive unit and integration tests:

```bash
# Run all tests
deno task test

# Run only unit tests
deno task test:unit

# Run only integration tests  
deno task test:integration
```

Tests use in-memory SQLite databases for fast, isolated execution.

### Database

- **Production**: SQLite database stored in `~/.config/@masinc/mcp-cmd/`
- **Testing**: In-memory SQLite database for fast, isolated tests
- **Cleanup**: Automatic removal of expired command outputs (1 day default)

## Hook Scripts

This project includes hook scripts for use with Claude Code:

### Available Hooks

- **pre-tool-use/bash.ts**: Blocks Bash tool usage and redirects to MCP cmd tool
- **pre-tool-use/cmd.ts**: Controls MCP cmd tool usage with command filtering
- **hooks-init.ts**: Initialize hook configuration files with presets and
  generate JSON Schema

### Initializing Hook Configuration

Use `hooks-init.ts` to create hook configuration files with predefined security
rules:

```bash
# Create project-local configuration with default security preset
deno run --allow-env --allow-read --allow-write src/bin/hooks-init.ts config --output project --preset default

# Create user-global configuration with development preset
deno run --allow-env --allow-read --allow-write src/bin/hooks-init.ts config --output user --preset development

# Output configuration to stdout (default)
deno run --allow-env --allow-read --allow-write src/bin/hooks-init.ts config --preset default

# Generate JSON Schema for configuration validation
deno run --allow-env --allow-read --allow-write src/bin/hooks-init.ts jsonschema

# View available options
deno run --allow-env --allow-read --allow-write src/bin/hooks-init.ts --help
```

#### Available Presets

- **default**: Comprehensive security rules (blocks dangerous commands, warns
  about shell expansion, etc.)
- **development**: Development-friendly rules (git warnings, database
  confirmations)
- **example**: Example configuration showing all rule types
- **empty**: Empty configuration (no rules)

#### Configuration Locations

- **Project-local**: `./.mcp-cmd/hooks-rules.yaml` (use `--output project`)
- **User-global**: `~/.config/@masinc/mcp-cmd/hooks-rules.yaml` (use
  `--output user`)
- **Stdout**: Output to console for piping or manual review (use
  `--output stdout` or omit for default)

The hook system automatically searches for configuration files in this order:

1. `~/.config/@masinc/mcp-cmd/hooks-rules.yaml`
2. `~/.config/@masinc/mcp-cmd/hooks-rules.yml`
3. `~/.config/@masinc/mcp-cmd/hooks-rules.json`
4. `./.mcp-cmd/hooks-rules.yaml`
5. `./.mcp-cmd/hooks-rules.yml`
6. `./.mcp-cmd/hooks-rules.json`

### Example Usage

Add to your Claude Code settings (`~/.claude.json`):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "/path/to/mcp-cmd/src/bin/pre-tool-use/bash.ts"
          }
        ]
      },
      {
        "matcher": "mcp__cmd__.*",
        "hooks": [
          {
            "type": "command",
            "command": "/path/to/mcp-cmd/src/bin/pre-tool-use/cmd.ts"
          }
        ]
      }
    ]
  }
}
```

## Requirements

- [Deno](https://deno.land/) runtime

## License

MIT
