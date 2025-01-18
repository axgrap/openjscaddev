# Stage 1: Git clone
FROM mcr.microsoft.com/devcontainers/javascript-node:22 AS git-builder
RUN git clone https://github.com/jscad/OpenJSCAD.org /workspace/openjscad

# Stage 2: Dependencies installation
FROM mcr.microsoft.com/devcontainers/javascript-node:22 AS deps-builder
COPY --from=git-builder /workspace/openjscad /workspace/openjscad
WORKDIR /workspace/openjscad

# Install JSCAD CLI globally and project dependencies
RUN npm install -g @jscad/cli && \
    npm install && \
    cd packages/web && \
    npm install

# Final stage
FROM mcr.microsoft.com/devcontainers/javascript-node:22
COPY --from=deps-builder /workspace/openjscad /workspace/openjscad
COPY --from=deps-builder /usr/local/lib/node_modules /usr/local/lib/node_modules
# COPY --from=deps-builder /usr/local/bin/@jscad /usr/local/bin/@jscad
COPY devserver.js /workspace/openjscad/packages/web/devserver.js
# Set working directory
WORKDIR /workspace/openjscad

RUN rm -rf /workspace/openjscad/.git
# Switch back to node user
USER node

# Expose the default web development port
EXPOSE 3000
EXPOSE 8081

USER root
RUN chown -R node:node /workspace/openjscad

USER node

# Create a startup script
# RUN echo '#!/bin/sh\ncd /workspace/openjscad/packages/web && HOST=0.0.0.0 npm run dev' > /home/node/startup.sh && \
#     chmod +x /home/node/startup.sh

# Set the entrypoint to the startup script
# ENTRYPOINT ["/home/node/startup.sh"]