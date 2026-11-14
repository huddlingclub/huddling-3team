# 개발 하네스 · 첫 커밋부터 실기기 검증까지

**먼저 증명할 것**　같은 GIF가 Finder에서는 파일로, 대화창에서는 정지 이미지로 처리될 수 있다. 검색 API 연결 전, 팀이 만든 ①·②·③ 반복 GIF를 복사해 실제 수신자가 무엇을 보는지 기록한다.

## 시작 환경과 실행

## 첫 10분 · 팀 공통 계약

기존 저장소에 호환되는 구성이 있으면 재사용한다. 새 프로젝트의 기본안은 단일 npm 패키지, React + TypeScript + Vite, Electron이다. UI는 한 번 구현해 Mac 창과 Vercel에서 함께 사용한다.

| 소유자 | GitHub 브랜치와 파일 | 합의할 인터페이스 |
|---|---|---|
| A | feat/mac-shell · desktop/, 루트 package.json 및 lockfile | preload에서 window.gifHost.copyGif({id, gifUrl, sessionId})를 제공한다. 성공·실패를 반환하고 메인 프로세스가 성공한 세션만 닫는다 |
| B | feat/picker · src/, public/fixtures/ | GifItem은 id, description, previewUrl, gifUrl을 가진다. gifHost가 없으면 웹 미리보기 동작을 사용한다 |
| PM | 통합 브랜치 · supabase/, 세 문서 | 추천어 테이블과 샘플 데이터, Vercel Preview URL, 실측 결과를 PR에 기록한다 |

A가 첫 커밋에서 다음 npm 스크립트를 정의한다. npm run dev는 Vite, npm run desktop은 준비된 로컬 Vite 주소를 여는 Electron, npm run build는 타입 검사와 Vite 빌드다. 의존성 추가는 A가 lockfile에 반영한다. 첫 설치로 lockfile을 커밋한 후 팀원은 npm ci를 실행한다. Mac 시연 시 터미널 두 개에서 dev와 desktop을 순서대로 실행한다. Vercel은 저장소 루트에서 npm run build, 출력 dist로 설정한다. 로컬 Electron에는 로컬 UI만 로드하고 contextIsolation을 켜며 nodeIntegration을 끈다. 복사 요청은 현재 세션에서 받은 GIF 또는 내장 fixture만 허용한다.

### Claude Code에 바로 전달할 작업 지시

- **A**　“PRD.md, HARNESS.md, DESIGN.md를 읽고 desktop과 실행 스크립트를 구현해. 준비 완료 후 Alt+Space를 등록하고 성공 여부를 확인해. 패널을 숨긴 뒤 원래 앱의 입력란에 ⌘V가 들어가는지 실기기에서 확인할 절차를 PR에 적어. 원본 GIF 바이트로 먼저 검증하고 정지 이미지 변환을 피하는 경로를 사용해.”
- **B**　“세 문서의 GifItem과 gifHost 계약을 따라 src와 fixture를 구현해. 한글 조합 중 Enter 오선택과 이전 검색 응답 덮어쓰기를 재현해 확인해. 브라우저에서는 데스크톱 복사 성공처럼 보이지 않게 해. PR에 sample/live 결과와 빌드 결과를 적어.”
- 각 개발자는 별도 체크아웃 또는 worktree에서 Claude Code를 실행한다. 65분에 각자 변경 파일과 검증 결과를 첨부해 PR을 열고 PM이 동일 커밋으로 통합한다. AI가 작성한 테스트 결과와 실제 Mac 관찰 결과는 따로 기록한다.

### Supabase와 Vercel 설정

PM이 SQL Editor에서 새 테이블을 만들고 시드를 한 번 입력한다.

```sql
create table public.suggested_terms (
  term text primary key,
  position integer not null unique
);
alter table public.suggested_terms enable row level security;
revoke all on public.suggested_terms from anon, authenticated;
grant select on public.suggested_terms to anon;
create policy read_suggestions on public.suggested_terms
  for select to anon using (true);
insert into public.suggested_terms values ('박수', 1), ('축하', 2), ('usagi', 3);
```

UI는 VITE_SUPABASE_URL과 VITE_SUPABASE_PUBLISHABLE_KEY로 position 순서의 상위 3개를 읽는다. 검색어나 사용 기록은 저장하지 않는다. 로컬 .env.local과 Vercel Preview에 두 값을 설정한다. PM이 추천어 하나를 잠시 수정하고 새로고침해 반영을 확인한 뒤 되돌린다. 네트워크 실패나 빈 테이블에는 내장 추천어를 쓴다. 관리자 키는 클라이언트에 넣지 않는다.

