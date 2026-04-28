FROM mcr.microsoft.com/devcontainers/typescript-node:1-22-bookworm

# delta のインストール
ARG DELTA_VERSION="0.18.2"
RUN curl -fsSL "https://github.com/dandavison/delta/releases/download/${DELTA_VERSION}/git-delta_${DELTA_VERSION}_arm64.deb" \
    -o /tmp/delta.deb \
  && dpkg -i /tmp/delta.deb \
  && rm /tmp/delta.deb

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