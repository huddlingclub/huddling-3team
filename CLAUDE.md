# CLAUDE.md

팀 공통 규칙은 `AGENTS.md`에 있다. Codex와 같은 기준을 쓰기 위해 아래에서 그대로 불러온다. 규칙을 바꿀 때는 `AGENTS.md`를 수정하고 이 파일에는 Claude Code 전용 내용만 적는다.

@AGENTS.md

## Claude Code 전용

- 개인 권한 설정은 `.claude/settings.local.json`에 두고 커밋하지 않는다.
- 병렬 작업은 `claude --worktree` 또는 별도 git worktree를 써서 다른 팀원의 작업 폴더와 겹치지 않게 한다.
