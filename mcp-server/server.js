import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { spawn } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = join(__dirname, "..");   // C:\Users\jwpmi\source\repos\DiskCleanUp

const server = new Server(
  { name: "diskcleaup-runner", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// ── Tool definitions ──────────────────────────────────────────
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "dotnet_command",
      description:
        "Run any dotnet CLI command in the DiskCleanUp project directory. " +
        "Examples: 'build', 'run', 'build --configuration Release'. " +
        "Returns stdout, stderr, and exit code.",
      inputSchema: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "dotnet subcommand + args (e.g. 'build', 'run', 'build --no-restore')",
          },
        },
        required: ["command"],
      },
    },
    {
      name: "powershell_command",
      description:
        "Run a PowerShell command in the DiskCleanUp project directory. " +
        "Use for file ops, process management, or anything dotnet can't do. " +
        "Returns stdout, stderr, and exit code.",
      inputSchema: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "PowerShell command string to execute",
          },
        },
        required: ["command"],
      },
    },
  ],
}));

// ── Tool handlers ─────────────────────────────────────────────
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "dotnet_command") {
    return await runDotnet(args.command);
  }

  if (name === "powershell_command") {
    return await runPowerShell(args.command);
  }

  return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
});

// ── Runners ───────────────────────────────────────────────────
async function runDotnet(command) {
  const parts = command.split(" ");
  const start = Date.now();
  const result = await runProcess("dotnet", parts, PROJECT_DIR);
  const duration = ((Date.now() - start) / 1000).toFixed(2);

  return {
    content: [{
      type: "text",
      text:
        `## dotnet ${command} (${duration}s)\n\n` +
        `**Exit Code:** ${result.exitCode}\n\n` +
        `### Output:\n\`\`\`\n${result.stdout}\n\`\`\`` +
        (result.stderr ? `\n\n### Stderr:\n\`\`\`\n${result.stderr}\n\`\`\`` : ""),
    }],
    isError: result.exitCode !== 0,
  };
}

async function runPowerShell(command) {
  const start = Date.now();
  const result = await runProcess("powershell", ["-NoProfile", "-Command", command], PROJECT_DIR);
  const duration = ((Date.now() - start) / 1000).toFixed(2);

  return {
    content: [{
      type: "text",
      text:
        `## PowerShell (${duration}s)\n\n` +
        `**Exit Code:** ${result.exitCode}\n\n` +
        `### Output:\n\`\`\`\n${result.stdout}\n\`\`\`` +
        (result.stderr ? `\n\n### Stderr:\n\`\`\`\n${result.stderr}\n\`\`\`` : ""),
    }],
    isError: result.exitCode !== 0,
  };
}

function runProcess(command, args, cwd) {
  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      cwd,
      shell: true,
      env: { ...process.env, FORCE_COLOR: "0" },
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (d) => { stdout += d.toString(); });
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("close", (exitCode) => resolve({ stdout, stderr, exitCode }));
    proc.on("error", (err) => resolve({ stdout, stderr: err.message, exitCode: 1 }));
  });
}

// ── Start ─────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
