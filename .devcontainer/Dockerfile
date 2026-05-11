FROM mcr.microsoft.com/devcontainers/typescript-node:1-22-bookworm

# delta のインストール
ARG DELTA_VERSION="0.18.2"
RUN curl -fsSL "https://github.com/dandavison/delta/releases/download/${DELTA_VERSION}/git-delta_${DELTA_VERSION}_arm64.deb" \
    -o /tmp/delta.deb \
  && dpkg -i /tmp/delta.deb \
  && rm /tmp/delta.deb

# gitleaks のインストール（秘密情報スキャン — ローカル/CI で同一バージョンを使う）
# CI 側 (.github/workflows/secret-scan.yml) と version を揃えること。
ARG GITLEAKS_VERSION="8.21.2"
RUN ARCH="$(dpkg --print-architecture)" \
  && case "$ARCH" in \
       amd64) GL_ARCH="x64" ;; \
       arm64) GL_ARCH="arm64" ;; \
       *) echo "unsupported arch for gitleaks: $ARCH" && exit 1 ;; \
     esac \
  && curl -fsSL "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_${GL_ARCH}.tar.gz" \
       -o /tmp/gitleaks.tgz \
  && tar -xzf /tmp/gitleaks.tgz -C /usr/local/bin gitleaks \
  && rm /tmp/gitleaks.tgz \
  && gitleaks version

# packages/vscode-e2e の Electron ベース VS Code を headless 起動するための依存
# (xvfb-run / xauth + GTK・NSS 系ライブラリ)。CI では vscode-e2e.yml が同等のものを apt-get する。
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
       xvfb \
       xauth \
       libnss3 \
       libgbm1 \
       libxshmfence1 \
       libgtk-3-0 \
       libasound2 \
       libxss1 \
       libxkbfile1 \
       libsecret-1-0 \
  && rm -rf /var/lib/apt/lists/*