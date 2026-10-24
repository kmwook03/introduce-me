# 김민욱 자기소개 · 방명록

기존 자기소개 HTML/CSS/JavaScript를 보존하고 Express와 PostgreSQL로 방명록을 추가한 서비스다. 정적 화면과 API를 같은 Node.js 프로세스에서 제공하고, DB는 별도 프로세스·Pod에서 실행한다.

현재 **로컬 구현과 실제 PostgreSQL·브라우저 검증을 완료**했다. OpenShift 로그인 환경이 없어 클러스터 기동, PVC 권한·영속성, Route HTTPS, quota, 전체 삭제 후 재배포는 아직 검증하지 않았다. 제출 완료 상태로 간주하지 않는다. 실제 확인 내역은 [검증 기록](docs/verification.md)을 참고한다.

## 로컬 실행

Node.js 24와 Docker Compose가 필요하다.

```bash
cp .env.example .env
npm ci
docker compose up -d db
npm start
```

<http://localhost:8080>에서 확인한다. DB 기동과 마이그레이션을 최대 90초 동안 재시도한다. 그동안 정적 페이지와 liveness는 제공하지만 readiness와 방명록은 503이다. DB 비밀번호 오류나 마이그레이션 오류는 즉시 실패하고 비정상 종료한다. 재시도 제한 시간에는 마지막 연결·질의 timeout만큼 추가 시간이 들 수 있다.

웹도 컨테이너로 실행하려면 `npm start` 대신 다음을 실행한다.

```bash
docker compose --profile full up -d --build
```

`docker compose down`은 볼륨을 보존한다. 영속성 확인 중에는 `down -v`를 사용하지 않는다. `.env`를 변경한 뒤 기존 DB 볼륨의 계정·인증값도 일치하는지 확인한다.

## 테스트

기본 `npm test`는 Node.js 테스트 러너를 사용한다. `TEST_DB_NAME`이 없으면 실제 DB 통합 테스트는 명시적으로 건너뛴다. 전체 검증에는 앱 DB와 다른, 이름이 `_test`로 끝나는 DB가 필요하다. `.env.example`의 기본 이름은 `portfolio_test`다.

```bash
docker compose exec db sh -c 'createdb -U "$POSTGRESQL_USER" "$POSTGRESQL_DATABASE"_test'
TEST_DB_NAME=portfolio_test npm test
npm run deploy:check
```

DB가 이미 있으면 `createdb`를 반복하지 않는다. 통합 테스트는 해당 테스트 DB 안에 임의 이름의 스키마를 생성하고 자신이 만든 스키마만 정리한다. 앱 DB를 비우지 않는다. 정상 작성·조회, 한글·이모지 코드 포인트 경계, DB CHECK 제약, JSON·본문 크기·쿼리 검증, SQL 특수문자, 커서 정렬·중복 방지, 마이그레이션 동시 실행·재실행, 앱 재생성을 검사한다. 별도 테스트는 DB 오류 응답과 정적 화면·liveness, 위조한 프록시 헤더를 이용한 빈도 제한 우회를 검사한다.

## 화면과 API

프로필 데이터는 `public/index.html`의 `profile-data` JSON을 수정한다. CSS와 실행 코드는 `public/css/style.css`, `public/js/profile.js`로 분리했다. 프로필 사진과 학교 로고는 `public/images/`에 있다. 기존 저장소의 원본은 변경하지 않았다.

방명록은 이름 1~40자, 메시지 1~1,000자를 받는다. 양 끝 공백을 제거하고 Unicode 코드 포인트 단위로 센다. 조합형 이모지는 여러 글자로 계산될 수 있다. API와 PostgreSQL이 같은 길이·공백 조건을 적용한다. ID는 문자열, 작성 시각은 DB가 정한 UTC 시각이며 화면에서는 방문자 시간대로 표시한다.

| 경로 | 동작 |
| --- | --- |
| `GET /api/guestbook?limit=20&before=<id>` | ID 내림차순, 기본 20개·최대 50개, `{ items, nextCursor }` |
| `POST /api/guestbook` | JSON `{ name, message }`, 성공 시 201과 생성된 글 |
| `GET /health/live` | DB 질의 없이 200 |
| `GET /health/ready` | 마이그레이션 완료와 DB 질의 성공 시 200, 실패 시 503 |

오류는 `{ "error": { "code": "...", "message": "..." } }` 형태다. 입력 오류는 400, 분당 5회 쓰기 제한은 429, DB 장애·준비 중 상태는 503이다. 요청 본문은 12KiB로 제한한다. SQL은 매개변수로 실행하고 사용자 글은 `textContent`로 표시한다.

## 아키텍처와 생명주기

