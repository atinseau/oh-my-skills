FROM ubuntu

RUN apt-get update && apt-get install -y \
    curl \
    git

RUN curl -fsSL https://gh.io/copilot-install | bash
RUN curl -fsSL https://claude.ai/install.sh | bash
RUN echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
