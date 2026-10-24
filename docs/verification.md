# 개발 검증 기록

검증일: 2026-10-24 (Asia/Seoul). 아래 결과는 로컬 개발 환경에서 확인했다. OpenShift 배포 성공 증빙이 아니다.

## 실행 환경

- Node.js v24.13.0, npm 11.17.0. 배포 대상 이미지는 공식 보안 릴리스 Node.js 24.22.1로 고정했다.
- PostgreSQL 16.15 Ubuntu 패키지를 `/tmp`에 풀어 일반 사용자로 실행했다. 시스템 설치나 기존 DB 접근은 하지 않았다.
- 앱 DB `portfolio`와 통합 테스트 전용 DB `portfolio_test`를 분리했다. 테스트 스키마는 실행마다 새로 만들고 정리했다.
- Docker 데몬 접근은 권한 부족, sudo 접근은 비밀번호 필요로 실패했다. `oc`와 kubeconfig가 없어 실제 컨테이너·클러스터 검증은 수행하지 못했다.

## 완료한 검사

| 검사 | 결과 |
| --- | --- |
| `npm test` + 실제 PostgreSQL | 17개 전체 통과, skip 0. 입력·DB 제약·커서·마이그레이션·장애 응답·배포 payload 제한 등 |
| `npm run deploy:generate` / `deploy:check` | 런타임 생성과 최신 상태 검사 통과 |
| `docker compose config --quiet` | Compose 구성 파싱 통과 |
| 배포 YAML 파싱·리소스 참조 | YAML 파싱, 생성 필드 부재, Service/Deployment/Route·볼륨 참조 확인 |
| 이미지 digest 익명 조회 | 빈 Docker 인증 디렉터리로 Node·PostgreSQL manifest 조회 성공 |
| 번들 독립 실행 | ConfigMap 조각을 복원한 파일만 `/tmp`에서 실행, 실제 PostgreSQL 연결·자동 마이그레이션 성공 |
| Chromium 데스크톱 1440px·모바일 390px | 프로필·사진·로고·프로젝트·논문, 방명록 작성·새로고침, 가로 넘침 없음 |
| 브라우저 입력·보안 | 한글·이모지 40/1,000자 경계, 줄바꿈, HTML 문자열이 실행되지 않고 글자로 표시됨 |
| 목록·작성 동시 동작 | 실제 20개 이후 더 불러오기·마지막 커서 처리, 목록 갱신 중 작성한 글이 사라지지 않음 |
| 키보드·오류 | 이름→메시지 Tab 이동, DB 오류 안내·새로고침 재시도, JS 실행 오류 없음 |
| 실제 웹 프로세스 재시작 | 방명록 유지, SIGTERM 정상 종료 |
| 실제 PostgreSQL 정지 | 직접 웹 접근 시 static/live 200, ready/API 503 |
| 실제 PostgreSQL 재기동 | 풀 재연결, readiness 200 복구, 기존 글 유지 |
| DB가 늦게 준비되는 기동 | 준비 전 live/static 200·ready 503, DB 기동 후 자동 준비 완료 |
| 로그 | 비밀번호와 방명록 본문이 출력되지 않음 |
| `npm audit` | 최종 런타임·개발 의존성 포함 알려진 취약점 0개 |
| `npm ci --offline --ignore-scripts` | lock 파일에서 재설치 후 동일한 배포 산출물 생성 확인 |

로컬 화면: [데스크톱](images/local-desktop.png), [모바일](images/local-mobile.png). 이 캡처를 과제의 실제 배포 화면 증빙으로 사용하지 않는다.

## 배포 전 남은 검사

- Sandbox quota·LimitRange·StorageClass와 PVC 할당 확인.
- 고정 이미지의 실제 layer pull, OpenShift 임의 UID 실행, PVC 쓰기 권한 확인.
- `oc apply -f deploy/k8s/`만으로 정상 배포·내부 DB 연결·자동 마이그레이션 확인.
- Route HTTPS·리다이렉트·readiness endpoints 제외·복구 확인.
- 실제 router CIDR 및 전달 헤더 확인 후 방문자별 요청 제한 설정.
- 웹/DB Pod 재생성과 PVC 유지 시 영속성 확인.
- 백업·캡처 후 PVC 포함 전체 삭제·재생성 검증.
- 과제 저장소 YAML·README·실제 캡처 전달, 소스 commit 기록, 최종 제출 Push.
