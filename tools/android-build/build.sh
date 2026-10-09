#!/usr/bin/env bash
# Runs INSIDE the container: copies the project (read-only mount at /src) without node_modules,
# installs dependencies for Linux, generates the native project and builds a release APK.
set -euo pipefail
mkdir -p /work/app && cd /work/app
tar -C /src --exclude=./node_modules --exclude=./android --exclude=./dist --exclude=./.git \
  --exclude=./.secrets --exclude=./build --exclude=./server/node_modules -cf - . | tar -xf -
npm ci --no-audit --no-fund
npx expo prebuild --platform android --no-install
cd android
./gradlew assembleRelease --no-daemon -PreactNativeArchitectures=arm64-v8a \
  -Dorg.gradle.jvmargs="-Xmx6g -XX:MaxMetaspaceSize=1g"
mkdir -p /out
cp app/build/outputs/apk/release/app-release.apk /out/fft.apk
ls -lh /out/fft.apk