```text
브라우저 → HTTPS Route → Service personal-portfolio:8080
                         └─ Node.js Deployment (replica 1)
                            ├─ 자기소개 정적 파일·방명록 API
                            ├─ 설정 ConfigMap + 인증 Secret
                            ├─ 초기화 컨테이너: 번들 → emptyDir
                            └─ PostgreSQL 연결 풀 (최대 5개)
                                 ↓ portfolio-db:5432 (ClusterIP)
                            PostgreSQL Deployment (replica 1, Recreate)
                                 └─ PVC portfolio-db-data (1Gi)
```

DB 연결 대기는 2초, SQL 실행 제한은 3초, 클라이언트 질의 제한은 4초다. readiness 질의는 1.5초 제한이며 풀 연결 대기 시간이 추가될 수 있다. 마이그레이션은 트랜잭션·이력·파일 checksum과 advisory lock을 사용한다. 적용한 migration은 수정하지 말고 새 파일을 추가한다. SIGTERM/SIGINT에는 신규 연결을 닫고 진행 중 요청·초기화 작업을 정리한 다음 풀을 종료한다. 강제 종료 상한은 10초다. 로그에 비밀번호·연결 문자열·방명록 본문을 기록하지 않는다.

DB 장애 중 직접 Pod로 접근하면 자기소개 파일을 계속 제공한다. OpenShift Route에서는 readiness 실패로 Pod가 endpoints에서 제외되므로 전체 사이트가 잠시 응답하지 않을 수 있다. DB 장애가 웹 liveness 실패나 재시작으로 이어지지는 않는다.

## 빌드 없는 OpenShift 전달 방식

최종 기본안은 **공개 Node.js 런타임 + 번들을 담은 ConfigMap**이다. 채점자에게 서비스 이미지 빌드·레지스트리 로그인·Git clone·npm 설치를 요구하지 않는다. 개발자가 esbuild로 서버와 런타임 의존성을 미리 묶고, 정적 파일·마이그레이션과 함께 gzip JSON으로 포장한다. 배포 YAML에는 이 산출물이 포함되어 있다.

```bash
# 개발자가 소스나 의존성을 수정했을 때만 실행
npm ci
npm run deploy:generate
npm run deploy:check
```

런타임 payload는 약 559KB다. 일반 `oc apply`의 `last-applied-configuration` annotation은 256KiB 제한이 있으므로, 하나의 큰 ConfigMap 대신 128KiB 이하 조각 5개로 나눈다. 각 조각의 base64와 메타데이터를 합쳐도 annotation 제한 이내다. 초기화 컨테이너가 projected volume에서 조각을 읽어 SHA-256을 검사하고 파일을 `emptyDir`에 푼다. 웹은 이를 읽기 전용으로 사용한다. 설치·외부 다운로드는 없다. 코드 변경 시 Deployment의 checksum annotation도 갱신해 롤아웃을 유도한다.

`Dockerfile`은 별도의 서비스 이미지가 필요한 경우를 위한 대안이다. `docker build -t introduce-me:local .`로 만들 수 있지만, 과제 YAML은 이 로컬 이미지에 의존하지 않는다. 이미지에는 런타임 의존성만 설치하고 비루트 UID와 임의 UID의 읽기를 지원한다.

## 고정 이미지

2026-10-24에 빈 Docker 인증 설정으로 두 digest의 manifest를 익명 조회했다. 실제 레이어 pull과 컨테이너 기동은 Docker 데몬 권한이 없어 검증하지 못했다.

| 대상 | 이미지와 고정 digest |
| --- | --- |
| 웹·초기화 | `docker.io/library/node:24.22.1-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205` |
| DB | `quay.io/sclorg/postgresql-16-c9s@sha256:66566a27e08ec28d739c5fc54dcd47a4f0b505682d469589e9d493ae0b7bc9ab` |

Node.js 24.22.1은 공식 보안 릴리스다. PostgreSQL 16은 지원 중인 버전이며 SCLorg 이미지는 OpenShift용으로 NSS wrapper와 쓰기 경로 권한 처리를 제공한다. DB 데이터는 해당 이미지 문서에 따라 `/var/lib/pgsql/data`에 마운트하며 이미지가 하위 `userdata`를 관리하므로 `PGDATA`를 덮어쓰지 않는다. 이 지원 근거와 실제 Sandbox 실행 검증은 구분한다.

## OpenShift 배포

로그인한 `oc`와 대상 프로젝트가 필요하다. YAML은 namespace·Route host·고정 UID를 지정하지 않으며 해당 프로젝트의 SCC와 기본 StorageClass를 사용한다. 최초 배포 전 다음을 확인한다.

```bash
oc whoami
oc project
oc get resourcequota,limitrange
oc get storageclass
```

StorageClass 조회 권한이 없으면 콘솔에서 기본 스토리지를 확인한다. 웹 요청/제한은 CPU 50m/250m·메모리 64Mi/192Mi, DB는 CPU 100m/500m·메모리 128Mi/512Mi다. init 컨테이너도 웹과 같은 요청/제한을 사용한다. 실제 quota·LimitRange·기동 메모리에 맞춰 조정한다.

