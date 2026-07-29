"""Loopback-only helper that asks FFmpeg to merge HLS/DASH streams."""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import threading
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

HOST = "127.0.0.1"
PORT = 17863
DOWNLOAD_ROOT = Path.home() / "Downloads"
ALLOWED_HOSTS = {"video.twimg.com", "pbs.twimg.com"}
jobs: dict[str, dict[str, str | int | None]] = {}


def safe_output_path(filename: str) -> Path:
    parts = [re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", part) for part in filename.split("/") if part]
    if not parts:
        raise ValueError("无效文件名")
    output = (DOWNLOAD_ROOT / Path(*parts)).resolve()
    root = DOWNLOAD_ROOT.resolve()
    if root not in output.parents:
        raise ValueError("输出路径越界")
    output.parent.mkdir(parents=True, exist_ok=True)
    return output


def run_job(job_id: str, url: str, output: Path) -> None:
    jobs[job_id] = {"status": "running", "output": str(output), "returnCode": None}
    command = [
        "ffmpeg", "-y", "-nostdin", "-loglevel", "error",
        "-i", url, "-map", "0", "-c", "copy", str(output)
    ]
    result = subprocess.run(command, capture_output=True, text=True, timeout=7200)
    jobs[job_id] = {
        "status": "completed" if result.returncode == 0 else "failed",
        "output": str(output),
        "returnCode": result.returncode,
        "error": result.stderr[-2000:] if result.returncode else "",
    }


class Handler(BaseHTTPRequestHandler):
    def _extension_origin(self) -> str | None:
        origin = self.headers.get("Origin", "")
        return origin if origin.startswith("chrome-extension://") else None

    def do_OPTIONS(self) -> None:
        if not self._extension_origin():
            self.send_response(403)
            self.end_headers()
            return
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self) -> None:
        if self.path == "/health":
            self._json(200, {"ok": True, "ffmpeg": bool(shutil.which("ffmpeg"))})
            return
        if self.path.startswith("/jobs/"):
            job_id = self.path.rsplit("/", 1)[-1]
            self._json(200 if job_id in jobs else 404, jobs.get(job_id, {"error": "not found"}))
            return
        self._json(404, {"error": "not found"})

    def do_POST(self) -> None:
        if not self._extension_origin():
            self._json(403, {"error": "只接受 Chrome 扩展请求"})
            return
        if self.path != "/download":
            self._json(404, {"error": "not found"})
            return
        try:
            length = min(int(self.headers.get("Content-Length", "0")), 65536)
            payload = json.loads(self.rfile.read(length))
            url = str(payload["url"])
            parsed = urlparse(url)
            if parsed.scheme != "https" or parsed.hostname not in ALLOWED_HOSTS:
                raise ValueError("只允许 video.twimg.com/pbs.twimg.com 的 HTTPS 地址")
            if not shutil.which("ffmpeg"):
                raise RuntimeError("未找到 ffmpeg，请先安装并加入 PATH")
            output = safe_output_path(str(payload["filename"]))
            job_id = uuid.uuid4().hex
            threading.Thread(target=run_job, args=(job_id, url, output), daemon=True).start()
            self._json(202, {"ok": True, "jobId": job_id, "output": str(output)})
        except Exception as exc:
            self._json(400, {"error": str(exc)})

    def _cors(self) -> None:
        origin = self._extension_origin()
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")

    def _json(self, status: int, payload: object) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt: str, *args: object) -> None:
        print(f"[helper] {self.address_string()} {fmt % args}")


if __name__ == "__main__":
    print(f"X Media Helper: http://{HOST}:{PORT}")
    print(f"输出目录: {DOWNLOAD_ROOT}")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