KLIPY 테스트 키는 클라이언트 사용 조건을 확인해 로컬 live에만 설정한다. 브라우저에 배포한 VITE_ 값은 공개 가능한 값으로 취급한다. Vercel Preview 기본값은 sample이며 자체 fixture로 검색 화면을 검수한다. 실제 API 요청과 미디어 로딩은 시연 Mac의 클라이언트가 직접 수행한다. [Vercel Git 연동](https://vercel.com/docs/git) · [Supabase 키](https://supabase.com/docs/guides/getting-started/api-keys) · [Electron 단축키](https://www.electronjs.org/docs/latest/api/global-shortcut/)

실행 모드는 두 개다. sample은 팀 소유 3프레임 GIF와 고정된 검색 결과를 읽어 오프라인에서 실행한다. live는 KLIPY의 클라이언트 통합을 사용한다. 키 누락 시 live 오류를 표시하고 개발자가 직접 sample을 고른다.

## 병렬 개발의 접점

| 담당 | 입력 → 출력 | 구현 계약 |
|---|---|---|
| A · 패널 | 단축키 → 세션 | 최초 호출에서 이전 앱을 기억하고 패널을 현재 Space에 표시한다. 열려 있을 때 다시 누르면 취소한다. Esc도 동일하다 |
| B · 검색 | 검색어·페이지 → 결과·다음 페이지 유무 | 결과마다 ID, 설명, 미리보기 URL, 실제 GIF URL을 구분한다. 공급자 응답 순서와 제공된 URL을 보존한다 |
| A · 복사 | 선택 결과 → 성공 또는 오류 | 성공은 클립보드 기록 완료를 뜻한다. 패널을 닫은 뒤 이전 앱을 활성화한다. 실패 시 결과·선택을 유지한다 |
| PM · 검증 | 실행 모드·앱·빌드 → 실측표 | 수신 측 재생 여부와 실제 전달 형태를 별도 기록한다 |

### A. 클립보드 실험

1. 동일한 로컬 GIF를 두 방식으로 각각 기록한다. 첫 실험은 Electron main에서 clipboard.writeBuffer로 macOS GIF 타입(com.compuserve.gif)에 원본 바이트를 기록한다. 두 번째 후보는 작은 macOS pasteboard 헬퍼를 사용해 확장자가 .gif인 실제 파일의 URL을 파일 객체로 기록한다. 후보를 개별 시험해야 어느 방식을 앱이 읽었는지 알 수 있다.
2. 카카오톡에서 초안 작성 → 호출 → 선택 → 원래 입력란에서 ⌘V → 첨부 확인 → 전송 → 수신 화면 순으로 시험한다. Finder에는 파일 URL 방식으로 붙여넣고 복사된 파일의 프레임도 확인한다.
3. 카카오톡 수신 결과가 움직이고 별도 파일 관리가 필요 없는 방식을 우선한다. 파일 URL만 통과하면 파일이 붙여넣기 전에 지워지지 않도록 앱 소유 임시 경로와 수명을 검증한다. KLIPY 미디어를 로컬 파일로 보관하는 방식은 공식 캐싱 요건부터 확인한다. 결정 전에는 팀 소유 파일로 시험한다.
4. 원본 획득·GIF 형식 검증이 끝난 후 클립보드를 변경한다. 중복 클릭은 한 번만 처리한다. 복사 도중 Esc로 취소한 세션의 뒤늦은 완료가 클립보드를 바꾸거나 다른 앱을 활성화하지 않게 한다.

### B. 실제 데이터 연결

KLIPY Partner Panel에서 테스트 키를 받아 공식 GIF 검색 예제로 ‘usagi’ 1건을 먼저 조회한다. 실제 응답에서 GIF 원본과 작은 미리보기 필드를 대조하고, 반환 URL의 쿼리까지 보존한다. 원본 GIF가 없는 항목은 복사할 수 없게 처리한다. 검색어가 바뀌면 이전 요청을 취소하고 응답을 적용하기 직전에 최신 질의인지 다시 확인한다.

공식 출처 자산을 표시하고, 파트너 설정에 따라 반환되는 광고·이벤트 처리 요구를 확인한다. 복사 시점에는 외부 앱의 실제 전송을 알 수 없으므로 공유 이벤트 의미를 공식 명세와 대조한다. 별도 프록시와 미디어 캐싱은 KLIPY가 사전 협의를 안내하는 방식이다. 실제 키·응답과 호환성은 팀의 시연 환경에서 검증한다. [KLIPY 통합 문서](https://docs.klipy.com/) · [개발자 안내](https://klipy.com/developers)

## 통합 점검표

| ID | 절차 | 통과 기준 |
|---|---|---|
| T1 | Finder·브라우저·카카오톡에서 각각 ⌥ Space, 글자 입력, Esc | 열리는 패널은 1개, 첫 글자 입력 가능, 각 호출 앱으로 복귀 |
| T2 | 한글 ‘박수’ 조합 중 Enter, 이어 ‘usagi’ 검색 | 조합 중 GIF 오선택 없음, 최신 검색 결과만 표시 |
| T3 | 키보드만 사용해 첫 결과와 다음 결과 선택 | 화살표로 이동, Enter로 1건 복사, 기존 초안 유지 |
| T4 | 숫자 GIF를 시연 채팅에서 붙여넣고 전송 | 수신 시 숫자 변경 확인. 파일 첨부면 채팅 내/파일 열기 후 재생도 구분 |
| T5 | 기존 클립보드에 ‘검증’ 저장 후 다운로드 중단 또는 취소 | 복사 완료로 표시하지 않고 기존 내용 유지, 재시도 가능 |
| T6 | 빈 응답·오프라인·인증 오류·요청 한도 오류를 sample로 재현 | 빈 결과와 오류를 구분, 반복 호출 없음, 오류 해소 후 재시도 가능 |
| T7 | 단축키 중복, 보조 모니터, 전체 화면 앱에서 각각 호출 | 등록 실패는 메뉴에서 안내, 메뉴로 열기 가능. 패널 위치와 앱 복귀 결과 기록 |

**실측 기록 양식**　날짜 / macOS·대상 앱 버전 / sample 또는 live / 호출 앱·입력란 / 복사 형식 / 붙여넣기 결과 / 수신 측 재생 / 통과·보류 / 담당. 현재 전 항목 미측정이다. Vercel Preview URL과 Git 커밋, Supabase 추천어 변경 반영 여부도 함께 남긴다. 시연 전 PM이 T1~T6 결과를 채우고 T7의 제약을 발표자에게 공유한다.
