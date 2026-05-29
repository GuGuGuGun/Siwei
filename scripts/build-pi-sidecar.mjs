import { copyFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execPath } from 'node:process'

const targetTriple = process.env.TAURI_ENV_TARGET_TRIPLE ?? 'x86_64-pc-windows-msvc'
const isWindows = targetTriple.includes('windows')
const outputName = `siwei-pi-agent-sidecar-${targetTriple}${isWindows ? '.exe' : ''}`
const nodeRuntimeName = `siwei-node-runtime-${targetTriple}${isWindows ? '.exe' : ''}`
const outputDir = join('src-tauri', 'binaries')
const outputPath = join(outputDir, outputName)
const nodeRuntimePath = join(outputDir, nodeRuntimeName)

await mkdir(outputDir, { recursive: true })
await copyFile(execPath, nodeRuntimePath)

const tempDir = await mkdtemp(join(tmpdir(), 'siwei-pi-sidecar-'))
const launcherSourcePath = join(tempDir, 'siwei-pi-agent-sidecar-launcher.rs')
await writeFile(launcherSourcePath, launcherSource(), 'utf8')

execFileSync('rustc', [launcherSourcePath, '-O', '-o', outputPath], { stdio: 'inherit' })

console.info(`已生成 Pi Agent Core sidecar launcher: ${outputPath}`)
console.info(`已复制 Node runtime: ${nodeRuntimePath}`)

function launcherSource() {
  const targetRuntimeNameLiteral = JSON.stringify(nodeRuntimeName)
  return String.raw`
use std::{
    env,
    path::{Path, PathBuf},
    process::{Command, Stdio},
};

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let exe_dir = env::current_exe()
        .map_err(|error| format!("无法定位 sidecar 可执行文件: {error}"))?
        .parent()
        .ok_or_else(|| "sidecar 可执行文件目录不存在".to_string())?
        .to_path_buf();
    let cwd = env::current_dir().map_err(|error| format!("无法获取当前目录: {error}"))?;

    let node = find_existing(&[
        exe_dir.join(runtime_name()),
        exe_dir.join(target_runtime_name()),
        cwd.join("src-tauri").join("binaries").join(target_runtime_name()),
    ])
    .ok_or_else(|| "Pi Agent Core Node runtime 不存在".to_string())?;

    let script = find_existing(&[
        exe_dir.join("resources").join("sidecars").join("siwei-pi-agent-sidecar.mjs"),
        exe_dir.join("sidecars").join("siwei-pi-agent-sidecar.mjs"),
        cwd.join("sidecars").join("siwei-pi-agent-sidecar.mjs"),
    ])
    .ok_or_else(|| "Pi Agent Core sidecar 脚本不存在".to_string())?;

    let status = Command::new(node)
        .arg(script)
        .stdin(Stdio::inherit())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .status()
        .map_err(|error| format!("启动 Pi Agent Core runtime 失败: {error}"))?;

    std::process::exit(status.code().unwrap_or(1));
}

fn find_existing(candidates: &[PathBuf]) -> Option<PathBuf> {
    candidates.iter().find(|path| path.exists()).cloned()
}

fn runtime_name() -> &'static Path {
    Path::new(if cfg!(windows) {
        "siwei-node-runtime.exe"
    } else {
        "siwei-node-runtime"
    })
}

fn target_runtime_name() -> &'static Path {
    Path::new(${targetRuntimeNameLiteral})
}
`
}
