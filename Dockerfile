# trust the dino: the app server plus the toolchains a review needs (git, Go, a JDK).
# Prebuilt reviews (dossier/) are served as they are; adding projects stays off unless
# TRUST_ADMIN_TOKEN is set (it clones and runs other people's code).
FROM golang:1.24-bookworm AS go
FROM eclipse-temurin:21-jdk AS jdk

FROM python:3.12-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=go /usr/local/go /usr/local/go
COPY --from=jdk /opt/java/openjdk /opt/java/openjdk
ENV PATH=/usr/local/go/bin:/opt/java/openjdk/bin:$PATH \
    JAVA_HOME=/opt/java/openjdk \
    TRUST_HOST=0.0.0.0 \
    TRUST_STATE=/state \
    PYTHONUNBUFFERED=1
WORKDIR /app
COPY . .
RUN cd adapters/go && go build -o /dev/null . && mkdir -p /state
EXPOSE 8290
CMD ["python3", "-m", "core.serve", "8290"]
