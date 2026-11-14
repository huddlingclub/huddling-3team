#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
export VITE_GIF_MODE=sample KLIPY_API_KEY= VITE_OLLAMA_MODEL=
stage=$(mktemp -d /tmp/gifkey-lite.XXXXXX)
trap 'rm -rf -- "$stage"' EXIT
app="$stage/share/Gifkey.app"
resources="$app/Contents/Resources/picker"
mkdir -p "$app/Contents/MacOS" "$resources"
./node_modules/.bin/vite build --mode companion --base=./ --outDir "$resources"
rm -f "$resources/Jjalkkak-macOS.zip"
python3 - "$resources" <<'PY'
import re, sys
from pathlib import Path
folder = Path(sys.argv[1])
page = folder / "index.html"
html = page.read_text()
# An inline entry point lets WebKit open the bundle directly with file URLs.
html = re.sub(r'<script type="module" crossorigin src="([^"]+)"></script>', lambda m: "<script>" + (folder / m[1]).read_text().replace("</script", "<\\/script") + "</script>", html)
html = re.sub(r'<link rel="stylesheet" crossorigin href="([^"]+)">', lambda m: "<style>" + (folder / m[1]).read_text() + "</style>", html)
assert '<script>' in html and '<style>' in html
script = re.search(r'<script>.*?</script>', html, flags=re.S)
assert script
html = html[:script.start()] + html[script.end():]
page.write_text(html.replace('</body>', script.group() + '</body>'))
PY
rm -r "$resources/assets"
cat > "$app/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>Gifkey</string>
<key>CFBundleIdentifier</key><string>club.huddling.jjalkkak.copy</string>
<key>CFBundleName</key><string>Gifkey</string>
<key>CFBundleDisplayName</key><string>짤깍</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleVersion</key><string>5</string>
<key>CFBundleShortVersionString</key><string>0.2.1</string>
<key>LSMinimumSystemVersion</key><string>13.0</string>
<key>LSUIElement</key><true/>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>
PLIST
for arch in arm64 x86_64; do
  swiftc -O -target "$arch-apple-macosx13.0" -module-cache-path "$stage/cache-$arch" desktop/mac-launcher.swift desktop/web-copy-bridge.swift -o "$stage/Gifkey-$arch"
done
lipo -create "$stage/Gifkey-arm64" "$stage/Gifkey-x86_64" -output "$app/Contents/MacOS/Gifkey"
xattr -cr "$app"
codesign --force --sign - "$app"
cat > "$stage/share/사용 안내.txt" <<'GUIDE'
짤깍 · 맥 팀 테스트용

1. 이전 짤깍이 켜져 있다면 메뉴 막대에서 ‘짤깍 종료’를 선택합니다.
2. 압축을 풀고 새 Gifkey.app을 한 번 실행합니다. macOS 13 이상이 필요합니다.
3. 앱은 창 없이 메뉴 막대에 상주합니다. https://huddling-3team.vercel.app 을 엽니다.
4. 웹에서 GIF를 클릭합니다. 브라우저가 로컬 네트워크 연결 권한을 물으면 허용합니다.
5. 웹에 ‘GIF를 복사했어요’가 뜨면 카카오톡에서 ⌘V로 붙여넣습니다. 전송은 직접 하세요.
6. 다음 GIF부터는 웹에서 클릭하고 카톡에 ⌘V만 누릅니다. 앱 창을 열 필요가 없습니다.
7. 오프라인 샘플 검색창은 ⌥ Space 또는 메뉴 막대의 ‘짤깍 열기’로 엽니다.

앱을 종료하거나 Mac을 재시작하면 새 Gifkey.app을 다시 한 번 실행해야 합니다.
원본 GIF 파일이 복사됩니다. 카카오톡 입력창과 수신 화면에서의 재생 여부는 직접 확인해 주세요.

샘플 검색과 키워드 추천은 오프라인에서 동작합니다.
개발자 확인 경고가 뜨면 팀에서 받은 파일임을 확인한 뒤 시스템 설정 → 개인정보 보호 및 보안 → 그래도 열기를 선택하세요.
GUIDE
ditto -c -k "$stage/share" "$stage/Jjalkkak-macOS.zip"
ditto -x -k "$stage/Jjalkkak-macOS.zip" "$stage/extracted"
codesign --verify --strict "$stage/extracted/Gifkey.app"
lipo -archs "$stage/extracted/Gifkey.app/Contents/MacOS/Gifkey"
size=$(stat -f %z "$stage/Jjalkkak-macOS.zip")
test "$size" -lt 20000000
printf '%s bytes\n' "$size"

cp "$stage/Jjalkkak-macOS.zip" public/Jjalkkak-macOS.zip
