# mcp-cmd

MCP (Model Context Protocol) server for executing shell commands and managing their outputs.

## Features

This MCP server provides tools to execute shell commands and manage their outputs:

- **runCommand**: Execute shell commands and capture stdout/stderr with output ID
- **getStdoutById**: Retrieve stdout from a previous command execution 
- **getStderrById**: Retrieve stderr from a previous command execution

## Installation & Usage

### STDIO Mode

Run the MCP server in STDIO mode (for use with MCP clients):

```bash
deno run --allow-run --allow-read --allow-write --allow-sys jsr:@masinc/mcp-cmd/bin/stdio
```

To ensure you're running the latest version:

```bash
deno run --reload --allow-run --allow-read --allow-write --allow-sys jsr:@masinc/mcp-cmd/bin/stdio
```

### HTTP Mode

Run the MCP server as an HTTP server:

```bash
deno serve --allow-run --allow-read --allow-write --allow-sys jsr:@masinc/mcp-cmd/bin/http
```

To ensure you're running the latest version:

```bash
deno serve --reload --allow-run --allow-read --allow-write --allow-sys jsr:@masinc/mcp-cmd/bin/http
```

The HTTP server will be available at `http://localhost:8000/mcp`.

You can specify host and port:

```bash
# Custom port
deno serve --port 3000 --allow-run --allow-read --allow-write --allow-sys jsr:@masinc/mcp-cmd/bin/http

# Custom host and port
deno serve --host 0.0.0.0 --port 3000 --allow-run --allow-read --allow-write --allow-sys jsr:@masinc/mcp-cmd/bin/http
```

## MCP Tools

### runCommand

Execute a shell command and capture both stdout and stderr. Returns an output ID that can be used to retrieve the results later.

**Input:**
- `command`: The base command to execute (e.g. 'ls', 'curl', 'git', 'python', 'node')
- `args` (optional): Array of command-line arguments
- `stdin` (optional): Text input to send to the command's stdin
- `stdinForOutput` (optional): UUID of a previous command's output to use as stdin (enables command chaining)

**Output:**
- `id`: UUID output ID for retrieving results later
- `output`: Combined stdout/stderr output in chronological order

### getStdoutById

Retrieve the stdout (standard output) from a previously executed command using its output ID.

**Input:**
- `id`: The UUID output ID returned from a previous runCommand execution

**Output:**
- `content`: The stdout content (base64 encoded if binary data)
- `base64Encoded`: Boolean indicating if content is base64 encoded

### getStderrById

Retrieve the stderr (standard error) from a previously executed command using its output ID.

**Input:**
- `id`: The UUID output ID returned from a previous runCommand execution

**Output:**
- `content`: The stderr content (base64 encoded if binary data)
- `base64Encoded`: Boolean indicating if content is base64 encoded

## Key Features

- **Binary Data Support**: Automatically detects and base64 encodes binary output
- **Command Chaining**: Use output from one command as input to another via `stdinForOutput`
- **Chronological Output**: stdout/stderr mixed in correct time order for display
- **Persistent Storage**: Command outputs stored in SQLite database with automatic cleanup
- **Cross-Platform**: Works on Linux, macOS, and Windows

## Requirements

- [Deno](https://deno.land/) runtime


## License

MIT