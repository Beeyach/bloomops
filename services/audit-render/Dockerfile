# Playwright's own image, because it already carries Chromium and the pile of
# system libraries it needs. Installing those by hand on a plain Node image is
# the single most annoying part of running a browser in a container.
# The tag must stay in step with the playwright-core version in package.json,
# which is pinned exactly rather than with a caret for this reason: the image
# ships Chromium built for one Playwright version, and playwright-core looks
# for that exact browser revision. A caret would quietly resolve to a newer
# minor and the container would build fine, then fail at launch with
# "executable doesn't exist". Change both lines together or neither.
FROM mcr.microsoft.com/playwright:v1.49.0-noble

# ffmpeg is not in the Playwright image.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY . .

# Cloud Run sets PORT; 8080 is its default and a sane local fallback.
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.mjs"]
