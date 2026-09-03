# NCS마수리

NCS 응용수리 전용 학습 앱 - 문제 위에 Apple Pencil로 바로 필기하며 풀 수 있는 아이패드용 웹앱.

## Supabase 설정

이 프로젝트는 필기 데이터를 Supabase에 저장합니다 (localStorage는 즉시 표시용 캐시로만 사용).

1. `supabase-setup.sql` 파일 내용 전체를 Supabase 대시보드 → SQL Editor에 붙여넣고 실행하세요.
   (이 프로젝트는 이미 `strokes` 테이블에 연결되도록 `src/supabaseClient.js`에 URL/키가 설정되어 있습니다.)
2. 다른 Supabase 프로젝트를 쓰려면 `src/supabaseClient.js`의 `SUPABASE_URL`, `SUPABASE_ANON_KEY`를 교체하면 됩니다.

> 참고: 지금은 로그인 기능이 없어서 anon 키로 누구나 읽고 쓸 수 있게 열려 있습니다.
> 개인용 프로토타입 단계에서는 괜찮지만, 여러 사람이 쓰는 서비스로 키우면 로그인 + 사용자별 데이터 분리가 필요합니다.

## 로컬에서 실행하기

```bash
npm install
npm run dev
```

브라우저(또는 아이패드 사파리 - 같은 와이파이에 연결한 뒤 이 컴퓨터의 IP:포트로 접속)에서 확인할 수 있습니다.

## 무료 배포 (Render)

1. 이 프로젝트를 GitHub 저장소로 올립니다.
2. Render(render.com)에서 "New Static Site"로 이 저장소를 연결합니다.
3. Build Command: `npm run build`
4. Publish Directory: `dist`
5. 배포되면 나온 URL을 아이패드 사파리에서 열고, 공유 버튼 → "홈 화면에 추가"를 하면
   앱처럼 아이콘이 생기고 전체화면으로 실행됩니다.

## 폴더 구조

- `index.html` — 화면 골격 (헤더/로고, 탭별 화면, 필기 툴바, 하단 탭바)
- `src/main.js` — 동작 로직 (문제 렌더링, 필기, 채점, 탭 전환)
- `src/style.css` — 전체 스타일
- `src/data/problems.js` — **문제 데이터는 여기서 추가/수정**
- `src/storage.js` — 필기 데이터를 브라우저 localStorage에 저장/불러오기
- `public/manifest.json`, `public/icons/` — PWA(홈 화면 설치) 설정

## 아직 구현 안 된 것

- 대시보드, 계산연습, 오답노트 탭은 자리만 잡아둔 상태 (준비 중 화면)
- 필기 좌표가 화면 회전(가로/세로 전환) 시 비율에 맞게 재배치되지는 않음
