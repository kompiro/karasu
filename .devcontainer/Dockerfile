FROM mcr.microsoft.com/devcontainers/typescript-node:1-22-bookworm

# delta のインストール
ARG DELTA_VERSION="0.18.2"
RUN curl -fsSL "https://github.com/dandavison/delta/releases/download/${DELTA_VERSION}/git-delta_${DELTA_VERSION}_arm64.deb" \
    -o /tmp/delta.deb \
  && dpkg -i /tmp/delta.deb \
  && rm /tmp/delta.deb