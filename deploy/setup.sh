#!/usr/bin/env bash
# VM 초기 세팅. 처음 한 번만 실행하고, 끝나면 SSH를 다시 붙어야 docker 권한이 먹는다.
set -euo pipefail

# e2-small은 RAM 2GB라 swap 없이는 nest build가 죽는다
if [ ! -f /swapfile ]; then
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
  echo "swap 생성됨"
fi

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
  echo "docker 설치됨"
fi

# 재부팅 후 컨테이너가 자동으로 뜨려면 필요
sudo systemctl enable --now docker

echo
echo "완료. exit 후 다시 접속하고 'docker ps'로 확인하세요."
