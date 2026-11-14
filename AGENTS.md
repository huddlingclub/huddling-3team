# AGENTS.md · 공통 에이전트 지침

이 파일은 Claude Code와 Codex가 함께 읽는 **단일 기준 문서**다. Codex는 이 파일을 직접 읽고, Claude Code는 `CLAUDE.md`가 이 파일을 불러온다. 규칙을 바꿀 때는 이 파일만 수정하고 `CLAUDE.md`에는 도구 전용 내용만 둔다.

## 프로젝트 한 줄 요약

Mac에서 ⌥ Space로 GIF 검색 패널을 열고, 고른 애니메이션 GIF를 클립보드에 복사해 호출 앱으로 돌아가는 당일 시연용 앱이다. 같은 React UI를 Electron(시연 Mac)과 Vercel Preview(팀 검수)에서 함께 쓴다.

## 먼저 읽을 문서

| 문서 | 내용 |
|---|---|
| `PRD.md` | 목표, 범위(P0/P1), 팀 일정, 시연 대본 |
| `HARNESS.md` | 브랜치·파일 소유, 인터페이스 계약, 실행 스크립트, Supabase·KLIPY 설정, 점검표 T1~T7 |
| `DESIGN.md` | 패널 레이아웃, 키보드·마우스 조작, 상태별 문구 |

문서와 코드가 다르면 문서를 기준으로 하고, 차이를 PR 설명에 적는다. 세 문서의 내용 변경은 PM 소유이므로 개발자는 제안만 한다.

## 파일 소유와 브랜치

| 소유자 | 브랜치 | 수정 가능한 경로 |
|---|---|---|
| A · Mac 셸 | `feat/mac-shell` | `desktop/`, 루트 `package.json`, lockfile |
| B · 검색 UI | `feat/picker` | `src/`, `public/fixtures/` |
| PM · 통합 | 통합 브랜치 | `supabase/`, `PRD.md`, `HARNESS.md`, `DESIGN.md` |

- 자기 소유가 아닌 경로는 수정하지 않는다. 꼭 필요하면 PR 설명에 이유를 적고 소유자에게 확인받는다.
- 의존성 추가는 A만 하고 lockfile에 반영한다. 다른 사람은 `npm install`로 lockfile을 바꾸지 말고 `npm ci`를 쓴다.
- 개발자마다 별도 체크아웃 또는 git worktree에서 에이전트를 실행한다. 한 작업 폴더에서 Claude Code와 Codex를 동시에 돌리지 않는다.

## 공유 인터페이스 (바꾸지 말 것)

```ts
// B가 정의 · src/
type GifItem = { id: string; description: string; previewUrl: string; gifUrl: string };

// A가 preload에서 제공 · desktop/
window.gifHost?.copyGif({ id, gifUrl, sessionId }): Promise<성공 | 실패>
```

- `window.gifHost`가 없으면 웹 미리보기 동작이다. 브라우저에서 복사 성공처럼 보이게 하지 않는다.
- 메인 프로세스는 성공한 세션만 닫는다. 실패·취소 시 기존 클립보드와 결과·선택을 유지한다.
- 계약을 바꿔야 하면 코드보다 먼저 A·B가 합의하고 `HARNESS.md` 변경을 PM에게 요청한다.

## 실행 명령

A가 첫 커밋에서 정의한다. 정의 전에는 아래 명령이 없을 수 있다.

| 명령 | 동작 |
|---|---|
| `npm ci` | lockfile 기준 설치 |
| `npm run dev` | Vite 개발 서버 |
| `npm run desktop` | 실행 중인 로컬 Vite 주소를 여는 Electron (`dev` 먼저 실행) |
| `npm run build` | 타입 검사 + Vite 빌드, 출력 `dist/` |

변경을 마치면 최소한 `npm run build`가 통과하는지 확인하고 결과를 PR에 적는다.

## 보안·비밀값

- `.env.local`, 실제 API 키, Supabase 관리자(service role) 키는 커밋하지 않는다. 클라이언트에는 `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`만 둔다.
- `VITE_` 값은 브라우저에 공개되는 값으로 취급한다. KLIPY 테스트 키는 로컬 live 모드에만 둔다. Vercel Preview 기본값은 sample이다.
- 이 레포는 **공개** 레포다. 로그, 스크린샷, PR 설명에도 키를 남기지 않는다.
- Electron은 로컬 UI만 로드하고 `contextIsolation: true`, `nodeIntegration: false`를 유지한다. 복사 요청은 현재 세션에서 받은 GIF 또는 내장 fixture만 허용한다.

## 작업 규칙

- UI 문구는 `DESIGN.md`의 한국어 문구를 그대로 쓴다.
- 한글 조합(IME) 중 Enter와 이전 검색 응답 덮어쓰기는 `HARNESS.md` T2 기준으로 직접 재현해 확인한다.
- 에이전트가 실행한 테스트 결과와 실제 Mac에서 사람이 관찰한 결과는 PR에 **따로** 적는다. 실기기에서 확인하지 않은 항목을 통과로 쓰지 않는다.
- 커밋 메시지는 한국어로 짧게 쓴다. 에이전트가 붙이는 공동 작성자 줄은 그대로 둬도 된다.
- 도구별 로컬 설정(`.claude/settings.local.json`, `.codex/` 등)은 커밋하지 않는다. 팀 공통 규칙은 이 파일에 적는다.
