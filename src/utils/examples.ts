// The .asm programs in examples/, bundled into the app: Vite reads them at build time,
// so a new file in examples/ shows up in the Examples list without changing any code.

export type Example = { name: string; code: string }; // name = file name without ".asm"

const files = import.meta.glob<string>("../../examples/*.asm", {
  query: "?raw",
  import: "default",
  eager: true,
});

export const EXAMPLES: Example[] = Object.entries(files)
  .map(([path, code]) => ({
    name: path.slice(path.lastIndexOf("/") + 1).replace(/\.asm$/, ""),
    code: code.replace(/\r\n?/g, "\n"), // textarea uses "\n" only
  }))
  .sort((a, b) => a.name.localeCompare(b.name));
