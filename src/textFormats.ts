// Explicit fences are authoritative. Unfenced prose requires structural evidence.
// Highlighting supports the full highlight.js registry; detection stays conservative.
import { highlightLanguages } from "./highlightLanguages";
const definitions: Record<string, string[]> = {
  plaintext: ["txt", "text", "log"],
  markdown: ["md", "markdown", "mdown"],
  json: ["json", "jsonc", "ipynb", "geojson", "jsonl", "ndjson"],
  python: ["py", "pyw", "pyi", "python"],
  javascript: ["js", "mjs", "cjs", "javascript", "jsx"],
  typescript: ["ts", "tsx", "typescript", "mts", "cts"],
  css: ["css"],
  scss: ["scss"],
  less: ["less"],
  bash: ["sh", "bash", "zsh", "shell", "fish"],
  powershell: ["ps1", "psm1", "powershell"],
  shell: ["console", "shellsession"],
  xml: [
    "html",
    "htm",
    "xml",
    "svg",
    "xhtml",
    "vue",
    "svelte",
    "plist",
    "xsd",
    "xsl",
    "rss",
    "atom",
  ],
  yaml: ["yaml", "yml"],
  ini: ["ini", "toml", "conf", "properties", "cfg", "env"],
  sql: ["sql"],
  dockerfile: ["dockerfile", "docker"],
  makefile: ["makefile", "make", "mk"],
  cmake: ["cmake"],
  nginx: ["nginx"],
  apache: ["apache", "htaccess"],
  diff: ["diff", "patch"],
  c: ["c", "h"],
  cpp: ["cpp", "cc", "cxx", "hpp", "hxx"],
  csharp: ["cs", "csharp", "csx"],
  java: ["java"],
  kotlin: ["kt", "kts", "kotlin"],
  swift: ["swift"],
  go: ["go", "golang"],
  rust: ["rs", "rust"],
  ruby: ["rb", "ruby", "gemspec"],
  php: ["php", "php3", "php4", "php5"],
  r: ["r", "rscript"],
  lua: ["lua"],
  perl: ["pl", "pm", "perl"],
  dart: ["dart"],
  scala: ["scala", "sc"],
  groovy: ["groovy", "gradle"],
  clojure: ["clj", "cljs", "cljc", "edn"],
  elixir: ["ex", "exs", "elixir"],
  erlang: ["erl", "hrl", "erlang"],
  haskell: ["hs", "haskell"],
  ocaml: ["ml", "mli", "ocaml"],
  fsharp: ["fs", "fsx", "fsharp"],
  julia: ["jl", "julia"],
  matlab: ["matlab", "m"],
  fortran: ["f90", "f95", "fortran"],
  objectivec: ["mm", "objc", "objectivec"],
  assembly: ["asm", "s"],
  wasm: ["wat", "wasm"],
  graphql: ["graphql", "gql"],
  protobuf: ["proto", "protobuf"],
  thrift: ["thrift"],
  terraform: ["tf", "hcl", "terraform"],
  nix: ["nix"],
  vim: ["vim", "vimrc"],
  lisp: ["lisp", "lsp", "el"],
  scheme: ["scm", "ss", "scheme"],
  latex: ["tex", "latex", "sty", "bib"],
  asciidoc: ["adoc", "asciidoc"],
  rst: ["rst", "rest"],
  http: ["http", "https"],
  accesslog: ["accesslog"],
  csv: ["csv", "tsv"],
  mermaid: ["mmd", "mermaid"],
};
const aliases = new Map(
  Object.entries(definitions).flatMap(
    ([language, names]) =>
      [[language, language], ...names.map((name) => [name, language])] as [
        string,
        string,
      ][],
  ),
);
export function normalizeLanguage(name: string) {
  return (
    aliases.get(name.toLowerCase()) ||
    highlightLanguages[name.toLowerCase()] ||
    name.toLowerCase()
  );
}
export function languageForFile(name: string): string | undefined {
  const base = name.split(/[\\/]/).pop()?.toLowerCase() || "";
  if (/^(dockerfile)(\.|$)/.test(base)) return "dockerfile";
  if (/^(makefile|gnumakefile)$/.test(base)) return "makefile";
  if (/^(cmakelists\.txt|\.cmake)$/.test(base)) return "cmake";
  if (
    /^(\.env(?:\..+)?|\.gitignore|\.npmrc|\.editorconfig|\.gitconfig)$/.test(
      base,
    )
  )
    return "ini";
  const extension = base.split(".").pop() || "";
  return aliases.get(extension) || highlightLanguages[extension];
}
export type TextFormatDetection = {
  extension: string;
  language: string;
  content: string;
};
function result(extension: string, content: string): TextFormatDetection {
  return { extension, language: normalizeLanguage(extension), content };
}
export function detectTextFormat(
  text: string,
): TextFormatDetection | undefined {
  const code = text.trim();
  const fenced = code.match(
    /^(`{3,}|~{3,})([\w+#.-]+)[^\S\r\n]*\r?\n([\s\S]*?)\r?\n\1$/,
  );
  if (fenced) {
    const language = normalizeLanguage(fenced[2]);
    const extension =
      definitions[language]?.[0] ||
      (highlightLanguages[language] ? language : undefined);
    if (extension) return result(extension, fenced[3]);
  }
  if (/^[{[]/.test(code)) {
    try {
      const value = JSON.parse(code);
      if (value && typeof value === "object") return result("json", text);
    } catch {
      /* Other languages can start with a brace. */
    }
    if (/^\{\s*(?:\/\/[^\n]*\n\s*)?"[^"\n]+"\s*:/.test(code))
      return result("jsonc", text);
  }
  const lines = code.split(/\r?\n/);
  if (
    lines.length > 1 &&
    lines.every((line) => {
      try {
        return /^\s*\{/.test(line) && !!JSON.parse(line);
      } catch {
        return false;
      }
    })
  )
    return result("jsonl", text);
  if (/^#!.*\b(?:bash|sh|zsh|fish)\b/.test(code)) return result("sh", text);
  if (/^#!.*\bpython[\d.]*\b/.test(code)) return result("py", text);
  if (/^#!.*\bnode\b/.test(code)) return result("js", text);
  if (/^#!.*\bruby\b/.test(code)) return result("rb", text);
  if (/^<\?php\b/.test(code)) return result("php", text);
  if (
    /^(?:\s*#.*\n)*(?:FROM\s+\S+|ARG\s+\w+=)/.test(code) &&
    /^(?:RUN|COPY|WORKDIR|CMD|ENTRYPOINT)\s/m.test(code)
  )
    return result("dockerfile", text);
  if (/^diff --git |^@@ [-+]\d/m.test(code)) return result("diff", text);
  if (/^HTTP\/\d|^(?:GET|POST|PUT|DELETE|PATCH)\s+\/\S*\s+HTTP\//.test(code))
    return result("http", text);
  if (
    /^\s*(?:async\s+)?def\s+\w+\s*\([^\n]*\)\s*(?:->[^\n]+)?\s*:|^\s*(?:from\s+[\w.]+\s+import\s|import\s+[\w.]+\s*$|if\s+__name__\s*==)/m.test(
      code,
    )
  )
    return result("py", text);
  if (
    /^\s*(?:export\s+)?(?:interface\s+\w+|type\s+\w+(?:<[^>]+>)?\s*=|enum\s+\w+\s*\{)|\b(?:const|let)\s+\w+\s*:\s*(?:string|number|boolean|\w+\[\])/m.test(
      code,
    )
  )
    return result("ts", text);
  if (
    /<(?:[A-Z][\w.]*|div|span|button|main)\b[^>]*[\s\S]*\b(?:className=|onClick=|useState\(|return\s*\()/m.test(
      code,
    )
  )
    return result("jsx", text);
  if (
    /^\s*(?:export\s+)?(?:(?:const|let|var)\s+[\w${[][^\n]*=|(?:async\s+)?function\s+\w+\s*\(|import\s+.+\s+from\s+["']|import\s+["'])|\([^)]*\)\s*=>|\bconsole\.(?:log|error)\(/m.test(
      code,
    )
  )
    return result("js", text);
  if (
    /^(?:[^{}\n]+\{\s*\n?)\s*(?:--?[\w-]+|[\w-]+)\s*:\s*[^{};]+[;}]/m.test(
      code,
    ) &&
    /}/.test(code)
  )
    return result(code.includes("$") ? "scss" : "css", text);
  if (
    /^\s*(?:<!doctype\s+html|<(?:html|head|body|div|section|main|p|button|ul|table)\b)/i.test(
      code,
    ) &&
    /<\/[\w:-]+\s*>/i.test(code)
  )
    return result("html", text);
  if (
    /^\s*(?:<\?xml\b|<svg\b)/.test(code) ||
    /^\s*<([\w:-]+)[^>]*>[\s\S]*<\/\1\s*>\s*$/.test(code)
  )
    return result("xml", text);
  if (
    /^\s*(?:SELECT\b[\s\S]*\bFROM\b|CREATE\s+(?:TABLE|INDEX|VIEW)\b|INSERT\s+INTO\b|UPDATE\s+\w+\s+SET\b|DELETE\s+FROM\b|ALTER\s+TABLE\b)/i.test(
      code,
    )
  )
    return result("sql", text);
  if (/^\s*package\s+\w+/m.test(code) && /\bfunc\s+\w+\s*\(/.test(code))
    return result("go", text);
  if (/^\s*(?:pub\s+)?(?:async\s+)?fn\s+\w+\s*\(|^\s*use\s+\w+::/m.test(code))
    return result("rs", text);
  if (
    /^\s*(?:public\s+)?(?:final\s+)?class\s+\w+|^\s*import\s+java\./m.test(
      code,
    ) &&
    /[{};]/.test(code)
  )
    return result("java", text);
  if (/^\s*(?:using\s+System\b|namespace\s+[\w.]+\s*[{;])/m.test(code))
    return result("cs", text);
  if (/^\s*#include\s*[<"]|\bint\s+main\s*\(/m.test(code))
    return result(/\bstd::|\bcout\s*<</.test(code) ? "cpp" : "c", text);
  if (/^\s*fun\s+\w+\s*\(|^\s*data\s+class\s/m.test(code))
    return result("kt", text);
  if (
    /^\s*import\s+(?:SwiftUI|Foundation|UIKit)\b|^\s*func\s+\w+\s*\([^\n]*\)\s*(?:->\s*\w+\s*)?\{/m.test(
      code,
    )
  )
    return result("swift", text);
  if (/^\s*def\s+\w+[^\n]*\n[\s\S]*^\s*end\s*$/m.test(code))
    return result("rb", text);
  if (
    /^\s*local\s+function\s+\w+|^\s*function\s+\w+\([^\n]*\)\s*\n[\s\S]*\bend\b/m.test(
      code,
    )
  )
    return result("lua", text);
  if (/^\s*\w+\s*<-\s*function\s*\(/m.test(code)) return result("r", text);
  if (/^\s*void\s+main\s*\([^\n]*\)\s*\{/m.test(code))
    return result("dart", text);
  if (/^\s*(?:query|mutation|subscription)\s+\w*[\s({]/m.test(code))
    return result("graphql", text);
  if (/^\s*syntax\s*=\s*["']proto[23]["']/.test(code))
    return result("proto", text);
  if (/^\s*(?:resource|provider|variable|terraform)\s+["'{]/m.test(code))
    return result("tf", text);
  if (
    /^\s*\$[A-Z]\w*\s*=|^\s*(?:Get|Set|New|Remove|Write)-[A-Z]\w+\b/m.test(code)
  )
    return result("ps1", text);
  if (
    /^\s*(?:curl|wget|git|npm|npx|pnpm|yarn|pip|pip3|python3?|node|docker|kubectl|sudo|ssh|chmod|mkdir|rm|cp|ls|cd)\s+(?:[-./~\w@][^\n]*)$/m.test(
      code,
    ) &&
    !/^[#>*] /m.test(code)
  )
    return result("sh", text);
  if (/^\s*(?:export\s+)?[A-Z_][A-Z_0-9]*=[^\n]*$/m.test(code))
    return result("env", text);
  if (/^\s*\[[\w.'"-]+\]\s*$/m.test(code) && /^[\w.-]+\s*=\s*.+/m.test(code))
    return result("toml", text);
  if (
    lines.filter((line) => /^\s*[\w.-]+:\s+(?!\/\/).+|^\s*-\s+\w+:/.test(line))
      .length >= 2 &&
    !/[{};]/.test(code)
  )
    return result("yaml", text);
  if (
    /^#{1,6}\s+\S|^\s*```|^>\s+\S|^\|.+\|\s*$|^\s*[-*+]\s+(?:\[[ xX]\]\s+)?\S|^\d+\.\s+\S/m.test(
      code,
    ) ||
    /\*\*[^*\n]+\*\*|\[[^\]\n]+\]\(https?:\/\/[^)]+\)/.test(code)
  )
    return result("md", text);
  if (
    lines.length >= 2 &&
    lines.every(
      (line) => line.split(",").length === lines[0].split(",").length,
    ) &&
    lines[0].split(",").length >= 3
  )
    return result("csv", text);
}
