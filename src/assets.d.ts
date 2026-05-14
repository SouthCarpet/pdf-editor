// Vite asset URL imports. The `?url` suffix instructs Vite to emit the file
// to the dist directory and return its public URL as a string at runtime.
// Used for the bundled Recovery wordlist (top-1k.txt) so the dev server and
// production bundle both resolve the file path correctly.
declare module "*.txt?url" {
  const url: string;
  export default url;
}
