# Shared base image for the integration suite.
#
# Every test file used to run its own `apk add` in beforeAll. That cost ~0.5s
# locally and much more (plus network flakiness) on CI runners, once per file.
# This image bakes the union of those package sets into a layer Docker caches,
# so container startup is the only remaining per-file cost.
#
# Built automatically by tests/helpers.ts when missing; see `bun run test:image`.
FROM alpine:3

RUN apk add --no-cache \
	bash \
	coreutils \
	curl \
	git \
	jq \
	sed \
	zsh

CMD ["sleep", "infinity"]
