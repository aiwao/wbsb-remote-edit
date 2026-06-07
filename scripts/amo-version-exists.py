#!/usr/bin/env python3
import argparse
import base64
import hashlib
import hmac
import json
import os
import secrets
import sys
import time
import urllib.error
import urllib.parse
import urllib.request


DEFAULT_API_BASE_URL = "https://addons.mozilla.org/api/v5"


def parse_args():
    parser = argparse.ArgumentParser(
        description="Check whether a Firefox extension version already exists on AMO."
    )
    parser.add_argument(
        "--source-dir",
        required=True,
        help="Built extension directory containing manifest.json.",
    )
    parser.add_argument(
        "--api-base-url",
        default=os.environ.get("AMO_API_BASE_URL", DEFAULT_API_BASE_URL),
        help="AMO API base URL. Defaults to production AMO or AMO_API_BASE_URL.",
    )
    return parser.parse_args()


def base64url(data):
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def create_jwt(api_key, api_secret):
    issued_at = int(time.time())
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "iss": api_key,
        "jti": secrets.token_urlsafe(16),
        "iat": issued_at,
        "exp": issued_at + 60,
    }
    signing_input = ".".join(
        [
            base64url(json.dumps(header, separators=(",", ":")).encode()),
            base64url(json.dumps(payload, separators=(",", ":")).encode()),
        ]
    )
    signature = hmac.new(api_secret.encode(), signing_input.encode(), hashlib.sha256).digest()
    return f"{signing_input}.{base64url(signature)}"


def load_manifest(source_dir):
    manifest_path = os.path.join(source_dir, "manifest.json")
    with open(manifest_path, encoding="utf-8") as manifest_file:
        return json.load(manifest_file)


def version_detail_url(api_base_url, addon_id, version):
    base_url = api_base_url.rstrip("/")
    addon_path = urllib.parse.quote(addon_id, safe="")
    version_path = urllib.parse.quote(f"v{version}", safe="")
    return f"{base_url}/addons/addon/{addon_path}/versions/{version_path}/"


def main():
    args = parse_args()
    api_key = os.environ.get("WEB_EXT_API_KEY", "")
    api_secret = os.environ.get("WEB_EXT_API_SECRET", "")
    if not api_key:
        print("WEB_EXT_API_KEY is required.", file=sys.stderr)
        return 2
    if not api_secret:
        print("WEB_EXT_API_SECRET is required.", file=sys.stderr)
        return 2

    manifest = load_manifest(args.source_dir)
    addon_id = manifest["browser_specific_settings"]["gecko"]["id"]
    version = manifest["version"]
    token = create_jwt(api_key, api_secret)
    request = urllib.request.Request(
        version_detail_url(args.api_base_url, addon_id, version),
        headers={"Authorization": f"JWT {token}"},
    )

    try:
        with urllib.request.urlopen(request) as response:
            print("true" if response.status == 200 else "false")
            return 0
    except urllib.error.HTTPError as error:
        if error.code == 404:
            print("false")
            return 0
        if error.code in (401, 403):
            print(
                f"AMO version lookup failed with HTTP {error.code}. "
                "Check AMO credentials and add-on permissions.",
                file=sys.stderr,
            )
            return 1
        print(f"AMO version lookup failed with HTTP {error.code}.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
