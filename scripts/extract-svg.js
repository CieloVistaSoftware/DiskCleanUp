#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

function printUsage() {
  console.log("Usage: node scripts/extract-svg.js <input.html> [output-dir]");
  console.log("Example: node scripts/extract-svg.js DiskCleanUp.Service/wwwroot/index.html");
}

async function ensureDirectory(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

function getDefaultOutputDir(inputPath) {
  const parsed = path.parse(inputPath);
  return path.join(parsed.dir, `${parsed.name}-svgs`);
}

function sanitizeSvg(svgMarkup) {
  return svgMarkup.trim() + "\n";
}

async function main() {
  const [, , inputArg, outputArg] = process.argv;

  if (!inputArg || inputArg === "--help" || inputArg === "-h") {
    printUsage();
    process.exit(inputArg ? 0 : 1);
  }

  const inputPath = path.resolve(inputArg);
  const outputDir = path.resolve(outputArg || getDefaultOutputDir(inputPath));

  let html;
  try {
    html = await fs.readFile(inputPath, "utf8");
  } catch (error) {
    console.error(`Failed to read input file: ${inputPath}`);
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  const matches = [...html.matchAll(/<svg\b[\s\S]*?<\/svg>/gi)];

  if (matches.length === 0) {
    console.log(`No SVG markup found in: ${inputPath}`);
    return;
  }

  await ensureDirectory(outputDir);

  for (let i = 0; i < matches.length; i += 1) {
    const svgMarkup = sanitizeSvg(matches[i][0]);
    const filename = `svg-${String(i + 1).padStart(3, "0")}.svg`;
    const filePath = path.join(outputDir, filename);
    await fs.writeFile(filePath, svgMarkup, "utf8");
  }

  console.log(`Extracted ${matches.length} SVG block(s).`);
  console.log(`Output directory: ${outputDir}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