```bash
oc apply -f deploy/k8s/
oc rollout status deployment/portfolio-db --timeout=240s
oc rollout status deployment/personal-portfolio --timeout=240s
oc get pods,svc,route,pvc
oc get endpoints personal-portfolio portfolio-db
oc logs deployment/personal-portfolio -c web
oc get route personal-portfolio -o jsonpath='{.spec.host}{"\n"}'
```

출력한 host에 `https://`를 붙여 접속한다. Route는 edge TLS와 HTTP→HTTPS 리다이렉트를 사용하며 DB에는 Route를 만들지 않는다. Secret의 비밀번호는 공개 실습용 값이다. 실제 비밀번호와 재사용하지 않는다. Secret 자체는 암호화나 외부 공개 차단을 보장하지 않는다.

`TRUST_PROXY=false`가 기본이다. 검증되지 않은 `X-Forwarded-For`는 무시하므로 라우터 주소를 기준으로 여러 방문자가 쓰기 한도를 공유할 수 있다. 실제 router 주소/CIDR와 전달 헤더를 확인한 뒤 `personal-portfolio-config`에 정확한 신뢰 범위를 지정한다. `true`나 hop 수를 사용하지 않는다. 메모리 기반 제한은 Pod별이며 재시작 시 초기화된다.

이전 Nginx 배포에서 전환한다면 기존 이름 `personal-portfolio`를 그대로 사용한다. Node 배포가 정상임을 확인한 후 더 이상 참조하지 않는 기존 `personal-portfolio-content` ConfigMap을 정리한다. 파일명 변경이나 `oc apply`만으로 오래된 Object가 삭제되지는 않는다. 설정·Secret을 변경한 뒤에는 `oc rollout restart deployment/personal-portfolio`를 실행한다. DB 인증 변경은 기존 PVC 안의 계정 상태와 이미지의 인증 갱신 동작도 확인한다.

## 영속성·장애 검증과 제출

1. 브라우저에서 식별 가능한 글을 작성하고 웹 Pod를 삭제해 재생성한 뒤 글이 남는지 확인한다.
2. DB Pod만 삭제하고 PVC를 유지한 채 글이 남는지 확인한다.
3. DB Deployment를 0으로 줄여 직접 웹 Pod의 live 200·ready 503·API 503을 확인한다. Route의 endpoints 제외도 확인하고 DB를 다시 1로 늘려 복구한다. `oc port-forward deployment/personal-portfolio 18080:8080`으로 Pod에 직접 접근할 수 있다.
4. 캡처·백업을 확보한 후 별도 재현성 검증으로 전체 삭제·생성을 수행한다. **다음 delete는 PVC도 삭제하므로 글이 사라질 수 있다.**

```bash
oc delete -f deploy/k8s/ --wait=true
oc apply -f deploy/k8s/
oc rollout status deployment/portfolio-db --timeout=240s
oc rollout status deployment/personal-portfolio --timeout=240s
```

새 빈 방명록·새 글 작성·HTTPS·Probe·PVC를 확인하고 실제 결과를 기록한다. Pod 교체 영속성과 PVC 자체 삭제 후 재생성은 서로 다른 검사다.

실제 Sandbox 검증 후 이 저장소의 `deploy/k8s/` 내용을 과제 저장소 `students/202255521/k8s/`에 전달한다. 과제 README에는 서비스 저장소 URL, 소스 commit, 위 이미지 digest, 실제 명령·Route URL·배포 결과·AI 사용 내역을 기록한다. Topology/리소스·HTTPS 화면·방명록 결과 캡처를 `students/202255521/images/`에 저장한다. 현재는 이전 과제 저장소를 수정하거나 Push하지 않았다.

## 참고와 AI 사용

- 원본: `/home/kmwook/PlatformLab/index.html`, 축소 프로필 사진·학교 로고, 기존 과제 README/YAML, `hw.pdf`, OpenShift 강의 자료.
- [Node.js 24.22.1 공식 릴리스](https://nodejs.org/en/blog/release/v24.22.1): 보안 패치 버전 선택.
- [PostgreSQL 지원 정책](https://www.postgresql.org/support/versioning/): PostgreSQL 16 지원 확인.
- [SCLorg PostgreSQL 16 이미지 문서](https://github.com/sclorg/postgresql-container/blob/master/16/root/usr/share/container-scripts/postgresql/README.md): 환경변수·데이터 경로.
- [SCLorg Dockerfile](https://github.com/sclorg/postgresql-container/blob/master/16/Dockerfile.c9s): OpenShift 이미지 구성·권한 처리.
- [Kubernetes ConfigMap](https://kubernetes.io/docs/concepts/configuration/configmap/) 및 [annotation](https://kubernetes.io/docs/concepts/overview/working-with-objects/annotations/): 데이터와 배포 메타데이터.
- Codex가 기존 화면 이관, 서버·방명록·테스트·배포 파일·문서 작성을 지원했다. 로컬 검증 결과와 미검증 클러스터 항목은 별도로 기록했다.
