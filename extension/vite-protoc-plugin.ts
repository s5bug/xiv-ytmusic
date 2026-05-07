import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { platform } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";
import type { Plugin } from "vite";

const execFileAsync = promisify(execFile);

export default function protocPlugin(): Plugin {
  const prefix = "@proto/";
  const protoSrc = resolve(process.cwd(), "../protobuf");
  const outDir = resolve(process.cwd(), "./.proto");

  const nocheckHeader = "// @ts-nocheck\n\n";

  return {
    name: "vite-plugin-protoc",
    enforce: "pre",

    async buildStart() {
      // await rm(outDir, { recursive: true, force: true }).catch(() => {});
      await mkdir(outDir, { recursive: true });
    },

    resolveId(id: string) {
      if (id.startsWith(prefix)) {
        return resolve(outDir, `${id.substring(prefix.length)}.ts`);
      }
      return undefined;
    },

    async load(id: string) {
      if (!id.startsWith(outDir)) return undefined;

      const relativePath = id.slice(outDir.length + 1);
      const protoPath = relativePath.replace(/\.ts$/, ".proto");

      const tsFile = resolve(outDir, relativePath);
      const protoFile = resolve(protoSrc, protoPath);

      try {
        await access(protoFile, fs.constants.R_OK);
      } catch {
        // original proto doesn't exist
        return undefined;
      }

      this.addWatchFile(protoFile);

      const binExt = platform() === "win32" ? ".cmd" : "";

      const tsproto = resolve(process.cwd(), `./node_modules/.bin/protoc-gen-ts_proto${binExt}`);

      try {
        await mkdir(outDir, { recursive: true });

        const args = [
          "protoc",
          `--proto_path=${protoSrc}`,
          `--plugin=protoc-gen-ts_proto=${tsproto}`,
          "--ts_proto_opt=outputClientImpl=grpc-web",
          `--ts_proto_out=${outDir}`,
          `${protoFile}`,
        ] as const;
        console.log(`[vite-plugin-protoc] Running command \`${args.join(" ")}\`...`);
        await execFileAsync(args[0], args.slice(1));

        // now we read the file and prepend `// @ts-nocheck` if needed
        const tsContents = await readFile(tsFile, "utf-8");

        if (!tsContents.startsWith(nocheckHeader)) {
          await writeFile(tsFile, nocheckHeader + tsContents, "utf-8");
        }

        // return undefined because the file exists now
        return undefined;
      } catch (e) {
        console.error(`[vite-plugin-protoc] Error compiling ${protoFile}`, e);
        throw e;
      }
    },
  };
}
