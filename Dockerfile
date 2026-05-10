FROM node:current-trixie-slim

ENV PORT=7860 \
    NODE_ENV=production \
    TEAM_KEY=change-me \
    MAX_TEAM_SESSIONS=5 \
    MAX_PUBLIC_SESSIONS=2 \
    PUBLIC_TIMEOUT_MINUTES=10 \
    TEAM_TIMEOUT_MINUTES=180 \
    IDLE_TIMEOUT_MINUTES=10 \
    CTF_UID=1001 \
    CTF_GID=1001 \
    PIPX_HOME=/opt/pipx \
    PIPX_BIN_DIR=/usr/local/bin

RUN printf '%s\n' \
      'Types: deb' \
      'URIs: http://mirrors.kernel.org/debian' \
      'Suites: trixie trixie-updates' \
      'Components: main' \
      'Signed-By: /usr/share/keyrings/debian-archive-keyring.gpg' \
      '' \
      'Types: deb' \
      'URIs: http://security.debian.org/debian-security' \
      'Suites: trixie-security' \
      'Components: main' \
      'Signed-By: /usr/share/keyrings/debian-archive-keyring.gpg' \
    > /etc/apt/sources.list.d/debian.sources

RUN apt-get update \
    && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends \
      bash \
      coreutils \
      findutils \
      grep \
      sed \
      gawk \
      less \
      tar \
      gzip \
      zip \
      unzip \
      file \
      nano \
      vim-tiny \
      xxd \
      bsdmainutils \
      curl \
      wget \
      git \
      jq \
      ripgrep \
      bat \
      fd-find \
      moreutils \
      tree \
      tmux \
      procps \
      psmisc \
      net-tools \
      python3 \
      python3-pip \
      python3-venv \
      pipx \
      netcat-openbsd \
      openssh-client \
      nmap \
      socat \
      openssl \
      dnsutils \
      whois \
      iputils-ping \
      iproute2 \
      gcc \
      g++ \
      make \
      pkg-config \
      patch \
      gdb \
      binutils \
      strace \
      ltrace \
      patchelf \
      nasm \
      checksec \
      pngcheck \
      zbar-tools \
      steghide \
      binwalk \
      foremost \
      sleuthkit \
      libimage-exiftool-perl \
      fastfetch \
      libcap2-bin \
    && rm -rf /var/lib/apt/lists/*

RUN git clone --depth 1 https://github.com/radareorg/radare2 /opt/radare2 \
    && /opt/radare2/sys/install.sh

RUN python3 -m pip install --break-system-packages --no-cache-dir \
      requests \
      beautifulsoup4 \
      pycryptodome \
      z3-solver \
      capstone \
      unicorn \
      ropper \
      pwntools

RUN pipx install sqlmap

RUN groupadd --gid 1001 ctf \
    && useradd --uid 1001 --gid 1001 --create-home --shell /bin/bash ctf \
    && rm -f /usr/bin/sudo /bin/su /usr/bin/su \
    && chmod 0755 /usr/bin/apt /usr/bin/apt-get || true \
    && setcap cap_net_raw+ep /bin/ping || true

WORKDIR /app

RUN npm install -g npm@latest \
    && npm cache clean --force

COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund \
    && npm cache clean --force

COPY public ./public
COPY server.js ./server.js
COPY scripts ./scripts
COPY templates /opt/ctf-template

RUN mkdir -p /app/public/xterm /tmp/ctf-web-cli/sessions \
    && cp node_modules/@xterm/xterm/css/xterm.css /app/public/xterm/xterm.css \
    && cp node_modules/@xterm/xterm/lib/xterm.js /app/public/xterm/xterm.js \
    && cp node_modules/@xterm/addon-fit/lib/addon-fit.js /app/public/xterm/addon-fit.js \
    && install -m 0755 /app/scripts/restricted-demo-shell.sh /usr/local/bin/restricted-demo-shell \
    && install -m 0755 /app/scripts/cleanup.sh /usr/local/bin/ctf-web-cli-cleanup \
    && chown -R root:root /app /opt/ctf-template \
    && chown -R ctf:ctf /tmp/ctf-web-cli \
    && chmod 0711 /tmp/ctf-web-cli /tmp/ctf-web-cli/sessions

EXPOSE 7860

CMD ["node", "server.js"]
