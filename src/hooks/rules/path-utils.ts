import { relative, resolve } from "@std/path";

/**
 * パスがカレントディレクトリ以下かを確認する
 * @param targetPath 確認したいパス
 * @param currentDir カレントディレクトリ（未指定時はprocess.cwd()）
 * @returns カレントディレクトリ以下の場合true
 */
export function isWithinCurrentDirectory(
  targetPath: string,
  currentDir?: string,
): boolean {
  const cwd = currentDir || Deno.cwd();

  // 絶対パスに変換
  const absoluteTarget = resolve(cwd, targetPath);
  const absoluteCwd = resolve(cwd);

  // 相対パスを計算
  const relativePath = relative(absoluteCwd, absoluteTarget);

  // ".." で始まる場合は親ディレクトリに向かっている
  // 絶対パスで始まる場合も外部パス
  return !relativePath.startsWith("..") && !relativePath.startsWith("/");
}

/**
 * 引数からパスを抽出する（オプション引数も含む）
 * @param args コマンド引数
 * @returns 抽出されたパス一覧
 */
export function extractPathsFromArgs(args: string[]): string[] {
  const paths: string[] = [];

  for (const arg of args) {
    if (arg.startsWith("-")) {
      // 全ての = 含むオプションをチェック
      const generalPattern = /^-[^=]*=(.+)$/;
      const match = arg.match(generalPattern);
      if (match && isPathLike(match[1])) {
        paths.push(match[1]);
      }
    } else {
      // 通常の引数でパスっぽいもの
      if (isPathLike(arg)) {
        paths.push(arg);
      }
    }
  }

  return paths;
}

/**
 * 文字列がパスっぽいかを判定
 * @param str 判定する文字列
 * @returns パスっぽい場合true
 */
function isPathLike(str: string): boolean {
  return (
    str.includes("/") ||
    str.includes("\\") ||
    str === "." ||
    str === ".." ||
    str.startsWith("~") ||
    str.startsWith("./") ||
    str.startsWith("../") ||
    str.includes(".") // ファイル拡張子を含む
  );
}

/**
 * コマンド引数からパスを抽出してカレントディレクトリ以下かチェック
 * @param args コマンド引数
 * @param currentDir カレントディレクトリ
 * @returns すべてのパスがカレントディレクトリ以下の場合true
 */
export function isAllPathsWithinCurrentDirectory(
  args: string[],
  currentDir?: string,
): boolean {
  const paths = extractPathsFromArgs(args);

  return paths.every((path) => isWithinCurrentDirectory(path, currentDir));
}

/**
 * 危険なパスパターンをチェック
 * @param path パス
 * @returns 危険なパスの場合true
 */
export function isDangerousPath(path: string): boolean {
  const dangerousPatterns = [
    "/", // ルートディレクトリ
    "/bin", // システムディレクトリ
    "/usr",
    "/etc",
    "/var",
    "/sys",
    "/proc",
    "/dev",
    "/home", // 他ユーザーのホーム
    "/root",
    "C:\\", // Windows
    "C:/",
  ];

  const normalizedPath = path.replace(/\\/g, "/");

  return dangerousPatterns.some((pattern) =>
    normalizedPath.startsWith(pattern) ||
    normalizedPath === pattern.slice(0, -1) // trailing slash除去版
  );
}

/**
 * コマンド引数から危険なパスを検出
 * @param args コマンド引数
 * @returns 危険なパス一覧
 */
export function findDangerousPathsInArgs(args: string[]): string[] {
  const paths = extractPathsFromArgs(args);
  return paths.filter(isDangerousPath);
}
