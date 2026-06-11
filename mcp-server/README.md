# feature: DiskCleanUp MCP Server

Gives Claude Desktop a `dotnet_command` and `powershell_command` tool scoped to this project.

## Setup (one time)

```powershell
cd mcp-server
npm install
```

## Registration

The `.vscode/mcp.json` file registers the server with Claude Desktop automatically when you open this project.

## Tools

| Tool | Example |
|------|---------|
| `dotnet_command` | `build`, `run`, `build --configuration Release` |
| `powershell_command` | `Get-Process`, `Remove-Item .\bin -Recurse` |

---
_TODO: one paragraph describing the single responsibility of this file._
docid: 300.7.mcp-server-readme
id: feature-diskcleanup-mcp-server
title: feature: DiskCleanUp MCP Server
project: DiskCleanUp
description: Gives Claude Desktop a dotnetcommand and powershellcommand tool scoped to this project.
status: active
tags: [claude, desktop, diskcleanup, dotnetcommand, feature, getting, gives, mcp, powershellcommand, project, readme, scoped, server, started, tool]
category: 300.7 — Getting Started
created: 2026-02-22
updated: 2026-04-27
version: 1.0.0
author: CieloVista Software
relativepath: mcp-server/README.md
---