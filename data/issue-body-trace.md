## Problem

Running `tools/trace-server/server.js` via the FileList "Run" button (or `node server.js` directly) fails with:

```
ReferenceError: require is not defined in ES module scope
```

The root `package.json` has `"type": "module"`, which causes Node.js to treat **all** `.js` files in the repo as ES modules. `server.js` uses CommonJS (`require`, `__dirname`) and has no ES module equivalent.

## Fix (commit `TODO`)

Added `tools/trace-server/package.json`:

```json
{ "type": "commonjs" }
```

Node.js respects the **nearest** `package.json` when resolving module type. This local override scopes `server.js` back to CommonJS without touching the root config or renaming the file.
