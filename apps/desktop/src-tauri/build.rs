use std::{env, path::PathBuf, process::Command};

fn main() {
    if env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        build_macos_capture_helper();
    }
    tauri_build::build()
}

fn build_macos_capture_helper() {
    let manifest = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"));
    let source = manifest.join("native/macos/MoyuCapture.swift");
    let target = env::var("TARGET").expect("TARGET");
    let output_dir = manifest.join("bin");
    let output = output_dir.join(format!("moyu-capture-{target}"));
    std::fs::create_dir_all(&output_dir).expect("create sidecar output directory");
    println!("cargo:rerun-if-changed={}", source.display());

    let arch = if target.starts_with("x86_64") {
        "x86_64"
    } else {
        "arm64"
    };
    let status = Command::new("xcrun")
        .args([
            "swiftc",
            "-O",
            "-parse-as-library",
            "-target",
            &format!("{arch}-apple-macos15.0"),
            "-framework",
            "ApplicationServices",
            "-framework",
            "ScreenCaptureKit",
            "-framework",
            "Vision",
        ])
        .arg(&source)
        .arg("-o")
        .arg(&output)
        .status()
        .expect("run swiftc for capture sidecar");
    assert!(status.success(), "failed to build macOS capture sidecar");

    let arm64 = output_dir.join("moyu-capture-aarch64-apple-darwin");
    let x86_64 = output_dir.join("moyu-capture-x86_64-apple-darwin");
    if arm64.exists() && x86_64.exists() {
        let universal = output_dir.join("moyu-capture-universal-apple-darwin");
        let temporary = output_dir.join(format!("moyu-capture-universal-{arch}.tmp"));
        let status = Command::new("xcrun")
            .args(["lipo", "-create"])
            .arg(&arm64)
            .arg(&x86_64)
            .arg("-output")
            .arg(&temporary)
            .status()
            .expect("run lipo for universal capture sidecar");
        assert!(
            status.success(),
            "failed to build universal macOS capture sidecar"
        );
        std::fs::rename(&temporary, &universal).expect("move universal capture sidecar into place");
    }
}
