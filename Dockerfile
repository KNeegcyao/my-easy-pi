# my-easy-pi 沙箱镜像
# 基于 Alpine Linux，只安装最小工具集
# 用于在容器中安全执行 bash 命令

FROM alpine:latest

RUN apk add --no-cache \
    bash \
    coreutils \
    grep \
    findutils \
    curl \
    wget \
    git \
    ca-certificates \
    && rm -rf /var/cache/apk/*

RUN adduser -D -h /workspace sandbox

WORKDIR /workspace
USER sandbox

CMD ["/bin/bash"]