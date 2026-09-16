#!/usr/bin/env bash
# VM에서 실행되는 배포 스크립트. 워크플로가 git pull 후 이 파일을 호출한다.
#
# stdin으로 넘기지 않고 파일로 두는 이유:
# docker compose run이 stdin을 붙잡아서, heredoc으로 보내면 뒷줄이 통째로 사라진다.
set -euo pipefail
cd ~/app

C="docker compose -f docker-compose.prod.yml"

$C build
$C run --rm -T --no-deps app npx prisma migrate deploy < /dev/null
$C up -d --force-recreate --wait

# Caddyfile은 볼륨이라 up만으로는 반영되지 않는다
$C exec -T caddy caddy reload --config /etc/caddy/Caddyfile

# 빌드마다 쌓이는 옛 이미지가 30GB 디스크를 채운다
docker image prune -f

echo "배포 완료: $(git log --oneline -1)"
