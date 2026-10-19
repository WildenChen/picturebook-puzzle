#!/usr/bin/env python3
"""Generate original picture-book art using the existing local OpenClaw Agnes credential."""
import argparse
import base64
import datetime
import json
import os
from pathlib import Path
import re
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
SECRET_FILE = Path.home() / ".openclaw/secrets/model-providers.json"
API_URL = "https://apihub.agnes-ai.com/v1/images/generations"


def get_key():
    value = os.environ.get("PICTUREBOOK_AGNES_API_KEY")
    if value:
        return value
    data = json.loads(SECRET_FILE.read_text(encoding="utf-8"))
    value = data.get("agnes")
    if isinstance(value, dict):
        value = value.get("api_key") or value.get("key")
    if not isinstance(value, str) or not value:
        raise RuntimeError("Agnes key unavailable in OpenClaw configuration")
    return value


def main():
    parser = argparse.ArgumentParser(description="Agnes picture-book art generator")
    parser.add_argument("--prompt", required=True)
    parser.add_argument("--name", default="illustration")
    parser.add_argument("--size", choices=["1024x1024", "1024x768", "768x1024"], default="1024x768")
    args = parser.parse_args()
    if not re.fullmatch(r"[a-zA-Z0-9_-]{1,60}", args.name):
        parser.error("--name accepts only letters, digits, underscores and hyphens")
    key = get_key()
    payload = {
        "model": "agnes-image-2.0-flash",
        "prompt": "Original illustrated fairytale picture-book artwork, cohesive watercolor and gouache style, no text or watermark. " + args.prompt,
        "size": args.size,
        "extra_body": {"response_format": "url"},
    }
    request = urllib.request.Request(
        API_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=240) as response:
            data = json.load(response)["data"][0]
        if data.get("b64_json"):
            image = base64.b64decode(data["b64_json"])
        else:
            url = data.get("url")
            if not isinstance(url, str) or not url.startswith("https://"):
                raise RuntimeError("Agnes returned no valid image URL")
            with urllib.request.urlopen(url, timeout=90) as response:
                image = response.read()
    except Exception as exc:
        raise SystemExit("Agnes image generation failed: " + type(exc).__name__) from None
    output = ROOT / "art-drafts"
    output.mkdir(exist_ok=True)
    filename = args.name + "-" + datetime.datetime.now().strftime("%Y%m%d-%H%M%S") + ".png"
    dest = output / filename
    dest.write_bytes(image)
    print(dest)


if __name__ == "__main__":
    main()
