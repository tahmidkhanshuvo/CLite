FROM oven/bun:1.4.4 AS bun
FROM debian:trixie-slim
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
COPY --from=bun /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt

ARG DEBIAN_FRONTEND=noninteractive

# Default profile fits a small host. Optional packages add image size, not extra services.
ARG INSTALL_HEAVY_TOOLS=false
RUN printf 'Acquire::https::CaInfo "/etc/ssl/certs/ca-certificates.crt";\n' > /etc/apt/apt.conf.d/99clite-ca \
    && sed -i 's|http://deb.debian.org/debian-security|https://security.debian.org/debian-security|; s|http://deb.debian.org/debian|https://mirrors.kernel.org/debian|' /etc/apt/sources.list.d/debian.sources \
    && apt-get update --error-on=any \
    && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends \
      ca-certificates tini util-linux bash bash-completion coreutils findutils \
      grep sed gawk less tar gzip zip unzip p7zip-full unrar-free zstd \
      file nano vim-tiny xxd bsdextrautils curl wget git jq ripgrep bat fd-find \
      moreutils tree tmux procps psmisc net-tools sqlite3 \
      python3 python3-pip python3-venv pipx \
      netcat-openbsd openssh-client nmap socat openssl dnsutils whois \
      iputils-ping iproute2 gobuster john hashid \
      gcc g++ make cmake pkg-config patch gdb binutils strace ltrace patchelf nasm checksec \
      pngcheck zbar-tools steghide binwalk foremost sleuthkit libimage-exiftool-perl fastfetch \
    && if [ "$INSTALL_HEAVY_TOOLS" = true ]; then apt-get install -y --no-install-recommends hashcat tshark tcpdump; fi \
    && rm -rf /var/lib/apt/lists/*

# Preserve the reversing tool from v1 using a released, checksum-verified package.
RUN arch="$(dpkg --print-architecture)" \
    && case "$arch" in \
         amd64) checksum=7019eedc0e0e87d1f53d6b8f5fc62b898567679c5efdce7fbfc557c9e7655e90 ;; \
         arm64) checksum=bbf48ee7bd5d8282f65a297dcabd34c9961a500e62d6b036679caab187b32ef1 ;; \
         *) echo "Unsupported radare2 architecture: $arch" >&2; exit 1 ;; \
       esac \
    && curl -fL --retry 3 "https://github.com/radareorg/radare2/releases/download/6.2.4/radare2_6.2.4_${arch}.deb" -o /tmp/radare2.deb \
    && printf '%s  /tmp/radare2.deb\n' "$checksum" | sha256sum -c - \
    && apt-get update \
    && apt-get install -y --no-install-recommends /tmp/radare2.deb \
    && rm -f /tmp/radare2.deb \
    && rm -rf /var/lib/apt/lists/*

# Keep the distro Python intact; all bundled libraries live in one reusable venv.
RUN python3 -m venv /opt/ctf-python \
    && /opt/ctf-python/bin/pip install --no-cache-dir \
      requests beautifulsoup4 pycryptodome z3-solver capstone unicorn \
      ropper ROPGadget pwntools sympy gmpy2 pillow pyelftools scapy sqlmap \
    && for cmd in pwn checksec ropper ROPgadget sqlmap; do \
         if [ -f "/opt/ctf-python/bin/$cmd" ]; then ln -sf "/opt/ctf-python/bin/$cmd" "/usr/local/bin/$cmd"; fi; \
       done

COPY .env.example /tmp/clite-defaults.env
RUN set -a && . /tmp/clite-defaults.env \
    && groupadd --gid "$CTF_GID" ctf \
    && useradd --uid "$CTF_UID" --gid "$CTF_GID" --create-home --shell /bin/bash ctf \
    && groupadd --gid "$DEMO_GID" practice \
    && useradd --uid "$DEMO_UID" --gid "$DEMO_GID" --no-create-home --shell /usr/sbin/nologin practice \
    && rm -f /usr/bin/sudo /bin/su /usr/bin/su

WORKDIR /app
COPY package.json bun.lock .env.example ./
RUN bun install --frozen-lockfile --production
COPY server.ts tsconfig.json ./
COPY lib ./lib
COPY data ./data
COPY public ./public
COPY scripts ./scripts
COPY templates ./templates
# Enforce LF shebangs even when building a Windows checkout.
RUN sed -i 's/\r$//' scripts/*.py \
    && install -m 0755 scripts/clite.py /usr/local/bin/clite \
    && mkdir -p /tmp/ctf-web-cli/sessions \
    && chmod 0711 /tmp/ctf-web-cli /tmp/ctf-web-cli/sessions \
    && chmod 0755 /app /opt/ctf-python

HEALTHCHECK --interval=30s --timeout=3s --start-period=15s \
    CMD bun scripts/healthcheck.ts
ENTRYPOINT ["/usr/bin/tini", "-s", "--"]
CMD ["bun", "run", "server.ts"]
